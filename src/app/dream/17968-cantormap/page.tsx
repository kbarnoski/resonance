"use client";

/* ── 17968 · Cantormap ────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your two hands could grab the voices of one of Karel's
 *  own piano recordings and physically PLACE, MOVE, GATHER and SCATTER them
 *  around your head in real 3-D space?
 *
 *  The conducted parameter is SPATIALIZATION — WHERE each strand of the music
 *  lives in the room — a parameter no prior lab piece has conducted.
 *
 *  TECHNIQUE. One real take is decoded once, then split into four decorrelated
 *  band-voices of the SAME buffer:
 *    · voice 0 — lowpass ~250 Hz   (the low body, sits low + wide)
 *    · voice 1 — bandpass ~250–1500 Hz
 *    · voice 2 — bandpass ~1.5–5 kHz
 *    · voice 3 — highpass ~3.8 kHz (the air, sits high)
 *  Each band feeds its own Web-Audio PannerNode with panningModel = "HRTF", so
 *  every band has a genuine position around the listener's head. A slow rate-1.0
 *  bed of the FULL take stays centred so sound is present before any hand is seen.
 *
 *  INTERACTION. Two tracked hands become two grab points. The nearest voices to
 *  a hand follow it: hand x → azimuth (left/right), hand height → elevation (Y),
 *  pinch (thumb–index distance) → pull the voice toward the listener (nearer +
 *  louder via panner Z + distance model). Open both hands wide + apart → the
 *  field SCATTERS; bring hands together → all voices GATHER to centre, a mono-ish
 *  intimate collapse. No hand seen → the bed keeps playing and voices drift on a
 *  labelled autonomous orbit (a clear demo state, never faked as live control).
 *
 *  OUTPUT. Raw WebGL2: glowing amber-gold orbs (the voices) in a dark volumetric
 *  field, with feedback light-trails as they move, driven by safeMaster.analyser.
 *  Canvas2D top-down room view if WebGL2 is unavailable. Pointer drag fallback if
 *  the camera / model is unavailable. All audio terminates at the shared
 *  ear-safety safeMaster bus. See README.md for the mudra / canon lineage.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  HAND_LM,
  type HandLandmarkerInst,
  type Landmark,
  type Category,
} from "../_shared/cameraTracking";
import { PrototypeNav } from "../_shared/prototype-nav";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

const N_VOICES = 4;
const ROOM_HALF = 5; // world half-extent the room maps into
const PROJ = 0.42; // screen projection scale (world → normalized screen)
const SMOOTH = 0.12; // s — audio param smoothing time constant (latency craft)
const POS_LERP = 0.09; // per-frame position easing toward target
const DRIFT_SPEED = 0.16; // rad/s — autonomous orbit rate

// band-voice home layout (front hemisphere around the head)
const HOME_ANGLE = [-0.95, -0.34, 0.34, 0.95]; // radians, azimuth
const HOME_Y = [-1.6, -0.45, 0.6, 1.7]; // elevation per band
// small per-voice offsets so voices sharing one hand don't fully overlap
const OFF_X = [-0.9, 0.9, -0.9, 0.9];
const OFF_Y = [0.6, 0.6, -0.6, -0.6];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── audio engine ──────────────────────────────────────────────────────────────
interface Voice {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  // world position + integrated target
  x: number;
  y: number;
  z: number;
}

interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  title: string;
  voices: Voice[];
  bedGain: GainNode;
  bedSrc: AudioBufferSourceNode;
  freq: Uint8Array<ArrayBuffer>;
}

function setPannerPos(p: PannerNode, x: number, y: number, z: number, t: number) {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, t, SMOOTH);
    p.positionY.setTargetAtTime(y, t, SMOOTH);
    p.positionZ.setTargetAtTime(z, t, SMOOTH);
  } else {
    (
      p as unknown as { setPosition: (a: number, b: number, c: number) => void }
    ).setPosition?.(x, y, z);
  }
}

function buildEngine(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): AudioEngine {
  // listener at origin, facing -z (Web Audio default). Front hemisphere is -z.
  const L = ctx.listener;
  if (L.forwardZ) {
    L.forwardX.value = 0;
    L.forwardY.value = 0;
    L.forwardZ.value = -1;
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    (
      L as unknown as {
        setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
      }
    ).setOrientation?.(0, 0, -1, 0, 1, 0);
  }

  const mkVoice = (i: number): Voice => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = 1.0; // rate-1.0 always — spatialization is the parameter

    const filter = ctx.createBiquadFilter();
    if (i === 0) {
      filter.type = "lowpass";
      filter.frequency.value = 250;
      filter.Q.value = 0.7;
    } else if (i === 1) {
      filter.type = "bandpass";
      filter.frequency.value = 612; // sqrt(250*1500)
      filter.Q.value = 0.5;
    } else if (i === 2) {
      filter.type = "bandpass";
      filter.frequency.value = 2739; // sqrt(1500*5000)
      filter.Q.value = 0.8;
    } else {
      filter.type = "highpass"; // the air band (highshelf spirit, decorrelated)
      filter.frequency.value = 3800;
      filter.Q.value = 0.7;
    }

    const gain = ctx.createGain();
    gain.gain.value = i === 3 ? 0.9 : 0.62; // lift the quiet air band a touch

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 16;
    panner.rolloffFactor = 1;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(master.input);
    src.start();

    const ang = HOME_ANGLE[i];
    const x = Math.sin(ang) * (ROOM_HALF * 0.8);
    const z = -Math.cos(ang) * (ROOM_HALF * 0.8);
    setPannerPos(panner, x, HOME_Y[i], z, ctx.currentTime);
    return { src, filter, gain, panner, x, y: HOME_Y[i], z };
  };

  const voices: Voice[] = [];
  for (let i = 0; i < N_VOICES; i++) voices.push(mkVoice(i));

  // always-on centred bed of the full take
  const bedSrc = ctx.createBufferSource();
  bedSrc.buffer = buffer;
  bedSrc.loop = true;
  bedSrc.playbackRate.value = 1.0;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.32;
  bedSrc.connect(bedGain);
  bedGain.connect(master.input);
  bedSrc.start();

  return {
    ctx,
    master,
    buffer,
    title,
    voices,
    bedGain,
    bedSrc,
    freq: new Uint8Array(master.analyser.frequencyBinCount),
  };
}

function teardownEngine(e: AudioEngine) {
  try {
    for (const v of e.voices) v.src.stop();
    e.bedSrc.stop();
  } catch {
    /* already stopped */
  }
}

