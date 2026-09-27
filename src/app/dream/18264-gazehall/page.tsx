"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18264-gazehall — LOOK at your recording to hear it.
//
// A dark hall holds a luminous SPECTRAL SEARCHLIGHT. Turn your head and the beam
// sweeps across a spectral field (frequency runs left→right). Wherever your gaze
// lands, that band of Karel's real piano blooms up out of the dark:
//   · look UP    → the air & treble of the recording brighten and rise
//   · look DOWN  → the bass & body swell
//   · look L / R → the stereo image sweeps AND the spectral focus slides
// It is PITCH-CLEAN: the recording's pitch and speed never change — a parallel
// bank of bandpass filters simply decides WHICH frequencies bloom and where they
// sit in space. A gaze-contingent auditory spotlight.
//
// INPUT  webcam head-pose (MediaPipe FaceLandmarker) — yaw & pitch from landmarks
// OUTPUT raw WebGL2 full-screen fragment shader (no three.js) — a volumetric
//        searchlight cone over a violet→cyan→white spectrogram field; Canvas2D
//        fallback of the same field when WebGL2 is unavailable.
// AUDIO  Karel's real catalog → parallel BiquadFilter bandpass bank → per-band
//        gains (a Gaussian window on the gaze's spectral target) → StereoPanner →
//        createSafeMaster (NEVER ctx.destination). playbackRate stays 1.0, loop.
//
// DEMO DRIVE: with no camera the gaze cone sweeps a slow Lissajous on its own, so
// the full gaze→spectral-focus→(audible EQ/pan + visible beam) path runs and is
// verifiable in a headless environment. Camera is a first-class opt-in swap.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud, ImmersiveToggle } from "../_shared/immersive";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
  type FaceResult,
  type Landmark,
} from "../_shared/cameraTracking";

// ── the spectral bank ────────────────────────────────────────────────────────
// ~10 log-spaced bandpass bands across 80 Hz … 8 kHz. Each band's normalized
// position p_i = i/(N-1) maps onto the shader's log-frequency X axis, so the
// gaze's spectral focus lines up visually with the band that blooms.
const BAND_COUNT = 10;
const F_LO = 80;
const F_HI = 8000;
const BAND_FCS: number[] = Array.from({ length: BAND_COUNT }, (_, i) =>
  F_LO * Math.pow(F_HI / F_LO, i / (BAND_COUNT - 1)),
);
const BAND_FLOOR = 0.14; // never let a band go silent → the piece stays alive
const FOCUS_SIGMA = 0.18; // width of the Gaussian bloom window over the bank

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── head pose read from face landmarks (robust, no matrix dependency) ─────────
interface HeadPose {
  /** −1 (turned left) … +1 (turned right), mirror-corrected. */
  yaw: number;
  /** −1 (looking down) … +1 (looking up). */
  pitch: number;
}
const NEUTRAL_POSE: HeadPose = { yaw: 0, pitch: 0 };

// MediaPipe FaceLandmarker mesh indices used:
//   1 nose tip · 33 left-eye outer corner · 263 right-eye outer corner
//   10 forehead top · 152 chin bottom
const NOSE = 1;
const EYE_L = 33;
const EYE_R = 263;
const FORE = 10;
const CHIN = 152;
// Nose sits below the eye line at rest; subtract that neutral to center pitch.
const PITCH_NEUTRAL = 0.30;

function computePose(res: FaceResult): HeadPose | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const nose = lm[NOSE];
  const eyeL = lm[EYE_L];
  const eyeR = lm[EYE_R];
  const fore = lm[FORE];
  const chin = lm[CHIN];
  const interEye = Math.abs(eyeR.x - eyeL.x) + 1e-4;
  const eyeMidX = (eyeL.x + eyeR.x) / 2;
  const eyeMidY = (eyeL.y + eyeR.y) / 2;
  const faceH = Math.abs(chin.y - fore.y) + 1e-4;

  // yaw: horizontal nose offset from eye midpoint, normalized by inter-eye dist.
  // Mirror x (negate) so a turn reads like a mirror.
  const yawRaw = -((nose.x - eyeMidX) / interEye);
  const yaw = clamp(yawRaw * 3.4, -1, 1);

  // pitch: vertical nose offset from the eye line over face height; up → larger.
  const pitchRaw = (nose.y - eyeMidY) / faceH - PITCH_NEUTRAL;
  const pitch = clamp(pitchRaw * 5.2, -1, 1);

  return { yaw, pitch };
}

