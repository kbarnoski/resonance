"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ── Minimal local WebGPU typings (we avoid adding @webgpu/types to package.json) ─
// We use careful casts to `any` only at the navigator.gpu boundary; the rest is typed
// through the GPUTypes interface kept loose on purpose.
interface NavGPU {
  gpu?: {
    requestAdapter: (o?: unknown) => Promise<unknown>;
    getPreferredCanvasFormat: () => string;
  };
}

// ── Harmonic field ────────────────────────────────────────────────────────────
// Position -> harmony. We use a REAL functional layout, not a "no-wrong-notes"
// pentatonic. The x-axis walks a Tonnetz-flavoured diatonic neighbourhood in C
// major: I  vi  IV  ii  V  iii  I' (smoothly voice-led, common-tone heavy).
// The y-axis selects voicing/inversion + register so vertical motion re-voices the
// same harmony. Each chord is given as MIDI pitch classes relative to a root octave.
//
// Columns (left -> right), root + chord-tones (semitone offsets from root):
//   C major (I), A minor (vi), F major (IV), D minor (ii), G major (V), E minor (iii)
// These all live inside C major and are heavily common-toned so any 6-stack is consonant.

interface ChordSpec {
  name: string;
  roman: string;
  root: number; // MIDI note of the root (octave ~3)
  tones: number[]; // semitone offsets forming the triad/7th
  hue: number; // 0..1 warm-gallery hue for this harmonic region
}

const FIELD: ChordSpec[] = [
  { name: "C", roman: "I", root: 48, tones: [0, 4, 7, 11], hue: 0.09 }, // amber
  { name: "Am", roman: "vi", root: 45, tones: [0, 3, 7, 10], hue: 0.04 }, // terracotta
  { name: "F", roman: "IV", root: 41, tones: [0, 4, 7, 11], hue: 0.13 }, // honey
  { name: "Dm", roman: "ii", root: 50, tones: [0, 3, 7, 10], hue: 0.0 }, // rust
  { name: "G", roman: "V", root: 43, tones: [0, 4, 7, 10], hue: 0.11 }, // gold
  { name: "Em", roman: "iii", root: 40, tones: [0, 3, 7, 10], hue: 0.07 }, // ember
];

const BAR_SECONDS = 7; // loop length
const MAX_GHOSTS = 6;
const SAMPLE_HZ = 30; // path sampling rate

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Pick chord + a voiced note from normalized position.
// x in [0,1] -> column (chord), y in [0,1] -> inversion/register.
function harmonyAt(x: number, y: number): { chord: ChordSpec; freq: number; hue: number } {
  const col = Math.min(FIELD.length - 1, Math.max(0, Math.floor(x * FIELD.length)));
  const chord = FIELD[col];
  // y selects which chord tone + octave: higher = higher voice.
  const span = chord.tones.length;
  const idx = Math.min(span - 1, Math.max(0, Math.floor((1 - y) * span)));
  const octBoost = (1 - y) > 0.66 ? 12 : 0; // top third jumps an octave for a lead voice
  const note = chord.root + chord.tones[idx] + 12 + octBoost; // +12 to sit in a singable range
  return { chord, freq: midiToFreq(note), hue: chord.hue };
}

// ── Types for ghosts ──────────────────────────────────────────────────────────
interface PathPoint {
  x: number;
  y: number;
  freq: number;
  hue: number;
}

interface Ghost {
  id: number;
  path: PathPoint[];
  hue: number;
  // audio
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  filter: BiquadFilterNode;
}

interface LiveState {
  x: number;
  y: number;
}

