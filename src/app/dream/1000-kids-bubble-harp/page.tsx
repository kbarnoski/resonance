"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// 1000 · KIDS BUBBLE HARP
// Tap floating bubbles → each is a REAL Karplus-Strong plucked string that
// wobbles, sings, and blooms. Drag across them for a harp glissando.
// Rendering: raw WebGL2 (additive glowing bubbles) → Canvas2D fallback.
// Audio: Karplus-Strong delay-line worklet → precomputed-buffer fallback.
// ─────────────────────────────────────────────────────────────────────────────

// ── Scale: D major pentatonic (D E F# A B) — no "wrong" notes ────────────────
// Low octaves = big bubbles, high octaves = small bubbles.
const SCALE_SEMIS = [2, 4, 6, 9, 11]; // D E F# A B (relative to C)
const NOTE_NAMES = ["D", "E", "F♯", "A", "B"];

interface BubbleSpec {
  freq: number;
  name: string;
  baseR: number; // base radius in px (size ↔ pitch)
  hue: number; // 175 teal → 30 amber
}

// Build a palette of bubble "types": 3 octaves × 5 pentatonic notes = 15 tunings.
const BUBBLE_SPECS: BubbleSpec[] = (() => {
  const specs: BubbleSpec[] = [];
  const octaves = [3, 4, 5];
  octaves.forEach((oct) => {
    SCALE_SEMIS.forEach((semi, si) => {
      const midi = 12 + oct * 12 + semi;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const idx = specs.length; // 0..14, low→high
      // Bigger for lower notes.
      const t = idx / 14; // 0 low → 1 high
      const baseR = 88 - t * 50; // 88px (low) → 38px (high)
      const hue = 178 - t * 150; // teal (low) → amber/coral (high)
      specs.push({
        freq,
        name: `${NOTE_NAMES[si]}${oct}`,
        baseR,
        hue,
      });
    });
  });
  return specs;
})();

const BUBBLE_COUNT = 16;

// ── Live bubble state ────────────────────────────────────────────────────────
interface Bubble {
  spec: BubbleSpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // effective radius (≥ baseR, big ones get a min floor for tappability)
  phase: number; // bob phase
  pluckT: number; // time since pluck (s), or Infinity = at rest
  wobAmp: number; // current wobble amplitude
  wobPhase: number; // wobble oscillation phase
  squash: number; // contact squash 0..1
  squashAng: number; // direction of contact squash
}

// ─────────────────────────────────────────────────────────────────────────────
// Karplus-Strong AudioWorklet source (loaded via Blob URL — self-contained).
// A genuine delay line with a 2-point averaging low-pass in the feedback path,
// excited by a short soft noise burst. This IS the 1983 Karplus & Strong string.
// ─────────────────────────────────────────────────────────────────────────────
const KS_WORKLET_SRC = `
class KarplusVoice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.line = null;
    this.len = 0;
    this.idx = 0;
    this.active = false;
    this.gain = 0;
    this.damp = 0.5;       // averaging-filter blend (brightness)
    this.decay = 0.996;    // loop gain < 1 → string decay
    this.last = 0;         // 1-pole smoothing memory for the LP
  }
  pluck(freq, vel, damp, decay) {
    // Delay length sets the pitch: sr / freq samples around the loop.
    const len = Math.max(8, Math.round(this.sr / freq));
    if (!this.line || this.line.length < len) this.line = new Float32Array(len + 4);
    this.len = len;
    this.idx = 0;
    this.damp = damp;
    this.decay = decay;
    this.last = 0;
    // Excitation: short noise burst, slightly low-pass smoothed so the attack
    // is soft (kids-safe — no harsh transient). This fills the delay line.
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const noise = Math.random() * 2 - 1;
      prev = prev * 0.55 + noise * 0.45; // smooth the burst
      this.line[i] = prev * vel;
    }
    this.active = true;
    this.gain = vel;
  }
  // Render one sample through the delay-line feedback loop.
  next() {
    if (!this.active) return 0;
    const i = this.idx;
    const ni = (i + 1) % this.len;
    const cur = this.line[i];
    const nxt = this.line[ni];
    // 2-point averaging low-pass + loop gain = the Karplus-Strong filter.
    const avg = (cur * (1 - this.damp) + nxt * this.damp);
    const filtered = avg * this.decay;
    this.line[i] = filtered;
    this.idx = ni;
    // Track energy so we can free the voice when it has rung out.
    this.gain = this.gain * 0.99995 + Math.abs(cur) * 0.00005;
    if (Math.abs(cur) < 1e-5 && this.gain < 1e-4) this.active = false;
    return cur;
  }
}

class KarplusProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < 24; i++) this.voices.push(new KarplusVoice(sampleRate));
    this.rr = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'pluck') {
        // Round-robin voice steal so mashing taps never runs out.
        const v = this.voices[this.rr];
        this.rr = (this.rr + 1) % this.voices.length;
        v.pluck(d.freq, d.vel, d.damp, d.decay);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    const n = out.length;
    const voices = this.voices;
    for (let s = 0; s < n; s++) {
      let mix = 0;
      let active = 0;
      for (let v = 0; v < voices.length; v++) {
        if (voices[v].active) { mix += voices[v].next(); active++; }
      }
      // √-voice normalization: a fistful of taps stays loud-safe.
      if (active > 1) mix /= Math.sqrt(active);
      out[s] = mix;
    }
    return true;
  }
}
registerProcessor('karplus-proc', KarplusProcessor);
`;