// ── grab points (from hands or pointer) ────────────────────────────────────────
interface Grab {
  present: boolean;
  sx: number; // screen 0..1
  sy: number; // screen 0..1
  x: number; // world
  y: number; // world
  z: number; // world (depth, negative = in front)
  pinch: number; // 0 closed … 1 open
  open: number; // hand openness
}
const emptyGrab = (): Grab => ({
  present: false,
  sx: 0.5,
  sy: 0.5,
  x: 0,
  y: 0,
  z: -3,
  pinch: 0.5,
  open: 0.5,
});

function pinchOf(lm: Landmark[]): number {
  const t = lm[HAND_LM.thumbTip];
  const idx = lm[HAND_LM.indexTip];
  const w = lm[HAND_LM.wrist];
  const mcp = lm[HAND_LM.middleMcp];
  const palm = Math.hypot(w.x - mcp.x, w.y - mcp.y) + 1e-4;
  const d = Math.hypot(t.x - idx.x, t.y - idx.y);
  return clamp01((d / palm - 0.15) / (1.05 - 0.15));
}

// map a hand's mirrored features → a world grab point
function grabFromHand(lm: Landmark[]): Grab {
  const f = computeHandFeatures(lm);
  const pinch = pinchOf(lm);
  const sx = clamp01(0.5 + (f.cx / 1.4) * 0.42);
  const sy = clamp01(0.5 - (f.height - 0.5) * 0.84);
  const x = clamp(f.cx / 1.2, -1, 1) * ROOM_HALF * 0.92;
  const y = (f.height - 0.5) * 2 * ROOM_HALF * 0.42;
  const z = -(1.2 + pinch * 3.8); // pinch-closed → near/loud, open → far
  return { present: true, sx, sy, x, y, z, pinch, open: f.open };
}

