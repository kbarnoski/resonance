"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Slowbloom — the stiller you hold your whole body, the slower TIME flows through
// Karel's real piano recording, with the PITCH FROZEN, so a single chord blooms
// and hangs for many seconds.
//
// Whole-body motion energy (shoulders + wrists + nose) conducts a pitch-preserving
// time-scale modification (TSM) of the recording. Be still → time dilates (up to
// ~8× slower, pitch unchanged, notes elongate into a long "now"). Move → time
// resumes toward natural tempo.
//
// Engine: a real-time, variable-rate STFT PHASE-VOCODER running inside an
// AudioWorklet (self-contained radix-2 FFT/IFFT, loaded via a Blob URL — no
// separate served .js). Pitch is preserved by construction: playbackRate is NEVER
// touched. Visuals: a raw WebGL2 "long-exposure bloom field" where stillness lets
// light accrete into long luminous smears and motion disperses it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import type { SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
} from "../_shared/cameraTracking";
import type { PoseLandmarkerInst } from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

const MAX_STRETCH = 8;

// ── The phase-vocoder time-scale-modification worklet ────────────────────────
// A streaming STFT phase vocoder: analysis grain read at pointer `ta`, FFT →
// instantaneous-frequency phase advance → synthesis phase accumulation → IFFT →
// Hann overlap-add. Synthesis hop Hs is fixed (constant output rate); analysis
// hop Ha = Hs / stretch shrinks as we slow down, so `ta` crawls through the take
// while the pitch stays exactly where Karel played it. Self-contained radix-2
// Cooley-Tukey FFT, no deps. Runs the SAME analysis timing across L & R.
const WORKLET_SOURCE = `
class SlowbloomTSM extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'stretch', defaultValue: 1, minValue: 1, maxValue: 12, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.N = 2048;
    this.Hs = 512;
    this.half = this.N >> 1;
    this.loaded = false;
    this.win = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.N);
    this.cosT = new Float32Array(this.half);
    this.sinT = new Float32Array(this.half);
    for (let k = 0; k < this.half; k++) {
      this.cosT[k] = Math.cos((2 * Math.PI * k) / this.N);
      this.sinT[k] = Math.sin((2 * Math.PI * k) / this.N);
    }
    this.rev = new Int32Array(this.N);
    const bits = Math.round(Math.log(this.N) / Math.LN2);
    for (let i = 0; i < this.N; i++) {
      let x = i, r = 0;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      this.rev[i] = r;
    }
    this.omega = new Float32Array(this.half + 1);
    for (let b = 0; b <= this.half; b++) this.omega[b] = (2 * Math.PI * b) / this.N;
    this.re = new Float32Array(this.N);
    this.im = new Float32Array(this.N);
    this.accL = new Float32Array(this.N);
    this.accR = new Float32Array(this.N);
    this.prevPhL = new Float32Array(this.half + 1);
    this.prevPhR = new Float32Array(this.half + 1);
    this.synPhL = new Float32Array(this.half + 1);
    this.synPhR = new Float32Array(this.half + 1);
    this.ta = 0;
    this.CAP = this.N * 8;
    this.fifoL = new Float32Array(this.CAP);
    this.fifoR = new Float32Array(this.CAP);
    this.wr = 0; this.rd = 0; this.avail = 0;
    this.left = null; this.right = null; this.len = 0;
    this.norm = 1 / 1.5; // Hann-squared / 75% overlap COLA normalization
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.type === 'load') {
        this.left = d.left; this.right = d.right; this.len = d.left.length;
        this.ta = 0;
        this.prevPhL.fill(0); this.prevPhR.fill(0);
        this.synPhL.fill(0); this.synPhR.fill(0);
        this.accL.fill(0); this.accR.fill(0);
        this.wr = 0; this.rd = 0; this.avail = 0;
        this.loaded = this.len > this.N;
      }
    };
  }
  fft(re, im, inv) {
    const n = this.N, rev = this.rev, cosT = this.cosT, sinT = this.sinT;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = (n / len) | 0;
      for (let i = 0; i < n; i += len) {
        let k = 0;
        for (let j = i; j < i + half; j++) {
          const wr = cosT[k];
          const wi = inv ? sinT[k] : -sinT[k];
          const ar = re[j + half], ai = im[j + half];
          const vr = ar * wr - ai * wi;
          const vi = ar * wi + ai * wr;
          const ur = re[j], ui = im[j];
          re[j] = ur + vr; im[j] = ui + vi;
          re[j + half] = ur - vr; im[j + half] = ui - vi;
          k += step;
        }
      }
    }
    if (inv) { const invn = 1 / n; for (let i = 0; i < n; i++) { re[i] *= invn; im[i] *= invn; } }
  }
  processChannel(input, acc, prevPh, synPh, Ha) {
    const N = this.N, half = this.half, re = this.re, im = this.im, win = this.win, len = this.len, omega = this.omega;
    const ta = this.ta;
    for (let i = 0; i < N; i++) {
      let p = ta + i; p = p % len; if (p < 0) p += len;
      const i0 = p | 0; const frac = p - i0; const i1 = (i0 + 1 >= len) ? 0 : i0 + 1;
      re[i] = (input[i0] * (1 - frac) + input[i1] * frac) * win[i];
      im[i] = 0;
    }
    this.fft(re, im, false);
    const TWO_PI = 2 * Math.PI;
    for (let b = 0; b <= half; b++) {
      const rr = re[b], ii = im[b];
      const mag = Math.sqrt(rr * rr + ii * ii);
      const phase = Math.atan2(ii, rr);
      const expected = omega[b] * Ha;
      let dphi = phase - prevPh[b] - expected;
      dphi = dphi - TWO_PI * Math.round(dphi / TWO_PI);
      const inst = omega[b] + dphi / Ha;
      prevPh[b] = phase;
      synPh[b] += inst * this.Hs;
      re[b] = mag * Math.cos(synPh[b]);
      im[b] = mag * Math.sin(synPh[b]);
    }
    for (let b = 1; b < half; b++) { re[N - b] = re[b]; im[N - b] = -im[b]; }
    im[0] = 0; im[half] = 0;
    this.fft(re, im, true);
    const norm = this.norm;
    for (let i = 0; i < N; i++) acc[i] += re[i] * win[i] * norm;
  }
  generateHop(Ha) {
    const N = this.N, Hs = this.Hs, CAP = this.CAP;
    this.processChannel(this.left, this.accL, this.prevPhL, this.synPhL, Ha);
    this.processChannel(this.right, this.accR, this.prevPhR, this.synPhR, Ha);
    for (let i = 0; i < Hs; i++) {
      this.fifoL[this.wr] = this.accL[i];
      this.fifoR[this.wr] = this.accR[i];
      this.wr = (this.wr + 1) % CAP;
    }
    this.avail += Hs;
    this.accL.copyWithin(0, Hs, N); this.accL.fill(0, N - Hs, N);
    this.accR.copyWithin(0, Hs, N); this.accR.fill(0, N - Hs, N);
    let ta = this.ta + Ha; ta = ta % this.len; if (ta < 0) ta += this.len; this.ta = ta;
  }
  process(inputs, outputs, parameters) {
    const out = outputs[0]; const L = out[0]; const R = out[1] || out[0];
    const frames = L.length;
    if (!this.loaded) { for (let i = 0; i < frames; i++) { L[i] = 0; if (R !== L) R[i] = 0; } return true; }
    const sp = parameters.stretch;
    const stretch = Math.max(1, sp.length ? sp[0] : 1);
    const Ha = this.Hs / stretch;
    let guard = 0;
    while (this.avail < frames && guard < 128) { this.generateHop(Ha); guard++; }
    const CAP = this.CAP;
    for (let i = 0; i < frames; i++) {
      L[i] = this.fifoL[this.rd];
      if (R !== L) R[i] = this.fifoR[this.rd];
      this.rd = (this.rd + 1) % CAP; this.avail--;
    }
    return true;
  }
}
registerProcessor('slowbloom-tsm', SlowbloomTSM);
`;

