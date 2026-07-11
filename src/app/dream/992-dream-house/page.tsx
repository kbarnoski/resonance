"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// DREAM HOUSE — a browser port of La Monte Young & Marian Zazeela's sound-and-
// light environment. A field of continuously-running just-intoned sine partials
// that NEVER stop (a drone, not triggered notes). Your position in the room
// sculpts which partials bloom and which fade — pure standing-wave timbre with
// no notes and no wrong notes. Magenta/violet Zazeela light field responds to
// which partials are currently loud. WebGPU → WebGL2 → Canvas2D render chain.
// ─────────────────────────────────────────────────────────────────────────────

// ── Just intonation set ──────────────────────────────────────────────────────
// Fundamental ~72.6 Hz (a low D-ish drone). Ratios drawn from Young's harmonic
// vocabulary: members of the harmonic series and Young's favoured small-integer
// primes (he famously dwells on 7, and on the 9/8, 7/4, 3/2 relations). Each
// partial gets a fixed 3D position in the room and a magenta-violet hue.
const FUND = 72.6; // Hz — low, felt-in-the-body drone fundamental

interface Partial {
  ratio: [number, number]; // just ratio numerator/denominator
  label: string;
  // fixed position in the room, normalized 0..1 (x,y) — used both for the
  // spatial "well" proximity sculpt and for the HRTF panner placement.
  px: number;
  py: number;
  hue: number; // 0..1 within the magenta→violet band
}

// 8 partials. Frequencies span ~72 Hz to ~290 Hz so the cluster stays warm and
// non-shrill (master lowpass at 6 kHz guards the rest).
const PARTIALS: Partial[] = [
  { ratio: [1, 1], label: "1/1", px: 0.5, py: 0.5, hue: 0.86 }, //  72.6 Hz  centre — the ever-present root
  { ratio: [9, 8], label: "9/8", px: 0.2, py: 0.32, hue: 0.9 }, //  81.7 Hz
  { ratio: [5, 4], label: "5/4", px: 0.78, py: 0.28, hue: 0.82 }, //  90.8 Hz
  { ratio: [4, 3], label: "4/3", px: 0.32, py: 0.74, hue: 0.94 }, //  96.8 Hz
  { ratio: [3, 2], label: "3/2", px: 0.7, py: 0.72, hue: 0.78 }, // 108.9 Hz
  { ratio: [7, 4], label: "7/4", px: 0.13, py: 0.6, hue: 0.97 }, // 127.1 Hz  Young's beloved 7th partial
  { ratio: [2, 1], label: "2/1", px: 0.88, py: 0.52, hue: 0.74 }, // 145.2 Hz  octave
  { ratio: [9, 4], label: "9/4", px: 0.5, py: 0.12, hue: 0.88 }, // 163.4 Hz
];

function partialFreq(p: Partial): number {
  return FUND * (p.ratio[0] / p.ratio[1]);
}

// ── Magenta/violet palette (Zazeela light field) ─────────────────────────────
// hue in [0.72, 0.99] maps a violet→magenta band. Returns rgb 0..1.
function magentaRGB(hue: number, light: number): [number, number, number] {
  // saturated magenta-violet; we bias toward pink/magenta and add a violet tail.
  const s = 0.72;
  const h = hue;
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const hp = h * 6;
  const xc = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, xc, 0];
  else if (hp < 2) [r, g, b] = [xc, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, xc];
  else if (hp < 4) [r, g, b] = [0, xc, c];
  else if (hp < 5) [r, g, b] = [xc, 0, c];
  else [r, g, b] = [c, 0, xc];
  const m = light - c / 2;
  return [r + m, g + m, b + m];
}

// ── Audio engine ─────────────────────────────────────────────────────────────
// One AudioContext. The performer is the AudioListener. Each partial is a
// permanently-running sine OscillatorNode → per-partial gain → HRTF PannerNode
// placed at the partial's fixed room position → master bus. A tiny second
// detune oscillator per partial gives slow position-dependent beating (the
// hallmark Dream House shimmer).
interface Voice {
  osc: OscillatorNode;
  beat: OscillatorNode; // a faint, slightly detuned twin → beating
  beatGain: GainNode;
  gain: GainNode; // sculpted by position
  panner: PannerNode;
  baseFreq: number;
}

