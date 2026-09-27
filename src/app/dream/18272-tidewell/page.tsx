"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 18272-tidewell — CONDUCT the tonal REGISTER of your recording by TILTING YOUR
// HEAD. Tip right and the air/treble of Karel's piano rises and pours to the
// right; tip left and the body/bass swells to the left. The PITCH never changes.
//
// A head-ROLL → spectral register-tilt conductor. Roll ANGLE tips a spectral
// seesaw (a tilt-EQ: a low-shelf and a high-shelf mirrored around 0 dB). Roll
// VELOCITY (a fast tilt) throws a brief "splash" of air off the high-shelf that
// decays back. Head YAW pans the whole field across the stereo image. Nothing
// is pitched or time-stretched — the recording loops at playbackRate 1.0 and
// only its tonal BALANCE and spatial PLACEMENT move.
//
// INPUT  webcam head-roll (MediaPipe FaceLandmarker) — the angle of the eye line
//        is the tilt; nose-vs-eye-midpoint offset is the pan. Pointer-drag is a
//        first-class manual fallback.
// OUTPUT raw WebGL2 full-screen fragment shader (no three.js) — a volumetric
//        "sea of light" whose horizon TIPS with the roll: the raised side glows
//        cool cyan "air", the lowered side deep violet "body", incandescent
//        white pools where spectral energy gathers, and a luminous cascade
//        pours downhill toward the low side. Canvas2D fallback of the same.
// AUDIO  Karel's real catalog → low-shelf(320Hz) → high-shelf(3.5kHz) → stereo
//        panner → createSafeMaster (NEVER ctx.destination). Roll tips the two
//        shelves in opposition; roll velocity splashes the high-shelf; yaw+roll
//        drive the pan. Every param smoothed with setTargetAtTime.
//
// DEMO DRIVE: with NO camera the piece auto-runs a labeled seesaw sweep
// (roll = 0.7·sin(t·0.00017), yaw = 0.4·sin(t·0.00011)) that drives the exact
// same downstream chain, so the whole look→sound→light path is audible and
// visible — and verifiable headless — before any webcam. Ships demoable.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

// ── tilt-EQ constants ─────────────────────────────────────────────────────────
const LOW_SHELF_HZ = 320;
const HIGH_SHELF_HZ = 3500;
const HIGH_MAX_DB = 10; // roll right → high-shelf toward +10 dB (air rises)
const LOW_MAX_DB = 9; //  roll right → low-shelf toward −9 dB (body drops)
const SPLASH_DB = 6; //   extra transient air on a fast tilt
const SMOOTH_TC = 0.12; // setTargetAtTime time constant for every audio param

// how far the head-roll angle counts as "full tilt" — ±30° maps to ±1.
const ROLL_RANGE = Math.PI / 6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── head roll + yaw read from face landmarks (no matrix dependency) ────────────
interface HeadTilt {
  /** −1 (tipped left, body pours left) … +1 (tipped right, air pours right). */
  roll: number;
  /** −1 (turned left) … +1 (turned right), mirror-corrected — pans the field. */
  yaw: number;
}
const NEUTRAL: HeadTilt = { roll: 0, yaw: 0 };

// MediaPipe FaceLandmarker mesh indices:
//   1 nose tip · 33 right-eye outer corner · 263 left-eye outer corner
const NOSE = 1;
const EYE_R = 33; // person's right eye — appears on image LEFT (smaller x)
const EYE_L = 263; // person's left eye — appears on image RIGHT (larger x)

function computeTilt(res: FaceResult): HeadTilt | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const nose = lm[NOSE];
  const eR = lm[EYE_R];
  const eL = lm[EYE_L];
  if (!nose || !eR || !eL) return null;

  // ROLL = angle of the eye line. We mirror x (1-x) so it reads like a mirror:
  // tip your head to YOUR right and the eye line rotates so roll goes positive.
  const ax = 1 - eR.x;
  const bx = 1 - eL.x;
  const ang = Math.atan2(eL.y - eR.y, bx - ax); // ~0 when level
  const roll = clamp(ang / ROLL_RANGE, -1, 1);

  // YAW = horizontal nose offset from the eye midpoint, normalized by inter-eye
  // distance; mirror so a turn reads like a mirror.
  const eyeMidX = (eR.x + eL.x) / 2;
  const interEye = Math.abs(eL.x - eR.x) + 1e-4;
  const yaw = clamp(-((nose.x - eyeMidX) / interEye) * 3.2, -1, 1);

  return { roll, yaw };
}