// project a world voice position → normalized screen for the visual
function projectWorld(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: clamp01(0.5 + (x / ROOM_HALF) * PROJ),
    sy: clamp01(0.5 - (y / ROOM_HALF) * PROJ),
  };
}

// ── WebGL2 field ───────────────────────────────────────────────────────────────
const VERT_SRC = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// accumulation pass — fade previous frame, add glowing orbs → light trails
const ACCUM_SRC = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uFade;
uniform float uEnergy;
uniform int uOrbCount;
uniform vec4 uOrbs[4];   // xy screen(0..1), z radius, w intensity
uniform vec4 uHands[2];  // xy screen(0..1), z radius, w present
out vec4 frag;

float glow(vec2 uv, vec2 c, float r, vec2 asp){
  vec2 d = (uv - c) * asp;
  float q = dot(d, d) / (r * r);
  return exp(-q);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec3 prev = texture(uPrev, uv).rgb * uFade;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 4; k++){
    if (k >= uOrbCount) break;
    vec4 o = uOrbs[k];
    float core = glow(uv, o.xy, o.z * 0.5, asp);
    float halo = glow(uv, o.xy, o.z * 1.8, asp);
    float g = (core * 1.3 + halo * 0.5) * o.w * (0.7 + 0.6 * uEnergy);
    vec3 tint = mix(vec3(1.0, 0.55, 0.14), vec3(1.0, 0.86, 0.52), clamp(o.w, 0.0, 1.0));
    col += tint * g;
  }
  for (int h = 0; h < 2; h++){
    vec4 hd = uHands[h];
    if (hd.w < 0.5) continue;
    vec2 d = (uv - hd.xy) * asp;
    float dist = length(d);
    float ring = smoothstep(0.018, 0.0, abs(dist - hd.z));
    col += vec3(1.0, 0.72, 0.3) * ring * 0.45;
  }
  frag = vec4(prev + col, 1.0);
}`;

// present pass — warm near-black background + tonemapped accumulation + vignette
const PRESENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D uAccum;
uniform vec2 uRes;
uniform float uEnergy;
out vec4 frag;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 acc = texture(uAccum, uv).rgb;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  // warm near-black volumetric field
  vec3 bg = vec3(0.028, 0.018, 0.009) + vec3(0.05, 0.03, 0.012) * (1.0 - r2 * 1.6) * (0.5 + 0.7 * uEnergy);
  vec3 col = bg + acc;
  col = col / (col + vec3(0.85)); // reinhard tonemap
  col *= 1.0 - r2 * 0.9;          // vignette
  col = pow(col, vec3(0.9));
  frag = vec4(col, 1.0);
}`;

interface GlState {
  gl: WebGL2RenderingContext;
  accumProg: WebGLProgram;
  presentProg: WebGLProgram;
  vao: WebGLVertexArrayObject;
  fbo: [WebGLFramebuffer, WebGLFramebuffer];
  tex: [WebGLTexture, WebGLTexture];
  w: number;
  h: number;
  cur: 0 | 1;
  uAccum: {
    uPrev: WebGLUniformLocation | null;
    uRes: WebGLUniformLocation | null;
    uFade: WebGLUniformLocation | null;
    uEnergy: WebGLUniformLocation | null;
    uOrbCount: WebGLUniformLocation | null;
    uOrbs: WebGLUniformLocation | null;
    uHands: WebGLUniformLocation | null;
  };
  uPresent: {
    uAccum: WebGLUniformLocation | null;
    uRes: WebGLUniformLocation | null;
    uEnergy: WebGLUniformLocation | null;
  };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function linkProg(gl: WebGL2RenderingContext, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link: " + (gl.getProgramInfoLog(p) ?? "unknown"));
  }
  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}

function makeTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture();
  if (!tex) throw new Error("tex alloc failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("fbo alloc failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

function buildGl(canvas: HTMLCanvasElement, w: number, h: number): GlState {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) throw new Error("WebGL2 unavailable");
  const accumProg = linkProg(gl, ACCUM_SRC);
  const presentProg = linkProg(gl, PRESENT_SRC);
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("vao alloc failed");
  const t0 = makeTarget(gl, w, h);
  const t1 = makeTarget(gl, w, h);
  const uA = (n: string) => gl.getUniformLocation(accumProg, n);
  const uP = (n: string) => gl.getUniformLocation(presentProg, n);
  return {
    gl,
    accumProg,
    presentProg,
    vao,
    fbo: [t0.fbo, t1.fbo],
    tex: [t0.tex, t1.tex],
    w,
    h,
    cur: 0,
    uAccum: {
      uPrev: uA("uPrev"),
      uRes: uA("uRes"),
      uFade: uA("uFade"),
      uEnergy: uA("uEnergy"),
      uOrbCount: uA("uOrbCount"),
      uOrbs: uA("uOrbs[0]"),
      uHands: uA("uHands[0]"),
    },
    uPresent: {
      uAccum: uP("uAccum"),
      uRes: uP("uRes"),
      uEnergy: uP("uEnergy"),
    },
  };
}

function resizeGl(s: GlState, w: number, h: number) {
  const { gl } = s;
  for (const tex of s.tex) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  s.w = w;
  s.h = h;
}

function renderGl(
  s: GlState,
  orbs: Float32Array,
  orbCount: number,
  hands: Float32Array,
  energy: number,
) {
  const { gl } = s;
  const src = s.cur;
  const dst = (s.cur ^ 1) as 0 | 1;

  // accumulation → dst
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo[dst]);
  gl.viewport(0, 0, s.w, s.h);
  gl.useProgram(s.accumProg);
  gl.bindVertexArray(s.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.tex[src]);
  gl.uniform1i(s.uAccum.uPrev, 0);
  gl.uniform2f(s.uAccum.uRes, s.w, s.h);
  gl.uniform1f(s.uAccum.uFade, 0.9);
  gl.uniform1f(s.uAccum.uEnergy, energy);
  gl.uniform1i(s.uAccum.uOrbCount, orbCount);
  gl.uniform4fv(s.uAccum.uOrbs, orbs);
  gl.uniform4fv(s.uAccum.uHands, hands);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // present dst → screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, s.w, s.h);
  gl.useProgram(s.presentProg);
  gl.bindVertexArray(s.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.tex[dst]);
  gl.uniform1i(s.uPresent.uAccum, 0);
  gl.uniform2f(s.uPresent.uRes, s.w, s.h);
  gl.uniform1f(s.uPresent.uEnergy, energy);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  s.cur = dst;
}

function destroyGl(s: GlState) {
  const { gl } = s;
  try {
    gl.deleteProgram(s.accumProg);
    gl.deleteProgram(s.presentProg);
    gl.deleteVertexArray(s.vao);
    for (const f of s.fbo) gl.deleteFramebuffer(f);
    for (const t of s.tex) gl.deleteTexture(t);
  } catch {
    /* context lost */
  }
}