// ── GLSL: full-screen searchlight over a log-frequency spectral field ─────────
const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;      // 0..1, y up
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSpectrum;   // R8, FFT magnitude, width = bins
uniform float uTime;
uniform float uFocus;          // spectral focus 0..1 over log frequency
uniform float uBeamX;          // beam target x 0..1
uniform float uBeamY;          // beam target y 0..1 (y up)
uniform float uNyquist;        // sampleRate/2
uniform float uEnergy;
uniform float uTreble;

// deep violet/indigo lows → cyan → luminous white highs
vec3 spectralColor(float f){
  vec3 lo  = vec3(0.30, 0.14, 0.82);   // indigo / violet
  vec3 mid = vec3(0.16, 0.64, 0.94);   // cyan
  vec3 hi  = vec3(0.96, 0.98, 1.00);   // luminous white
  f = clamp(f, 0.0, 1.0);
  if(f < 0.5) return mix(lo, mid, f / 0.5);
  return mix(mid, hi, (f - 0.5) / 0.5);
}

float sampleField(vec2 uv){
  // x → log frequency 80 Hz … 8 kHz, matching the audio bank
  float freq = 80.0 * pow(100.0, clamp(uv.x, 0.0, 1.0));
  float binPos = clamp(freq / uNyquist, 0.0, 1.0);
  return texture(uSpectrum, vec2(binPos, 0.5)).r;
}