// ── GLSL: a volumetric "sea of light" with a horizon that TIPS with the roll ───
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
uniform float uRoll;           // -1..1 tilt of the seesaw (right = +)
uniform float uPan;            // -1..1 horizontal light pool position
uniform float uEnergy;         // overall loudness 0..1
uniform float uTreble;         // air/high energy 0..1
uniform float uBass;           // body/low energy 0..1
uniform float uFlow;           // roll velocity → cascade speed 0..1
uniform float uNyquist;

// deep violet body → indigo → cyan air → incandescent white pool
vec3 bodyCol = vec3(0.36, 0.12, 0.72);   // deep violet (body / low side)
vec3 baseCol = vec3(0.22, 0.14, 0.56);   // indigo base
vec3 airCol  = vec3(0.30, 0.78, 0.98);   // cool cyan (air / high side)
vec3 poolCol = vec3(1.00, 0.99, 0.98);   // incandescent white

// cheap value noise + fbm for the moving sea surface
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0));
  float c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

float spectrumAt(float x){
  // x 0..1 → log frequency 60 Hz … 9 kHz, sampled from the analyser texture
  float freq = 60.0 * pow(150.0, clamp(x, 0.0, 1.0));
  float binPos = clamp(freq / uNyquist, 0.0, 1.0);
  return texture(uSpectrum, vec2(binPos, 0.5)).r;
}

