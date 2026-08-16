"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { README_TEXT } from "./readme-text";

// ─────────────────────────────────────────────────────────────────────────────
// 13792-auroraconductor · "Conduct his recording with your whole body."
//
//   Move a hand in front of the webcam; the browser estimates a dense OPTICAL
//   FLOW field (Lucas–Kanade-lite on a 32×24 grid). The OVERALL QUANTITY OF
//   MOTION sets the conducted tempo of a pitch-preserving granular time-stretch
//   of Karel's real recording (0.4×–1.6×, pitch nailed to his piano); the flow
//   DIRECTION FIELD bends a full-viewport WebGL2 aurora curtain. Camera is the
//   baton; pointer motion is the graceful fallback. arXiv:2604.27957.
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2;

// ── deterministic PRNG (seed once; never Math.random / Date.now) ─────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

// ── optical-flow / capture geometry ──────────────────────────────────────────
const GX = 32; // flow grid columns
const GY = 24; // flow grid rows
const CELL = 3; // capture pixels per grid cell (per axis)
const CW = GX * CELL; // 96 — downsampled capture width
const CH = GY * CELL; // 72 — downsampled capture height

const CAM_GAIN = 11; // meanAbsIt → normalized quantity
const CAM_FLOOR = 0.008; // meanAbsIt below this = "no real motion"
const DIR_SCALE = 0.9; // LK vector → normalized direction
const MAG_SCALE = 3.5; // LK vector length → texture magnitude

// ── granular OLA engine constants ────────────────────────────────────────────
const GRAIN_DUR = 0.11; // seconds of his audio per grain (pitch = his, rate 1)
const GRAIN_HOP = 0.045; // OUTPUT seconds between grain onsets (constant)
const LOOKAHEAD = 0.12;
const SCHED_MS = 25;
const RATE_MIN = 0.4;
const RATE_MAX = 1.6;

// unit Hann window for grain envelopes
const HANN_N = 64;
const HANN = new Float32Array(HANN_N);
for (let i = 0; i < HANN_N; i++) {
  HANN[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (HANN_N - 1));
}

// ── dense optical flow: brightness-gradient (Lucas–Kanade-lite) per cell ──────
// Downsample the webcam frame to CW×CH grayscale, then for each 32×24 grid cell
// solve the 2×2 least-squares LK system over its pixel window for a flow vector
// (u,v). The OVERALL quantity of motion is the mean absolute frame-difference —
// exactly the "quantity of motion" the referenced dome installation conducts by.
class OpticalFlow {
  readonly canvas: HTMLCanvasElement;
  private readonly g2: CanvasRenderingContext2D;
  private cur = new Float32Array(CW * CH);
  private prev = new Float32Array(CW * CH);
  private hasPrev = false;
  // per-cell flow, direction normalized to [-1,1], mag to [0,1]
  fx = new Float32Array(GX * GY);
  fy = new Float32Array(GX * GY);
  mag = new Float32Array(GX * GY);

  constructor() {
    const c = document.createElement("canvas");
    c.width = CW;
    c.height = CH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context for flow");
    this.canvas = c;
    this.g2 = ctx;
  }

  reset(): void {
    this.hasPrev = false;
    this.fx.fill(0);
    this.fy.fill(0);
    this.mag.fill(0);
  }