// ── WebGL2 shaders ───────────────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Accumulation / feedback pass — the long exposure. Stillness raises retention so
// light accretes into long smears; motion raises dispersion so it flows apart.
const ACCUM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uPrev;
uniform sampler2D uSpec;
uniform float uTime;
uniform float uStill;
uniform float uEnergy;
uniform float uReach;
uniform float uLean;
uniform vec2 uRes;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float disperse = mix(0.0006, 0.011, uEnergy);
  vec2 drift = c * disperse + vec2(uLean * 0.004 * (0.3 + uEnergy), -0.0007);
  vec3 prev = texture(uPrev, uv - drift).rgb;
  float retain = mix(0.855, 0.9935, uStill);
  prev *= retain;

  float bin = pow(abs(uv.x * 2.0 - 1.0), 0.8);
  float s = texture(uSpec, vec2(bin, 0.5)).r;

  float shaftPos = 0.5 + 0.30 * sin(uv.x * 7.0 + uTime * 0.05);
  float shaft = smoothstep(0.55, 0.0, abs(uv.y - shaftPos));
  float ray = pow(s, 1.5) * shaft;

  float n = hash(floor((uv * uRes) / 3.0) + floor(uTime * 2.0));
  float sparkle = smoothstep(0.986, 1.0, n) * s;

  vec3 pearl  = vec3(0.82, 0.85, 0.90);
  vec3 pewter = vec3(0.34, 0.38, 0.45);
  vec3 tint = mix(pewter, pearl, clamp(s * 1.2 + uReach * 0.35, 0.0, 1.0));
  float intensity = mix(0.010, 0.058, uStill);
  vec3 add = tint * (ray * intensity + sparkle * 0.020);

  float shafts = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float xp = fract(0.2 + fi * 0.33 + uLean * 0.05);
    float w = smoothstep(0.055, 0.0, abs(uv.x - xp));
    shafts += w * (0.5 + 0.5 * sin(uv.y * 3.0 - uTime * 0.10 + fi));
  }
  add += pearl * shafts * mix(0.0018, 0.013, uStill);

  vec3 outc = prev + add;
  outc = min(outc, vec3(3.5));
  frag = vec4(outc, 1.0);
}`;

// Present pass — spectral bloom + Reinhard tonemap into pewter→pearl, vignette.
const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uStill;
uniform float uReach;
vec3 bloomSample(vec2 uv){
  vec3 sum = vec3(0.0); float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      vec2 off = vec2(float(i), float(j)) / uRes * 3.0;
      float w = exp(-float(i * i + j * j) * 0.16);
      sum += texture(uTex, uv + off).rgb * w;
      total += w;
    }
  }
  return sum / total;
}
void main(){
  vec2 uv = vUv;
  vec3 base = texture(uTex, uv).rgb;
  vec3 bloom = bloomSample(uv);
  vec3 col = base + bloom * mix(0.4, 0.95, uStill);
  col = col / (col + vec3(0.9));
  col += vec3(0.020, 0.030, 0.050) * uStill;   // cool moonlit lift
  col += vec3(0.016, 0.013, 0.009) * uReach;   // faint reach warmth (near-achromatic)
  float d = distance(uv, vec2(0.5));
  col *= smoothstep(0.98, 0.34, d);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
  frag = vec4(col, 1.0);
}`;