void main(){
  vec2 uv = vUv;
  float ang = uRoll * 0.52;                 // tilt angle in radians (~±30°)
  float sn = sin(ang), cs = cos(ang);

  // horizon height at this column: right side rises when roll > 0.
  float poolX = 0.5 + uPan * 0.34;          // stereo pan slides the light pool
  float horizon = 0.5 + (uv.x - poolX) * tan(ang) + 0.03*sin(uTime*0.3);
  float h = uv.y - horizon;                 // signed height above the tilted line

  // ── the SEA of light below the horizon (body / violet, deeper on low side) ──
  // flow pours DOWNHILL toward the lowered side (opposite the roll sign).
  vec2 flowDir = normalize(vec2(-uRoll, -0.6));
  float t = uTime;
  vec2 sp = vec2((uv.x - poolX)*3.0, (horizon - uv.y)*3.0);
  sp += flowDir * t * (0.4 + uFlow*2.6);
  float surf = fbm(sp + vec2(0.0, t*0.15));
  surf += 0.5*fbm(sp*2.1 - flowDir*t*(0.6+uFlow*2.0));

  float below = smoothstep(0.0, -0.02, h);  // 1 below horizon
  // deeper (lower) side of the sea leans more violet + darker
  float depth = clamp(-h * 2.2, 0.0, 1.0);
  vec3 sea = mix(baseCol, bodyCol, clamp(depth + (-uRoll)*0.4, 0.0, 1.0));
  sea *= (0.35 + 0.9*surf) * (0.5 + uBass*1.4);
  sea *= below;

  // ── the AIR above the horizon (cyan, brighter on the raised side) ──────────
  float above = smoothstep(0.0, 0.02, h);
  float airLift = clamp(uRoll * (uv.x - poolX) * 2.0 + 0.4, 0.0, 1.4);
  vec3 air = airCol * (0.10 + 0.5*airLift) * (0.4 + uTreble*1.6);
  // soft glow of air raining upward, animated
  float shimmer = fbm(vec2(uv.x*6.0 + t*0.2, uv.y*4.0 - t*(0.5+uFlow)));
  air *= (0.6 + 0.7*shimmer);
  air *= above * smoothstep(0.9, 0.0, h);   // fade with altitude

  // ── volumetric godray shafts pooling where spectral energy is ──────────────
  // march down from a source above toward the pool, sampling the spectrum.
  vec2 O = vec2(poolX, 1.25);
  float glow = 0.0;
  const int STEPS = 22;
  vec2 p = uv;
  vec2 stepv = (O - uv) / float(STEPS);
  float decay = 1.0;
  for(int i=0;i<STEPS;i++){
    float band = spectrumAt(clamp(p.x, 0.0, 1.0));
    float lane = exp(-pow((p.x - poolX)*3.2, 2.0));
    glow += band * lane * decay;
    p += stepv;
    decay *= 0.90;
  }
  glow *= 0.05 * (0.6 + uEnergy*1.2);
  vec3 shaft = mix(bodyCol, airCol, clamp(0.5 + uRoll*0.5, 0.0, 1.0)) * glow;

  // ── incandescent WHITE pool where energy gathers along the horizon ─────────
  float hband = exp(-pow(h*7.0, 2.0));      // bright seam right at the waterline
  float pool = hband * (0.25 + uEnergy*1.4) * exp(-pow((uv.x - poolX)*2.2, 2.0));
  vec3 white = poolCol * pool;

  // ── luminous cascade streaks pouring downhill (speed = roll velocity) ──────
  vec2 cdir = flowDir;
  float along = dot(uv - vec2(poolX, horizon), cdir);
  float across = dot(uv - vec2(poolX, horizon), vec2(cdir.y, -cdir.x));
  float streaks = fbm(vec2(across*22.0, along*6.0 - t*(2.0+uFlow*10.0)));
  streaks = smoothstep(0.62, 0.98, streaks) * below * (0.15 + uFlow*1.1);
  vec3 cascade = mix(airCol, poolCol, 0.5) * streaks;

  vec3 col = sea + air + shaft + white + cascade;
  col += baseCol * 0.02;                     // never fully black — stays alive

  // depth vignette
  vec2 q = uv - 0.5;
  float vig = smoothstep(1.15, 0.30, length(q) * 1.25);
  col *= mix(0.5, 1.0, vig);

  col = col / (col + vec3(0.85));            // reinhard-ish tonemap
  col = pow(col, vec3(0.86));
  fragColor = vec4(col, 1.0);
}`;

// ── WebGL helpers ──────────────────────────────────────────────────────────────
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

function initGL(canvas: HTMLCanvasElement, bins: number): GLEngine | null {
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
    "uRoll",
    "uPan",
    "uEnergy",
    "uTreble",
    "uBass",
    "uFlow",
    "uNyquist",
  ]) {
    uni[name] = gl.getUniformLocation(prog, name);
  }
  gl.uniform1i(uni.uSpectrum, 0);
  return { gl, prog, spectrumTex, bins, uni };
}

// ── Canvas2D fallback: the same tilting sea, drawn by hand ─────────────────────
function drawSeaCanvas(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  roll: number,
  pan: number,
  energy: number,
  treble: number,
  bass: number,
  flow: number,
  time: number,
): void {
  g.fillStyle = "rgb(6,4,16)";
  g.fillRect(0, 0, w, h);
  const poolX = (0.5 + pan * 0.34) * w;
  const ang = roll * 0.52;
  // horizon endpoints (y down in canvas, so invert)
  const midY = h * 0.5;
  const slope = Math.tan(ang);
  const yAt = (x: number) => midY - (x - poolX) * slope; // right rises when roll>0
  g.globalCompositeOperation = "lighter";

  // sea (below horizon) — violet, deeper toward the lowered side
  const lowSide = roll >= 0 ? 0 : w; // lowered edge
  const seaGrad = g.createLinearGradient(lowSide, 0, w - lowSide, 0);
  seaGrad.addColorStop(0, `rgba(92,31,184,${0.35 + bass * 0.5})`);
  seaGrad.addColorStop(1, `rgba(56,36,143,${0.15 + bass * 0.3})`);
  g.fillStyle = seaGrad;
  g.beginPath();
  g.moveTo(0, yAt(0));
  g.lineTo(w, yAt(w));
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fill();

  // air (above horizon) — cyan, brighter on the raised side
  const airGrad = g.createLinearGradient(roll >= 0 ? w : 0, 0, roll >= 0 ? 0 : w, 0);
  airGrad.addColorStop(0, `rgba(77,199,250,${0.28 + treble * 0.5})`);
  airGrad.addColorStop(1, `rgba(77,199,250,0.04)`);
  g.fillStyle = airGrad;
  g.beginPath();
  g.moveTo(0, yAt(0));
  g.lineTo(w, yAt(w));
  g.lineTo(w, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fill();

  // incandescent white pool along the waterline, centered on the pan position
  const pool = g.createRadialGradient(poolX, yAt(poolX), 0, poolX, yAt(poolX), w * 0.5);
  pool.addColorStop(0, `rgba(255,253,250,${0.12 + energy * 0.5})`);
  pool.addColorStop(1, "rgba(255,253,250,0)");
  g.fillStyle = pool;
  g.fillRect(0, 0, w, h);

  // a few cascade streaks pouring downhill
  const n = 40;
  for (let i = 0; i < n; i++) {
    const fx = ((i / n + (time * (0.05 + flow * 0.4)) * (roll >= 0 ? -1 : 1)) % 1 + 1) % 1;
    const x = fx * w;
    const y0 = yAt(x);
    const len = (0.05 + flow * 0.2) * h;
    g.strokeStyle = `rgba(200,240,255,${0.05 + flow * 0.25})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x - roll * 20, y0 + len);
    g.stroke();
  }
  g.globalCompositeOperation = "source-over";
}