  /** Sample one video frame; returns overall quantity of motion (meanAbsIt). */
  compute(video: HTMLVideoElement): number {
    // mirror horizontally so moving right on screen reads as right
    this.g2.save();
    this.g2.scale(-1, 1);
    this.g2.drawImage(video, -CW, 0, CW, CH);
    this.g2.restore();

    const img = this.g2.getImageData(0, 0, CW, CH).data;
    const cur = this.cur;
    for (let i = 0, p = 0; i < cur.length; i++, p += 4) {
      // luma, normalized 0..1
      cur[i] = (img[p] * 0.299 + img[p + 1] * 0.587 + img[p + 2] * 0.114) / 255;
    }

    if (!this.hasPrev) {
      this.prev.set(cur);
      this.hasPrev = true;
      return 0;
    }

    const prev = this.prev;
    // per-cell accumulators for the LK 2×2 normal equations
    const sxx = new Float32Array(GX * GY);
    const syy = new Float32Array(GX * GY);
    const sxy = new Float32Array(GX * GY);
    const sxt = new Float32Array(GX * GY);
    const syt = new Float32Array(GX * GY);

    let absItSum = 0;
    let absItN = 0;

    for (let y = 1; y < CH - 1; y++) {
      const cy = (y / CELL) | 0;
      for (let x = 1; x < CW - 1; x++) {
        const idx = y * CW + x;
        const ix = (cur[idx + 1] - cur[idx - 1]) * 0.5;
        const iy = (cur[idx + CW] - cur[idx - CW]) * 0.5;
        const it = cur[idx] - prev[idx];
        absItSum += it < 0 ? -it : it;
        absItN++;
        const cx = (x / CELL) | 0;
        const c = cy * GX + cx;
        sxx[c] += ix * ix;
        syy[c] += iy * iy;
        sxy[c] += ix * iy;
        sxt[c] += ix * it;
        syt[c] += iy * it;
      }
    }

    for (let c = 0; c < GX * GY; c++) {
      const det = sxx[c] * syy[c] - sxy[c] * sxy[c];
      let u = 0;
      let v = 0;
      if (det > 1e-6) {
        const b0 = -sxt[c];
        const b1 = -syt[c];
        u = (b0 * syy[c] - b1 * sxy[c]) / det;
        v = (sxx[c] * b1 - sxy[c] * b0) / det;
      }
      const m = Math.hypot(u, v);
      this.fx[c] = clamp(u * DIR_SCALE, -1, 1);
      // flip v: image y grows downward, aurora y grows upward
      this.fy[c] = clamp(-v * DIR_SCALE, -1, 1);
      this.mag[c] = clamp(m * MAG_SCALE, 0, 1);
    }

    // swap buffers (reuse the old cur as next prev)
    const tmp = this.prev;
    this.prev = this.cur;
    this.cur = tmp;

    return absItN > 0 ? absItSum / absItN : 0;
  }
}

// ── pitch-preserving granular overlap-add time-stretch ───────────────────────
// One read-head walks his recording at the CONDUCTED rate; a constant stream of
// short grains (each played at speed 1 → his pitch) is overlap-added back into
// continuous sound. Read-head speed decoupled from grain-emit rate = time
// stretch with pitch nailed to his piano.
class GranularEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private lowpass: BiquadFilterNode;
  private rng = mulberry32(0x51ac33);
  private scratch = new Float32Array(HANN_N);

  readPos = 0;
  private rate = 0.6;
  private dyn = 0.4;
  private bright = 0.5;
  private tRate = 0.6;
  private tDyn = 0.4;
  private tBright = 0.5;

  private nextGrainTime = 0;
  private timer: number | null = null;
  private running = false;

  constructor(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode) {
    this.ctx = ctx;
    this.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9000;
    lp.Q.value = 0.7;
    lp.connect(dest);
    this.lowpass = lp;
  }

  setTarget(rate: number, dyn: number, bright: number): void {
    this.tRate = clamp(rate, RATE_MIN, RATE_MAX);
    this.tDyn = clamp(dyn, 0, 1);
    this.tBright = clamp(bright, 0, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextGrainTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(this.tick, SCHED_MS);
  }

  private tick = (): void => {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = this.buffer.duration;

    const cutoff = 500 + this.bright * 8500;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.05);

    while (this.nextGrainTime < now + LOOKAHEAD) {
      const k = 0.14;
      this.rate += (this.tRate - this.rate) * k;
      this.dyn += (this.tDyn - this.dyn) * k;
      this.bright += (this.tBright - this.bright) * k;

      this.scheduleGrain(Math.max(this.nextGrainTime, now + 0.004));

      this.readPos += this.rate * GRAIN_HOP; // advance at the CONDUCTED rate
      if (this.readPos >= dur) this.readPos -= dur;
      if (this.readPos < 0) this.readPos += dur;

      this.nextGrainTime += GRAIN_HOP; // OUTPUT hop is constant
    }
  };

  private scheduleGrain(when: number): void {
    const ctx = this.ctx;
    const dur = this.buffer.duration;
    let rp = this.readPos;
    if (this.rate < 0.5) {
      // slow / near-held: jitter a few ms so a broadened chord shimmers
      rp += (this.rng() - 0.5) * 0.01;
    }
    rp = clamp(rp, 0, Math.max(0, dur - GRAIN_DUR - 0.05));

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 1; // pitch stays exactly his

    const g = ctx.createGain();
    const peak = Math.max(0.0001, this.dyn * 0.55);
    for (let i = 0; i < HANN_N; i++) this.scratch[i] = HANN[i] * peak;
    g.gain.setValueCurveAtTime(this.scratch, when, GRAIN_DUR);

    src.connect(g);
    g.connect(this.lowpass);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
    src.start(when, rp, GRAIN_DUR + 0.02);
  }

  dispose(): void {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    try {
      this.lowpass.disconnect();
    } catch {
      /* ctx closing */
    }
  }
}