// ── Audio engine ──────────────────────────────────────────────────────────────
class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  busGain: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  listener: AudioListener;
  live: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  constructor() {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.ctx = new AC();
    this.listener = this.ctx.listener;
    this.busGain = this.ctx.createGain();
    this.busGain.gain.value = 1;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 5200;
    this.lowpass.Q.value = 0.4;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.busGain.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  setListenerPos(x: number, y: number) {
    // Map normalized room (x,y) to a small world. Listener faces -z.
    const lx = (x - 0.5) * 6;
    const lz = (0.5 - y) * 4;
    const t = this.ctx.currentTime;
    if (this.listener.positionX) {
      this.listener.positionX.setTargetAtTime(lx, t, 0.05);
      this.listener.positionY.setTargetAtTime(0, t, 0.05);
      this.listener.positionZ.setTargetAtTime(lz, t, 0.05);
    } else {
      // deprecated API fallback
      (this.listener as unknown as { setPosition: (a: number, b: number, c: number) => void })
        .setPosition?.(lx, 0, lz);
    }
  }

  ensureLive() {
    if (this.live) return this.live;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2600;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.busGain);
    osc.start();
    this.live = { osc, gain, filter };
    return this.live;
  }

  setLive(freq: number, active: boolean) {
    const l = this.ensureLive();
    const t = this.ctx.currentTime;
    l.osc.frequency.setTargetAtTime(freq, t, 0.04);
    l.gain.gain.setTargetAtTime(active ? 0.18 : 0.0, t, 0.06);
  }

  normalize(count: number) {
    // ~1/sqrt(n) gain normalization across the bus
    const g = count <= 0 ? 1 : 1 / Math.sqrt(count + 1);
    this.busGain.gain.setTargetAtTime(0.9 * Math.max(0.32, g), this.ctx.currentTime, 0.2);
  }

  makeGhost(id: number, hue: number): Ghost {
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1700;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 14;
    panner.rolloffFactor = 0.7;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.busGain);
    osc.start();
    sub.start();
    return { id, path: [], hue, osc, sub, gain, panner, filter };
  }

  updateGhost(g: Ghost, p: PathPoint) {
    const t = this.ctx.currentTime;
    g.osc.frequency.setTargetAtTime(p.freq, t, 0.05);
    g.sub.frequency.setTargetAtTime(p.freq / 2, t, 0.05);
    g.gain.gain.setTargetAtTime(0.16, t, 0.08);
    g.filter.frequency.setTargetAtTime(1200 + p.y * 2200, t, 0.1);
    const px = (p.x - 0.5) * 6;
    const pz = (0.5 - p.y) * 4;
    if (g.panner.positionX) {
      g.panner.positionX.setTargetAtTime(px, t, 0.05);
      g.panner.positionY.setTargetAtTime(0, t, 0.05);
      g.panner.positionZ.setTargetAtTime(pz, t, 0.05);
    } else {
      (g.panner as unknown as { setPosition: (a: number, b: number, c: number) => void })
        .setPosition?.(px, 0, pz);
    }
  }

  killGhost(g: Ghost) {
    try {
      g.osc.stop();
      g.sub.stop();
    } catch {
      /* already stopped */
    }
    g.osc.disconnect();
    g.sub.disconnect();
    g.filter.disconnect();
    g.gain.disconnect();
    g.panner.disconnect();
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
      if (this.live) {
        this.live.osc.stop();
        this.live.osc.disconnect();
        this.live.gain.disconnect();
        this.live.filter.disconnect();
      }
    } catch {
      /* ignore */
    }
    this.busGain.disconnect();
    this.lowpass.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ── Renderer abstraction ────────────────────────────────────────────────────────
// All renderers expose draw(frame) drawing ghosts + live performer as point fields.
interface DrawGhost {
  points: { x: number; y: number }[]; // recent trail in normalized coords
  head: { x: number; y: number };
  hue: number;
  intensity: number; // 0..1 how loudly it's sounding now
  live: boolean;
}