class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  listener: AudioListener;
  voices: Voice[] = [];
  amps: number[]; // smoothed visual amplitude readout per partial

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.listener = this.ctx.listener;
    this.amps = PARTIALS.map(() => 0);

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 6000; // safety — keep the cluster soft
    this.lowpass.Q.value = 0.3;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // fades in on start (no click)

    this.bus.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // build the permanently-running drone field
    for (const p of PARTIALS) {
      const baseFreq = partialFreq(p);
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseFreq;

      const beat = this.ctx.createOscillator();
      beat.type = "sine";
      beat.frequency.value = baseFreq; // detuned later, per position
      const beatGain = this.ctx.createGain();
      beatGain.gain.value = 0.0;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;

      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.0;
      panner.maxDistance = 18;
      panner.rolloffFactor = 0.6;
      this.placePanner(panner, p.px, p.py);

      osc.connect(gain);
      beat.connect(beatGain);
      beatGain.connect(gain);
      gain.connect(panner);
      panner.connect(this.bus);

      osc.start();
      beat.start();
      this.voices.push({ osc, beat, beatGain, gain, panner, baseFreq });
    }
  }

  placePanner(panner: PannerNode, px: number, py: number) {
    // map normalized room → a ~10m world, listener faces -z
    const x = (px - 0.5) * 8;
    const z = (0.5 - py) * 6;
    const y = 0;
    if (panner.positionX) {
      const t = this.ctx.currentTime;
      panner.positionX.setValueAtTime(x, t);
      panner.positionY.setValueAtTime(y, t);
      panner.positionZ.setValueAtTime(z, t);
    } else {
      (
        panner as unknown as { setPosition: (a: number, b: number, c: number) => void }
      ).setPosition?.(x, y, z);
    }
  }

  setListenerPos(px: number, py: number) {
    const x = (px - 0.5) * 8;
    const z = (0.5 - py) * 6;
    const t = this.ctx.currentTime;
    if (this.listener.positionX) {
      this.listener.positionX.setTargetAtTime(x, t, 0.08);
      this.listener.positionY.setTargetAtTime(0, t, 0.08);
      this.listener.positionZ.setTargetAtTime(z, t, 0.08);
    } else {
      (
        this.listener as unknown as { setPosition: (a: number, b: number, c: number) => void }
      ).setPosition?.(x, 0, z);
    }
  }

  // Sculpt the spectrum from position. For each partial, gain ∝ spatial
  // proximity to that partial's well (Gaussian falloff), so moving even slightly
  // re-balances which overtones dominate. Detuning of the beat-twin also depends
  // on position → walking creates shifting beats. Everything setTargetAtTime'd.
  sculpt(px: number, py: number) {
    const t = this.ctx.currentTime;
    // proximity weights
    const weights: number[] = [];
    let sum = 0;
    for (const p of PARTIALS) {
      const dx = px - p.px;
      const dy = py - p.py;
      const d2 = dx * dx + dy * dy;
      // wide-ish Gaussian wells so zones overlap and morph smoothly
      const w = Math.exp(-d2 / 0.085) + 0.12; // +floor so every partial always faintly present (a true drone)
      weights.push(w);
      sum += w;
    }
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const norm = weights[i] / sum; // 0..1, sums to 1
      // perceptual: emphasize the dominant few, keep cluster from clipping.
      const g = 0.02 + norm * 0.85;
      v.gain.gain.setTargetAtTime(g, t, 0.18);
      this.amps[i] = this.amps[i] + (norm - this.amps[i]) * 0.08; // smoothed readout

      // position-dependent micro-detune for the beat twin: 0.05..~1.4 Hz beats
      const beatHz = 0.06 + (px * 0.7 + py * 0.6) * 0.9 + i * 0.04;
      v.beat.frequency.setTargetAtTime(v.baseFreq + beatHz, t, 0.4);
      v.beatGain.gain.setTargetAtTime(0.5, t, 0.4); // twin at half the main → audible beating
    }
  }

  fadeIn() {
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 1.6);
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    try {
      for (const v of this.voices) {
        v.osc.stop();
        v.beat.stop();
        v.osc.disconnect();
        v.beat.disconnect();
        v.beatGain.disconnect();
        v.gain.disconnect();
        v.panner.disconnect();
      }
    } catch {
      /* already stopped */
    }
    this.bus.disconnect();
    this.lowpass.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── Render frame data ────────────────────────────────────────────────────────
