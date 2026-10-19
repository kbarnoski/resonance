"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 22880-vantage — Karel's ONE piano take, exploded into a SWARM of sound-bodies
// orbiting you in 3-D. Your head position (webcam / mouse) is your VANTAGE POINT
// inside the swarm: lean left/right to pan, lean IN to pull the voices near (and
// the hall tightens), lean BACK for a wide hall, turn to rotate the whole field.
// Everything you HEAR you also SEE — each voice is a cluster of GPU particles,
// projected from your tracked viewpoint, glowing with that voice's live level.
//
// AUDIO (never synthesis): one real take (loadRealTrackBuffer) → one looping
// BufferSource → fanned into N parallel BiquadFilter band-splits (sub / low-mid /
// mid / high-mid / air). Each band = one spatial VOICE: biquad → gain → HRTF
// PannerNode fixed on a 3-D ring/shell, → the shared safeMaster. A per-voice
// AnalyserNode taps the gain (pre-panner) so each particle cluster glows with its
// own voice. A convolver whose impulse is a decayed slice of HIS OWN recording is
// the hall; its wet level drops as you lean in. Listener position/orientation is
// your vantage. ZERO oscillators, ZERO noise, ZERO ctx.destination.
//
// RENDER: raw WebGL2 GPGPU — ~30k particles advanced on the GPU by TRANSFORM
// FEEDBACK (ping-ponged position+velocity buffers), drawn as additive gl.POINTS
// projected through a view matrix built from the vantage. Warm stone/bronze→gold
// glow on near-black (art-layer palette only). No three.js, no Canvas2D, no grain.
//
// INPUT (graceful): `head · tracking` (MediaPipe FaceLandmarker) · `camera off —
// mouse steers` (pointer + arrow keys drive the exact same vantage) · a lost
// state in text-destructive. Pointer-first: the whole piece is audible+visible
// with no camera at all.
//
// Grounding: SPARO (Krishnan, Zhang, Duraiswami & Brown, arXiv:2610.20400, 2026)
// for head-tracked neural HRTF; Begault, "3-D Sound for VR and Multimedia". README.
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

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRACK = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath"
const VOICE_COUNT = 5;
const PARTICLES_PER_VOICE = 6000;
const N = VOICE_COUNT * PARTICLES_PER_VOICE; // 30000
const RING_R = 5.0;
const MAX_YAW = 1.1; // radians the field rotates at full turn

// band-split centres / types per voice, low → high register
const BANDS: { type: BiquadFilterType; hz: number; q: number }[] = [
  { type: "lowpass", hz: 190, q: 0.8 },
  { type: "bandpass", hz: 420, q: 1.2 },
  { type: "bandpass", hz: 950, q: 1.4 },
  { type: "bandpass", hz: 2200, q: 1.6 },
  { type: "highpass", hz: 4800, q: 0.8 },
];