interface Renderer {
  kind: "webgpu" | "webgl2" | "canvas2d";
  draw: (ghosts: DrawGhost[]) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

// HSL warm palette -> rgb (gallery / candle-lit, low saturation, warm)
function warmRGB(hue: number, light: number): [number, number, number] {
  const s = 0.55;
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

// ── Canvas2D fallback renderer ────────────────────────────────────────────────
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
    draw(ghosts) {
      // warm gallery wash
      ctx.fillStyle = "rgba(20,15,12,0.30)";
      ctx.fillRect(0, 0, W, H);
      for (const gh of ghosts) {
        const [r, g, b] = warmRGB(gh.hue, gh.live ? 0.62 : 0.5);
        const baseA = gh.live ? 0.9 : 0.4 + gh.intensity * 0.4;
        // trail particles
        for (let i = 0; i < gh.points.length; i++) {
          const p = gh.points[i];
          const f = i / Math.max(1, gh.points.length);
          ctx.beginPath();
          ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${
            baseA * f * 0.5
          })`;
          ctx.arc(p.x * W, p.y * H, 2 + f * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        // head bloom
        const grd = ctx.createRadialGradient(
          gh.head.x * W,
          gh.head.y * H,
          0,
          gh.head.x * W,
          gh.head.y * H,
          (gh.live ? 60 : 34) * (0.6 + gh.intensity)
        );
        grd.addColorStop(0, `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${baseA})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(gh.head.x * W, gh.head.y * H, (gh.live ? 60 : 34) * (0.6 + gh.intensity), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    destroy() {
      /* nothing persistent */
    },
  };
}

// ── WebGL2 renderer (point sprites) ───────────────────────────────────────────
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
    draw(ghosts) {
      gl.clearColor(0.078, 0.059, 0.047, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const data: number[] = [];
      for (const gh of ghosts) {
        const [r, g, b] = warmRGB(gh.hue, gh.live ? 0.66 : 0.52);
        for (let i = 0; i < gh.points.length; i++) {
          const p = gh.points[i];
          const f = i / Math.max(1, gh.points.length);
          data.push(p.x, p.y, 3 + f * 4, r, g, b, (gh.live ? 0.5 : 0.3) * f * (0.5 + gh.intensity));
        }
        // dense head cluster
        const hcount = gh.live ? 90 : 50;
        for (let k = 0; k < hcount; k++) {
          const ang = (k / hcount) * Math.PI * 2;
          const rad = (Math.random() * 0.5 + 0.05) * (gh.live ? 0.055 : 0.035) * (0.7 + gh.intensity);
          data.push(
            gh.head.x + Math.cos(ang) * rad,
            gh.head.y + Math.sin(ang) * rad,
            (gh.live ? 7 : 5) * (0.6 + gh.intensity),
            r,
            g,
            b,
            (gh.live ? 0.85 : 0.5) * (0.5 + gh.intensity)
          );
        }
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

// ── WebGPU renderer (hand-written WGSL point field) ───────────────────────────
async function makeWebGPU(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  const navGpu = navigator as unknown as NavGPU;
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

  // Each particle: vec2 pos, f32 size, vec3 color, f32 alpha  => 7 floats.
  // We draw with 6 verts per particle (a quad) using instancing-free expansion in VS.
  const wgsl = `
  struct Particle { pos: vec2<f32>, size: f32, color: vec3<f32>, alpha: f32 };
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
    let half = p.size; // in clip units (already scaled by caller)
    var out: VSOut;
    out.clip = vec4<f32>(ndc + o*half, 0.0, 1.0);
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
  const MAX_PARTS = 6000;
  const FLOATS = 8; // pos(2)+size(1)+pad(1)+color(3)+alpha(1) => align to 8 for std layout
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
  // bind group
  const bindGroup = (dev as unknown as {
    createBindGroup: (o: unknown) => unknown;
  }).createBindGroup({
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
    draw(ghosts) {
      let n = 0;
      const aspect = canvas.height / Math.max(1, canvas.width);
      const push = (x: number, y: number, sizePx: number, c: [number, number, number], a: number) => {
        if (n >= MAX_PARTS) return;
        const o = n * FLOATS;
        cpu[o] = x;
        cpu[o + 1] = y;
        // size in clip units; convert px-ish to fraction of width
        cpu[o + 2] = (sizePx / canvas.width) * 2;
        cpu[o + 3] = aspect; // store aspect in pad slot, unused but keeps stride
        cpu[o + 4] = c[0];
        cpu[o + 5] = c[1];
        cpu[o + 6] = c[2];
        cpu[o + 7] = a;
        n++;
      };
      for (const gh of ghosts) {
        const col = warmRGB(gh.hue, gh.live ? 0.66 : 0.52);
        for (let i = 0; i < gh.points.length; i++) {
          const p = gh.points[i];
          const f = i / Math.max(1, gh.points.length);
          push(p.x, p.y, (3 + f * 5), col, (gh.live ? 0.45 : 0.28) * f * (0.5 + gh.intensity));
        }
        const hcount = gh.live ? 130 : 70;
        for (let k = 0; k < hcount; k++) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.sqrt(Math.random()) * (gh.live ? 0.06 : 0.04) * (0.7 + gh.intensity);
          push(
            gh.head.x + Math.cos(ang) * rad,
            gh.head.y + Math.sin(ang) * rad,
            (gh.live ? 9 : 6) * (0.6 + gh.intensity),
            col,
            (gh.live ? 0.8 : 0.45) * (0.5 + gh.intensity)
          );
        }
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
            clearValue: { r: 0.078, g: 0.059, b: 0.047, a: 1 },
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

// ── React component ───────────────────────────────────────────────────────────
type InputMode = "auto" | "pointer" | "camera";

export default function EchoRoomGPU() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [rendererKind, setRendererKind] = useState<string>("…");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [armed, setArmed] = useState(false);
  const [ghostCount, setGhostCount] = useState(0);
  const [notice, setNotice] = useState<string>("");
  const [cameraState, setCameraState] = useState<"off" | "loading" | "on" | "error">("off");
  const [showNotes, setShowNotes] = useState(false);
  const [nowChord, setNowChord] = useState<string>("—");

  // mutable engine refs
  const engineRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const ghostsRef = useRef<Ghost[]>([]);
  const liveRef = useRef<LiveState>({ x: 0.5, y: 0.5 });
  const armedRef = useRef(false);
  const recBufRef = useRef<PathPoint[]>([]);
  const recStartRef = useRef(0);
  const rafRef = useRef(0);
  const idRef = useRef(1);
  const lastSampleRef = useRef(0);
  const phaseRef = useRef(0); // global loop phase 0..1
  const inputModeRef = useRef<InputMode>("auto");
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<{ close?: () => void; detect?: (v: HTMLVideoElement, t: number) => unknown } | null>(
    null
  );
  const autoDemoRef = useRef<{ phase: number } | null>(null);

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  // ── add ghost from recorded buffer ──
  const commitGhost = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const buf = recBufRef.current;
    if (buf.length < 4) {
      recBufRef.current = [];
      return;
    }
    const hue = buf[Math.floor(buf.length / 2)].hue;
    const g = eng.makeGhost(idRef.current++, hue);
    g.path = buf.slice();
    ghostsRef.current.push(g);
    // cap
    while (ghostsRef.current.length > MAX_GHOSTS) {
      const old = ghostsRef.current.shift();
      if (old) eng.killGhost(old);
    }
    eng.normalize(ghostsRef.current.length);
    setGhostCount(ghostsRef.current.length);
    recBufRef.current = [];
  }, []);

  const armLoop = useCallback(() => {
    if (armedRef.current) return;
    recBufRef.current = [];
    recStartRef.current = performance.now();
    setArmed(true);
  }, []);

  const clearAll = useCallback(() => {
    const eng = engineRef.current;
    if (eng) for (const g of ghostsRef.current) eng.killGhost(g);
    ghostsRef.current = [];
    if (eng) eng.normalize(0);
    setGhostCount(0);
  }, []);

  // ── main animation/audio loop ──
  const startLoop = useCallback(() => {
    const tick = () => {
      const eng = engineRef.current;
      const ren = rendererRef.current;
      const now = performance.now();

      // advance global phase
      phaseRef.current = ((now / 1000) % BAR_SECONDS) / BAR_SECONDS;

      // auto-demo: if no real input engaged, drive live with a figure-8
      if (inputModeRef.current === "auto" && autoDemoRef.current) {
        autoDemoRef.current.phase += 0.0045;
        const a = autoDemoRef.current.phase;
        liveRef.current.x = 0.5 + 0.32 * Math.sin(a);
        liveRef.current.y = 0.5 + 0.22 * Math.sin(a * 2);
      }

      const live = liveRef.current;
      const h = harmonyAt(live.x, live.y);

      if (eng) {
        eng.setListenerPos(live.x, live.y);
        eng.setLive(h.freq, true);
      }

      // recording
      if (armedRef.current) {
        const elapsed = (now - recStartRef.current) / 1000;
        if (now - lastSampleRef.current > 1000 / SAMPLE_HZ) {
          lastSampleRef.current = now;
          recBufRef.current.push({ x: live.x, y: live.y, freq: h.freq, hue: h.hue });
        }
        if (elapsed >= BAR_SECONDS) {
          commitGhost();
          // auto-arm-next if room remains
          if (ghostsRef.current.length < MAX_GHOSTS) {
            recBufRef.current = [];
            recStartRef.current = now;
          } else {
            armedRef.current = false;
            setArmed(false);
          }
        }
      }

      // playback ghosts + collect draw data
      const drawList: DrawGhost[] = [];
      for (const g of ghostsRef.current) {
        const len = g.path.length;
        if (len === 0) continue;
        const idxF = phaseRef.current * len;
        const idx = Math.floor(idxF) % len;
        const p = g.path[idx];
        if (eng) eng.updateGhost(g, p);
        // trail = last ~20 points behind head
        const trail: { x: number; y: number }[] = [];
        for (let t = 18; t >= 0; t--) {
          const ti = (idx - t + len) % len;
          trail.push({ x: g.path[ti].x, y: g.path[ti].y });
        }
        drawList.push({
          points: trail,
          head: { x: p.x, y: p.y },
          hue: g.hue,
          intensity: 0.8,
          live: false,
        });
      }
      // live performer (brightest)
      drawList.push({
        points: [],
        head: { x: live.x, y: live.y },
        hue: h.hue,
        intensity: 1,
        live: true,
      });

      if (ren) ren.draw(drawList);

      // update chord readout occasionally (cheap, every frame ok)
      // throttle via phase
      tickChordRef.current = h.chord.name + " " + h.chord.roman;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [commitGhost]);

  const tickChordRef = useRef("—");
  useEffect(() => {
    const iv = setInterval(() => setNowChord(tickChordRef.current), 150);
    return () => clearInterval(iv);
  }, []);

  // ── pointer input ──
  const onPointer = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === "camera") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    liveRef.current.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    liveRef.current.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (inputModeRef.current === "auto") {
      autoDemoRef.current = null;
      setInputMode("pointer");
      setNotice("Pointer = your body. Move to play the harmonic field.");
    }
  }, []);

  // ── camera + MediaPipe pose ──
  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setNotice("Requesting camera + loading MediaPipe Pose…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
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
        PoseLandmarker: {
          createFromOptions: (f: unknown, o: unknown) => Promise<unknown>;
        };
      };
      const fileset = await FilesetResolver.forVisionTasks(`${cdnBase}/wasm`);
      const landmarker = (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      })) as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: unknown[][] }; close: () => void };
      poseRef.current = { close: () => landmarker.close() };
      inputModeRef.current = "camera";
      autoDemoRef.current = null;
      setInputMode("camera");
      setCameraState("on");
      setNotice("Camera live — your torso/hip centroid is your position in the room.");

      const detectLoop = () => {
        if (inputModeRef.current !== "camera" || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          try {
            const res = landmarker.detectForVideo(v, performance.now());
            const lms = res.landmarks && res.landmarks[0];
            if (lms && lms.length > 24) {
              // hips: 23 (left), 24 (right); shoulders 11,12 -> torso centroid
              const pts = lms as { x: number; y: number }[];
              const cx = (pts[11].x + pts[12].x + pts[23].x + pts[24].x) / 4;
              const cy = (pts[11].y + pts[12].y + pts[23].y + pts[24].y) / 4;
              // mirror x (selfie)
              liveRef.current.x = Math.min(1, Math.max(0, 1 - cx));
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
      // MediaPipe failed to load — keep camera off, stay pointer/auto
      setCameraState("error");
      setNotice("MediaPipe could not load (offline?) — using pointer control instead.");
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

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
      // renderer chain
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

      // auto-demo after 1.5s: record a couple of ghosts so it sounds + moves
      setTimeout(() => {
        if (!mounted) return;
        if (inputModeRef.current !== "auto") return;
        // ensure audio (may be suspended until gesture, but try)
        ensureEngine();
        autoDemoRef.current = { phase: 0 };
        setNotice("Auto-demo: recording past selves automatically. Click/tap or start camera to take over.");
        // schedule two auto ghosts
        autoRecord(0);
        autoRecord(BAR_SECONDS * 1000 + 200);
      }, 1500);
    })();

    return () => {
      mounted = false;
      window.removeEventListener("resize", sizeTo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
    }
    engineRef.current.resume();
    return engineRef.current;
  }, []);

  // auto-record helper (drives armed recording on a timer for the demo)
  const autoRecord = useCallback(
    (delay: number) => {
      window.setTimeout(() => {
        if (inputModeRef.current !== "auto") return;
        if (ghostsRef.current.length >= MAX_GHOSTS) return;
        armLoop();
        window.setTimeout(() => {
          // armLoop's loop commits automatically at BAR end; ensure we stop arming after one bar
          armedRef.current = false;
          setArmed(false);
        }, BAR_SECONDS * 1000 + 80);
      }, delay);
    },
    [armLoop]
  );

  // primary action handler also unlocks audio
  const onPrimary = useCallback(() => {
    ensureEngine();
    armLoop();
  }, [ensureEngine, armLoop]);

  const onCanvasInteract = useCallback(
    (e: React.PointerEvent) => {
      ensureEngine();
      onPointer(e);
    },
    [ensureEngine, onPointer]
  );

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
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0f0b08] text-foreground">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas
        ref={canvasRef}
        onPointerMove={onPointer}
        onPointerDown={onCanvasInteract}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="pointer-events-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Echo Room
          </h1>
          <p className="mt-2 text-base text-foreground">
            Walk an invisible harmonic field; each loop becomes a past self — a glowing body that
            re-traces your path and re-sings its chord, spatialized around you.
          </p>
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onPrimary}
            className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base font-medium transition ${
              armed
                ? "bg-violet-400 text-[#1a1209] shadow-lg shadow-violet-500/20"
                : "bg-muted text-[#1a1209] hover:bg-card"
            }`}
          >
            {armed ? "Recording past self…" : "Start a loop"}
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
            onClick={clearAll}
            className="min-h-[44px] rounded-lg border border-border bg-transparent px-4 py-2.5 text-base font-medium text-muted-foreground transition hover:bg-accent"
          >
            Clear all
          </button>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-lg border border-border bg-transparent px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent"
          >
            Design notes
          </button>

          <div className="ml-auto flex items-center gap-4 font-mono text-base text-muted-foreground">
            <span>
              ghosts <span className="text-foreground">{ghostCount}</span>/{MAX_GHOSTS}
            </span>
            <span>
              chord <span className="text-violet-300/90">{nowChord}</span>
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

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-6">
          <div className="max-w-lg rounded-xl border border-border bg-[#171009] p-6 text-base text-foreground shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">Position → harmony:</span> the room&rsquo;s x-axis walks a
                voice-led diatonic neighbourhood in C major (I &middot; vi &middot; IV &middot; ii &middot; V &middot; iii). The y-axis
                chooses the voicing/inversion and register. Real functional harmony, not a
                no-wrong-notes scale.
              </li>
              <li>
                <span className="text-foreground">Loop / ghost:</span> &ldquo;Start a loop&rdquo;
                records your path for one {BAR_SECONDS}s bar. It becomes a permanent ghost that loops
                forever, re-sounding its chord at its moving position. Up to {MAX_GHOSTS}; oldest
                drops.
              </li>
              <li>
                <span className="text-foreground">Spatial audio:</span> each ghost owns an HRTF
                PannerNode; your position is the AudioListener, so the ensemble re-pans as you move.
              </li>
              <li>
                <span className="text-foreground">Render:</span> hand-written WGSL particle field
                (WebGPU), falling back to WebGL2 points then Canvas2D — always showing the ghosts.
              </li>
              <li>
                <span className="text-foreground">Input:</span> MediaPipe Pose torso centroid, falling
                back to pointer, with a zero-hardware auto-demo on load.
              </li>
            </ul>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-medium text-[#1a1209] hover:bg-card"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