// ── Canvas2D fallback (top-down room view) ─────────────────────────────────────
interface Trail2D {
  x: number[];
  y: number[];
}
function draw2D(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  voices: Voice[],
  hands: Grab[],
  trails: Trail2D[],
  energy: number,
) {
  ctx2d.fillStyle = "#0a0704";
  ctx2d.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) / (ROOM_HALF * 2.4);

  // room rings
  ctx2d.strokeStyle = "rgba(255,180,80,0.10)";
  ctx2d.lineWidth = 1;
  for (let r = 1; r <= ROOM_HALF; r += 1.6) {
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  // listener head
  ctx2d.fillStyle = "rgba(255,200,120,0.7)";
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx2d.fill();

  // voices (x → horizontal, z → depth up the screen)
  voices.forEach((v, i) => {
    const px = cx + v.x * scale;
    const py = cy + v.z * scale; // z negative (front) → up
    const tr = trails[i];
    tr.x.push(px);
    tr.y.push(py);
    if (tr.x.length > 26) {
      tr.x.shift();
      tr.y.shift();
    }
    ctx2d.beginPath();
    for (let j = 0; j < tr.x.length; j++) {
      if (j === 0) ctx2d.moveTo(tr.x[j], tr.y[j]);
      else ctx2d.lineTo(tr.x[j], tr.y[j]);
    }
    ctx2d.strokeStyle = "rgba(255,150,50,0.28)";
    ctx2d.lineWidth = 2;
    ctx2d.stroke();

    const near = clamp01((6 - Math.hypot(v.x, v.y, v.z)) / 5);
    const rad = 6 + near * 12 + energy * 6;
    const g = ctx2d.createRadialGradient(px, py, 0, px, py, rad * 2.2);
    g.addColorStop(0, "rgba(255,220,150,0.95)");
    g.addColorStop(0.4, "rgba(255,150,50,0.6)");
    g.addColorStop(1, "rgba(255,120,30,0)");
    ctx2d.fillStyle = g;
    ctx2d.beginPath();
    ctx2d.arc(px, py, rad * 2.2, 0, Math.PI * 2);
    ctx2d.fill();
  });

  // hands
  for (const hnd of hands) {
    if (!hnd.present) continue;
    const px = cx + hnd.x * scale;
    const py = cy + hnd.z * scale;
    ctx2d.strokeStyle = "rgba(255,190,90,0.75)";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(px, py, 16 + hnd.open * 10, 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "running" | "error";
type Driver = "camera" | "pointer";
type TrackState = "live2" | "live1" | "lost" | "auto" | "pointer";

export default function Cantormap() {
  const { immersive, toggle } = useImmersive();

  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [driver, setDriver] = useState<Driver>("camera");
  const [trackState, setTrackState] = useState<TrackState>("auto");
  const [using2D, setUsing2D] = useState(false);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [gatherPointer, setGatherPointer] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const glRef = useRef<GlState | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);

  const rafRef = useRef<number>(0);
  const rvfcRef = useRef<number>(0);
  const useRvfcRef = useRef<boolean>(false);
  const runningRef = useRef<boolean>(false);

  const latestHandsRef = useRef<Grab[]>([emptyGrab(), emptyGrab()]);
  const pointerRef = useRef<{ active: boolean; sx: number; sy: number }>({
    active: false,
    sx: 0.5,
    sy: 0.4,
  });
  const gatherPointerRef = useRef(false);
  const driverRef = useRef<Driver>("camera");
  const trailsRef = useRef<Trail2D[]>(
    Array.from({ length: N_VOICES }, () => ({ x: [], y: [] })),
  );
  const startRef = useRef<number>(0);
  const energyRef = useRef<number>(0);

  useEffect(() => {
    gatherPointerRef.current = gatherPointer;
  }, [gatherPointer]);
  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  // ── per-frame control: hands/pointer → world targets → panners + shader ──────
  const stepFrame = useCallback((now: number) => {
    const eng = engineRef.current;
    const safe = safeRef.current;
    if (!eng || !safe) return;
    const t = eng.ctx.currentTime;
    const time = (now - startRef.current) / 1000;

    // energy from analyser (RMS-ish)
    safe.analyser.getByteFrequencyData(eng.freq);
    let sum = 0;
    for (let i = 0; i < eng.freq.length; i++) sum += eng.freq[i];
    const energy = clamp01(sum / eng.freq.length / 140);
    energyRef.current = mix(energyRef.current, energy, 0.2);

    // gather two grab points
    const grabs: Grab[] = [emptyGrab(), emptyGrab()];
    if (driverRef.current === "camera") {
      const hs = latestHandsRef.current;
      grabs[0] = hs[0];
      grabs[1] = hs[1];
    } else {
      const p = pointerRef.current;
      if (p.active) {
        const cx = (p.sx - 0.5) / PROJ; // invert projection → world
        const cy = (0.5 - p.sy) / PROJ;
        grabs[0] = {
          present: true,
          sx: p.sx,
          sy: p.sy,
          x: clamp(cx * ROOM_HALF, -ROOM_HALF, ROOM_HALF),
          y: clamp(cy * ROOM_HALF, -ROOM_HALF, ROOM_HALF),
          z: -2.4,
          pinch: 0.4,
          open: 0.6,
        };
      }
    }
    const present = grabs.filter((g) => g.present);

    // gather / scatter factor from two-hand relationship
    let gather = 0;
    let scatter = 0;
    if (grabs[0].present && grabs[1].present) {
      const sep = Math.hypot(grabs[0].x - grabs[1].x, grabs[0].y - grabs[1].y);
      gather = smoothstep(4.5, 1.2, sep); // hands close → gather
      const avgOpen = (grabs[0].open + grabs[1].open) / 2;
      scatter = smoothstep(4.0, 7.5, sep) * avgOpen; // wide + open → scatter
    } else if (driverRef.current === "pointer" && gatherPointerRef.current) {
      gather = 1;
    }

    // move each voice toward its target
    for (let i = 0; i < eng.voices.length; i++) {
      const v = eng.voices[i];
      let tx: number;
      let ty: number;
      let tz: number;
      if (present.length > 0) {
        // nearest present hand in screen space
        const proj = projectWorld(v.x, v.y);
        let best = present[0];
        let bestD = Infinity;
        for (const g of present) {
          const d = Math.hypot(proj.sx - g.sx, proj.sy - g.sy);
          if (d < bestD) {
            bestD = d;
            best = g;
          }
        }
        const spread = 1 + scatter * 1.8;
        tx = best.x + OFF_X[i] * (1 - gather) * spread;
        ty = best.y + OFF_Y[i] * (1 - gather) * spread;
        tz = best.z - (i - 1.5) * 0.4 * (1 - gather);
      } else {
        // labelled autonomous orbit
        const ang = HOME_ANGLE[i] + time * DRIFT_SPEED;
        const r = ROOM_HALF * 0.8;
        tx = Math.sin(ang) * r;
        tz = -Math.cos(ang) * r;
        ty = HOME_Y[i] + Math.sin(time * 0.5 + i) * 0.5;
      }
      // gather → collapse toward an intimate centre in front of the head
      tx = mix(tx, 0, gather);
      ty = mix(ty, 0, gather);
      tz = mix(tz, -1.4, gather);

      v.x += (tx - v.x) * POS_LERP;
      v.y += (ty - v.y) * POS_LERP;
      v.z += (tz - v.z) * POS_LERP;
      setPannerPos(v.panner, v.x, v.y, v.z, t);
    }

    // bed level: pull back a touch while actively conducting
    eng.bedGain.gain.setTargetAtTime(present.length > 0 ? 0.2 : 0.32, t, SMOOTH);

    // ── render ────────────────────────────────────────────────────────────────
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
      canvas.width = cw;
      canvas.height = ch;
      if (glRef.current) resizeGl(glRef.current, cw, ch);
    }
    const en = energyRef.current;

    if (glRef.current) {
      const orbs = new Float32Array(N_VOICES * 4);
      for (let i = 0; i < eng.voices.length; i++) {
        const v = eng.voices[i];
        const p = projectWorld(v.x, v.y);
        const dist = Math.hypot(v.x, v.y, v.z);
        const near = clamp01((16 - dist) / 15);
        orbs[i * 4] = p.sx;
        orbs[i * 4 + 1] = 1 - p.sy; // gl y is bottom-up
        orbs[i * 4 + 2] = 0.03 + near * 0.09; // radius
        orbs[i * 4 + 3] = 0.35 + near * 0.55; // intensity
      }
      const hs = new Float32Array(2 * 4);
      for (let i = 0; i < 2; i++) {
        const g = grabs[i];
        hs[i * 4] = g.sx;
        hs[i * 4 + 1] = 1 - g.sy;
        hs[i * 4 + 2] = 0.04 + g.open * 0.05;
        hs[i * 4 + 3] = g.present ? 1 : 0;
      }
      renderGl(glRef.current, orbs, N_VOICES, hs, en);
    } else if (ctx2dRef.current) {
      draw2D(ctx2dRef.current, canvas.width, canvas.height, eng.voices, grabs, trailsRef.current, en);
    }
  }, []);

  // read landmarks → latestHandsRef + update tracking status
  const applyDetection = useCallback((now: number) => {
    const tracker = trackerRef.current;
    const video = videoRef.current;
    if (!tracker || !video) return;
    let res: { landmarks: Landmark[][]; handednesses?: Category[][]; handedness?: Category[][] };
    try {
      res = tracker.detectForVideo(video, now);
    } catch {
      return;
    }
    const lms = res.landmarks ?? [];
    const hd = res.handednesses ?? res.handedness;
    const slots: Grab[] = [emptyGrab(), emptyGrab()];
    if (lms.length === 0) {
      latestHandsRef.current = slots;
      setTrackState("lost");
      return;
    }
    // assign to stable left/right slots by handedness when available
    let usedL = false;
    let usedR = false;
    for (let i = 0; i < lms.length && i < 2; i++) {
      const g = grabFromHand(lms[i]);
      const label = hd?.[i]?.[0]?.categoryName;
      if (label === "Left" && !usedL) {
        slots[0] = g;
        usedL = true;
      } else if (label === "Right" && !usedR) {
        slots[1] = g;
        usedR = true;
      } else if (!usedL) {
        slots[0] = g;
        usedL = true;
      } else if (!usedR) {
        slots[1] = g;
        usedR = true;
      }
    }
    latestHandsRef.current = slots;
    const n = slots.filter((s) => s.present).length;
    setTrackState(n >= 2 ? "live2" : n === 1 ? "live1" : "auto");
  }, []);

  // ── main RAF render loop ─────────────────────────────────────────────────────
  const runLoop = useCallback(
    (now: number) => {
      if (!runningRef.current) return;
      // detect here only when rVFC is not driving detection
      if (
        !useRvfcRef.current &&
        driverRef.current === "camera" &&
        trackerRef.current &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        applyDetection(now);
      }
      stepFrame(now);
      rafRef.current = requestAnimationFrame(runLoop);
    },
    [stepFrame, applyDetection],
  );

  // rVFC detection loop (decoupled from render when available)
  const rvfcLoop = useCallback(
    (now: number) => {
      if (!runningRef.current) return;
      if (driverRef.current === "camera") applyDetection(now);
      const video = videoRef.current;
      if (video && "requestVideoFrameCallback" in video) {
        rvfcRef.current = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: (t: number) => void) => number;
          }
        ).requestVideoFrameCallback(rvfcLoop);
      }
    },
    [applyDetection],
  );

  // ── start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (status === "loading" || status === "running") return;
    setStatus("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      const engine = buildEngine(ctx, safe, buffer, title);
      ctxRef.current = ctx;
      safeRef.current = safe;
      engineRef.current = engine;
      setTrackTitle(title);

      // visual context: WebGL2 preferred, Canvas2D fallback
      const canvas = canvasRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(2, Math.round(canvas.clientWidth * dpr));
      const ch = Math.max(2, Math.round(canvas.clientHeight * dpr));
      canvas.width = cw;
      canvas.height = ch;
      try {
        glRef.current = buildGl(canvas, cw, ch);
        setUsing2D(false);
      } catch {
        const c2 = canvas.getContext("2d");
        if (!c2) throw new Error("no 2D context");
        ctx2dRef.current = c2;
        setUsing2D(true);
      }

      // camera + hand tracker; fall back to pointer on any failure
      let cameraOk = false;
      try {
        const tracker = await createHandTracker(2);
        trackerRef.current = tracker;
        const video = videoRef.current!;
        const stream = await startCamera(video);
        streamRef.current = stream;
        cameraOk = true;
      } catch {
        cameraOk = false;
      }

      if (cameraOk) {
        setDriver("camera");
        driverRef.current = "camera";
        setTrackState("auto");
        const video = videoRef.current!;
        useRvfcRef.current = "requestVideoFrameCallback" in video;
      } else {
        setDriver("pointer");
        driverRef.current = "pointer";
        setTrackState("pointer");
        setErrMsg(
          "Camera or hand model unavailable — drag on the field to move a single grab point.",
        );
      }

      runningRef.current = true;
      startRef.current = performance.now();
      setStatus("running");
      if (useRvfcRef.current) {
        const video = videoRef.current!;
        rvfcRef.current = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: (t: number) => void) => number;
          }
        ).requestVideoFrameCallback(rvfcLoop);
      }
      rafRef.current = requestAnimationFrame(runLoop);
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "failed to start");
    }
  }, [status, trackId, runLoop, rvfcLoop]);

  // ── teardown on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (video && "cancelVideoFrameCallback" in video && rvfcRef.current) {
        (
          video as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }
        ).cancelVideoFrameCallback(rvfcRef.current);
      }
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
      if (engineRef.current) teardownEngine(engineRef.current);
      try {
        safeRef.current?.disconnect();
      } catch {
        /* noop */
      }
      try {
        void ctxRef.current?.close();
      } catch {
        /* noop */
      }
      if (glRef.current) destroyGl(glRef.current);
    };
  }, []);

  // ── pointer handlers (fallback control) ──────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (driverRef.current !== "pointer") return;
    const r = e.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      active: true,
      sx: clamp01((e.clientX - r.left) / r.width),
      sy: clamp01((e.clientY - r.top) / r.height),
    };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (driverRef.current !== "pointer" || !pointerRef.current.active) return;
    const r = e.currentTarget.getBoundingClientRect();
    pointerRef.current.sx = clamp01((e.clientX - r.left) / r.width);
    pointerRef.current.sy = clamp01((e.clientY - r.top) / r.height);
  }, []);
  const onPointerUp = useCallback(() => {
    if (driverRef.current !== "pointer") return;
    pointerRef.current.active = false;
  }, []);

  const running = status === "running";

  // status line copy
  const trackLine =
    trackState === "live2"
      ? "tracking · live · 2 hands"
      : trackState === "live1"
        ? "tracking · live · 1 hand"
        : trackState === "auto"
          ? "no hands — autonomous drift (demo)"
          : trackState === "pointer"
            ? "pointer control · drag the field"
            : "hands lost";

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      {/* fixed art stage */}
      <div className="fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!running && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
            <div className="max-w-md rounded-lg border border-border bg-background/85 p-6 text-center shadow-lg backdrop-blur-md">
              <h1 className="text-2xl font-semibold tracking-tight">Cantormap</h1>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Two hands sculpt <em>where</em> the voices of Karel&apos;s recording live in a 3-D
                room around your head. Grab, place, gather and scatter the sound in space.
              </p>
              <div className="mt-4 flex flex-col gap-2 text-left">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  recording
                </span>
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  disabled={status === "loading"}
                  className="min-h-[44px] rounded-md border border-border bg-background px-3 text-base text-foreground"
                >
                  {REAL_TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={start}
                disabled={status === "loading"}
                className="mt-4 min-h-[44px] w-full rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {status === "loading" ? "loading his take…" : "Begin — enable camera + sound"}
              </button>
              {status === "error" && (
                <p className="mt-3 text-sm text-destructive">{errMsg}</p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Sits at a desk webcam, waist-up. Needs camera + audio permission. Falls back to
                pointer drag if either is unavailable.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* small mirrored camera preview */}
      <video
        ref={videoRef}
        className="fixed bottom-3 left-3 z-30 h-20 w-28 -scale-x-100 rounded-md border border-border/40 object-cover opacity-70"
        playsInline
        muted
        style={{ display: running && driver === "camera" ? "block" : "none" }}
      />

      {/* light overlay strip — status + track + controls */}
      {running && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
          {!immersive && (
            <span className="pointer-events-auto text-2xl font-semibold tracking-tight">
              Cantormap
            </span>
          )}
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              trackState === "lost" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {trackLine}
          </span>
          {trackState === "lost" && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              · show your hands, palms to camera
            </span>
          )}
          {trackTitle && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              · {trackTitle}
            </span>
          )}
          {using2D && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              · webgl2 absent · canvas2d room view
            </span>
          )}
        </div>
      )}

      {/* pointer-mode notice + gather control */}
      {running && driver === "pointer" && (
        <div className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
          {errMsg && (
            <span className="rounded-md border border-border bg-background/80 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
              {errMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => setGatherPointer((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            {gatherPointer ? "scatter voices" : "gather voices"}
          </button>
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Cantormap"
        description="Two hands grab the band-voices of one of Karel's own piano recordings and physically place, move, gather and scatter them around your head in real 3-D HRTF space — spatialization is the conducted instrument."
        howTo={[
          "Allow camera + sound, then hold both hands up, palms toward the camera.",
          "Move a hand left/right to swing the nearest voices around you; raise or lower it for elevation.",
          "Pinch thumb to finger to pull a voice in close and loud; open the pinch to push it away.",
          "Bring both hands together to gather every voice to an intimate centre; spread them wide and open to scatter the field.",
          "Drop your hands and the bed keeps playing while the voices drift on their own — a demo state, not live control.",
        ]}
      />

      {!immersive && <PrototypeNav slugs={["17968-cantormap"]} />}
    </div>
  );
}