// fixed world position of each voice on the ring/shell (y rises with register)
function voiceCenter(i: number): [number, number, number] {
  const a = (i / VOICE_COUNT) * Math.PI * 2;
  const y = -1.6 + (i / (VOICE_COUNT - 1)) * 3.4; // sub low … air high
  return [RING_R * Math.sin(a), y, -RING_R * Math.cos(a)];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── vantage: the listener's point inside the swarm ───────────────────────────
interface Vantage {
  x: number; // strafe / lean left-right, world units
  depth: number; // 0 (leaned back, wide hall) … 1 (leaned in, close)
  yaw: number; // -1 … 1, field rotation
}

// ── mat4 helpers (column-major, for uniformMatrix4fv) ────────────────────────
function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function lookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): Float32Array {
  let zx = eye[0] - center[0],
    zy = eye[1] - center[1],
    zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy,
    xy = up[2] * zx - up[0] * zz,
    xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy,
    yy = zz * xx - zx * xz,
    yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

// ── head pose from face landmarks → vantage target ───────────────────────────
// 1 nose tip · 33 / 263 outer eye corners · 133 / 362 inner eye corners
const NOSE = 1;
const EYE_OUT_L = 33;
const EYE_OUT_R = 263;
const IOD_NEAR = 0.11; // inter-ocular distance (normalized) when leaned back
const IOD_FAR = 0.23; // … when leaned way in

function computeVantageFromFace(res: FaceResult): Vantage | null {
  const lm: Landmark[] | undefined = res.faceLandmarks?.[0];
  if (!lm || lm.length < 468) return null;
  const nose = lm[NOSE];
  const eL = lm[EYE_OUT_L];
  const eR = lm[EYE_OUT_R];
  const iod = Math.abs(eR.x - eL.x) + 1e-4;
  const eyeMidX = (eL.x + eR.x) / 2;
  // mirror x so moving your head left moves your vantage left (mirror preview)
  const headX = 1 - nose.x; // 0..1
  const x = clamp((headX - 0.5) * 2, -1, 1) * 3.2;
  const depth = clamp01((iod - IOD_NEAR) / (IOD_FAR - IOD_NEAR));
  // yaw: nose offset from eye midpoint over iod, mirrored
  const yaw = clamp(-((nose.x - eyeMidX) / iod) * 2.6, -1, 1);
  return { x, depth, yaw };
}

// ── GLSL ─────────────────────────────────────────────────────────────────────
// update: advance particle pos/vel on the GPU (transform feedback)
const UPDATE_VS = /* glsl */ `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aVel;
in float aVoice;
in vec3 aSeed;
uniform vec3 uCenters[${VOICE_COUNT}];
uniform float uLevels[${VOICE_COUNT}];
uniform float uTime;
uniform float uDt;
out vec3 vPos;
out vec3 vVel;
void main(){
  int vi = int(aVoice + 0.5);
  vec3 center = uCenters[vi];
  float lvl = uLevels[vi];
  float ang = uTime * (0.25 + aSeed.x * 0.55) + aSeed.y * 6.2831;
  float orbitR = 0.55 + aSeed.z * 1.25 + lvl * 0.9;
  vec3 target = center + vec3(
    cos(ang) * orbitR,
    sin(ang * 1.3 + aSeed.x * 6.2831) * orbitR * 0.6,
    sin(ang) * orbitR
  );
  vec3 vel = aVel + (target - aPos) * (2.6 * uDt);
  // agitation scales with this voice's live level
  vel += (aSeed - 0.5) * lvl * 4.5 * uDt;
  vel *= 0.90;
  vPos = aPos + vel * uDt;
  vVel = vel;
}`;

const UPDATE_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 c;
void main(){ c = vec4(0.0); }`;

const RENDER_VS = /* glsl */ `#version 300 es
precision highp float;
in vec3 aPos;
in float aVoice;
in vec3 aSeed;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uLevels[${VOICE_COUNT}];
uniform float uDpr;
out float vGlow;
out float vVoiceF;
void main(){
  vec4 vp = uView * vec4(aPos, 1.0);
  gl_Position = uProj * vp;
  float dist = max(-vp.z, 0.3);
  int vi = int(aVoice + 0.5);
  float lvl = uLevels[vi];
  float size = (5.5 + lvl * 24.0) / dist * uDpr;
  gl_PointSize = clamp(size, 1.0, 46.0);
  vGlow = (0.22 + lvl * 1.35) * clamp(2.6 / max(dist, 0.4), 0.08, 1.5);
  vVoiceF = aVoice;
}`;

const RENDER_FS = /* glsl */ `#version 300 es
precision highp float;
in float vGlow;
in float vVoiceF;
out vec4 fragColor;
// warm vantage palette: stone → bronze → pale gold with register
vec3 voiceColor(float v){
  float t = v / ${(VOICE_COUNT - 1).toFixed(1)};
  vec3 stone  = vec3(0.34, 0.24, 0.15);
  vec3 bronze = vec3(0.74, 0.44, 0.19);
  vec3 gold   = vec3(1.00, 0.87, 0.58);
  vec3 c = mix(stone, bronze, smoothstep(0.0, 0.5, t));
  return mix(c, gold, smoothstep(0.5, 1.0, t));
}
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if(r > 0.5) discard;
  float a = exp(-r * r * 7.0);
  vec3 col = voiceColor(vVoiceF) * vGlow;
  fragColor = vec4(col * a, a);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  tfVaryings?: string[],
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

interface GLEngine {
  gl: WebGL2RenderingContext;
  update: WebGLProgram;
  render: WebGLProgram;
  pos: [WebGLBuffer, WebGLBuffer];
  vel: [WebGLBuffer, WebGLBuffer];
  voiceBuf: WebGLBuffer;
  seedBuf: WebGLBuffer;
  updateVAO: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  renderVAO: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  tf: [WebGLTransformFeedback, WebGLTransformFeedback];
  read: number;
  uUpdate: Record<string, WebGLUniformLocation | null>;
  uRender: Record<string, WebGLUniformLocation | null>;
}

function initGL(canvas: HTMLCanvasElement): GLEngine | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const update = buildProgram(gl, UPDATE_VS, UPDATE_FS, ["vPos", "vVel"]);
  const render = buildProgram(gl, RENDER_VS, RENDER_FS);
  if (!update || !render) return null;

  // static per-particle attributes
  const voiceArr = new Float32Array(N);
  const seedArr = new Float32Array(N * 3);
  const posInit = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const vi = Math.floor(i / PARTICLES_PER_VOICE);
    voiceArr[i] = vi;
    seedArr[i * 3] = Math.random();
    seedArr[i * 3 + 1] = Math.random();
    seedArr[i * 3 + 2] = Math.random();
    const c = voiceCenter(vi);
    posInit[i * 3] = c[0] + (Math.random() - 0.5) * 2;
    posInit[i * 3 + 1] = c[1] + (Math.random() - 0.5) * 2;
    posInit[i * 3 + 2] = c[2] + (Math.random() - 0.5) * 2;
  }

  const mkBuf = (data: Float32Array, usage: number): WebGLBuffer => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return b;
  };
  const pos: [WebGLBuffer, WebGLBuffer] = [
    mkBuf(posInit, gl.DYNAMIC_COPY),
    mkBuf(new Float32Array(N * 3), gl.DYNAMIC_COPY),
  ];
  const vel: [WebGLBuffer, WebGLBuffer] = [
    mkBuf(new Float32Array(N * 3), gl.DYNAMIC_COPY),
    mkBuf(new Float32Array(N * 3), gl.DYNAMIC_COPY),
  ];
  const voiceBuf = mkBuf(voiceArr, gl.STATIC_DRAW);
  const seedBuf = mkBuf(seedArr, gl.STATIC_DRAW);

  // attribute locations
  const uaPos = gl.getAttribLocation(update, "aPos");
  const uaVel = gl.getAttribLocation(update, "aVel");
  const uaVoice = gl.getAttribLocation(update, "aVoice");
  const uaSeed = gl.getAttribLocation(update, "aSeed");
  const raPos = gl.getAttribLocation(render, "aPos");
  const raVoice = gl.getAttribLocation(render, "aVoice");
  const raSeed = gl.getAttribLocation(render, "aSeed");

  const vecAttrib = (buf: WebGLBuffer, loc: number, size: number) => {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };

  const mkUpdateVAO = (r: number): WebGLVertexArrayObject => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    vecAttrib(pos[r], uaPos, 3);
    vecAttrib(vel[r], uaVel, 3);
    vecAttrib(voiceBuf, uaVoice, 1);
    vecAttrib(seedBuf, uaSeed, 3);
    gl.bindVertexArray(null);
    return vao;
  };
  const mkRenderVAO = (r: number): WebGLVertexArrayObject => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    vecAttrib(pos[r], raPos, 3);
    vecAttrib(voiceBuf, raVoice, 1);
    vecAttrib(seedBuf, raSeed, 3);
    gl.bindVertexArray(null);
    return vao;
  };
  const updateVAO: [WebGLVertexArrayObject, WebGLVertexArrayObject] = [
    mkUpdateVAO(0),
    mkUpdateVAO(1),
  ];
  const renderVAO: [WebGLVertexArrayObject, WebGLVertexArrayObject] = [
    mkRenderVAO(0),
    mkRenderVAO(1),
  ];

  const mkTF = (w: number): WebGLTransformFeedback => {
    const t = gl.createTransformFeedback()!;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, t);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, pos[w]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, vel[w]);
    return t;
  };
  const tf: [WebGLTransformFeedback, WebGLTransformFeedback] = [mkTF(0), mkTF(1)];
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const uUpdate = {
    uCenters: gl.getUniformLocation(update, "uCenters"),
    uLevels: gl.getUniformLocation(update, "uLevels"),
    uTime: gl.getUniformLocation(update, "uTime"),
    uDt: gl.getUniformLocation(update, "uDt"),
  };
  const uRender = {
    uView: gl.getUniformLocation(render, "uView"),
    uProj: gl.getUniformLocation(render, "uProj"),
    uLevels: gl.getUniformLocation(render, "uLevels"),
    uDpr: gl.getUniformLocation(render, "uDpr"),
  };

  return {
    gl,
    update,
    render,
    pos,
    vel,
    voiceBuf,
    seedBuf,
    updateVAO,
    renderVAO,
    tf,
    read: 0,
    uUpdate,
    uRender,
  };
}