// ── GL helpers (non-hook names) ──────────────────────────────────────────────
interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}
interface GLState {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  accum: WebGLProgram;
  present: WebGLProgram;
  targets: [Target, Target];
  specTex: WebGLTexture;
  cur: number;
  w: number;
  h: number;
  useFloat: boolean;
  lose: WEBGL_lose_context | null;
}

function drawCompile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader alloc");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? "compile";
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

function drawProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc");
  const v = drawCompile(gl, gl.VERTEX_SHADER, vs);
  const f = drawCompile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "link";
    throw new Error(log);
  }
  return p;
}

function drawTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
): Target {
  const tex = gl.createTexture();
  if (!tex) throw new Error("tex alloc");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const internal = useFloat ? gl.RGBA16F : gl.RGBA8;
  const type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("fbo alloc");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo };
}

function runInitGL(canvas: HTMLCanvasElement): GLState {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("no-webgl2");
  const useFloat = !!gl.getExtension("EXT_color_buffer_float");
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("vao");
  const accum = drawProgram(gl, VERT, ACCUM_FRAG);
  const present = drawProgram(gl, VERT, PRESENT_FRAG);
  const w = canvas.width;
  const h = canvas.height;
  const targets: [Target, Target] = [
    drawTarget(gl, w, h, useFloat),
    drawTarget(gl, w, h, useFloat),
  ];
  const specTex = gl.createTexture();
  if (!specTex) throw new Error("spec");
  gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {
    gl,
    vao,
    accum,
    present,
    targets,
    specTex,
    cur: 0,
    w,
    h,
    useFloat,
    lose: gl.getExtension("WEBGL_lose_context"),
  };
}