// ── audio graph type ────────────────────────────────────────────────────────────
interface TiltEQ {
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  panner: StereoPannerNode;
}

type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";
type Source = "demo" | "live" | "pointer";

export default function Tidewell() {
  const { immersive, toggle } = useImmersive();
  const [phase, setPhase] = useState<Phase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [source, setSource] = useState<Source>("demo");
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
  const eqRef = useRef<TiltEQ | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const engineRef = useRef<GLEngine | null>(null);

  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const tiltRef = useRef<HeadTilt>({ ...NEUTRAL }); // smoothed
  const prevRollRef = useRef(0);
  const splashRef = useRef(0); // decaying air-splash amount 0..1
  const camWantRef = useRef(false);
  const lastFaceRef = useRef(0);
  const lastTimeRef = useRef(0);

  // pointer-drag manual control (first-class fallback)
  const pointerRef = useRef<{ active: boolean; roll: number; yaw: number }>({
    active: false,
    roll: 0,
    yaw: 0,
  });

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

  // ── pointer fallback: drag across the stage to tilt the register ───────────
  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width; // 0..1
    const ny = (e.clientY - r.top) / r.height;
    pointerRef.current = {
      active: true,
      roll: clamp(nx * 2 - 1, -1, 1),
      yaw: clamp(ny * 2 - 1, -1, 1),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!pointerRef.current.active) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    pointerRef.current.roll = clamp(nx * 2 - 1, -1, 1);
    pointerRef.current.yaw = clamp(ny * 2 - 1, -1, 1);
  }, []);
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── control + render loop ─────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = now;

    // 1. target tilt from the active source: camera > pointer > demo
    const target: HeadTilt = { ...NEUTRAL };
    let label: Source = "demo";

    if (camWantRef.current && trackerRef.current && videoRef.current) {
      try {
        const video = videoRef.current;
        if (video.readyState >= 2) {
          const res = trackerRef.current.detectForVideo(video, now);
          const p = computeTilt(res);
          if (p) {
            lastFaceRef.current = now;
            target.roll = p.roll;
            target.yaw = p.yaw;
            label = "live";
            setCamState((s) => (s === "live" ? s : "live"));
          } else {
            if (now - lastFaceRef.current > 900)
              setCamState((s) => (s === "lost" ? s : "lost"));
            target.roll = tiltRef.current.roll;
            target.yaw = tiltRef.current.yaw;
            label = "live";
          }
        } else {
          target.roll = tiltRef.current.roll;
          target.yaw = tiltRef.current.yaw;
          label = "live";
        }
      } catch {
        target.roll = tiltRef.current.roll;
        target.yaw = tiltRef.current.yaw;
        label = "live";
      }
    } else if (pointerRef.current.active) {
      target.roll = pointerRef.current.roll;
      target.yaw = pointerRef.current.yaw;
      label = "pointer";
    } else {
      // DEMO DRIVE — a slow seesaw sweep, clearly labeled (t in ms).
      target.roll = 0.7 * Math.sin(now * 0.00017);
      target.yaw = 0.4 * Math.sin(now * 0.00011);
      label = "demo";
    }
    setSource((s) => (s === label ? s : label));

    // 2. exponential smoother (~0.12s time constant feel)
    const k = 1 - Math.exp(-dt / 0.12);
    const cur = tiltRef.current;
    const rollBefore = cur.roll;
    cur.roll += (target.roll - cur.roll) * k;
    cur.yaw += (target.yaw - cur.yaw) * k;

    // 3. roll VELOCITY → air splash (fast tilt throws a transient of air)
    const rollVel = Math.abs(cur.roll - rollBefore) / Math.max(dt, 1e-3);
    const flow = clamp01(rollVel * 1.6);
    // charge the splash on fast motion, otherwise let it decay
    splashRef.current = Math.max(splashRef.current * Math.exp(-dt / 0.45), flow);

    // 4. drive the tilt-EQ (pitch-clean) — every param via setTargetAtTime
    const ctx = ctxRef.current;
    const eq = eqRef.current;
    if (ctx && eq) {
      const t0 = ctx.currentTime;
      const highGain = cur.roll * HIGH_MAX_DB + splashRef.current * SPLASH_DB;
      const lowGain = -cur.roll * LOW_MAX_DB;
      eq.highShelf.gain.setTargetAtTime(
        clamp(highGain, -HIGH_MAX_DB, HIGH_MAX_DB + SPLASH_DB),
        t0,
        SMOOTH_TC,
      );
      eq.lowShelf.gain.setTargetAtTime(clamp(lowGain, -LOW_MAX_DB, LOW_MAX_DB), t0, SMOOTH_TC);
      const pan = clamp(cur.roll * 0.8 + cur.yaw * 0.4, -1, 1);
      eq.panner.pan.setTargetAtTime(pan, t0, SMOOTH_TC);
    }

    // 5. analyser → energy / treble / bass + texture
    let energy = 0,
      treble = 0,
      bass = 0;
    const bins = freqRef.current;
    const master = masterRef.current;
    if (master && bins) {
      master.analyser.getByteFrequencyData(bins);
      let sum = 0,
        tsum = 0,
        bsum = 0;
      const tStart = Math.floor(bins.length * 0.5);
      const bEnd = Math.floor(bins.length * 0.16);
      for (let i = 0; i < bins.length; i++) {
        sum += bins[i];
        if (i >= tStart) tsum += bins[i];
        if (i < bEnd) bsum += bins[i];
      }
      energy = clamp01(sum / bins.length / 170);
      treble = clamp01(tsum / (bins.length - tStart) / 150);
      bass = clamp01(bsum / Math.max(1, bEnd) / 190);
    }

    const c = canvasRef.current;
    const eng = engineRef.current;
    const nyquist = ctx ? ctx.sampleRate / 2 : 22050;
    const panPos = clamp(cur.roll * 0.8 + cur.yaw * 0.4, -1, 1);
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
      gl.uniform1f(eng.uni.uRoll, cur.roll);
      gl.uniform1f(eng.uni.uPan, panPos);
      gl.uniform1f(eng.uni.uEnergy, energy);
      gl.uniform1f(eng.uni.uTreble, treble);
      gl.uniform1f(eng.uni.uBass, bass);
      gl.uniform1f(eng.uni.uFlow, splashRef.current);
      gl.uniform1f(eng.uni.uNyquist, nyquist);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (c) {
      const g = c.getContext("2d");
      if (g)
        drawSeaCanvas(
          g,
          c.width,
          c.height,
          cur.roll,
          panPos,
          energy,
          treble,
          bass,
          splashRef.current,
          now / 1000,
        );
    }

    prevRollRef.current = cur.roll;
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

      // tilt-EQ: low-shelf → high-shelf → stereo panner → safe master.
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = LOW_SHELF_HZ;
      lowShelf.gain.value = 0;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = HIGH_SHELF_HZ;
      highShelf.gain.value = 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;

      lowShelf.connect(highShelf);
      highShelf.connect(panner);
      panner.connect(master.input);
      eqRef.current = { lowShelf, highShelf, panner };

      // one looping source, pitch-clean at rate 1.0 — never altered.
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = 1.0;
      src.connect(lowShelf);
      src.start();
      srcRef.current = src;

      // WebGL2 (or Canvas2D fallback)
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

  // ── camera opt-in: swap the demo drive for live head-roll ──────────────────
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
      const eq = eqRef.current;
      if (eq) {
        try {
          eq.lowShelf.disconnect();
          eq.highShelf.disconnect();
          eq.panner.disconnect();
        } catch {
          /* noop */
        }
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const camLive = camState === "live" && source === "live";
  const camBad = camState === "denied" || camState === "failed";
  const running = phase === "running";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        onPointerDown={running ? onPointerDown : undefined}
        onPointerMove={running ? onPointerMove : undefined}
        onPointerUp={running ? onPointerUp : undefined}
        onPointerCancel={running ? onPointerUp : undefined}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* start overlay */}
        {!running && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-black/70 px-6 py-10 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              tilt your head to conduct the tone
            </p>
            <h1 className="max-w-xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Tip your head right and the air &amp; treble of Karel&apos;s piano
              rises and pours right; tip left and the body &amp; bass swells left.
              The pitch never changes — only the tone tips.
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
              It opens on a self-running demo seesaw — no camera needed. Then
              press &ldquo;Use camera&rdquo; to conduct the register with your own
              head, or drag across the stage to tilt it by hand.
            </p>
            {phase === "error" && (
              <p className="max-w-md text-sm text-destructive">{errMsg}</p>
            )}
          </div>
        )}

        {/* tracking-status line */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camState === "requesting" ? (
              <span className="text-muted-foreground">searching…</span>
            ) : camLive ? (
              <span className="text-foreground">tracking · live</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                no face · face the camera, look straight ahead
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">
                  drag to tilt · demo seesaw running
                </span>
              </span>
            ) : source === "pointer" ? (
              <span className="text-muted-foreground">pointer · drag to tilt</span>
            ) : (
              <span className="text-muted-foreground">
                demo — press &ldquo;Use camera&rdquo; to conduct with your head
              </span>
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
              <div className="pointer-events-none absolute right-4 top-20 z-30 max-w-[16rem] text-right font-mono text-xs uppercase tracking-[0.18em] text-destructive">
                WebGL2 unavailable · Canvas2D sea
              </div>
            )}

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                18272 · tidewell — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Tip right → air &amp; treble rise and pour right · tip left → body
                &amp; bass swells left · a fast tilt splashes a burst of air · yaw
                pans the field. Pitch-clean — only the tone tips.
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
            title="Tidewell"
            description="Conduct the tonal register of Karel's real piano recording by tilting your head. Tip right and the air & treble rise and pour to the right; tip left and the body & bass swells to the left. A fast tilt splashes a burst of air. Pitch-clean — only the tonal balance and spatial placement move, never the pitch."
            howTo={[
              "Press Use camera, then tilt your head right — the treble rises and pours right",
              "Tilt your head left — the bass & body swells and pours left",
              "Tilt fast to splash a bright burst of air off the top",
              "Turn your head left / right to pan the whole field across the stereo image",
              "No camera? Drag left–right across the stage to tilt the register by hand",
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
              className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
                tidewell — a spectral seesaw for the head
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings loops, pitch-clean, at
                  its natural speed — <code>playbackRate</code> stays 1.0 and no
                  granular or time-stretch ever touches it. The only thing that
                  moves is its tonal balance.
                </p>
                <p>
                  A tilt-EQ sits on the signal path: a low-shelf at 320 Hz and a
                  high-shelf at 3.5 kHz, wired as a seesaw. Tip your head right and
                  the high-shelf climbs toward +10 dB while the low-shelf drops
                  toward −9 dB — the air rises. Tip left and the mirror happens —
                  the body swells. A fast tilt (roll velocity) throws a transient
                  &ldquo;splash&rdquo; of extra air off the high-shelf that decays
                  back. A StereoPanner follows <code>roll·0.8 + yaw·0.4</code>, so
                  the whole field slides across the stereo image. Every parameter
                  is smoothed with <code>setTargetAtTime</code> (~0.12 s) so there
                  is no zipper noise. The mix terminates in the shared safe-master
                  bus, never the raw destination.
                </p>
                <p>
                  Head roll is read from face landmarks — the angle of the eye
                  line between the two outer eye corners (indices 33 and 263),
                  <code>atan2(dy, dx)</code>, normalized over ±30°, mirrored so it
                  reads like a mirror. Yaw is the nose offset from the eye
                  midpoint. Both are smoothed with a ~0.12 s time constant.
                </p>
                <p>
                  The visual is a raw-WebGL2 volumetric &ldquo;sea of light&rdquo;
                  whose horizon TIPS with your roll. The raised side glows cool
                  cyan (air), the lowered side deep violet (body); godray shafts
                  pool where the analyser&apos;s FFT bins have energy; an
                  incandescent white seam burns along the waterline where energy
                  gathers; and a luminous cascade pours downhill toward the low
                  side at a speed set by your roll velocity. Every audible change
                  has a visible twin.
                </p>
                <p>
                  With no camera the piece runs a slow seesaw demo on its own
                  (roll = 0.7·sin(t·0.00017), yaw = 0.4·sin(t·0.00011)), driving
                  the exact same chain — so the full path is alive and verifiable
                  without a webcam. A pointer drag is a first-class manual control.
                </p>
                <p>
                  Reference: Zwicker &amp; Fastl,{" "}
                  <em>Psychoacoustics: Facts and Models</em> — spectral balance and
                  &ldquo;sharpness&rdquo; are what the ear reads as brightness, the
                  basis for treating a tilt-EQ as a &ldquo;tone&rdquo; conductor.
                  Believed a lab-first: no prior proto conducts register / tonal
                  balance via head-roll (existing conductor pieces conduct tempo or
                  phrasing).
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