// ── audio voices ─────────────────────────────────────────────────────────────
interface VoiceNode {
  biquad: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
}
interface AudioGraph {
  ctx: AudioContext;
  master: SafeMaster;
  src: AudioBufferSourceNode;
  voices: VoiceNode[];
  wet: GainNode;
  convolver: ConvolverNode;
}

// a convolution impulse made from a DECAYED SLICE of Karel's own recording
function buildHallImpulse(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.min(Math.floor(sr * 1.4), buffer.length);
  const chs = Math.min(2, buffer.numberOfChannels);
  const ir = ctx.createBuffer(Math.max(2, chs), len, sr);
  const start = Math.floor(buffer.length * 0.18);
  for (let c = 0; c < ir.numberOfChannels; c++) {
    const srcData = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    const out = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-(i / len) * 4.5);
      const si = start + i;
      out[i] = (si < buffer.length ? srcData[si] : 0) * env;
    }
  }
  return ir;
}

// ── component ────────────────────────────────────────────────────────────────
type Phase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "lost" | "denied" | "failed";

export default function VantagePage() {
  const { immersive, toggle } = useImmersive();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const engineRef = useRef<GLEngine | null>(null);
  const audioRef = useRef<AudioGraph | null>(null);
  const trackerRef = useRef<FaceLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camWantRef = useRef(false);
  const lastFaceRef = useRef(0);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const levelsRef = useRef<Float32Array>(new Float32Array(VOICE_COUNT));
  // vantage: target (from input) + smoothed (for see==hear lockstep)
  const targetRef = useRef<Vantage>({ x: 0, depth: 0.5, yaw: 0 });
  const vantRef = useRef<Vantage>({ x: 0, depth: 0.5, yaw: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const pointerActiveRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [glFailed, setGlFailed] = useState(false);
  const [camState, setCamState] = useState<CamState>("off");
  const [trackId, setTrackId] = useState(DEFAULT_TRACK);
  const [trackTitle, setTrackTitle] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  // ── resize (dpr capped) ────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
    const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const eng = engineRef.current;
    if (eng) eng.gl.viewport(0, 0, c.width, c.height);
  }, []);

  // ── init GL at mount (no gesture needed) so the swarm lives immediately ─────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const eng = initGL(c);
    if (!eng) {
      setGlFailed(true);
      return;
    }
    engineRef.current = eng;
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    const onLost = (e: Event) => e.preventDefault();
    c.addEventListener("webglcontextlost", onLost);
    rafRef.current = requestAnimationFrame(runFrame);
    return () => {
      window.removeEventListener("resize", onResize);
      c.removeEventListener("webglcontextlost", onLost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize]);

  // ── keyboard: arrows nudge the vantage (yaw + depth) ───────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        keysRef.current.add(e.key);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── pointer steers the vantage (strafe + depth) ────────────────────────────
  const applyPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (camWantRef.current) return; // head tracking owns the vantage
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const px = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const py = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    targetRef.current.x = px * 3.2;
    targetRef.current.depth = clamp01((-py + 1) / 2); // top of stage = leaned in
  }, []);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerActiveRef.current || e.pointerType === "mouse") applyPointer(e);
    },
    [applyPointer],
  );
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointerActiveRef.current = true;
      applyPointer(e);
    },
    [applyPointer],
  );
  const onPointerUp = useCallback(() => {
    pointerActiveRef.current = false;
  }, []);

  // ── the frame loop (runs whenever GL is up; audio optional) ────────────────
  const runFrame = useCallback((ts: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const dtRaw = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016;
    lastTsRef.current = ts;
    const dt = clamp(dtRaw, 0.001, 0.05);
    const timeSec = ts / 1000;
    const gl = eng.gl;

    // 1) HEAD POSE (if camera live) → vantage target
    if (camWantRef.current && trackerRef.current && videoRef.current) {
      const video = videoRef.current;
      if (video.readyState >= 2) {
        try {
          const res = trackerRef.current.detectForVideo(video, ts);
          const v = computeVantageFromFace(res);
          if (v) {
            targetRef.current = v;
            lastFaceRef.current = ts;
            if (camState !== "live") setCamState("live");
          } else if (ts - lastFaceRef.current > 900 && camState !== "lost") {
            setCamState("lost");
          }
        } catch {
          /* detector hiccup — keep last target */
        }
      }
    }

    // 2) keyboard nudges (yaw via left/right, depth via up/down)
    const keys = keysRef.current;
    if (keys.size) {
      const tg = targetRef.current;
      if (keys.has("ArrowLeft")) tg.yaw = clamp(tg.yaw - dt * 1.3, -1, 1);
      if (keys.has("ArrowRight")) tg.yaw = clamp(tg.yaw + dt * 1.3, -1, 1);
      if (keys.has("ArrowUp")) tg.depth = clamp01(tg.depth + dt * 0.8);
      if (keys.has("ArrowDown")) tg.depth = clamp01(tg.depth - dt * 0.8);
    }

    // 3) smooth the vantage (used for BOTH audio listener and the view matrix)
    const k = 1 - Math.exp(-dt / 0.12);
    const vant = vantRef.current;
    const tgt = targetRef.current;
    vant.x += (tgt.x - vant.x) * k;
    vant.depth += (tgt.depth - vant.depth) * k;
    vant.yaw += (tgt.yaw - vant.yaw) * k;

    // 4) per-voice levels
    const levels = levelsRef.current;
    const audio = audioRef.current;
    if (audio) {
      for (let i = 0; i < VOICE_COUNT; i++) {
        const vo = audio.voices[i];
        vo.analyser.getByteFrequencyData(vo.freq);
        let sum = 0;
        for (let b = 0; b < vo.freq.length; b++) sum += vo.freq[b];
        const avg = sum / vo.freq.length / 255;
        levels[i] += (clamp01(avg * 2.4) - levels[i]) * 0.25;
      }
      // drive the HRTF listener from the vantage
      const ctx = audio.ctx;
      const now = ctx.currentTime;
      const eye = vantEye(vant);
      const fwd = vantForward(vant);
      const L = ctx.listener;
      const setParam = (p: AudioParam | undefined, val: number) => {
        if (p && typeof p.setTargetAtTime === "function") p.setTargetAtTime(val, now, 0.08);
      };
      if ("positionX" in L) {
        setParam(L.positionX, eye[0]);
        setParam(L.positionY, eye[1]);
        setParam(L.positionZ, eye[2]);
        setParam(L.forwardX, fwd[0]);
        setParam(L.forwardY, fwd[1]);
        setParam(L.forwardZ, fwd[2]);
        setParam(L.upX, 0);
        setParam(L.upY, 1);
        setParam(L.upZ, 0);
      } else {
        const legacy = L as unknown as {
          setPosition?: (x: number, y: number, z: number) => void;
          setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
        };
        legacy.setPosition?.(eye[0], eye[1], eye[2]);
        legacy.setOrientation?.(fwd[0], fwd[1], fwd[2], 0, 1, 0);
      }
      // hall wet drops as you lean in (depth → 1)
      audio.wet.gain.setTargetAtTime(0.06 + (1 - vant.depth) * 0.42, now, 0.14);
    } else {
      // idle demo: gentle living swarm before play
      for (let i = 0; i < VOICE_COUNT; i++) {
        const target = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(timeSec * (0.6 + i * 0.3) + i));
        levels[i] += (target - levels[i]) * 0.05;
      }
    }

    // 5) GPGPU update via transform feedback
    const read = eng.read;
    const write = 1 - read;
    gl.useProgram(eng.update);
    const centers = new Float32Array(VOICE_COUNT * 3);
    for (let i = 0; i < VOICE_COUNT; i++) {
      const c = voiceCenter(i);
      centers[i * 3] = c[0];
      centers[i * 3 + 1] = c[1];
      centers[i * 3 + 2] = c[2];
    }
    gl.uniform3fv(eng.uUpdate.uCenters, centers);
    gl.uniform1fv(eng.uUpdate.uLevels, levels);
    gl.uniform1f(eng.uUpdate.uTime, timeSec);
    gl.uniform1f(eng.uUpdate.uDt, dt);
    gl.bindVertexArray(eng.updateVAO[read]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, eng.tf[write]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    eng.read = write;

    // 6) render from the vantage
    const c = canvasRef.current!;
    const aspect = c.width / Math.max(1, c.height);
    const proj = perspective((58 * Math.PI) / 180, aspect, 0.1, 60);
    const eye = vantEye(vant);
    const fwd = vantForward(vant);
    const view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    gl.clearColor(0.018, 0.013, 0.009, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(eng.render);
    gl.uniformMatrix4fv(eng.uRender.uView, false, view);
    gl.uniformMatrix4fv(eng.uRender.uProj, false, proj);
    gl.uniform1fv(eng.uRender.uLevels, levels);
    gl.uniform1f(eng.uRender.uDpr, dpr);
    gl.bindVertexArray(eng.renderVAO[eng.read]);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);

    rafRef.current = requestAnimationFrame(runFrame);
  }, [camState]);

  // ── start audio (user gesture) ─────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();

      const master = createSafeMaster(ctx);
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // one looping source feeds every band (pitch-clean, his real take)
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = 1.0;

      // shared hall: convolver built from a decayed slice of HIS recording
      const convolver = ctx.createConvolver();
      convolver.normalize = true;
      convolver.buffer = buildHallImpulse(ctx, buffer);
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      convolver.connect(wet);
      wet.connect(master.input);

      const voices: VoiceNode[] = [];
      for (let i = 0; i < VOICE_COUNT; i++) {
        const biquad = ctx.createBiquadFilter();
        biquad.type = BANDS[i].type;
        biquad.frequency.value = BANDS[i].hz;
        biquad.Q.value = BANDS[i].q;
        const gain = ctx.createGain();
        gain.gain.value = i === 0 ? 1.0 : 1.3; // lift the thin upper bands a touch
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1.6;
        panner.rolloffFactor = 1.1;
        panner.maxDistance = 40;
        const pos = voiceCenter(i);
        if ("positionX" in panner) {
          panner.positionX.value = pos[0];
          panner.positionY.value = pos[1];
          panner.positionZ.value = pos[2];
        } else {
          (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(
            pos[0],
            pos[1],
            pos[2],
          );
        }
        src.connect(biquad);
        biquad.connect(gain);
        gain.connect(analyser); // level tap, pre-panner
        gain.connect(panner);
        panner.connect(master.input); // dry
        panner.connect(convolver); // wet send
        voices.push({
          biquad,
          gain,
          panner,
          analyser,
          freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        });
      }

      src.start();
      audioRef.current = { ctx, master, src, voices, wet, convolver };
      setPhase("running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "could not start the audio");
      setPhase("error");
    }
  }, [phase, trackId]);

  // ── camera opt-in ──────────────────────────────────────────────────────────
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
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.src.stop();
        } catch {
          /* already stopped */
        }
        for (const v of audio.voices) {
          try {
            v.biquad.disconnect();
            v.gain.disconnect();
            v.analyser.disconnect();
            v.panner.disconnect();
          } catch {
            /* noop */
          }
        }
        try {
          audio.convolver.disconnect();
          audio.wet.disconnect();
        } catch {
          /* noop */
        }
        audio.master.disconnect();
        audio.ctx.close().catch(() => {});
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      const eng = engineRef.current;
      if (eng) {
        const gl = eng.gl;
        try {
          gl.deleteProgram(eng.update);
          gl.deleteProgram(eng.render);
          eng.pos.forEach((b) => gl.deleteBuffer(b));
          eng.vel.forEach((b) => gl.deleteBuffer(b));
          gl.deleteBuffer(eng.voiceBuf);
          gl.deleteBuffer(eng.seedBuf);
          eng.updateVAO.forEach((v) => gl.deleteVertexArray(v));
          eng.renderVAO.forEach((v) => gl.deleteVertexArray(v));
          eng.tf.forEach((t) => gl.deleteTransformFeedback(t));
        } catch {
          /* context already gone */
        }
      }
    };
  }, []);

  const running = phase === "running";
  const camLive = camState === "live";
  const camBad = camState === "denied" || camState === "failed";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="fixed inset-0 h-dvh w-full touch-none overflow-hidden bg-black"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* WebGL2 unavailable — designed notice */}
        {glFailed && (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
            <p className="max-w-md text-base text-destructive">
              This piece needs WebGL2 for its GPU particle swarm, which this
              browser or device does not provide. The audio vantage still works
              elsewhere — try a recent desktop browser.
            </p>
          </div>
        )}

        {/* start overlay */}
        {!running && !glFailed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              one take · a swarm of sound-bodies around you
            </p>
            <h1 className="max-w-xl text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Move your head — or the mouse — to change your vantage point inside
              a 3-D swarm of Karel&apos;s piano. What you hear, you see.
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
              {phase === "loading" ? "loading Karel's recording…" : "Play to begin"}
            </button>
            <p className="max-w-md text-base text-muted-foreground">
              Starts on the mouse — drag to lean, arrow keys to turn &amp; push.
              Add the camera to steer with your real head.
            </p>
            {phase === "error" && <p className="max-w-md text-sm text-destructive">{errMsg}</p>}
          </div>
        )}

        {/* tracking-status line */}
        {running && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
            {camLive ? (
              <span className="text-foreground">head · tracking</span>
            ) : camState === "lost" ? (
              <span className="text-destructive">
                no face · sit ~60–150cm away, face the camera
              </span>
            ) : camBad ? (
              <span className="text-destructive">
                {camState === "denied" ? "camera denied · " : "camera failed · "}
                <span className="text-muted-foreground">mouse steers</span>
              </span>
            ) : (
              <span className="text-muted-foreground">camera off — mouse steers</span>
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

            <div className="absolute bottom-16 left-4 z-30 max-w-md space-y-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                22880 · vantage — {trackTitle}
              </p>
              <p className="text-base text-muted-foreground">
                Lean left / right to pan across the swarm · lean in (drag up) to
                pull the voices near and dry the hall · lean back for a wide hall ·
                arrow left / right to turn and rotate the field.
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
            title="Vantage"
            description="Karel's one piano take, exploded into a swarm of sound-bodies orbiting you in 3-D. Your head position (webcam) or the mouse sets your vantage point inside the swarm: each voice sweeps ear-to-ear and near-to-far as you lean and turn, rendered binaurally (HRTF) and as a GPU particle field seen from your viewpoint. What you hear, you see."
            howTo={[
              "Play to begin",
              "Lean / drag left-right to pan across the swarm",
              "Lean in (drag up) to pull the voices near; lean back for a wide hall",
              "Turn your head (or arrow left/right) to rotate the field",
              "Press i for info, f for fullscreen",
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
                vantage — a swarm you move through
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  One of Karel&apos;s real piano recordings loops, pitch-clean. A
                  bank of five parallel band-splits (sub, low-mid, mid, high-mid,
                  air) turns the single take into five spatial voices, each pinned
                  to a fixed point on a 3-D ring/shell around you and panned
                  binaurally with an HRTF PannerNode. Nothing is synthesised — every
                  voice is his recording, filtered and placed.
                </p>
                <p>
                  Your vantage point is the Web Audio listener. Lean left/right to
                  strafe (voices sweep ear-to-ear); lean in to move into the field
                  (voices pull near, distance attenuation rises, the hall dries);
                  lean back for a wide hall; turn to rotate your orientation so the
                  whole field revolves. The hall itself is a convolver whose impulse
                  is a decayed slice of his own recording, so even the reverb is made
                  of his sound. Everything terminates at the shared safe-master bus.
                </p>
                <p>
                  Each voice is a cluster of GPU particles in a raw-WebGL2 transform-
                  feedback swarm (~30k points advanced on the GPU each frame),
                  projected through a view matrix built from the same vantage and
                  glowing — stone → bronze → pale gold — with that voice&apos;s live
                  level, tapped by a per-voice analyser before the panner. So the
                  thing you hear move is the thing you see move: see == hear.
                </p>
                <p>
                  With no camera the mouse and arrow keys drive the exact same
                  vantage, so the whole binaural + visual experience is audible and
                  visible without a webcam. The camera is a labelled secondary
                  enhancement; a lost face falls back to the pointer with a visible
                  notice.
                </p>
                <p>
                  References: SPARO — &ldquo;HRTF Upsampling and Personalization via
                  Neural Operators,&rdquo; Krishnan, Zhang, Duraiswami &amp; Brown,
                  arXiv:2610.20400 (14 Oct 2026), on head-tracked neural HRTF; and
                  Durand R. Begault, &ldquo;3-D Sound for Virtual Reality and
                  Multimedia&rdquo; for the foundational HRTF model.
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

// ── vantage → camera / listener geometry (module helpers) ────────────────────
function vantEye(v: Vantage): [number, number, number] {
  const z = 4.6 - v.depth * 6.2; // leaned back (+4.6) … leaned in (-1.6)
  return [v.x, 0, z];
}
function vantForward(v: Vantage): [number, number, number] {
  const theta = v.yaw * MAX_YAW;
  return [-Math.sin(theta), 0, -Math.cos(theta)];
}