interface Marker {
  x: number;
  y: number;
  amps: number[]; // frozen spectral signature
}
interface Frame {
  amps: number[]; // current smoothed partial amplitudes 0..1
  listener: { x: number; y: number };
  markers: Marker[];
  time: number; // seconds, for slow breathing animation
}

interface Renderer {
  kind: "webgpu" | "webgl2" | "canvas2d";
  draw: (f: Frame) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
function makeCanvas2D(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let W = canvas.width;
  let H = canvas.height;
  return {
    kind: "canvas2d",
    resize(w, h) {
      W = w;
      H = h;
      canvas.width = w;
      canvas.height = h;
    },
    draw(f) {
      // deep violet wash with slow persistence
      ctx.fillStyle = "rgba(8,4,14,0.34)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      // each partial = a luminous symmetric bloom at its well, brightness = amp
      for (let i = 0; i < PARTIALS.length; i++) {
        const p = PARTIALS[i];
        const amp = f.amps[i];
        const breathe = 0.85 + 0.15 * Math.sin(f.time * 0.6 + i);
        const light = 0.4 + amp * 0.45;
        const [r, g, b] = magentaRGB(p.hue, light);
        const cx = p.px * W;
        const cy = p.py * H;
        const rad = (40 + amp * 240) * breathe * (W / 1200 + 0.4);
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const a = 0.12 + amp * 0.7;
        grd.addColorStop(0, `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      // frozen resonance markers — soft persistent glow
      for (const m of f.markers) {
        const grd = ctx.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, 26);
        grd.addColorStop(0, "rgba(255,180,255,0.5)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(m.x * W, m.y * H, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      // listener — a bright still presence
      const lg = ctx.createRadialGradient(
        f.listener.x * W,
        f.listener.y * H,
        0,
        f.listener.x * W,
        f.listener.y * H,
        18
      );
      lg.addColorStop(0, "rgba(255,235,255,0.9)");
      lg.addColorStop(1, "rgba(255,200,255,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(f.listener.x * W, f.listener.y * H, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    },
    destroy() {
      /* nothing persistent */
    },
  };
}

// ── WebGL2 point-sprite glow ─────────────────────────────────────────────────
function makeWebGL2(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", { alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  const vsrc = `#version 300 es
  layout(location=0) in vec2 aPos;
  layout(location=1) in float aSize;
  layout(location=2) in vec3 aColor;
  layout(location=3) in float aAlpha;
  out vec3 vColor; out float vAlpha;
  void main(){
    vColor=aColor; vAlpha=aAlpha;
    vec2 clip = vec2(aPos.x*2.0-1.0, 1.0-aPos.y*2.0);
    gl_Position = vec4(clip,0.0,1.0);
    gl_PointSize = aSize;
  }`;
  const fsrc = `#version 300 es
  precision mediump float;
  in vec3 vColor; in float vAlpha; out vec4 frag;
  void main(){
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if(r>0.5) discard;
    float a = smoothstep(0.5,0.0,r)*vAlpha;
    frag = vec4(vColor*a, a);
  }`;
  function compile(type: number, src: string) {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    return s;
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const buf = gl.createBuffer()!;
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const stride = 7 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  return {
    kind: "webgl2",
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    draw(f) {
      gl.clearColor(0.031, 0.016, 0.055, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const data: number[] = [];
      // each partial bloom = a dense cloud of points around its well
      for (let i = 0; i < PARTIALS.length; i++) {
        const p = PARTIALS[i];
        const amp = f.amps[i];
        const breathe = 0.85 + 0.15 * Math.sin(f.time * 0.6 + i);
        const [r, g, b] = magentaRGB(p.hue, 0.45 + amp * 0.4);
        const count = 40 + Math.floor(amp * 220);
        const spread = (0.04 + amp * 0.16) * breathe;
        for (let k = 0; k < count; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.sqrt(Math.random()) * spread;
          data.push(
            p.px + Math.cos(ang) * rad,
            p.py + Math.sin(ang) * rad * (canvas.width / canvas.height),
            (6 + amp * 16) * (canvas.width / 1200 + 0.4),
            r,
            g,
            b,
            (0.1 + amp * 0.55) * (1 - rad / Math.max(0.001, spread))
          );
        }
      }
      // frozen markers
      for (const m of f.markers) {
        for (let k = 0; k < 36; k++) {
          const ang = (k / 36) * Math.PI * 2;
          const rad = 0.02;
          data.push(m.x + Math.cos(ang) * rad, m.y + Math.sin(ang) * rad, 8, 1.0, 0.72, 1.0, 0.5);
        }
      }
      // listener
      for (let k = 0; k < 60; k++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * 0.02;
        data.push(
          f.listener.x + Math.cos(ang) * rad,
          f.listener.y + Math.sin(ang) * rad,
          10,
          1.0,
          0.92,
          1.0,
          0.7
        );
      }
      const arr = new Float32Array(data);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, arr.length / 7);
    },
    destroy() {
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    },
  };
}

// ── WebGPU (hand-written WGSL particle field) ────────────────────────────────
async function makeWebGPU(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  const navGpu = navigator as unknown as {
    gpu?: {
      requestAdapter: (o?: unknown) => Promise<unknown>;
      getPreferredCanvasFormat: () => string;
    };
  };
  if (!navGpu.gpu) return null;
  let adapter: unknown;
  try {
    adapter = await navGpu.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;
  const device = await (adapter as { requestDevice: () => Promise<unknown> }).requestDevice();
  if (!device) return null;
  const dev = device as {
    createShaderModule: (o: unknown) => unknown;
    createBuffer: (o: unknown) => unknown;
    createRenderPipeline: (o: unknown) => unknown;
    createBindGroup: (o: unknown) => unknown;
    queue: { writeBuffer: (b: unknown, o: number, d: BufferSource) => void; submit: (c: unknown[]) => void };
    createCommandEncoder: () => unknown;
  };
  const ctx = canvas.getContext("webgpu") as unknown as {
    configure: (o: unknown) => void;
    getCurrentTexture: () => { createView: () => unknown };
  } | null;
  if (!ctx) return null;
  const format = navGpu.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  // particle: pos(2), size(1), pad(1), color(3), alpha(1) = 8 floats
  const wgsl = `
  struct Particle { pos: vec2<f32>, size: f32, pad: f32, color: vec3<f32>, alpha: f32 };
  @group(0) @binding(0) var<storage, read> parts: array<Particle>;
  struct VSOut { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32>,
                 @location(1) color: vec3<f32>, @location(2) alpha: f32 };
  @vertex
  fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
    let pid = vi / 6u;
    let corner = vi % 6u;
    var offs = array<vec2<f32>,6>(
      vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0),
      vec2(-1.0,1.0),  vec2(1.0,-1.0), vec2(1.0,1.0));
    let o = offs[corner];
    let p = parts[pid];
    let ndc = vec2<f32>(p.pos.x*2.0-1.0, 1.0-p.pos.y*2.0);
    var out: VSOut;
    out.clip = vec4<f32>(ndc + o*p.size, 0.0, 1.0);
    out.uv = o;
    out.color = p.color;
    out.alpha = p.alpha;
    return out;
  }
  @fragment
  fn fs(in: VSOut) -> @location(0) vec4<f32> {
    let r = length(in.uv);
    if (r > 1.0) { discard; }
    let a = smoothstep(1.0, 0.0, r) * in.alpha;
    return vec4<f32>(in.color * a, a);
  }`;

  const shaderMod = dev.createShaderModule({ code: wgsl });
  const MAX_PARTS = 8000;
  const FLOATS = 8;
  const storage = dev.createBuffer({
    size: MAX_PARTS * FLOATS * 4,
    usage: 0x80 | 0x8, // STORAGE | COPY_DST
  });
  const pipeline = dev.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderMod, entryPoint: "vs" },
    fragment: {
      module: shaderMod,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
  const bindGroup = dev.createBindGroup({
    layout: (pipeline as { getBindGroupLayout: (i: number) => unknown }).getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: storage } }],
  });

  const cpu = new Float32Array(MAX_PARTS * FLOATS);

  return {
    kind: "webgpu",
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
    },
    draw(f) {
      let n = 0;
      const aspect = canvas.width / Math.max(1, canvas.height);
      const push = (x: number, y: number, sizePx: number, c: [number, number, number], a: number) => {
        if (n >= MAX_PARTS) return;
        const o = n * FLOATS;
        cpu[o] = x;
        cpu[o + 1] = y;
        cpu[o + 2] = (sizePx / canvas.width) * 2;
        cpu[o + 3] = 0;
        cpu[o + 4] = c[0];
        cpu[o + 5] = c[1];
        cpu[o + 6] = c[2];
        cpu[o + 7] = a;
        n++;
      };
      for (let i = 0; i < PARTIALS.length; i++) {
        const p = PARTIALS[i];
        const amp = f.amps[i];
        const breathe = 0.85 + 0.15 * Math.sin(f.time * 0.6 + i);
        const col = magentaRGB(p.hue, 0.45 + amp * 0.4);
        const count = 60 + Math.floor(amp * 320);
        const spread = (0.04 + amp * 0.17) * breathe;
        for (let k = 0; k < count; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.sqrt(Math.random()) * spread;
          push(
            p.px + Math.cos(ang) * rad,
            p.py + Math.sin(ang) * rad * aspect,
            (7 + amp * 18) * (canvas.width / 1400 + 0.4),
            col,
            (0.1 + amp * 0.5) * (1 - rad / Math.max(0.001, spread))
          );
        }
      }
      for (const m of f.markers) {
        for (let k = 0; k < 48; k++) {
          const ang = (k / 48) * Math.PI * 2;
          push(m.x + Math.cos(ang) * 0.02, m.y + Math.sin(ang) * 0.02 * aspect, 9, [1, 0.72, 1], 0.5);
        }
      }
      for (let k = 0; k < 80; k++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * 0.02;
        push(
          f.listener.x + Math.cos(ang) * rad,
          f.listener.y + Math.sin(ang) * rad * aspect,
          11,
          [1, 0.92, 1],
          0.65
        );
      }
      dev.queue.writeBuffer(storage, 0, cpu.subarray(0, n * FLOATS));
      const view = ctx.getCurrentTexture().createView();
      const enc = dev.createCommandEncoder() as {
        beginRenderPass: (o: unknown) => {
          setPipeline: (p: unknown) => void;
          setBindGroup: (i: number, g: unknown) => void;
          draw: (count: number) => void;
          end: () => void;
        };
        finish: () => unknown;
      };
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.031, g: 0.016, b: 0.055, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(n * 6);
      pass.end();
      dev.queue.submit([enc.finish()]);
    },
    destroy() {
      try {
        (storage as { destroy?: () => void }).destroy?.();
      } catch {
        /* ignore */
      }
    },
  };
}

// ── React component ──────────────────────────────────────────────────────────
type InputMode = "auto" | "pointer" | "camera";

export default function DreamHouse() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [rendererKind, setRendererKind] = useState<string>("…");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [notice, setNotice] = useState<string>(
    "The drone fades in on its own. Move your pointer to walk the room and sculpt the spectrum."
  );
  const [cameraState, setCameraState] = useState<"off" | "loading" | "on" | "error">("off");
  const [showNotes, setShowNotes] = useState(false);
  const [markerCount, setMarkerCount] = useState(0);
  const [loudest, setLoudest] = useState<string>("—");

  const engineRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const liveRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const markersRef = useRef<Marker[]>([]);
  const rafRef = useRef(0);
  const inputModeRef = useRef<InputMode>("auto");
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<{ close?: () => void } | null>(null);
  const autoDriftRef = useRef<number | null>(null);
  const loudestRef = useRef<string>("—");

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      engineRef.current.fadeIn();
    }
    engineRef.current.resume();
    return engineRef.current;
  }, []);

  // ── main loop ──
  const startLoop = useCallback(() => {
    const tick = () => {
      const eng = engineRef.current;
      const ren = rendererRef.current;
      const now = performance.now() / 1000;

      // auto-drift: slow Lissajous wander so the page is alive on cold load
      if (inputModeRef.current === "auto" && autoDriftRef.current !== null) {
        const a = now * 0.16 + autoDriftRef.current;
        liveRef.current.x = 0.5 + 0.34 * Math.sin(a);
        liveRef.current.y = 0.5 + 0.3 * Math.sin(a * 1.37 + 0.7);
      }

      const live = liveRef.current;
      if (eng) {
        eng.setListenerPos(live.x, live.y);
        eng.sculpt(live.x, live.y);
      }

      const amps = eng ? eng.amps.slice() : PARTIALS.map(() => 0);
      // loudest partial readout
      if (eng) {
        let bi = 0;
        for (let i = 1; i < amps.length; i++) if (amps[i] > amps[bi]) bi = i;
        loudestRef.current = PARTIALS[bi].label;
      }

      if (ren)
        ren.draw({
          amps,
          listener: { x: live.x, y: live.y },
          markers: markersRef.current,
          time: now,
        });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // periodic HUD update (cheap, off the rAF path)
  useEffect(() => {
    const iv = setInterval(() => setLoudest(loudestRef.current), 180);
    return () => clearInterval(iv);
  }, []);

  // ── pointer ──
  const onPointer = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === "camera") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    liveRef.current.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    liveRef.current.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (inputModeRef.current === "auto") {
      autoDriftRef.current = null;
      inputModeRef.current = "pointer";
      setInputMode("pointer");
      setNotice("You are walking the Dream House. Small moves bloom some partials and fade others.");
    }
  }, []);

  const onCanvasDown = useCallback(
    (e: React.PointerEvent) => {
      ensureEngine();
      onPointer(e);
    },
    [ensureEngine, onPointer]
  );

  // ── leave a resonance ──
  const leaveResonance = useCallback(() => {
    const eng = ensureEngine();
    markersRef.current.push({
      x: liveRef.current.x,
      y: liveRef.current.y,
      amps: eng.amps.slice(),
    });
    if (markersRef.current.length > 12) markersRef.current.shift();
    setMarkerCount(markersRef.current.length);
    setNotice("Resonance left as a soft marker. Return to it to recall this exact timbre.");
  }, [ensureEngine]);

  const clearMarkers = useCallback(() => {
    markersRef.current = [];
    setMarkerCount(0);
  }, []);

  // ── camera + MediaPipe pose ──
  const startCamera = useCallback(async () => {
    ensureEngine();
    setCameraState("loading");
    setNotice("Requesting camera + loading MediaPipe Pose…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
    } catch {
      setCameraState("error");
      setNotice("Camera unavailable or denied — staying on pointer control.");
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play().catch(() => {});

    try {
      const cdnBase = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
      const visionUrl = `${cdnBase}/vision_bundle.mjs`;
      const vision = await import(/* webpackIgnore: true */ visionUrl);
      const { FilesetResolver, PoseLandmarker } = vision as unknown as {
        FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
        PoseLandmarker: { createFromOptions: (f: unknown, o: unknown) => Promise<unknown> };
      };
      const fileset = await FilesetResolver.forVisionTasks(`${cdnBase}/wasm`);
      const landmarker = (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      })) as {
        detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number }[][] };
        close: () => void;
      };
      poseRef.current = { close: () => landmarker.close() };
      inputModeRef.current = "camera";
      autoDriftRef.current = null;
      setInputMode("camera");
      setCameraState("on");
      setNotice("Camera live — your torso centroid is your position. Step and lean to sculpt.");

      const detectLoop = () => {
        if (inputModeRef.current !== "camera" || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          try {
            const res = landmarker.detectForVideo(v, performance.now());
            const lms = res.landmarks && res.landmarks[0];
            if (lms && lms.length > 24) {
              const cx = (lms[11].x + lms[12].x + lms[23].x + lms[24].x) / 4;
              const cy = (lms[11].y + lms[12].y + lms[23].y + lms[24].y) / 4;
              liveRef.current.x = Math.min(1, Math.max(0, 1 - cx)); // mirror x
              liveRef.current.y = Math.min(1, Math.max(0, cy));
            }
          } catch {
            /* skip frame */
          }
        }
        requestAnimationFrame(detectLoop);
      };
      requestAnimationFrame(detectLoop);
    } catch {
      setCameraState("error");
      setNotice("MediaPipe could not load (offline?) — using pointer control instead.");
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [ensureEngine]);

  // ── boot ──
  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current!;
    const sizeTo = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.floor(r.width * dpr));
      const h = Math.max(2, Math.floor(r.height * dpr));
      rendererRef.current?.resize(w, h);
    };

    (async () => {
      let ren: Renderer | null = null;
      try {
        ren = await makeWebGPU(canvas);
      } catch {
        ren = null;
      }
      if (!ren) ren = makeWebGL2(canvas);
      if (!ren) ren = makeCanvas2D(canvas);
      if (!mounted) {
        ren?.destroy();
        return;
      }
      rendererRef.current = ren;
      setRendererKind(ren.kind);
      sizeTo();
      window.addEventListener("resize", sizeTo);
      startLoop();

      // best-effort auto-start: fade the drone in + slow drift after 1.5s.
      // If autoplay is blocked the AudioContext stays suspended until the first
      // gesture (pointer/button) calls ensureEngine().resume().
      setTimeout(() => {
        if (!mounted) return;
        if (inputModeRef.current !== "auto") return;
        ensureEngine();
        autoDriftRef.current = Math.random() * 6.28;
      }, 1500);
    })();

    return () => {
      mounted = false;
      window.removeEventListener("resize", sizeTo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── teardown ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        poseRef.current?.close?.();
      } catch {
        /* ignore */
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      rendererRef.current?.destroy();
      engineRef.current?.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#080410] text-foreground">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas
        ref={canvasRef}
        onPointerMove={onPointer}
        onPointerDown={onCanvasDown}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="pointer-events-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Dream House
          </h1>
          <p className="mt-2 text-base text-foreground">
            A room of sustained just-intoned sine drones — move and some partials bloom while others
            fade. Pure standing-wave timbre you sculpt with your position. No notes, no wrong notes.
          </p>
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={leaveResonance}
            className="min-h-[44px] rounded-lg bg-violet-400/90 px-4 py-2.5 text-base font-medium text-[#120820] transition hover:bg-violet-300"
          >
            Leave a resonance
          </button>

          <button
            onClick={startCamera}
            disabled={cameraState === "loading" || cameraState === "on"}
            className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
          >
            {cameraState === "on"
              ? "Camera live"
              : cameraState === "loading"
              ? "Loading…"
              : "Start camera (full body)"}
          </button>

          <button
            onClick={clearMarkers}
            className="min-h-[44px] rounded-lg border border-border bg-transparent px-4 py-2.5 text-base font-medium text-muted-foreground transition hover:bg-accent"
          >
            Clear resonances
          </button>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-lg border border-border bg-transparent px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent"
          >
            Read the design notes
          </button>

          <div className="ml-auto flex items-center gap-4 font-mono text-base text-muted-foreground">
            <span>
              loudest <span className="text-violet-200">{loudest}</span>
            </span>
            <span>
              marks <span className="text-foreground">{markerCount}</span>
            </span>
            <span className="hidden sm:inline">
              render <span className="text-foreground">{rendererKind}</span>
            </span>
          </div>
        </div>

        {notice && (
          <p
            className={`mt-3 text-base ${
              cameraState === "error" ? "text-violet-300" : "text-muted-foreground"
            }`}
          >
            {notice}
          </p>
        )}
      </div>

      {/* design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-6">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-xl border border-border bg-[#140a22] p-6 text-base text-foreground shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">The drone:</span> eight permanently-running sine
                oscillators tuned to just ratios over a {Math.round(FUND)} Hz fundamental — 1/1, 9/8,
                5/4, 4/3, 3/2, 7/4, 2/1, 9/4. They never stop; this is timbre, not melody.
              </li>
              <li>
                <span className="text-foreground">Position → spectrum:</span> each partial has a spatial
                well. Your proximity (Gaussian falloff) sets its gain, so small moves re-balance which
                overtones dominate. A position-dependent detuned twin per partial adds the shifting
                beats that are the Dream House&rsquo;s signature shimmer.
              </li>
              <li>
                <span className="text-foreground">HRTF:</span> you are the AudioListener; each partial
                sits at a fixed 3D position via an HRTF PannerNode, so the field re-pans around you as
                you walk among the sources.
              </li>
              <li>
                <span className="text-foreground">Zazeela light:</span> a symmetric magenta/violet glow
                field whose blooms brighten with the partials that are currently loud.
              </li>
              <li>
                <span className="text-foreground">Leave a resonance:</span> bookmark your current
                spectral position as a soft persistent marker you can walk back to.
              </li>
              <li>
                <span className="text-foreground">Render:</span> hand-written WGSL particle field
                (WebGPU) → WebGL2 point sprites → Canvas2D radial blooms. Active path shown in the HUD.
              </li>
              <li>
                <span className="text-foreground">Input:</span> pointer/touch by default; optional
                MediaPipe full-body pose; zero-interaction auto-drift on load.
              </li>
              <li>
                <span className="text-foreground">Lineage:</span> La Monte Young &amp; Marian
                Zazeela&rsquo;s <em>Dream House</em> (MELA Foundation, NYC); Janet Cardiff&rsquo;s{" "}
                <em>The Forty Part Motet</em>.
              </li>
            </ul>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-medium text-[#120820] hover:bg-card"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