// ── the WebGL2 aurora curtain ────────────────────────────────────────────────
const AURORA_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const AURORA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform float uTime;
uniform float uLevel;      // tamed audio analyser 0..1
uniform float uIntensity;  // conducted intensity 0..1
uniform float uMotion;     // overall quantity of motion 0..1
uniform sampler2D uFlow;   // RG = direction (-1..1 packed), B = magnitude

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = vUv;

  // sample the measured flow field (grid is stored y-up already)
  vec3 fl = texture(uFlow, uv).xyz;
  vec2 flow = fl.xy * 2.0 - 1.0;   // -1..1 direction
  float localMag = fl.z;           // 0..1 local motion

  // curtain horizontal coordinate, bent by the flow direction + slow drift
  float x = uv.x
    + flow.x * 0.10
    + 0.018 * sin(uv.y * 3.0 + uTime * 0.2);

  vec3 col = vec3(0.0);
  float speedBoost = 0.3 + uMotion * 1.6 + localMag * 1.4;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sp = 0.6 + fi * 0.35;

    // the curtain's center meanders with height; the flow leans it sideways
    float center = 0.5
      + 0.28 * sin(uv.y * 2.0 + uTime * 0.10 * sp + fi * 2.1)
      + flow.x * 0.16;
    float band = fbm(vec2(x * 3.0 + fi * 7.0, uv.y * 1.5 + uTime * 0.03 * sp));
    float d = abs(x - center + (band - 0.5) * 0.35);
    float ribbon = smoothstep(0.17, 0.0, d);

    // a hanging-curtain vertical profile (brighter aloft, feet fade)
    float vfall = smoothstep(0.0, 0.32, uv.y) * smoothstep(1.06, 0.42, uv.y);

    // downward-streaming filaments; they rush faster where you move faster
    float streak = fbm(vec2(
      x * 9.0 + fi * 3.0,
      uv.y * 6.5 - uTime * (0.25 + speedBoost * 0.7) * sp));

    float inten = ribbon * vfall * (0.45 + 0.75 * streak);

    // cool violet -> cyan -> ice, by height + curtain index
    vec3 c = mix(vec3(0.36, 0.18, 0.92), vec3(0.14, 0.74, 0.96),
                 clamp(uv.y * 0.9 + fi * 0.08, 0.0, 1.0));
    c = mix(c, vec3(0.78, 0.93, 1.0), smoothstep(0.62, 1.0, uv.y) * 0.6);
    col += c * inten;
  }

  // brightness pulses with the tamed analyser + conducted intensity
  float pulse = 0.42 + 0.85 * uLevel + 0.7 * uIntensity;
  col *= pulse * (0.55 + 1.25 * (uMotion * 0.5 + localMag * 0.6));

  // near-black night sky with a faint cool vertical wash
  vec3 bg = mix(vec3(0.010, 0.012, 0.030), vec3(0.020, 0.032, 0.070), uv.y);
  col += bg;

  // a whisper of star grain up high
  float star = step(0.9993, hash(floor(uv * vec2(900.0, 520.0))));
  col += star * smoothstep(0.4, 1.0, uv.y) * vec3(0.55, 0.7, 0.9);

  frag = vec4(col, 1.0);
}`;

class AuroraGL {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private tex: WebGLTexture;
  private u: {
    time: WebGLUniformLocation | null;
    level: WebGLUniformLocation | null;
    intensity: WebGLUniformLocation | null;
    motion: WebGLUniformLocation | null;
    flow: WebGLUniformLocation | null;
  };
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("no webgl2 context");
    this.gl = gl;
    this.canvas = canvas;

    const vs = this.compile(gl.VERTEX_SHADER, AURORA_VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, AURORA_FRAG);
    const program = gl.createProgram();
    if (!program) throw new Error("no gl program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;

    // fullscreen triangle
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error("no gl buffers");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.vbo = vbo;

    // flow field texture
    const tex = gl.createTexture();
    if (!tex) throw new Error("no gl texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      GX,
      GY,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(GX * GY * 4),
    );
    this.tex = tex;

    this.u = {
      time: gl.getUniformLocation(program, "uTime"),
      level: gl.getUniformLocation(program, "uLevel"),
      intensity: gl.getUniformLocation(program, "uIntensity"),
      motion: gl.getUniformLocation(program, "uMotion"),
      flow: gl.getUniformLocation(program, "uFlow"),
    };
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error("no gl shader");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
    }
    return sh;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setFlow(data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      GX,
      GY,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  render(time: number, level: number, intensity: number, motion: number): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.flow, 0);
    gl.uniform1f(this.u.time, time);
    gl.uniform1f(this.u.level, level);
    gl.uniform1f(this.u.intensity, intensity);
    gl.uniform1f(this.u.motion, motion);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteTexture(this.tex);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* noop */
    }
  }
}

// ── page ─────────────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "playing";
type InputMode = "camera" | "pointer";
type MotionSource = "you" | "demo";

function intensityWord(q: number): string {
  if (q < 0.18) return "held · pianissimo";
  if (q < 0.4) return "gentle · piano";
  if (q < 0.68) return "flowing · mezzo-forte";
  return "sweeping · forte";
}

export default function AuroraConductorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [track, setTrack] = useState<WelcomeHomeTrack>(REAL_TRACKS[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<{ rate: number; q: number; src: MotionSource }>(
    { rate: 0.6, q: 0, src: "demo" },
  );

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // vision
  const glRef = useRef<AuroraGL | null>(null);
  const ofRef = useRef<OpticalFlow | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camReadyRef = useRef(false);
  const inputModeRef = useRef<InputMode>("camera");

  // flow field float buffers (blended real ↔ synthetic) + packed texture
  const synFX = useRef(new Float32Array(GX * GY));
  const synFY = useRef(new Float32Array(GX * GY));
  const synMag = useRef(new Float32Array(GX * GY));
  const realFX = useRef(new Float32Array(GX * GY));
  const realFY = useRef(new Float32Array(GX * GY));
  const realMag = useRef(new Float32Array(GX * GY));
  const flowRGBA = useRef(new Uint8Array(GX * GY * 4));
  const cellPhase = useRef(new Float32Array(GX * GY));

  // conducting state
  const realWeightRef = useRef(0); // 0 = demo, 1 = your motion
  const realQRef = useRef(0); // raw normalized quantity from live input
  const qSmoothRef = useRef(0); // smoothed conducted quantity
  const levelRef = useRef(0);
  const motionSrcRef = useRef<MotionSource>("demo");
  const rngRef = useRef(mulberry32(0x13792bee));

  // pointer fallback
  const pointerRef = useRef({
    x: 0.5,
    y: 0.5,
    vel: 0,
    lastMove: -1e9,
  });
  const pointerDir = useRef({ x: 0, y: 0 });

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const hudTickRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // seed per-cell phases for the synthetic demo field (deterministic)
  useEffect(() => {
    const rng = rngRef.current;
    const cp = cellPhase.current;
    for (let i = 0; i < cp.length; i++) cp[i] = rng() * TWO_PI;
  }, []);

  // ── synthetic self-demo motion field (alive within ~1s, no real input) ──────
  const fillSynthetic = useCallback((t: number) => {
    const cp = cellPhase.current;
    const fx = synFX.current;
    const fy = synFY.current;
    const mg = synMag.current;
    let qSum = 0;
    for (let cy = 0; cy < GY; cy++) {
      for (let cx = 0; cx < GX; cx++) {
        const c = cy * GX + cx;
        const ph = cp[c];
        // a slow travelling swirl across the grid
        const wx = Math.sin(t * 0.5 + cy * 0.4 + ph);
        const wy = Math.cos(t * 0.42 + cx * 0.35 + ph * 0.7);
        fx[c] = wx * 0.6;
        fy[c] = wy * 0.45;
        const m = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.7 + ph));
        mg[c] = m;
        qSum += m;
      }
    }
    // overall demo quantity gently breathes in a calm musical band
    return clamp(0.2 + 0.14 * Math.sin(t * 0.6), 0, 1) * 0.9 + 0.1 * (qSum / (GX * GY));
  }, []);

  // ── build real flow field from pointer velocity (fallback mode) ─────────────
  const fillPointerFlow = useCallback((now: number) => {
    const p = pointerRef.current;
    // decay velocity when the pointer is idle
    const idle = now - p.lastMove;
    let q = p.vel;
    if (idle > 120) q *= Math.max(0, 1 - (idle - 120) / 500);
    const fx = realFX.current;
    const fy = realFY.current;
    const mg = realMag.current;
    // direction from recent pointer motion, held in p.vel-scaled dirs
    const dx = pointerDir.current.x;
    const dy = pointerDir.current.y;
    const pcx = p.x * GX;
    const pcy = (1 - p.y) * GY; // grid is y-up
    for (let cy = 0; cy < GY; cy++) {
      for (let cx = 0; cx < GX; cx++) {
        const c = cy * GX + cx;
        const ddx = cx + 0.5 - pcx;
        const ddy = cy + 0.5 - pcy;
        const g = Math.exp(-(ddx * ddx + ddy * ddy) / 40);
        fx[c] = dx;
        fy[c] = dy;
        mg[c] = clamp(q * (0.3 + g), 0, 1);
      }
    }
    realQRef.current = clamp(q, 0, 1);
  }, []);

  // ── pack blended float field → RGBA8 texture ────────────────────────────────
  const packFlow = useCallback((w: number) => {
    const out = flowRGBA.current;
    const rfx = realFX.current;
    const rfy = realFY.current;
    const rmg = realMag.current;
    const sfx = synFX.current;
    const sfy = synFY.current;
    const smg = synMag.current;
    for (let c = 0; c < GX * GY; c++) {
      const fx = sfx[c] * (1 - w) + rfx[c] * w;
      const fy = sfy[c] * (1 - w) + rfy[c] * w;
      const mg = smg[c] * (1 - w) + rmg[c] * w;
      const o = c * 4;
      out[o] = clamp((fx * 0.5 + 0.5) * 255, 0, 255);
      out[o + 1] = clamp((fy * 0.5 + 0.5) * 255, 0, 255);
      out[o + 2] = clamp(mg * 255, 0, 255);
      out[o + 3] = 255;
    }
    return out;
  }, []);

  // ── the conducting / render loop ────────────────────────────────────────────
  const frame = useCallback(
    (tsMs: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const ts = tsMs / 1000;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;

      // 1) synthetic demo field always computed (keeps the piece alive)
      const synQ = fillSynthetic(ts);

      // 2) measure real motion from the active input
      let rawFloor = false;
      if (inputModeRef.current === "camera" && camReadyRef.current) {
        const of = ofRef.current;
        const video = videoRef.current;
        if (of && video && video.readyState >= 2) {
          const meanAbsIt = of.compute(video);
          realFX.current.set(of.fx);
          realFY.current.set(of.fy);
          realMag.current.set(of.mag);
          realQRef.current = clamp(meanAbsIt * CAM_GAIN, 0, 1);
          rawFloor = meanAbsIt > CAM_FLOOR;
        }
      } else if (inputModeRef.current === "pointer") {
        fillPointerFlow(tsMs);
        rawFloor = realQRef.current > 0.02;
      }

      // 3) hand control from demo → you when real motion appears
      const targetW = rawFloor ? 1 : 0;
      realWeightRef.current = lerp(
        realWeightRef.current,
        targetW,
        clamp(dt * (rawFloor ? 4 : 1.2), 0, 1),
      );
      const w = realWeightRef.current;
      motionSrcRef.current = w > 0.5 ? "you" : "demo";

      // conducted quantity = blend of demo breathing and your motion
      const q = synQ * (1 - w) + realQRef.current * w;
      qSmoothRef.current = lerp(qSmoothRef.current, q, clamp(dt * 3.5, 0, 1));
      const qs = qSmoothRef.current;

      // 4) drive the granular engine
      const rate = RATE_MIN + qs * (RATE_MAX - RATE_MIN);
      const dyn = 0.32 + qs * 0.55;
      const bright = 0.4 + qs * 0.5;
      engineRef.current?.setTarget(rate, dyn, bright);
      safeRef.current?.setGain(0.6 + qs * 0.35);

      // 5) audio level for the visual pulse (tamed analyser)
      let level = 0;
      const safe = safeRef.current;
      const buf = analyserBufRef.current;
      if (safe && buf) {
        safe.analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        level = sum / (buf.length * 255);
      }
      levelRef.current = lerp(levelRef.current, level, clamp(dt * 6, 0, 1));

      // 6) upload flow + render aurora
      const gl = glRef.current;
      if (gl) {
        gl.setFlow(packFlow(w));
        gl.render(ts, levelRef.current, qs, qs);
      }

      hudTickRef.current++;
      if (hudTickRef.current % 6 === 0) {
        setHud({ rate, q: qs, src: motionSrcRef.current });
      }
    },
    [fillSynthetic, fillPointerFlow, packFlow],
  );

  // ── boot: WebGL2 aurora + rAF (runs from mount, audio or not) ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const gl = new AuroraGL(canvas);
        gl.resize();
        glRef.current = gl;
      } catch {
        setWebglOk(false);
      }
    }
    const onResize = () => glRef.current?.resize();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      glRef.current = null;
    };
  }, [frame]);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      safeRef.current?.disconnect();
      safeRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) {
        v.srcObject = null;
        videoRef.current = null;
      }
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  // ── pointer fallback tracking ───────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (inputModeRef.current !== "pointer") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const now = performance.now();
    const p = pointerRef.current;
    const dtms = Math.max(1, now - p.lastMove);
    const dxn = nx - p.x;
    const dyn = ny - p.y;
    const speed = Math.hypot(dxn, dyn) / (dtms / 1000);
    // normalize: a full-screen sweep per second ≈ 1.0
    p.vel = clamp(p.vel * 0.5 + (speed / 1.4) * 0.5, 0, 1.5);
    const mag = Math.hypot(dxn, dyn) || 1;
    pointerDir.current.x = clamp((dxn / mag) * 0.9, -1, 1);
    pointerDir.current.y = clamp((-dyn / mag) * 0.9, -1, 1); // grid y-up
    p.x = nx;
    p.y = ny;
    p.lastMove = now;
  }, []);

  // ── transport ───────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    camReadyRef.current = false;
    ofRef.current?.reset();
    setPhase("idle");
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setNotice(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let safe = safeRef.current;
      if (!safe) {
        safe = createSafeMaster(ctx);
        safeRef.current = safe;
        analyserBufRef.current = new Uint8Array(safe.analyser.frequencyBinCount);
      }

      // try the camera — the baton. Fall back to pointer on any failure.
      camReadyRef.current = false;
      let mode: InputMode = "pointer";
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia
      ) {
        try {
          if (!ofRef.current) ofRef.current = new OpticalFlow();
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 320 },
              height: { ideal: 240 },
              facingMode: "user",
            },
            audio: false,
          });
          streamRef.current = stream;
          let v = videoRef.current;
          if (!v) {
            v = document.createElement("video");
            v.muted = true;
            v.playsInline = true;
            v.setAttribute("playsinline", "");
            videoRef.current = v;
          }
          v.srcObject = stream;
          await v.play();
          ofRef.current.reset();
          camReadyRef.current = true;
          mode = "camera";
        } catch {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          mode = "pointer";
          setNotice(
            "No camera — move the pointer instead. Its velocity is the quantity of motion that conducts his piano.",
          );
        }
      } else {
        setNotice(
          "This browser has no camera access — move the pointer instead. Its velocity is the quantity of motion that conducts his piano.",
        );
      }
      setInputMode(mode);
      inputModeRef.current = mode;

      // decode + start his real recording through the granular engine
      const wh = await loadRealTrackBuffer(ctx, track.id);
      engineRef.current?.dispose();
      const engine = new GranularEngine(ctx, wh.buffer, safe.input);
      engine.readPos = 0;
      engine.start();
      engineRef.current = engine;

      // reset conductor so the demo takes over first, then hands to you
      realWeightRef.current = 0;
      realQRef.current = 0;
      setPhase("playing");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      camReadyRef.current = false;
      setError(
        err instanceof Error
          ? `Audio could not load (${err.message}). Pick another track and try again.`
          : "Audio could not load. Pick another track and try again.",
      );
      engineRef.current?.dispose();
      engineRef.current = null;
      setPhase("idle");
    }
  }, [track]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stop();
    },
    [stop],
  );

  const srcLabel =
    hud.src === "you"
      ? inputMode === "camera"
        ? "you are conducting — camera"
        : "you are conducting — pointer"
      : "self-demo — move to take over";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the aurora — WebGL2 canvas; the stage also catches pointer fallback */}
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none"
        onPointerMove={onPointerMove}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* chrome */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6 pt-14">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            13792 · auroraconductor · webcam optical flow
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Conduct his recording with your body
          </h1>
          <p className="text-base text-muted-foreground">
            Allow the camera and move. The overall quantity of your motion — read
            from live webcam optical flow — is the baton: sweep to rush his piano,
            go still to slow and hold it. The pitch never moves.
          </p>
          <p className="text-sm text-primary">
            Bigger, faster motion rushes and floods the aurora · stillness slows
            and holds · no camera falls back to pointer motion.
          </p>
        </header>
      </div>

      {/* center read-out */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 translate-y-24 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          conducted tempo
        </p>
        <p className="text-xl font-semibold tracking-tight text-primary">
          ×{hud.rate.toFixed(2)}
        </p>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {!webglOk && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            WebGL2 is unavailable, so the aurora isn&apos;t drawn — but you can
            still press Start and conduct his recording by ear.
          </p>
        )}
        {notice && !error && (
          <p className="max-w-2xl text-sm text-muted-foreground">{notice}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {srcLabel} · {intensityWord(hud.q)}
        </p>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={track.id}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {COLLECTIONS.map((col) => (
                <optgroup key={col.name} label={col.name}>
                  {col.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {phase !== "playing" ? (
            <button
              onClick={() => void play()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Starting…" : "Start — allow camera"}
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README_TEXT.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