// ── Precomputed-buffer KS fallback (no worklet) ──────────────────────────────
// Still a genuine delay-line feedback pluck, just rendered offline into a buffer.
function buildKarplusBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = Math.max(0.7, 2.0 - freq / 600);
  const bufLen = Math.round(sr * dur);
  const ringLen = Math.max(8, Math.round(sr / freq));
  const ring = new Float32Array(ringLen);
  let prev = 0;
  for (let i = 0; i < ringLen; i++) {
    const noise = Math.random() * 2 - 1;
    prev = prev * 0.55 + noise * 0.45;
    ring[i] = prev * 0.7;
  }
  const data = new Float32Array(bufLen);
  for (let n = 0; n < bufLen; n++) {
    const i = n % ringLen;
    data[n] = ring[i];
    ring[i] = 0.996 * 0.5 * (ring[i] + ring[(i + 1) % ringLen]);
  }
  const buf = ctx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
type Phase = "idle" | "ready";

export default function BubbleHarp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioWarn, setAudioWarn] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"webgl" | "canvas">("webgl");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const ksNodeRef = useRef<AudioWorkletNode | null>(null);
  const voiceBusRef = useRef<GainNode | null>(null); // pluck voices route here
  const ksBufsRef = useRef<AudioBuffer[]>([]); // fallback buffers per spec
  const useWorkletRef = useRef(false);

  // Bubble physics
  const bubblesRef = useRef<Bubble[]>([]);
  const lastDragRef = useRef<{ id: number; t: number }>({ id: -1, t: 0 });

  // Auto-demo (ghost finger)
  const lastInputRef = useRef(0);
  const ghostNextRef = useRef(0);

  // ── Pluck one bubble (THE single pipeline used by tap, drag, AND ghost) ──────
  const pluckBubble = useCallback((b: Bubble, vel = 0.85) => {
    const ctx = ctxRef.current;
    // Visual response is immediate regardless of audio.
    b.pluckT = 0;
    b.wobAmp = 1;
    b.wobPhase = 0;

    if (!ctx) return;
    const spec = b.spec;
    // Bigger/lower bubbles: darker (less damp) + longer decay → warm + long.
    const t = (88 - spec.baseR) / 50; // 0 low → 1 high
    const damp = 0.42 + t * 0.16; // low notes mellower, highs a touch brighter
    const decay = 0.998 - t * 0.006; // lows ring longer, highs shorter (kid-safe)
    const vol = 0.55 + (1 - t) * 0.25; // lows a little louder

    if (useWorkletRef.current && ksNodeRef.current) {
      ksNodeRef.current.port.postMessage({
        type: "pluck",
        freq: spec.freq,
        vel: vel * vol,
        damp,
        decay,
      });
    } else if (ksBufsRef.current.length) {
      const idx = BUBBLE_SPECS.indexOf(spec);
      const buf = ksBufsRef.current[idx >= 0 ? idx : 0];
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = vel * vol * 0.9;
        src.connect(g);
        const bus = voiceBusRef.current;
        if (bus) g.connect(bus);
        src.start();
      }
    }
  }, []);

  // ── Build / respawn the bubble field ─────────────────────────────────────────
  const seedBubbles = useCallback((W: number, H: number) => {
    const list: Bubble[] = [];
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const spec = BUBBLE_SPECS[Math.floor(Math.random() * BUBBLE_SPECS.length)];
      const r = Math.max(34, spec.baseR * (0.85 + Math.random() * 0.3));
      list.push({
        spec,
        x: Math.random() * (W - 2 * r) + r,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 10, // drift upward
        r,
        phase: Math.random() * Math.PI * 2,
        pluckT: Infinity,
        wobAmp: 0,
        wobPhase: 0,
        squash: 0,
        squashAng: 0,
      });
    }
    bubblesRef.current = list;
  }, []);

  // ── Hit test (returns index or -1) ───────────────────────────────────────────
  const bubbleAt = useCallback((px: number, py: number): number => {
    const bs = bubblesRef.current;
    // Topmost (later-drawn) first.
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const hitR = Math.max(b.r, 40); // ≥64px effective target diameter
      const dx = px - b.x;
      const dy = py - b.y;
      if (dx * dx + dy * dy <= hitR * hitR) return i;
    }
    return -1;
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // START — gesture-gates AudioContext + loads worklet synchronously in the tap.
  // ─────────────────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    let ctx: AudioContext | null = null;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      ctxRef.current = ctx;
      await ctx.resume();
    } catch {
      setAudioWarn("Audio unavailable — visuals still alive.");
      setPhase("ready");
      return;
    }

    // ── Kids-safe master chain: gain → lowpass → compressor → out ──────────────
    const master = ctx.createGain();
    master.gain.value = 0.26;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(lp).connect(comp).connect(ctx.destination);

    // Pluck voices share a bus into the master chain.
    const voiceBus = ctx.createGain();
    voiceBus.gain.value = 0.9;
    voiceBus.connect(master);
    voiceBusRef.current = voiceBus;

    // ── Always-on soft drone pad / water ambience (never silent) ───────────────
    // Two detuned low sines + a gently filtered noise "water" shimmer.
    const padFreqs = [BUBBLE_SPECS[0].freq, BUBBLE_SPECS[3].freq]; // D3 + A3 (root + 5th)
    padFreqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f / 2; // an octave down for a soft bed
      const detune = ctx!.createOscillator();
      detune.type = "sine";
      detune.frequency.value = 0.05 + i * 0.03; // slow LFO
      const detuneG = ctx!.createGain();
      detuneG.gain.value = 2.5;
      detune.connect(detuneG).connect(osc.detune);
      const g = ctx!.createGain();
      g.gain.value = 0.07;
      osc.connect(g).connect(master);
      osc.start();
      detune.start();
    });
    // Water shimmer: filtered looping noise.
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * 0.5;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 600;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.025;
    const nLfo = ctx.createOscillator();
    nLfo.frequency.value = 0.08;
    const nLfoG = ctx.createGain();
    nLfoG.gain.value = 250;
    nLfo.connect(nLfoG).connect(nf.frequency);
    noiseSrc.connect(nf).connect(ng).connect(master);
    noiseSrc.start();
    nLfo.start();

    // ── Try the Karplus-Strong worklet; fall back to precomputed buffers ───────
    try {
      const blob = new Blob([KS_WORKLET_SRC], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, "karplus-proc", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.connect(voiceBus);
      ksNodeRef.current = node;
      useWorkletRef.current = true;
    } catch {
      useWorkletRef.current = false;
      ksBufsRef.current = BUBBLE_SPECS.map((s) => buildKarplusBuffer(ctx!, s.freq));
    }

    setPhase("ready");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Main loop: physics + render (WebGL2 primary, Canvas2D fallback).
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    // Try WebGL2 first.
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      premultipliedAlpha: false,
      antialias: false,
    });
    const c2d = gl ? null : canvas.getContext("2d");
    const mode: "webgl" | "canvas" = gl ? "webgl" : "canvas";
    setRenderMode(mode);

    // ── WebGL2 setup: one additive textured quad per bubble ────────────────────
    let glProg: WebGLProgram | null = null;
    let quadVAO: WebGLVertexArrayObject | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uCenter: WebGLUniformLocation | null = null;
    let uRadius: WebGLUniformLocation | null = null;
    let uColor: WebGLUniformLocation | null = null;
    let uWob: WebGLUniformLocation | null = null;
    let uBloom: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uSquash: WebGLUniformLocation | null = null;

    if (gl) {
      const vsSrc = `#version 300 es
      in vec2 aPos;
      out vec2 vUV;
      void main(){ vUV = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;
      // Fragment renders a single bubble into a screen-space quad.
      const fsSrc = `#version 300 es
      precision highp float;
      in vec2 vUV;
      out vec4 frag;
      uniform vec2 uRes;
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uColor;
      uniform float uWob;    // wobble amplitude (pluck)
      uniform float uBloom;  // glow boost on pluck
      uniform float uTime;
      uniform vec2 uSquash;  // x=amount, y=angle
      void main(){
        vec2 p = gl_FragCoord.xy;
        vec2 d = p - uCenter;
        float ang = atan(d.y, d.x);
        // Soft-body wobble: radius ripples around the rim (squash-and-stretch).
        float wob = uWob * (sin(ang*3.0 + uTime*22.0) + 0.5*sin(ang*5.0 - uTime*15.0));
        // Contact squash along a direction.
        float sq = uSquash.x * cos(ang - uSquash.y);
        float rr = uRadius * (1.0 + wob*0.12 + sq*0.10);
        float dist = length(d);
        float edge = dist / max(rr, 1.0);
        // Glassy core + bright rim + outer glow.
        float core = smoothstep(1.05, 0.0, edge);
        float rim = smoothstep(1.0, 0.78, edge) * smoothstep(0.55, 1.0, edge);
        float glow = exp(-edge*edge*1.7);
        // Iridescent highlight (offset toward upper-left, like a real bubble).
        vec2 hl = (d / max(rr,1.0)) - vec2(-0.35, 0.4);
        float spec = exp(-dot(hl,hl)*9.0);
        vec3 col = uColor * (glow*0.6 + rim*0.9) + vec3(spec)*0.8;
        col += uColor * uBloom * glow * 0.9;
        float a = clamp(glow*0.55 + rim*0.8 + core*0.18 + spec, 0.0, 1.0);
        frag = vec4(col * a, a); // additive: alpha-weighted color
      }`;

      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, vsSrc);
      const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      if (vs && fs) {
        const prog = gl.createProgram();
        if (prog) {
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            glProg = prog;
          }
        }
      }
      if (glProg) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        // Full-screen quad (two triangles).
        const quad = new Float32Array([
          -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(glProg, "aPos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        quadVAO = vao;
        uRes = gl.getUniformLocation(glProg, "uRes");
        uCenter = gl.getUniformLocation(glProg, "uCenter");
        uRadius = gl.getUniformLocation(glProg, "uRadius");
        uColor = gl.getUniformLocation(glProg, "uColor");
        uWob = gl.getUniformLocation(glProg, "uWob");
        uBloom = gl.getUniformLocation(glProg, "uBloom");
        uTime = gl.getUniformLocation(glProg, "uTime");
        uSquash = gl.getUniformLocation(glProg, "uSquash");
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive
      }
    }

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
      else if (c2d) {
        c2d.setTransform(1, 0, 0, 1, 0, 0);
        c2d.scale(dpr, dpr);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    if (bubblesRef.current.length === 0) seedBubbles(W, H);
    lastInputRef.current = performance.now();
    ghostNextRef.current = performance.now() + 1800;

    // ── hsl→rgb helper for WebGL color ─────────────────────────────────────────
    const hsl2rgb = (h: number, s: number, l: number): [number, number, number] => {
      h /= 360;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => {
        const k = (n + h * 12) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      };
      return [f(0), f(8), f(4)];
    };

    let prev = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const tSec = now / 1000;
      const bs = bubblesRef.current;

      // ── Ghost-finger auto-demo: after ~1.8s idle, strum bubbles ──────────────
      if (now - lastInputRef.current > 1800 && now >= ghostNextRef.current) {
        // 60% single tap, 40% strum a short run.
        if (Math.random() < 0.4 && bs.length > 2) {
          // Strum: pluck 3–4 nearest-in-x bubbles in sequence.
          const sorted = [...bs].sort((a, b2) => a.x - b2.x);
          const startIdx = Math.floor(Math.random() * (sorted.length - 3));
          const run = sorted.slice(startIdx, startIdx + 3 + Math.floor(Math.random() * 2));
          run.forEach((b, k) => {
            window.setTimeout(() => pluckBubble(b, 0.8), k * 110);
          });
          ghostNextRef.current = now + 1600 + Math.random() * 1200;
        } else {
          const b = bs[Math.floor(Math.random() * bs.length)];
          pluckBubble(b, 0.85);
          ghostNextRef.current = now + 700 + Math.random() * 900;
        }
      }

      // ── Physics: drift, bob, soft-body collisions, respawn ───────────────────
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        b.phase += dt * 1.2;
        b.x += b.vx * dt + Math.sin(b.phase) * 6 * dt;
        b.y += b.vy * dt;
        // Gentle drag.
        b.vx *= 0.995;
        // Walls (x): soft bounce.
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
        // Respawn at bottom when drifting off the top.
        if (b.y < -b.r - 20) {
          b.y = H + b.r + Math.random() * 60;
          b.x = Math.random() * (W - 2 * b.r) + b.r;
          b.vy = -6 - Math.random() * 10;
          // Re-tune to a fresh note for variety.
          b.spec = BUBBLE_SPECS[Math.floor(Math.random() * BUBBLE_SPECS.length)];
          b.r = Math.max(34, b.spec.baseR * (0.85 + Math.random() * 0.3));
        }
        // Decay pluck wobble.
        if (b.pluckT !== Infinity) {
          b.pluckT += dt;
          b.wobPhase += dt;
          b.wobAmp = Math.exp(-b.pluckT * 4.5);
          if (b.wobAmp < 0.01) { b.wobAmp = 0; b.pluckT = Infinity; }
        }
        b.squash *= 0.9;
      }

      // Pairwise soft collisions (squash + nudge, never pop).
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i];
          const b = bs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minD = (a.r + b.r) * 0.82;
          if (dist < minD) {
            const overlap = (minD - dist) / minD;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap * 12;
            a.vx -= nx * push;
            a.vy -= ny * push;
            b.vx += nx * push;
            b.vy += ny * push;
            // Soft-body squash on contact.
            a.squash = Math.min(0.4, a.squash + overlap * 0.5);
            b.squash = Math.min(0.4, b.squash + overlap * 0.5);
            a.squashAng = Math.atan2(ny, nx);
            b.squashAng = Math.atan2(-ny, -nx);
            // Tiny sympathetic shimmer when they kiss (rare, soft).
            if (overlap > 0.18 && Math.random() < 0.01) {
              pluckBubble(Math.random() < 0.5 ? a : b, 0.25);
            }
          }
        }
      }

      // ── RENDER ───────────────────────────────────────────────────────────────
      if (gl && glProg && quadVAO) {
        // Teal water background gradient via clear + a drawn backdrop quad isn't
        // needed; we clear to deep teal then draw rays + bubbles additively.
        gl.clearColor(0.012, 0.07, 0.085, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(glProg);
        gl.bindVertexArray(quadVAO);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, tSec);

        // Drifting light rays: a few faint amber bubbles way oversized & dim.
        for (let r = 0; r < 4; r++) {
          const rx = (r / 4 + 0.12) * W + Math.sin(tSec * 0.1 + r) * 40;
          gl.uniform2f(uCenter, rx * dpr, H * dpr * 0.5);
          gl.uniform1f(uRadius, H * dpr * 0.9);
          gl.uniform3f(uColor, 0.05, 0.09, 0.07);
          gl.uniform1f(uWob, 0);
          gl.uniform1f(uBloom, 0);
          gl.uniform2f(uSquash, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        for (let i = 0; i < bs.length; i++) {
          const b = bs[i];
          const [cr, cg, cb] = hsl2rgb(b.spec.hue, 0.85, 0.6);
          const bloom = b.wobAmp;
          gl.uniform2f(uCenter, b.x * dpr, (H - b.y) * dpr);
          gl.uniform1f(uRadius, b.r * dpr);
          gl.uniform3f(uColor, cr, cg, cb);
          gl.uniform1f(uWob, b.wobAmp);
          gl.uniform1f(uBloom, bloom);
          gl.uniform2f(uSquash, b.squash, -b.squashAng);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      } else if (c2d) {
        // ── Canvas2D fallback: radial-gradient glowing circles + squash ────────
        const grad = c2d.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#03212a");
        grad.addColorStop(1, "#021419");
        c2d.fillStyle = grad;
        c2d.fillRect(0, 0, W, H);
        // Light rays.
        c2d.globalCompositeOperation = "lighter";
        for (let r = 0; r < 4; r++) {
          const rx = (r / 4 + 0.15) * W + Math.sin(tSec * 0.1 + r) * 40;
          const rg = c2d.createLinearGradient(rx - 60, 0, rx + 60, H);
          rg.addColorStop(0, "rgba(120,180,160,0)");
          rg.addColorStop(0.5, "rgba(140,200,180,0.05)");
          rg.addColorStop(1, "rgba(120,180,160,0)");
          c2d.fillStyle = rg;
          c2d.fillRect(rx - 70, 0, 140, H);
        }
        for (let i = 0; i < bs.length; i++) {
          const b = bs[i];
          // Squash-and-stretch ellipse from wobble + contact.
          const wob = b.wobAmp * Math.sin(b.wobPhase * 22) * 0.16;
          const sqx = 1 + wob + b.squash * 0.25 * Math.cos(b.squashAng);
          const sqy = 1 - wob + b.squash * 0.25 * Math.sin(b.squashAng);
          const rr = b.r;
          c2d.save();
          c2d.translate(b.x, b.y);
          c2d.scale(sqx, sqy);
          const g = c2d.createRadialGradient(
            -rr * 0.3, -rr * 0.3, rr * 0.1, 0, 0, rr * 1.15,
          );
          const hue = b.spec.hue;
          const bloom = 0.55 + b.wobAmp * 0.4;
          g.addColorStop(0, `hsla(${hue},90%,85%,${bloom})`);
          g.addColorStop(0.4, `hsla(${hue},85%,65%,${bloom * 0.7})`);
          g.addColorStop(0.8, `hsla(${hue},80%,55%,${0.25 + b.wobAmp * 0.3})`);
          g.addColorStop(1, `hsla(${hue},80%,55%,0)`);
          c2d.fillStyle = g;
          c2d.beginPath();
          c2d.arc(0, 0, rr * 1.15, 0, Math.PI * 2);
          c2d.fill();
          // Iridescent highlight.
          c2d.fillStyle = `rgba(255,255,255,${0.35 + b.wobAmp * 0.3})`;
          c2d.beginPath();
          c2d.arc(-rr * 0.32, -rr * 0.34, rr * 0.16, 0, Math.PI * 2);
          c2d.fill();
          c2d.restore();
        }
        c2d.globalCompositeOperation = "source-over";
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase, seedBubbles, pluckBubble]);

  // ── Pointer handlers (tap + drag-strum) — the human input pipeline ───────────
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, isDrag: boolean) => {
      lastInputRef.current = performance.now();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const idx = bubbleAt(px, py);
      if (idx < 0) return;
      const now = performance.now();
      if (isDrag) {
        // During a drag, only pluck a *newly entered* bubble (glissando).
        if (lastDragRef.current.id === idx && now - lastDragRef.current.t < 400) return;
        lastDragRef.current = { id: idx, t: now };
      } else {
        lastDragRef.current = { id: idx, t: now };
      }
      pluckBubble(bubblesRef.current[idx], 0.9);
    },
    [bubbleAt, pluckBubble],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePointer(e, false);
    },
    [handlePointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0 && e.pressure === 0) return; // not dragging
      handlePointer(e, true);
    },
    [handlePointer],
  );

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Render: idle splash ──────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#021419] px-6 text-center">
        <h1 className="text-3xl font-semibold text-white">Bubble Harp</h1>
        <p className="max-w-sm text-base text-white/80">
          Floating bubbles you can tap. Each one is a real plucked string — touch
          it and it wobbles, sings, and glows. Drag your finger across them to
          strum a harp.
        </p>
        <button
          onClick={handleStart}
          className="min-h-[72px] rounded-2xl bg-amber-400/90 px-10 py-5 text-2xl font-semibold text-[#021419] shadow-lg transition-colors hover:bg-amber-300"
        >
          ▶ Start playing
        </button>
        <p className="text-sm text-white/55">
          Tap a bubble · drag across bubbles to strum
        </p>
        <Link
          href="/dream"
          className="mt-2 font-mono text-sm text-white/55 transition-colors hover:text-white/80"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  // ── Render: live ─────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#021419]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{ touchAction: "none" }}
      />
      <div className="pointer-events-none absolute left-0 right-0 top-3 flex items-start justify-between px-5">
        <div>
          <p className="font-mono text-sm text-white/80">Bubble Harp</p>
          <p className="text-sm text-white/55">
            Tap a bubble · drag to strum
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-sm text-white/55 transition-colors hover:text-white/80"
        >
          ← dream
        </Link>
      </div>
      {audioWarn && (
        <p className="absolute bottom-4 left-0 right-0 text-center text-base text-rose-300">
          {audioWarn}
        </p>
      )}
      {!audioWarn && (
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-mono text-sm text-white/55">
          {renderMode === "webgl" ? "WebGL2" : "Canvas2D"} ·{" "}
          {useWorkletRef.current ? "Karplus-Strong worklet" : "Karplus-Strong buffer"}
        </p>
      )}
    </div>
  );
}