function runResizeGL(st: GLState, w: number, h: number): void {
  if (w === st.w && h === st.h) return;
  const { gl } = st;
  for (const t of st.targets) {
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }
  st.targets = [
    drawTarget(gl, w, h, st.useFloat),
    drawTarget(gl, w, h, st.useFloat),
  ];
  st.cur = 0;
  st.w = w;
  st.h = h;
}

interface Drive {
  still: number;
  energy: number;
  reach: number;
  lean: number;
}

function runRenderGL(
  st: GLState,
  spec: Uint8Array<ArrayBuffer>,
  drive: Drive,
  time: number,
): void {
  const { gl } = st;
  gl.bindVertexArray(st.vao);
  gl.bindTexture(gl.TEXTURE_2D, st.specTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    256,
    1,
    gl.RED,
    gl.UNSIGNED_BYTE,
    spec,
  );

  const src = st.targets[st.cur];
  const dst = st.targets[1 - st.cur];

  // accumulation pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
  gl.viewport(0, 0, st.w, st.h);
  gl.useProgram(st.accum);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src.tex);
  gl.uniform1i(gl.getUniformLocation(st.accum, "uPrev"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, st.specTex);
  gl.uniform1i(gl.getUniformLocation(st.accum, "uSpec"), 1);
  gl.uniform1f(gl.getUniformLocation(st.accum, "uTime"), time);
  gl.uniform1f(gl.getUniformLocation(st.accum, "uStill"), drive.still);
  gl.uniform1f(gl.getUniformLocation(st.accum, "uEnergy"), drive.energy);
  gl.uniform1f(gl.getUniformLocation(st.accum, "uReach"), drive.reach);
  gl.uniform1f(gl.getUniformLocation(st.accum, "uLean"), drive.lean);
  gl.uniform2f(gl.getUniformLocation(st.accum, "uRes"), st.w, st.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  st.cur = 1 - st.cur;

  // present pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, st.w, st.h);
  gl.useProgram(st.present);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, st.targets[st.cur].tex);
  gl.uniform1i(gl.getUniformLocation(st.present, "uTex"), 0);
  gl.uniform2f(gl.getUniformLocation(st.present, "uRes"), st.w, st.h);
  gl.uniform1f(gl.getUniformLocation(st.present, "uStill"), drive.still);
  gl.uniform1f(gl.getUniformLocation(st.present, "uReach"), drive.reach);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type CamStatus = "demo" | "live" | "lost" | "loading";

// ─────────────────────────────────────────────────────────────────────────────

export default function SlowbloomPage() {
  const { immersive, toggle } = useImmersive();

  const [started, setStarted] = useState(false);
  const [booting, setBooting] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [webglMsg, setWebglMsg] = useState<string>("");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [camStatus, setCamStatus] = useState<CamStatus>("demo");
  const [stretchLabel, setStretchLabel] = useState<string>("1.0");

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const panRef = useRef<StereoPannerNode | null>(null);
  const shelfRef = useRef<BiquadFilterNode | null>(null);
  const workletReadyRef = useRef(false);

  // camera / pose
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<PoseLandmarkerInst | null>(null);
  const modeRef = useRef<"demo" | "live">("demo");
  const poseLostRef = useRef(false);
  const camStatusRef = useRef<CamStatus>("demo");

  // motion energy state
  const prevLmRef = useRef<number[] | null>(null);
  const eRef = useRef(0);
  const reachRef = useRef(0);
  const leanRef = useRef(0);

  // viz
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GLState | null>(null);
  const rafRef = useRef<number>(0);
  const specRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const startTimeRef = useRef(0);
  const uiTickRef = useRef(0);

  const setCam = useCallback((s: CamStatus) => {
    if (camStatusRef.current === s) return;
    camStatusRef.current = s;
    setCamStatus(s);
  }, []);

  // Load / reload a real track into the worklet (resets the phase vocoder).
  const runLoadTrack = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    const node = nodeRef.current;
    if (!ctx || !node) return;
    const { buffer, title } = await loadRealTrackBuffer(ctx, id);
    const chL = buffer.getChannelData(0);
    const L = new Float32Array(chL);
    const chR =
      buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : chL;
    const R = new Float32Array(chR);
    node.port.postMessage(
      { type: "load", left: L, right: R, sampleRate: ctx.sampleRate },
      [L.buffer, R.buffer],
    );
    workletReadyRef.current = true;
    setTrackTitle(title);
  }, []);

  const runFrame = useCallback(() => {
    rafRef.current = requestAnimationFrame(runFrame);
    const now = performance.now();
    const t = now - startTimeRef.current;

    // ── resolve the drive: live pose, or the demo breathing curve ──
    let targetE = eRef.current;
    let targetReach = reachRef.current;
    let targetLean = leanRef.current;

    if (modeRef.current === "live" && trackerRef.current && videoRef.current) {
      const video = videoRef.current;
      let lost = true;
      if (video.readyState >= 2) {
        try {
          const res = trackerRef.current.detectForVideo(video, now);
          const lm = res.landmarks?.[0];
          if (lm) {
            const ls = lm[POSE_LM.leftShoulder];
            const rs = lm[POSE_LM.rightShoulder];
            const lw = lm[POSE_LM.leftWrist];
            const rw = lm[POSE_LM.rightWrist];
            const nose = lm[POSE_LM.nose];
            const visOk =
              (ls.visibility ?? 0) > 0.5 && (rs.visibility ?? 0) > 0.5;
            if (visOk) {
              lost = false;
              const pts = [
                nose.x, nose.y,
                ls.x, ls.y,
                rs.x, rs.y,
                lw.x, lw.y,
                rw.x, rw.y,
              ];
              const prev = prevLmRef.current;
              if (prev) {
                let disp = 0;
                for (let i = 0; i < pts.length; i += 2) {
                  disp += Math.hypot(pts[i] - prev[i], pts[i + 1] - prev[i + 1]);
                }
                targetE = clamp01(disp * 6.0);
              }
              prevLmRef.current = pts;
              const shoulderY = (ls.y + rs.y) / 2;
              const wristY = (lw.y + rw.y) / 2;
              targetReach = clamp01((shoulderY - wristY) / 0.35);
              const midX = (ls.x + rs.x) / 2;
              targetLean = Math.max(-1, Math.min(1, (0.5 - midX) * 2.2));
            }
          }
        } catch {
          lost = true;
        }
      }
      poseLostRef.current = lost;
      setCam(lost ? "lost" : "live");
      // when the body is lost, hold the last energy (no jump)
    } else {
      // demo drive — a slow whole-body breathing curve toward stillness and back
      targetE = 0.5 + 0.5 * Math.sin(t * 0.00013);
      targetReach = 0.5 + 0.45 * Math.sin(t * 0.00009);
      targetLean = 0.7 * Math.sin(t * 0.00007);
      setCam("demo");
    }

    // heavy low-pass smoothing — a slow, meditative signal
    eRef.current += (targetE - eRef.current) * 0.045;
    reachRef.current += (targetReach - reachRef.current) * 0.06;
    leanRef.current += (targetLean - leanRef.current) * 0.06;

    const energy = eRef.current;
    const still = 1 - energy;
    const reach = reachRef.current;
    const lean = leanRef.current;

    // ── conduct the audio ──
    const ctx = ctxRef.current;
    const node = nodeRef.current;
    if (ctx && node) {
      const stretch = 1 + still * (MAX_STRETCH - 1);
      const p = node.parameters.get("stretch");
      if (p) p.setTargetAtTime(stretch, ctx.currentTime, 0.18);
      if (shelfRef.current)
        shelfRef.current.gain.setTargetAtTime(reach * 5, ctx.currentTime, 0.2);
      if (panRef.current)
        panRef.current.pan.setTargetAtTime(lean * 0.85, ctx.currentTime, 0.2);
      uiTickRef.current++;
      if (uiTickRef.current % 12 === 0) setStretchLabel(stretch.toFixed(1));
    }

    // ── render the long-exposure field ──
    const st = glRef.current;
    const canvas = canvasRef.current;
    if (st && canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        runResizeGL(st, w, h);
      }
      const analyser = masterRef.current?.analyser;
      const spec = specRef.current;
      if (analyser && spec) analyser.getByteFrequencyData(spec);
      runRenderGL(
        st,
        spec ?? new Uint8Array(256),
        { still, energy, reach, lean },
        t * 0.001,
      );
    }
  }, [setCam]);

  const runStart = useCallback(async () => {
    if (started || booting) return;
    setBooting(true);
    setNotice("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      await ctx.resume();

      const master = createSafeMaster(ctx);
      masterRef.current = master;

      if (typeof ctx.audioWorklet === "undefined") {
        throw new Error("no-worklet");
      }
      const url = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
      );
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(ctx, "slowbloom-tsm", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { stretch: 1 },
      });
      nodeRef.current = node;

      // node → highshelf (reach brightness) → panner (lean) → safe master
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 3000;
      shelf.gain.value = 0;
      shelfRef.current = shelf;
      const pan = ctx.createStereoPanner();
      pan.pan.value = 0;
      panRef.current = pan;
      node.connect(shelf);
      shelf.connect(pan);
      pan.connect(master.input);

      specRef.current = new Uint8Array(master.analyser.frequencyBinCount);

      await runLoadTrack(trackId);

      // WebGL2 field
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
        canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
        try {
          glRef.current = runInitGL(canvas);
        } catch {
          setWebglMsg(
            "WebGL2 is unavailable in this browser — the audio still blooms; the light field needs WebGL2.",
          );
        }
      }

      modeRef.current = "demo";
      setCam("demo");
      startTimeRef.current = performance.now();
      setStarted(true);
      setBooting(false);
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (err) {
      console.error(err);
      setBooting(false);
      setNotice(
        "Audio could not start in this browser — it needs Web Audio and AudioWorklet.",
      );
    }
  }, [started, booting, trackId, runLoadTrack, runFrame, setCam]);

  const runUseCamera = useCallback(async () => {
    if (!started) return;
    setCam("loading");
    setNotice("");
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      const stream = await startCamera(video);
      streamRef.current = stream;
      const tracker = await createPoseTracker(1);
      trackerRef.current = tracker;
      prevLmRef.current = null;
      modeRef.current = "live";
      setCam("live");
    } catch (err) {
      console.error(err);
      modeRef.current = "demo";
      setCam("demo");
      setNotice(
        "Camera or pose model unavailable — the demo drive keeps conducting on its own.",
      );
    }
  }, [started, setCam]);

  const onTrackChange = useCallback(
    (id: string) => {
      setTrackId(id);
      if (started) {
        runLoadTrack(id).catch((e) => {
          console.error(e);
          setNotice("That track could not be loaded.");
        });
      }
    },
    [started, runLoadTrack],
  );

  // teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      try {
        nodeRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        glRef.current?.lose?.loseContext();
      } catch {
        /* noop */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  const statusLine =
    camStatus === "live"
      ? { text: "tracking · live", danger: false }
      : camStatus === "lost"
        ? {
            text: "shoulders lost — sit back so your shoulders are in frame",
            danger: true,
          }
        : camStatus === "loading"
          ? { text: "loading pose model…", danger: false }
          : {
              text: "demo — sweeping on its own; press Use camera to conduct",
              danger: false,
            };

  return (
    <main className="relative min-h-dvh w-full bg-background text-foreground">
      {/* long-exposure stage */}
      <div className="fixed inset-0 z-0">
        <canvas ref={canvasRef} className="h-full w-full" />
        {(!started || webglMsg) && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background" />
        )}
      </div>

      {/* mirrored pose preview (only while live) */}
      <video
        ref={videoRef}
        className={`fixed bottom-4 left-4 z-20 h-24 w-32 -scale-x-100 rounded-md border border-border/50 object-cover transition-opacity ${
          camStatus === "live" ? "opacity-80" : "pointer-events-none opacity-0"
        }`}
        playsInline
        muted
      />

      {/* first viewport: status (top) + controls (bottom) */}
      <section className="pointer-events-none relative z-10 flex h-dvh flex-col justify-between p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          {!immersive && (
            <div className="pointer-events-auto max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Slowbloom
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Hold your whole body still and time dilates through Karel&rsquo;s
                real piano — the pitch frozen, a single chord blooming into a long
                now.
              </p>
            </div>
          )}
          {started && (
            <p
              className={`font-mono text-xs uppercase tracking-[0.18em] ${
                statusLine.danger
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {statusLine.text}
            </p>
          )}
          {started && (
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
              stretch {stretchLabel}× · pitch locked
            </p>
          )}
          {webglMsg && (
            <p className="pointer-events-auto max-w-md text-sm text-destructive">
              {webglMsg}
            </p>
          )}
          {notice && (
            <p className="pointer-events-auto max-w-md text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </div>

        {!immersive && (
          <div className="pointer-events-auto flex flex-col gap-3">
            {!started ? (
              <div className="max-w-md rounded-lg border border-border bg-background/70 p-5 backdrop-blur-md">
                <p className="text-base leading-relaxed text-muted-foreground">
                  Press begin — the piece starts conducting itself with a slow
                  breathing demo. Allow the camera to take the baton and dilate
                  time with your own stillness.
                </p>
                <button
                  type="button"
                  onClick={runStart}
                  disabled={booting}
                  className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {booting ? "Waking the piano…" : "Begin"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runUseCamera}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {camStatus === "live" ? "Camera on" : "Use camera"}
                </button>
                <select
                  value={trackId}
                  onChange={(e) => onTrackChange(e.target.value)}
                  aria-label="Choose a track"
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {REAL_TRACKS.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </select>
                <ImmersiveHud
                  immersive={immersive}
                  onToggle={toggle}
                  title="Slowbloom"
                  description="Whole-body stillness conducts a pitch-preserving time-stretch of Karel's real piano recording: be still and time dilates up to eightfold with the pitch unchanged, so one chord blooms and hangs; move and time resumes. A phase-vocoder engine holds the pitch while a WebGL2 long-exposure field lets light accrete the longer you hold still."
                  howTo={[
                    "Allow the camera and sit back so your shoulders are in frame",
                    "Hold still — time slows and light accretes into a long exposure, pitch unchanged",
                    "Move to let time resume; reach up to brighten, lean to pan",
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* immersive HUD when there is no visible control bar */}
      {(immersive || !started) && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Slowbloom"
          description="Whole-body stillness conducts a pitch-preserving time-stretch of Karel's real piano recording: be still and time dilates up to eightfold with the pitch unchanged, so one chord blooms and hangs; move and time resumes. A phase-vocoder engine holds the pitch while a WebGL2 long-exposure field lets light accrete the longer you hold still."
          howTo={[
            "Allow the camera and sit back so your shoulders are in frame",
            "Hold still — time slows and light accretes into a long exposure, pitch unchanged",
            "Move to let time resume; reach up to brighten, lean to pan",
          ]}
        />
      )}

      {/* below-the-fold write-up */}
      {!immersive && (
        <section className="relative z-10 mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <div className="rounded-lg border border-border bg-background/70 p-6 backdrop-blur-md">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The question: what if the stiller you hold your whole body, the
              slower time flows through your own piano recording — with the pitch
              frozen — so a single chord blooms and hangs for many seconds? Motion
              energy from your shoulders, wrists and nose becomes the conductor of{" "}
              <span className="text-foreground">time itself</span>. Currently
              playing: <span className="text-foreground">{trackTitle}</span>.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Pitch is preserved by a real-time, variable-rate{" "}
              <span className="text-foreground">
                STFT phase-vocoder time-scale modification
              </span>{" "}
              running inside an AudioWorklet (2048-point frames, 512 synthesis hop,
              75% Hann overlap-add, a self-contained radix-2 FFT/IFFT). The
              synthesis hop is fixed while the analysis hop shrinks with the
              stretch factor, so the read head crawls through the take while every
              partial keeps its exact frequency — <code>playbackRate</code> is
              never touched. A demo drive (a slow breathing curve) exercises the
              identical energy → stretch → bloom chain with no webcam, so the whole
              mechanism is alive headless.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The light field is raw WebGL2: a ping-pong feedback buffer whose
              retention rises with stillness (a long exposure that accretes light)
              and whose dispersion rises with motion, a spectral bloom driven by
              the master analyser, and volumetric light shafts — rendered in a
              near-achromatic pewter-to-pearl, moonlit palette.
            </p>
            <p className="mt-4 font-mono text-xs leading-relaxed text-muted-foreground/80">
              refs — Flanagan &amp; Golden, &ldquo;Phase Vocoder,&rdquo; Bell
              System Technical Journal (1966); Dolson, &ldquo;The Phase Vocoder: A
              Tutorial,&rdquo; Computer Music Journal (1986); Lubis, Peng, Carreño
              &amp; Tsai, arXiv 2609.18999 (2026).
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