void main(){
  vec2 uv = vUv;
  vec2 O = vec2(0.5, 1.30);              // searchlight hangs above the hall
  vec2 T = vec2(uBeamX, uBeamY);         // gaze target
  vec2 axis = normalize(T - O);

  // volumetric godray: march from this pixel back toward the light origin,
  // accumulating how much of the path lies inside the sweeping cone.
  float glow = 0.0;
  const int STEPS = 26;
  vec2 p = uv;
  vec2 stepv = (O - uv) / float(STEPS);
  float decay = 1.0;
  for(int i = 0; i < STEPS; i++){
    vec2 v = p - O;
    float proj = dot(v, axis);
    vec2 perp = v - axis * proj;
    float dist = length(perp);
    float width = 0.02 + 0.16 * clamp(proj, 0.0, 1.4);
    float beam = exp(-(dist * dist) / (width * width))
               * (1.0 - smoothstep(0.0, 1.5, proj)) * step(0.0, proj);
    glow += beam * decay;
    p += stepv;
    decay *= 0.92;
  }
  float breathe = 0.6 + uEnergy * 1.0 + 0.08 * sin(uTime * 0.9);
  glow *= 0.045 * breathe;

  // direct cone mask at this pixel (where the field actually blooms)
  vec2 v0 = uv - O;
  float proj0 = dot(v0, axis);
  vec2 perp0 = v0 - axis * proj0;
  float width0 = 0.03 + 0.20 * clamp(proj0, 0.0, 1.4);
  float beam0 = exp(-(dot(perp0, perp0)) / (width0 * width0)) * step(0.0, proj0);

  // spectral field, emphasised in the focused frequency column
  float mag = sampleField(uv);
  float focusBand = exp(-pow(uv.x - uFocus, 2.0) / (2.0 * 0.10 * 0.10));
  float fieldAmt = mag * (0.30 + 0.70 * focusBand) * beam0;

  vec3 col = spectralColor(uv.x) * fieldAmt * (1.15 + uTreble * 0.8);
  col += spectralColor(uFocus) * glow;                 // the luminous shaft
  col += spectralColor(uFocus) * (0.012 + 0.02 * uEnergy) * beam0; // alive floor
  col += vec3(0.007, 0.008, 0.013);                    // faint dark-hall floor

  // depth vignette
  vec2 q = uv - 0.5;
  float vig = smoothstep(1.05, 0.28, length(q) * 1.3);
  col *= mix(0.42, 1.0, vig);

  col = col / (col + vec3(0.9));   // reinhard-ish tonemap
  col = pow(col, vec3(0.85));
  fragColor = vec4(col, 1.0);
}`;

// ── WebGL helpers (non-hook names) ────────────────────────────────────────────
function buildShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}
function buildProgram(gl: WebGL2RenderingContext) {
  const vs = buildShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = buildShader(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link: " + log);
  }
  return prog;
}

interface GLEngine {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  spectrumTex: WebGLTexture;
  bins: number;
  uni: Record<string, WebGLUniformLocation | null>;
}

function initGL(
  canvas: HTMLCanvasElement,
  bins: number,
): GLEngine | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  let prog: WebGLProgram;
  try {
    prog = buildProgram(gl);
  } catch {
    return null;
  }
  // full-screen triangle
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const spectrumTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, spectrumTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    bins,
    1,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    new Uint8Array(bins),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.useProgram(prog);
  const uni: Record<string, WebGLUniformLocation | null> = {};
  for (const name of [
    "uSpectrum",
    "uTime",
    "uFocus",
    "uBeamX",
    "uBeamY",
    "uNyquist",
    "uEnergy",
    "uTreble",
  ]) {
    uni[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform1i(uni.uSpectrum, 0);

  return { gl, prog, spectrumTex, bins, uni };
}

// ── Canvas2D fallback: same spectral field, rendered by hand ──────────────────
function drawFieldCanvas(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  focus: number,
  beamX: number,
  beamY: number,
  bins: Uint8Array,
  nyquist: number,
  energy: number,
): void {
  g.fillStyle = "rgb(2,2,5)";
  g.fillRect(0, 0, w, h);
  const cols = 96;
  g.globalCompositeOperation = "lighter";
  const ox = beamX * w;
  const oyTop = -0.28 * h;
  for (let cxi = 0; cxi < cols; cxi++) {
    const u = cxi / (cols - 1);
    const freq = 80 * Math.pow(100, u);
    const binPos = clamp01(freq / nyquist);
    const mag = bins[Math.floor(binPos * (bins.length - 1))] / 255;
    // cone proximity: how close this column is to the beam target x
    const cone = Math.exp(-Math.pow((u - beamX) / 0.16, 2));
    const focusBand = Math.exp(-Math.pow((u - focus) / 0.12, 2));
    const amt = mag * (0.3 + 0.7 * focusBand) * cone;
    if (amt < 0.01) continue;
    // color violet→cyan→white by frequency
    let r: number, gg: number, b: number;
    if (u < 0.5) {
      const t = u / 0.5;
      r = 0.3 + (0.16 - 0.3) * t;
      gg = 0.14 + (0.64 - 0.14) * t;
      b = 0.82 + (0.94 - 0.82) * t;
    } else {
      const t = (u - 0.5) / 0.5;
      r = 0.16 + (0.96 - 0.16) * t;
      gg = 0.64 + (0.98 - 0.64) * t;
      b = 0.94 + (1.0 - 0.94) * t;
    }
    const a = clamp01(amt * (0.7 + energy * 0.6));
    const cw = w / cols + 2;
    const cx = u * w;
    const grad = g.createLinearGradient(cx, 0, cx, h);
    const R = Math.round(r * 255),
      G = Math.round(gg * 255),
      B = Math.round(b * 255);
    grad.addColorStop(0, `rgba(${R},${G},${B},0)`);
    grad.addColorStop(clamp01(beamY), `rgba(${R},${G},${B},${a})`);
    grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = grad;
    g.fillRect(cx - cw / 2, 0, cw, h);
  }
  // soft searchlight shaft
  const shaft = g.createRadialGradient(ox, oyTop, 0, ox, oyTop, h * 1.1);
  const fv = focus;
  const R = Math.round((fv < 0.5 ? 0.3 : 0.96) * 255);
  shaft.addColorStop(0, `rgba(${R},${180},${255},${0.05 + energy * 0.05})`);
  shaft.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shaft;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";
}

// ── audio bank type ───────────────────────────────────────────────────────────
interface Bank {
  filters: BiquadFilterNode[];
  gains: GainNode[];
  sum: GainNode;
  intensity: GainNode;
  panner: StereoPannerNode;
}

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

export default function GazeHall() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [controlLabel, setControlLabel] = useState<"demo" | "live">("demo");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [glMode, setGlMode] = useState<"webgl2" | "canvas2d">("webgl2");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bankRef = useRef<Bank | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const engineRef = useRef<GLEngine | null>(null);

  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const poseRef = useRef<HeadPose>({ ...NEUTRAL_POSE });
  const camWantRef = useRef(false);
  const lastFaceRef = useRef(0);
  const lastTimeRef = useRef(0);

  // ── DPR-aware canvas sizing ──────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      const eng = engineRef.current;
      if (eng) eng.gl.viewport(0, 0, w, h);
    }
  }, []);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── control + render loop ─────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = now;

    // 1. target head pose from active source
    const target: HeadPose = { ...NEUTRAL_POSE };
    let label: "demo" | "live" = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      try {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          const res = trackerRef.current.detectForVideo(video, now);
          const p = computePose(res);
          if (p) {
            lastFaceRef.current = now;
            target.yaw = p.yaw;
            target.pitch = p.pitch;
            label = "live";
            setCamState((s) => (s === "live" ? s : "live"));
          } else if (now - lastFaceRef.current > 900) {
            setCamState((s) => (s === "lost" ? s : "lost"));
            target.yaw = poseRef.current.yaw;
            target.pitch = poseRef.current.pitch;
            label = "live";
          } else {
            target.yaw = poseRef.current.yaw;
            target.pitch = poseRef.current.pitch;
            label = "live";
          }
        } else {
          target.yaw = poseRef.current.yaw;
          target.pitch = poseRef.current.pitch;
          label = "live";
        }
      } catch {
        target.yaw = poseRef.current.yaw;
        target.pitch = poseRef.current.pitch;
      }
    } else {
      // DEMO DRIVE — a slow Lissajous sweep of the gaze cone, clearly labeled.
      const t = now / 1000;
      target.yaw = 0.72 * Math.sin(t * 0.19);
      target.pitch = 0.62 * Math.sin(t * 0.13 + 1.2);
      label = "demo";
    }
    setControlLabel((c) => (c === label ? c : label));

    // 2. exponential smoother (~0.12s time constant feel)
    const k = 1 - Math.exp(-dt / 0.12);
    const cur = poseRef.current;
    cur.yaw += (target.yaw - cur.yaw) * k;
    cur.pitch += (target.pitch - cur.pitch) * k;

    // 3. derive spectral focus, beam target, pan, intensity
    const focus = clamp01(0.5 + cur.pitch * 0.45 + cur.yaw * 0.3);
    const beamX = clamp(0.5 + cur.yaw * 0.42, 0.05, 0.95);
    const beamY = clamp(0.5 + cur.pitch * 0.36, 0.1, 0.95);
    const lean = Math.min(1, Math.hypot(cur.yaw, cur.pitch));

    const ctx = ctxRef.current;
    const bank = bankRef.current;
    const master = masterRef.current;
    if (ctx && bank && master) {
      const t0 = ctx.currentTime;
      const tc = 0.09;
      // Gaussian window over the bank centered on the focused frequency.
      for (let i = 0; i < bank.gains.length; i++) {
        const pi = i / (BAND_COUNT - 1);
        const w = Math.exp(
          -((pi - focus) * (pi - focus)) / (2 * FOCUS_SIGMA * FOCUS_SIGMA),
        );
        const g = BAND_FLOOR + (1 - BAND_FLOOR) * w;
        bank.gains[i].gain.setTargetAtTime(g, t0, tc);
      }
      bank.panner.pan.setTargetAtTime(clamp(cur.yaw * 0.95, -0.95, 0.95), t0, tc);
      bank.intensity.gain.setTargetAtTime(0.85 + lean * 0.3, t0, tc);
    }

    // 4. analyser energy → texture / draw
    let energy = 0,
      treble = 0;
    const bins = freqRef.current;
    if (master && bins) {
      master.analyser.getByteFrequencyData(bins);
      let sum = 0,
        tsum = 0;
      const tStart = Math.floor(bins.length * 0.45);
      for (let i = 0; i < bins.length; i++) {
        sum += bins[i];
        if (i >= tStart) tsum += bins[i];
      }
      energy = clamp01(sum / bins.length / 170);
      treble = clamp01(tsum / (bins.length - tStart) / 150);
    }

    const c = canvasRef.current;
    const eng = engineRef.current;
    const nyquist = ctx ? ctx.sampleRate / 2 : 22050;
    if (c && eng && bins) {
      const gl = eng.gl;
      gl.bindTexture(gl.TEXTURE_2D, eng.spectrumTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        eng.bins,
        1,
        gl.RED,
        gl.UNSIGNED_BYTE,
        bins.subarray(0, eng.bins),
      );
      gl.useProgram(eng.prog);
      gl.uniform1f(eng.uni.uTime, now / 1000);
      gl.uniform1f(eng.uni.uFocus, focus);
      gl.uniform1f(eng.uni.uBeamX, beamX);
      gl.uniform1f(eng.uni.uBeamY, beamY);
      gl.uniform1f(eng.uni.uNyquist, nyquist);
      gl.uniform1f(eng.uni.uEnergy, energy);
      gl.uniform1f(eng.uni.uTreble, treble);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (c && bins) {
      const g = c.getContext("2d");
      if (g) drawFieldCanvas(g, c.width, c.height, focus, beamX, beamY, bins, nyquist, energy);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── start audio + visuals (user gesture) ──────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;
      freqRef.current = new Uint8Array(master.analyser.frequencyBinCount);

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // parallel bandpass bank → per-band gain → sum → intensity → panner → safe
      const sum = ctx.createGain();
      sum.gain.value = 1;
      const filters: BiquadFilterNode[] = [];
      const gains: GainNode[] = [];
      for (let i = 0; i < BAND_COUNT; i++) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = BAND_FCS[i];
        bp.Q.value = 3.5;
        const g = ctx.createGain();
        g.gain.value = BAND_FLOOR;
        bp.connect(g);
        g.connect(sum);
        filters.push(bp);
        gains.push(g);
      }
      const intensity = ctx.createGain();
      intensity.gain.value = 1;
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;
      sum.connect(intensity);
      intensity.connect(panner);
      panner.connect(master.input);
      bankRef.current = { filters, gains, sum, intensity, panner };

      // single looping source at pitch-clean rate 1.0 feeds every band
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = 1.0;
      for (const bp of filters) src.connect(bp);
      src.start();
      srcRef.current = src;

      // set up WebGL2 (or fall back to Canvas2D)
      resize();
      const c = canvasRef.current;
      if (c) {
        const eng = initGL(c, master.analyser.frequencyBinCount);
        if (eng) {
          engineRef.current = eng;
          eng.gl.viewport(0, 0, c.width, c.height);
          setGlMode("webgl2");
        } else {
          setGlMode("canvas2d");
        }
      }

      lastTimeRef.current = 0;
      setPhase("running");
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start");
      setPhase("error");
    }
  }, [phase, trackId, resize, runFrame]);

  // ── camera opt-in: swap the demo drive for live head-pose ─────────────────
  const enableCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCamState("requesting");
    try {
      const tracker = await createFaceTracker(1);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastFaceRef.current = performance.now();
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      const msg = e instanceof Error ? e.message : "";
      if (/denied|Permission|NotAllowed/i.test(msg)) setCamState("denied");
      else setCamState("failed");
    }
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      const bank = bankRef.current;
      if (bank) {
        for (const f of bank.filters)
          try {
            f.disconnect();
          } catch {
            /* noop */
          }
        for (const g of bank.gains)
          try {
            g.disconnect();
          } catch {
            /* noop */
          }
        try {
          bank.sum.disconnect();
          bank.intensity.disconnect();
          bank.panner.disconnect();
        } catch {
          /* noop */
        }
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const camLive = camState === "live" && controlLabel === "live";
  const camBad = camState === "denied" || camState === "failed";
  const running = phase === "running";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              look at your recording to hear it
            </p>
            <h1 className="max-w-xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Turn your head to sweep a spectral searchlight across Karel&apos;s
              piano — wherever your gaze lands, that band blooms out of the dark.
            </h1>
            <div className="flex max-w-2xl flex-col gap-3">
              {COLLECTIONS.map((col) => (
                <div key={col.name} className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {col.name}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {col.tracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTrackId(t.id)}
                        className={
                          "min-h-[44px] rounded-md border px-4 text-sm transition-colors " +
                          (trackId === t.id
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                        }
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "loading Karel's recording…" : "Begin"}
            </button>
            <p className="max-w-md text-base text-muted-foreground">
              It starts on a self-running demo sweep — no camera needed. Click
              &ldquo;Use camera&rdquo; to conduct the light with your own head.
            </p>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking-status line */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camLive ? (
              <span className="text-foreground">tracking · live</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                no face · face the camera, look around
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">demo sweep running</span>
              </span>
            ) : (
              <span className="text-muted-foreground">demo sweep · no camera</span>
            )}
          </div>
        )}

        {/* chrome (hidden while immersive) */}
        {running && !immersive && (
          <>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {!camLive && (
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={camState === "requesting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {camState === "requesting" ? "starting camera…" : "Use camera"}
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            {glMode === "canvas2d" && (
              <div className="pointer-events-none absolute right-4 top-20 z-30 max-w-[16rem] text-right font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                WebGL2 unavailable · Canvas2D field
              </div>
            )}

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                18264 · gazehall — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Look up for the air &amp; treble · look down for the bass &amp;
                body · look left / right to sweep the stereo field and slide the
                spectral focus. Pitch-clean — only which frequencies bloom
                changes.
              </p>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </>
        )}

        {/* immersive HUD */}
        {running && immersive && (
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Gaze Hall"
            description="A gaze-contingent auditory spotlight. Turn your head to sweep a spectral searchlight across Karel's real piano recording; wherever your gaze lands, that band of the music blooms out of the dark. Pitch-clean: only which frequencies you hear, and where they sit in space, changes."
            howTo={[
              "Click Use camera, then slowly turn your head up and down to sweep the light across the sound",
              "Look up for the air & treble; look down for the bass & body",
              "Turn left / right to sweep the stereo field and slide the spectral focus",
              "With no camera it runs a self-driving demo sweep on its own",
            ]}
          />
        )}

        {/* design-notes modal */}
        {showNotes && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          >
            <div
              className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                gaze hall — a spectral searchlight
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings loops, pitch-clean, at
                  its natural speed. A parallel bank of ten bandpass filters,
                  log-spaced from 80 Hz to 8 kHz, splits it into bands. Your head
                  orientation aims a Gaussian window across that bank: the bands
                  under your gaze bloom, the rest fall to a low floor so the piece
                  never goes silent.
                </p>
                <p>
                  Head yaw and pitch are read from face landmarks — the nose tip
                  offset from the eye midpoint (yaw) and from the eye line over
                  face height (pitch) — smoothed with a ~0.12 s time constant. Up
                  reveals the air &amp; treble, down the bass &amp; body; left /
                  right sweeps a StereoPanner and slides the spectral focus. The
                  whole mix terminates in the shared safe-master bus.
                </p>
                <p>
                  The visual is a raw-WebGL2 dark hall holding a volumetric
                  searchlight that follows your gaze, blooming a violet → cyan →
                  white spectrogram field driven by the analyser&apos;s FFT bins.
                </p>
                <p>
                  With no camera the gaze cone runs a slow Lissajous sweep on its
                  own, so the full path — gaze → spectral focus → audible EQ/pan
                  shift and visible beam — is alive and verifiable without a
                  webcam.
                </p>
                <p>
                  References: Vinnikov &amp; Allison,
                  &ldquo;Gaze-Contingent Auditory Displays for Improved Spatial
                  Attention&rdquo;; and the recent finding (bioRxiv, Aug 2026,
                  &ldquo;Listening shapes seeing&rdquo;) that attending to a sound
                  in a location sharpens vision there — this piece makes that
                  cross-modal loop playable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
