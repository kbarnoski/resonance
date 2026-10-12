"use client";

/* ── 19840 · CYMATICA ─────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your body could conduct the actual physical standing-wave
 *  geometry — the Chladni sand figure — of the harmony inside one of Karel's own
 *  piano recordings?
 *
 *  One of Karel's REAL piano takes always plays (audible). The chord sounding RIGHT
 *  NOW (read from the track's chord analysis) selects which Chladni plate modes
 *  (m,n) are excited, so the sand figure on screen IS the harmony he is playing.
 *
 *  You — seated at a laptop webcam, visible from the waist UP — conduct the plate:
 *    · wrist HEIGHT   → driving frequency / mode energy (which spatial order rings)
 *    · arm SPAN       → plate "tension": how many modes ring + their spacing
 *    · torso LEAN     → damping: sharp vs diffuse nodal lines
 *  Your motion ALSO transforms the SOUND — a resonant lowpass that follows the
 *  driving frequency + a reverb-space send that follows the span — so your body
 *  controls what you hear, not only what you see.
 *
 *  RENDER: the classic Chladni SAND FIGURE as a genuine GPGPU particle simulation.
 *  160,000 "sand" grains live in a WebGL2 ping-pong float texture. Each frame the
 *  plate displacement field D(x,y) = Σ a_{mn}·sin(mπx)·sin(nπy) is summed over the
 *  active modes in the shader; grains do gradient descent on |D| (migrating toward
 *  the nodal lines where D≈0) with jitter ∝ |D| so antinodes shake them off. The
 *  emergent nodal figure IS the render. Drawn as small additive points. Degrades
 *  to a CPU Canvas2D sand sim when WebGL2 / float render targets are unavailable.
 *
 *  Palette: near-black steel plate, bone/silver/warm-white sand, a faint cool-
 *  violet glow along the nodal lines. See README.md for the full writeup + refs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type Landmark,
  type PoseResult,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── small math ───────────────────────────────────────────────────────────────
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── harmony → the chord sounding now ───────────────────────────────────────────
interface Chord {
  root: number; // pitch-class 0..11
  minor: boolean;
  symbol: string;
}

// A gentle fallback progression (vi–IV–I–V in C) so the plate still rings if a
// take has no chord analysis. His real chords are always preferred.
const FALLBACK_PROG: Chord[] = [
  { root: 9, minor: true, symbol: "Am" },
  { root: 5, minor: false, symbol: "F" },
  { root: 0, minor: false, symbol: "C" },
  { root: 7, minor: false, symbol: "G" },
];

function chordAt(chords: TrackChord[] | null, t: number): Chord {
  if (chords && chords.length) {
    let idx = 0;
    for (let i = 0; i < chords.length; i++) {
      if (chords[i].time <= t) idx = i;
      else break;
    }
    const c = chords[idx];
    const r = chordRoot(c.chord);
    if (r != null) return { root: r, minor: chordIsMinor(c.chord), symbol: c.chord };
  }
  return FALLBACK_PROG[Math.floor(t / 3.5) % FALLBACK_PROG.length];
}

// Chord → semitone offsets from the root, priority-ordered (root · fifth · octave
// · third · …). Each offset becomes one excited plate mode; higher tones push to
// higher spatial order.
function chordOffsets(minor: boolean): number[] {
  const third = minor ? 3 : 4;
  const seventh = minor ? 10 : 11;
  return [0, 7, 12, third, 19, third + 12, seventh, 24];
}

// ── Chladni plate modes from the chord + the conducting gesture ────────────────
const MAX_MODES = 8;

interface Conduct {
  present: boolean;
  wristsSeen: boolean;
  height: number; // 0..1 — wrist height → driving frequency / mode order
  span: number; // 0..1 — arm span → plate tension (mode count + spacing)
  lean: number; // 0..1 — torso lean → damping (sharp vs diffuse nodal lines)
}
const REST: Conduct = { present: false, wristsSeen: false, height: 0.45, span: 0.4, lean: 0.25 };

interface Modes {
  m: Float32Array; // length MAX_MODES
  n: Float32Array;
  a: Float32Array;
  count: number;
}

// The harmony selects WHICH plate modes are excited; the body shapes how many
// ring, how high their order sits, and how much they are driven.
function computeModes(chord: Chord, c: Conduct, energy: number): Modes {
  const m = new Float32Array(MAX_MODES);
  const n = new Float32Array(MAX_MODES);
  const a = new Float32Array(MAX_MODES);

  // wrist height → base spatial order (driving frequency rises with the hands).
  const base = 1 + Math.round(c.height * 5); // 1..6
  // arm span → how many modes ring + their spacing.
  const count = clamp(2 + Math.round(c.span * (MAX_MODES - 2)), 2, MAX_MODES);
  const skew = 1 + Math.round(c.span * 3); // 1..4 — widens m/n separation
  const offs = chordOffsets(chord.minor);

  let asum = 0;
  for (let i = 0; i < count; i++) {
    const semi = offs[i % offs.length];
    const liftHi = Math.round(semi / 3) + Math.floor(i / 2) * (skew - 1);
    const liftLo = Math.round(semi / 6);
    // alternate the lift between the two axes so the figure is never a trivial
    // grid; a minor chord breaks symmetry (one extra node line) → richer shape.
    const mm = base + (i % 2 === 0 ? liftHi : liftLo);
    const nn = base + (i % 2 === 0 ? liftLo : liftHi) + (chord.minor ? i % 2 : 0);
    m[i] = clamp(mm, 1, 14);
    n[i] = clamp(nn, 1, 14);
    // root/early tones strongest; scaled by drive (height) + live audio energy.
    const w = 1 / (1 + i * 0.55);
    a[i] = w;
    asum += Math.abs(w);
  }
  const drive = clamp(0.45 + c.height * 0.4 + energy * 0.35, 0, 1.3);
  const norm = (1.15 / (asum || 1)) * drive;
  for (let i = 0; i < count; i++) a[i] *= norm;
  return { m, n, a, count };
}

// ── audio: his real take + a body-driven resonant lowpass & reverb-space ───────
interface Audio {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode;
  preGain: GainNode;
  lowpass: BiquadFilterNode;
  dry: GainNode;
  send: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wet: GainNode;
  startTime: number;
  duration: number;
  title: string;
}

function buildAudio(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): Audio {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const preGain = ctx.createGain();
  preGain.gain.value = 1;
  source.connect(preGain);

  // resonant lowpass — its cutoff FOLLOWS the driving frequency (wrist height),
  // its Q follows the lean (sharper resonance = sharper nodal lines).
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1400;
  lowpass.Q.value = 2;
  preGain.connect(lowpass);

  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  lowpass.connect(dry);
  dry.connect(master.input);

  // reverb-space send — a feedback delay of his own filtered take; opens with
  // the arm span (plate "tension" → a wider ringing room).
  const send = ctx.createGain();
  send.gain.value = 0.3;
  lowpass.connect(send);
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.34;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  send.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master.input);

  const startTime = ctx.currentTime + 0.05;
  source.start(startTime);

  return {
    ctx,
    master,
    source,
    preGain,
    lowpass,
    dry,
    send,
    delay,
    feedback,
    wet,
    startTime,
    duration: buffer.duration,
    title,
  };
}

// Body → sound. Everything smoothed with setTargetAtTime(·, now, 0.12).
function applyConduct(a: Audio, c: Conduct): void {
  const now = a.ctx.currentTime;
  const TC = 0.12;
  // wrist height → resonant lowpass cutoff (the driving frequency you hear).
  const cutoff = 360 * Math.pow(8200 / 360, clamp01(c.height));
  a.lowpass.frequency.setTargetAtTime(cutoff, now, TC);
  // lean → resonance sharpness (ties sharp sound to sharp nodal lines).
  a.lowpass.Q.setTargetAtTime(1 + clamp01(c.lean) * 13, now, TC);
  // arm span → reverb-space send + feedback tail.
  const sp = clamp01(c.span);
  a.send.gain.setTargetAtTime(0.1 + sp * 0.5, now, TC);
  a.feedback.gain.setTargetAtTime(0.18 + sp * 0.5, now, TC);
  a.wet.gain.setTargetAtTime(0.1 + sp * 0.4, now, TC);
  a.master.setGain(0.58 + clamp01(c.height) * 0.2);
}

function teardownAudio(a: Audio): void {
  try {
    a.source.stop();
  } catch {
    /* already stopped */
  }
  for (const nd of [a.source, a.preGain, a.lowpass, a.dry, a.send, a.delay, a.feedback, a.wet]) {
    try {
      nd.disconnect();
    } catch {
      /* ignore */
    }
  }
  a.master.disconnect();
}

// ── pose → the conducting gesture (seated, waist-up; shoulders + wrists only) ──
function visOf(p: Landmark | undefined): number {
  return p ? (p.visibility ?? 1) : 0;
}

function readConduct(res: PoseResult, prev: Conduct): Conduct {
  const lm = res.landmarks[0];
  if (!lm) return { ...prev, present: false, wristsSeen: false };
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  const lw = lm[POSE_LM.leftWrist];
  const rw = lm[POSE_LM.rightWrist];
  const nose = lm[POSE_LM.nose];

  // Gate ONLY on shoulders (+ at least one wrist). Hips/knees/ankles are never
  // required — a seated laptop view does not see them.
  if (visOf(ls) < 0.5 || visOf(rs) < 0.5) {
    return { ...prev, present: false, wristsSeen: false };
  }
  const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) + 1e-4;
  const midx = (ls.x + rs.x) / 2;
  const midy = (ls.y + rs.y) / 2;

  const heightOf = (w: Landmark): number =>
    clamp01(((midy - w.y) / shoulderW) * 0.55 + 0.45); // above shoulders → >0.45

  const lwOk = visOf(lw) > 0.4;
  const rwOk = visOf(rw) > 0.4;
  let height = prev.height;
  let span = prev.span;
  if (lwOk && rwOk) {
    height = (heightOf(lw) + heightOf(rw)) / 2;
    span = clamp01((Math.abs(lw.x - rw.x) / shoulderW - 0.6) / (3.0 - 0.6));
  } else if (lwOk) {
    height = heightOf(lw);
    span = clamp01((Math.abs(lw.x - midx) / shoulderW) * 1.1);
  } else if (rwOk) {
    height = heightOf(rw);
    span = clamp01((Math.abs(rw.x - midx) / shoulderW) * 1.1);
  }

  // torso lean → sway of the head off the shoulder centre, normalized.
  const lean = clamp01(Math.abs(visOf(nose) > 0.3 ? nose.x - midx : 0) / (shoulderW * 0.8));

  return { present: true, wristsSeen: lwOk || rwOk, height, span, lean };
}

// ── WebGL2 GPGPU sand plate ────────────────────────────────────────────────────
const TEX = 400; // 400 × 400 = 160,000 grains simulated on the GPU
const GRAIN_COUNT = TEX * TEX;

const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FIELD_GLSL = `
const float PI = 3.14159265;
uniform int uModeCount;
uniform float uM[8];
uniform float uN[8];
uniform float uA[8];
float fieldD(vec2 uv) {
  float D = 0.0;
  for (int k = 0; k < 8; k++) {
    if (k >= uModeCount) break;
    D += uA[k] * sin(uM[k] * PI * uv.x) * sin(uN[k] * PI * uv.y);
  }
  return D;
}
void fieldDG(vec2 uv, out float D, out vec2 grad) {
  D = 0.0; grad = vec2(0.0);
  for (int k = 0; k < 8; k++) {
    if (k >= uModeCount) break;
    float m = uM[k]; float n = uN[k]; float a = uA[k];
    float sx = sin(m * PI * uv.x); float cx = cos(m * PI * uv.x);
    float sy = sin(n * PI * uv.y); float cy = cos(n * PI * uv.y);
    D += a * sx * sy;
    grad.x += a * m * PI * cx * sy;
    grad.y += a * n * PI * sx * cy;
  }
}`;

// Simulation step: gradient descent on |D| → grains migrate to the nodal lines,
// jitter ∝ |D| shakes them off the antinodes. THIS is the Chladni physics.
const SIM_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uPos;
uniform float uTime;
uniform float uStep;
uniform float uJitter;
uniform float uDrive;
${FIELD_GLSL}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uPos, tc, 0);
  vec2 p = s.xy;
  float seed = s.z;
  float D; vec2 grad;
  fieldDG(p, D, grad);
  float gl = length(grad) + 1e-4;
  vec2 dir = grad / gl;
  // descend toward the node (D=0): move opposite sign(D)*grad.
  vec2 move = -sign(D) * dir * uStep * (0.5 + uDrive);
  // jitter proportional to |D|: antinodes shake grains loose.
  float h1 = hash(p * 91.7 + vec2(uTime * 1.31, seed * 7.0));
  float h2 = hash(p * 47.3 + vec2(seed * 3.1, uTime * 0.77));
  float ang = h1 * 6.2831853;
  float jmag = uJitter * abs(D) * (0.4 + uDrive) * h2;
  p += move + vec2(cos(ang), sin(ang)) * jmag;
  // reflect at the plate edges.
  if (p.x < 0.0) p.x = -p.x;
  if (p.x > 1.0) p.x = 2.0 - p.x;
  if (p.y < 0.0) p.y = -p.y;
  if (p.y > 1.0) p.y = 2.0 - p.y;
  p = clamp(p, 0.0, 1.0);
  outColor = vec4(p, seed, 1.0);
}`;

// Grain render: read each grain's position, compute its |D| for a node-glow
// brightness, draw a small additive point. Bone sand, cool-violet along nodes.
const GRAIN_VS = `#version 300 es
precision highp float;
uniform sampler2D uPos;
uniform int uTex;
uniform float uAspect;
uniform float uPointSize;
${FIELD_GLSL}
out float vBright;
out float vNode;
void main() {
  int id = gl_VertexID;
  int ix = id % uTex;
  int iy = id / uTex;
  vec2 uv = (vec2(float(ix), float(iy)) + 0.5) / float(uTex);
  vec2 p = texture(uPos, uv).xy;
  float D = fieldD(p);
  vNode = exp(-abs(D) * 7.0);          // 1 at a node → 0 at an antinode
  vBright = 0.35 + vNode * 0.95;
  vec2 ndc = (p - 0.5) * 2.0;
  if (uAspect > 1.0) ndc.x /= uAspect; else ndc.y *= uAspect;
  ndc *= 0.94;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = uPointSize;
}`;

const GRAIN_FS = `#version 300 es
precision highp float;
in float vBright;
in float vNode;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = 1.0 - d;
  vec3 bone = vec3(0.86, 0.84, 0.80);        // warm-white / silver sand
  vec3 violet = vec3(0.52, 0.42, 0.98);      // faint cool-violet node glow
  vec3 col = mix(bone, violet, vNode * 0.55) * vBright;
  float alpha = a * a * (0.10 + vNode * 0.34);
  frag = vec4(col * alpha, alpha);
}`;

const FADE_FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform sampler2D uTrail;
uniform vec2 uRes;
uniform float uFade;
void main() {
  frag = texture(uTrail, gl_FragCoord.xy / uRes) * uFade;
}`;

const DISPLAY_FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform sampler2D uTrail;
uniform vec2 uRes;
void main() {
  vec3 c = texture(uTrail, gl_FragCoord.xy / uRes).rgb;
  c = c / (1.0 + c);                           // reinhard tone map
  c = pow(max(c, vec3(0.0)), vec3(0.72));
  vec3 plate = vec3(0.018, 0.018, 0.027);      // near-black steel plate
  frag = vec4(plate + c, 1.0);
}`;

interface Prog {
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}
interface GlState {
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject;
  sim: Prog;
  grain: Prog;
  fade: Prog;
  display: Prog;
  pos: [WebGLTexture, WebGLTexture];
  posFbo: [WebGLFramebuffer, WebGLFramebuffer];
  posR: 0 | 1;
  trail: [WebGLTexture, WebGLTexture];
  trailFbo: [WebGLFramebuffer, WebGLFramebuffer];
  trailR: 0 | 1;
  w: number;
  h: number;
  dpr: number;
}

function compileProg(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  uniforms: string[],
): Prog | null {
  const mk = (type: number, src: string): WebGLShader | null => {
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
  const vs = mk(gl.VERTEX_SHADER, vsSrc);
  const fs = mk(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const u of uniforms) loc[u] = gl.getUniformLocation(prog, u);
  return { prog, loc };
}

function makePosTexture(gl: WebGL2RenderingContext, data: Float32Array | null): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX, TEX, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function makeTrailTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function attachFbo(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  clear = false,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (clear) {
    // Trail textures start black; position textures must keep their seeded data.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  return fbo;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedPositions(): Float32Array {
  const rand = mulberry32(0x19840);
  const data = new Float32Array(GRAIN_COUNT * 4);
  for (let i = 0; i < GRAIN_COUNT; i++) {
    data[i * 4 + 0] = rand();
    data[i * 4 + 1] = rand();
    data[i * 4 + 2] = rand() * 10;
    data[i * 4 + 3] = 1;
  }
  return data;
}

function buildGl(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): GlState | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  const vao = gl.createVertexArray();
  if (!vao) return null;
  gl.bindVertexArray(vao);

  const sim = compileProg(gl, FULLSCREEN_VS, SIM_FS, [
    "uPos", "uTime", "uStep", "uJitter", "uDrive", "uModeCount", "uM", "uN", "uA",
  ]);
  const grain = compileProg(gl, GRAIN_VS, GRAIN_FS, [
    "uPos", "uTex", "uAspect", "uPointSize", "uModeCount", "uM", "uN", "uA",
  ]);
  const fade = compileProg(gl, FULLSCREEN_VS, FADE_FS, ["uTrail", "uRes", "uFade"]);
  const display = compileProg(gl, FULLSCREEN_VS, DISPLAY_FS, ["uTrail", "uRes"]);
  if (!sim || !grain || !fade || !display) return null;

  const p0 = makePosTexture(gl, seedPositions());
  const p1 = makePosTexture(gl, null);
  const pf0 = attachFbo(gl, p0);
  const pf1 = attachFbo(gl, p1);
  const t0 = makeTrailTexture(gl, w, h);
  const t1 = makeTrailTexture(gl, w, h);
  const tf0 = attachFbo(gl, t0, true);
  const tf1 = attachFbo(gl, t1, true);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    gl,
    vao,
    sim,
    grain,
    fade,
    display,
    pos: [p0, p1],
    posFbo: [pf0, pf1],
    posR: 0,
    trail: [t0, t1],
    trailFbo: [tf0, tf1],
    trailR: 0,
    w,
    h,
    dpr,
  };
}

function resizeTrail(s: GlState, w: number, h: number): void {
  const { gl } = s;
  gl.deleteTexture(s.trail[0]);
  gl.deleteTexture(s.trail[1]);
  gl.deleteFramebuffer(s.trailFbo[0]);
  gl.deleteFramebuffer(s.trailFbo[1]);
  const t0 = makeTrailTexture(gl, w, h);
  const t1 = makeTrailTexture(gl, w, h);
  s.trail = [t0, t1];
  s.trailFbo = [attachFbo(gl, t0, true), attachFbo(gl, t1, true)];
  s.trailR = 0;
  s.w = w;
  s.h = h;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

interface Frame {
  time: number;
  modes: Modes;
  drive: number; // 0..1 overall energy
  lean: number; // 0..1 damping
}

function setModeUniforms(gl: WebGL2RenderingContext, loc: Prog["loc"], modes: Modes): void {
  gl.uniform1i(loc.uModeCount, modes.count);
  gl.uniform1fv(loc.uM, modes.m);
  gl.uniform1fv(loc.uN, modes.n);
  gl.uniform1fv(loc.uA, modes.a);
}

function stepGl(s: GlState, f: Frame): void {
  const { gl } = s;
  gl.bindVertexArray(s.vao);

  // ── 1. simulation step (ping-pong position textures) ──
  const pR = s.posR;
  const pW = (1 - pR) as 0 | 1;
  gl.useProgram(s.sim.prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.posFbo[pW]);
  gl.viewport(0, 0, TEX, TEX);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.pos[pR]);
  gl.uniform1i(s.sim.loc.uPos, 0);
  gl.uniform1f(s.sim.loc.uTime, f.time);
  // lean → damping: more lean = sharper lines (smaller jitter, firmer descent).
  gl.uniform1f(s.sim.loc.uStep, 0.0032 + f.lean * 0.0026);
  gl.uniform1f(s.sim.loc.uJitter, 0.016 * (1.0 - f.lean * 0.7));
  gl.uniform1f(s.sim.loc.uDrive, f.drive);
  setModeUniforms(gl, s.sim.loc, f.modes);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  s.posR = pW;

  // ── 2. fade previous trail, then additively draw the grains ──
  const tR = s.trailR;
  const tW = (1 - tR) as 0 | 1;
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.trailFbo[tW]);
  gl.viewport(0, 0, s.w, s.h);
  gl.disable(gl.BLEND);
  gl.useProgram(s.fade.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.trail[tR]);
  gl.uniform1i(s.fade.loc.uTrail, 0);
  gl.uniform2f(s.fade.loc.uRes, s.w, s.h);
  gl.uniform1f(s.fade.loc.uFade, 0.9);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(s.grain.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.pos[s.posR]);
  gl.uniform1i(s.grain.loc.uPos, 0);
  gl.uniform1i(s.grain.loc.uTex, TEX);
  gl.uniform1f(s.grain.loc.uAspect, s.w / s.h);
  gl.uniform1f(s.grain.loc.uPointSize, Math.max(1, s.dpr * 1.4));
  setModeUniforms(gl, s.grain.loc, f.modes);
  gl.drawArrays(gl.POINTS, 0, GRAIN_COUNT);
  gl.disable(gl.BLEND);
  s.trailR = tW;

  // ── 3. display the trail to the screen ──
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, s.w, s.h);
  gl.useProgram(s.display.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, s.trail[s.trailR]);
  gl.uniform1i(s.display.loc.uTrail, 0);
  gl.uniform2f(s.display.loc.uRes, s.w, s.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function destroyGl(s: GlState): void {
  const { gl } = s;
  try {
    gl.deleteTexture(s.pos[0]);
    gl.deleteTexture(s.pos[1]);
    gl.deleteTexture(s.trail[0]);
    gl.deleteTexture(s.trail[1]);
    gl.deleteFramebuffer(s.posFbo[0]);
    gl.deleteFramebuffer(s.posFbo[1]);
    gl.deleteFramebuffer(s.trailFbo[0]);
    gl.deleteFramebuffer(s.trailFbo[1]);
    gl.deleteProgram(s.sim.prog);
    gl.deleteProgram(s.grain.prog);
    gl.deleteProgram(s.fade.prog);
    gl.deleteProgram(s.display.prog);
    gl.deleteVertexArray(s.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* context already gone */
  }
}

// ── Canvas2D fallback — the identical sand physics, fewer grains on the CPU ─────
const FB_COUNT = 3200;
interface Fallback {
  x: Float32Array;
  y: Float32Array;
  seed: Float32Array;
}
function createFallback(): Fallback {
  const rand = mulberry32(0x19840);
  const fb: Fallback = {
    x: new Float32Array(FB_COUNT),
    y: new Float32Array(FB_COUNT),
    seed: new Float32Array(FB_COUNT),
  };
  for (let i = 0; i < FB_COUNT; i++) {
    fb.x[i] = rand();
    fb.y[i] = rand();
    fb.seed[i] = rand() * 10;
  }
  return fb;
}
function hashJs(x: number, y: number): number {
  let px = (x * 123.34) % 1;
  let py = (y * 456.21) % 1;
  const d = px * px + py * py + 45.32;
  px += d;
  py += d;
  return (px * py) % 1;
}
function stepFallback(
  ctx: CanvasRenderingContext2D,
  fb: Fallback,
  f: Frame,
  w: number,
  h: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(5,5,8,0.18)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const { m, n, a, count } = f.modes;
  const PI = Math.PI;
  const side = Math.min(w, h) * 0.94;
  const ox = (w - side) / 2;
  const oy = (h - side) / 2;
  const step = 0.0032 + f.lean * 0.0026;
  const jitter = 0.016 * (1 - f.lean * 0.7);
  for (let i = 0; i < FB_COUNT; i++) {
    const px = fb.x[i];
    const py = fb.y[i];
    let D = 0;
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < count; k++) {
      const sx = Math.sin(m[k] * PI * px);
      const cx = Math.cos(m[k] * PI * px);
      const sy = Math.sin(n[k] * PI * py);
      const cy = Math.cos(n[k] * PI * py);
      D += a[k] * sx * sy;
      gx += a[k] * m[k] * PI * cx * sy;
      gy += a[k] * n[k] * PI * sx * cy;
    }
    const gl = Math.hypot(gx, gy) + 1e-4;
    const s = -(D < 0 ? -1 : 1) * step * (0.5 + f.drive);
    let nx = px + (gx / gl) * s;
    let ny = py + (gy / gl) * s;
    const h1 = hashJs(px * 91.7 + f.time * 1.31, py + fb.seed[i] * 7);
    const h2 = hashJs(px * 47.3 + fb.seed[i] * 3.1, py + f.time * 0.77);
    const jmag = jitter * Math.abs(D) * (0.4 + f.drive) * h2;
    const ang = h1 * 6.2831853;
    nx += Math.cos(ang) * jmag;
    ny += Math.sin(ang) * jmag;
    if (nx < 0) nx = -nx;
    if (nx > 1) nx = 2 - nx;
    if (ny < 0) ny = -ny;
    if (ny > 1) ny = 2 - ny;
    fb.x[i] = nx < 0 ? 0 : nx > 1 ? 1 : nx;
    fb.y[i] = ny < 0 ? 0 : ny > 1 ? 1 : ny;
    const node = Math.exp(-Math.abs(D) * 7);
    const bright = 0.35 + node * 0.95;
    const r = Math.round((0.86 + (0.52 - 0.86) * node * 0.55) * 255 * bright);
    const g = Math.round((0.84 + (0.42 - 0.84) * node * 0.55) * 255 * bright);
    const b = Math.round((0.8 + (0.98 - 0.8) * node * 0.55) * 255 * bright);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.14 + node * 0.4})`;
    ctx.fillRect(ox + fb.x[i] * side, oy + fb.y[i] * side, 1.6, 1.6);
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── the engine ─────────────────────────────────────────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  audio: Audio;
  masterData: Uint8Array<ArrayBuffer>;
  gl: GlState | null;
  ctx2d: CanvasRenderingContext2D | null;
  fb: Fallback | null;
  tracker: PoseLandmarkerInst | null;
  stream: MediaStream | null;
  chords: TrackChord[] | null;
  raf: number;
  time: number;
  lastMs: number;
  energy: number;
  smooth: Conduct;
  modes: Modes;
  lastChord: string;
  usingPointer: boolean;
  pointer: { x: number; y: number; down: boolean; active: boolean };
}

type Mode = "idle" | "loading" | "running";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.id === "8dafed88-4761-4dd3-a0f4-93f310441093")?.id ?? REAL_TRACKS[0].id;

export default function CymaticaPage() {
  const { immersive, toggle } = useImmersive();
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [driver, setDriver] = useState<"pointer" | "body">("pointer");
  const [using2D, setUsing2D] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [chordLabel, setChordLabel] = useState<string>("—");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const modeReadRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 2, h: 2, dpr: 1 };
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(window.innerWidth * dpr));
    const h = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }, []);

  const setStatus = useCallback((text: string, lost: boolean) => {
    const el = statusRef.current;
    if (!el) return;
    el.textContent = text;
    el.className = `font-mono text-xs ${lost ? "text-destructive" : "text-muted-foreground"}`;
  }, []);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.lastMs = eng.lastMs || nowMs;
      const dt = Math.min(0.05, (nowMs - eng.lastMs) / 1000);
      eng.lastMs = nowMs;
      eng.time += dt;

      // ── read the conducting gesture (pose, else pointer) ──
      let target = REST;
      let poseLive = false;
      let wristsSeen = false;
      if (eng.tracker && eng.stream && videoRef.current && videoRef.current.readyState >= 2) {
        let res: PoseResult | null = null;
        try {
          res = eng.tracker.detectForVideo(videoRef.current, nowMs);
        } catch {
          res = null;
        }
        if (res && res.landmarks && res.landmarks.length > 0) {
          const c = readConduct(res, eng.smooth);
          if (c.present) {
            target = c;
            poseLive = true;
            wristsSeen = c.wristsSeen;
            if (eng.usingPointer) {
              eng.usingPointer = false;
              setDriver("body");
            }
          } else if (!eng.usingPointer) {
            target = { ...eng.smooth, present: false };
          }
        } else if (!eng.usingPointer) {
          target = { ...eng.smooth, present: false };
        }
      }
      if (eng.usingPointer) {
        const p = eng.pointer;
        if (p.active) {
          target = {
            present: true,
            wristsSeen: true,
            height: clamp01(1 - p.y), // mouse Y → wrist height / driving frequency
            span: clamp01(Math.abs(p.x - 0.5) * 2), // mouse X → arm span / tension
            lean: p.down ? 0.85 : clamp01(Math.abs(p.x - 0.5) * 1.4), // press → damping
          };
        } else {
          target = REST;
        }
      }

      // ── smooth the reading (conducting, not twitching) ──
      const k = 0.12;
      const sm = eng.smooth;
      sm.height += (target.height - sm.height) * k;
      sm.span += (target.span - sm.span) * k;
      sm.lean += (target.lean - sm.lean) * k;
      sm.present = target.present;
      sm.wristsSeen = target.wristsSeen;

      // ── which chord is sounding now → excite its plate modes ──
      const tPlay = eng.ac.currentTime - eng.audio.startTime;
      const loopT = tPlay > 0 ? tPlay % eng.audio.duration : 0;
      const chord = chordAt(eng.chords, loopT);
      if (chord.symbol !== eng.lastChord) {
        eng.lastChord = chord.symbol;
        setChordLabel(chord.symbol);
      }

      applyConduct(eng.audio, sm);

      // ── live energy from his tamed master ──
      eng.master.analyser.getByteTimeDomainData(eng.masterData);
      let sum = 0;
      for (let i = 0; i < eng.masterData.length; i++) {
        const v = (eng.masterData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / eng.masterData.length);
      eng.energy += (Math.min(1, rms * 3.2) - eng.energy) * 0.2;

      eng.modes = computeModes(chord, sm, eng.energy);
      const drive = clamp01(0.3 + sm.height * 0.5 + eng.energy * 0.45);

      const frame: Frame = { time: eng.time, modes: eng.modes, drive, lean: sm.lean };

      if (eng.gl) {
        stepGl(eng.gl, frame);
      } else if (eng.ctx2d) {
        const c = canvasRef.current;
        if (c) stepFallback(eng.ctx2d, eng.fb!, frame, c.width, c.height);
      }

      // ── readouts ──
      if (modeReadRef.current) {
        const mm = eng.modes;
        let txt = "";
        for (let i = 0; i < Math.min(mm.count, 4); i++) {
          txt += `(${mm.m[i]},${mm.n[i]})`;
        }
        modeReadRef.current.textContent = `${mm.count} modes · ${txt}`;
      }

      // ── tracking-status line ──
      if (eng.usingPointer) {
        setStatus("pointer fallback · drag to conduct the plate", false);
      } else if (poseLive && wristsSeen) {
        setStatus("tracking · live", false);
      } else if (poseLive) {
        setStatus("tracking · live · raise your hands into frame", false);
      } else {
        setStatus("tracking lost · face the camera, shoulders in frame", true);
      }

      eng.raf = requestAnimationFrame(renderLoop);
    },
    [setStatus],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((tr) => tr.stop());
    if (eng.tracker) {
      try {
        eng.tracker.close();
      } catch {
        /* ignore */
      }
    }
    teardownAudio(eng.audio);
    if (eng.gl) destroyGl(eng.gl);
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 350);
    }
    engineRef.current = null;
  }, []);

  const tryCamera = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamNotice("No camera here — conducting the plate with the pointer instead.");
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream;
    try {
      stream = await startCamera(video);
    } catch {
      setCamNotice("Camera unavailable or blocked — conducting with the pointer instead.");
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    eng2.stream = stream;
    try {
      const tracker = await createPoseTracker(1);
      const eng3 = engineRef.current;
      if (!eng3) {
        tracker.close();
        return;
      }
      eng3.tracker = tracker;
      setShowPreview(true);
      setCamNotice(null);
    } catch {
      setCamNotice("Pose model could not load — conducting with the pointer instead.");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setGlNotice(null);
    setCamNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setShowPreview(false);
    setDriver("pointer");
    setMode("loading");

    // audio first — it must always work
    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioNotice("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setMode("idle");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ac, trackId);
    } catch {
      setAudioNotice("Karel's recording could not load — check the connection and try again.");
      void ac.close();
      setMode("idle");
      return;
    }

    const master = createSafeMaster(ac);
    const audio = buildAudio(ac, master, loaded.buffer, loaded.title);

    let chords: TrackChord[] | null = null;
    try {
      const analysis = await loadTrackAnalysis(trackId);
      chords = analysis?.chords?.length ? analysis.chords : null;
    } catch {
      chords = null;
    }

    // visuals: WebGL2 GPGPU sand, else Canvas2D CPU sand — never blocks audio.
    const { w, h, dpr } = sizeCanvas();
    const canvas = canvasRef.current;
    let gl: GlState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fb: Fallback | null = null;
    if (canvas) {
      try {
        gl = buildGl(canvas, w, h, dpr);
      } catch {
        gl = null;
      }
      if (!gl) {
        const g2 = canvas.getContext("2d");
        if (g2) {
          ctx2d = g2;
          fb = createFallback();
          setUsing2D(true);
          setGlNotice("WebGL2 float rendering unavailable — showing the Canvas2D sand fallback.");
        } else {
          setGlNotice("This browser can render neither WebGL2 nor Canvas2D — audio only.");
        }
      }
    }

    const eng: Engine = {
      ac,
      master,
      audio,
      masterData: new Uint8Array(master.analyser.fftSize),
      gl,
      ctx2d,
      fb,
      tracker: null,
      stream: null,
      chords,
      raf: 0,
      time: 0,
      lastMs: 0,
      energy: 0,
      smooth: { ...REST },
      modes: computeModes(FALLBACK_PROG[2], REST, 0),
      lastChord: "",
      usingPointer: true,
      pointer: { x: 0.5, y: 0.5, down: false, active: false },
    };
    engineRef.current = eng;

    setMode("running");
    void tryCamera();
    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, sizeCanvas, trackId, tryCamera]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setDriver("pointer");
    setShowPreview(false);
    setUsing2D(false);
  }, [stopEverything]);

  // pointer as the always-available conducting sensor
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng.pointer.x = clamp01((e.clientX - rect.left) / rect.width);
    eng.pointer.y = clamp01((e.clientY - rect.top) / rect.height);
    eng.pointer.active = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.pointer.down = true;
      eng.pointer.active = true;
      onPointerMove(e);
    },
    [onPointerMove],
  );
  const onPointerUp = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.pointer.down = false;
  }, []);

  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      const { w, h } = sizeCanvas();
      if (eng?.gl && (eng.gl.w !== w || eng.gl.h !== h)) resizeTrail(eng.gl, w, h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, sizeCanvas]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  const HOW_TO = [
    "Sit so the camera sees you from the waist up — shoulders and both wrists in frame.",
    "Raise your wrists to drive a higher plate frequency (higher-order sand figures).",
    "Spread your arms wide to ring more modes and widen their spacing; draw them in to simplify.",
    "Lean / sway to sharpen the nodal lines (more damping) or let them go diffuse.",
    "No camera? Drag the pointer — Y is wrist height, X is arm span, press to sharpen.",
  ];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the GPGPU sand plate fills the viewport */}
      <div
        className="absolute inset-0 touch-none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* mirrored webcam preview — stays mounted so the stream never detaches */}
      <div
        className={`absolute right-3 top-3 z-20 h-[20vh] max-h-40 w-[26vw] max-w-56 overflow-hidden rounded-md border border-border bg-black/40 ${
          showPreview && running ? "" : "hidden"
        }`}
      >
        <video
          ref={videoRef}
          className="h-full w-full -scale-x-100 object-cover opacity-70"
          playsInline
          muted
        />
      </div>

      {/* tracking-status + mode readout — visible whenever running */}
      {running && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-1">
          <span ref={statusRef} className="font-mono text-xs text-muted-foreground">
            starting…
          </span>
          <div className="flex flex-wrap gap-x-3">
            {chordLabel !== "—" && (
              <span className="font-mono text-xs text-primary">chord · {chordLabel}</span>
            )}
            <span ref={modeReadRef} className="font-mono text-xs text-muted-foreground" />
          </div>
        </div>
      )}

      {/* functional error notices stay visible even in immersive */}
      {(audioNotice || (running && driver === "pointer" && camNotice)) && (
        <div className="absolute inset-x-0 top-16 z-20 flex justify-center px-4">
          <p className="rounded-md border border-border bg-background/70 px-3 py-2 text-base text-destructive backdrop-blur-sm">
            {audioNotice ?? camNotice}
          </p>
        </div>
      )}

      {/* write-up chrome — hidden entirely while immersive */}
      {!immersive && (
        <>
          <div className="absolute left-4 top-12 z-10 max-w-xl">
            <Link
              href="/dream"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← back to the dream lab
            </Link>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              19840 · cymatica · conduct the harmony&apos;s sand figure
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Cymatica
            </h1>
            {!running && (
              <p className="mt-3 text-base leading-relaxed text-foreground">
                One of Karel&apos;s piano takes plays, and the chord sounding right now excites the
                Chladni plate modes beneath 160,000 grains of simulated sand — so the standing-wave
                figure on screen <span className="text-primary">is</span> the harmony he is playing.
                Conduct it with your body: raise your wrists to drive a higher frequency, spread your
                arms to ring more modes, lean to sharpen the nodal lines.
              </p>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-background/90 to-transparent p-4 pt-10">
            <div className="flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={loading}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Loading his take…" : "Conduct the plate"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                take
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  disabled={running || loading}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm normal-case tracking-normal text-foreground disabled:opacity-60"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {running && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  conducting:{" "}
                  <span className="text-primary">{driver === "body" ? "your body" : "pointer"}</span>
                </span>
              )}
              {running && using2D && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  canvas 2d fallback
                </span>
              )}
              <ImmersiveHud
                immersive={immersive}
                onToggle={toggle}
                title="Cymatica"
                description="Conduct the physical Chladni standing-wave figure of the harmony inside one of Karel's piano recordings — 160,000 grains of GPU-simulated sand migrating to the nodal lines of the chord he's playing."
                howTo={HOW_TO}
              />
            </div>

            {!running && !loading && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                tap conduct — grant the camera for body conducting, or conduct with the pointer
              </p>
            )}
            {glNotice && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {glNotice}
              </p>
            )}
            {running && (
              <p className="max-w-3xl text-sm text-muted-foreground">
                input: MediaPipe upper-body pose (pointer fallback) · harmony: his track&apos;s live
                chord analysis selects the excited Chladni modes (m,n) · sim: 160,000 GPU sand grains
                doing gradient descent on |Σ a·sin(mπx)·sin(nπy)| toward the nodal lines · audio: his
                real take → a body-driven resonant lowpass + reverb-space → ear-safe master.
              </p>
            )}
          </div>
        </>
      )}

      {/* in immersive, only the HUD pills (plus the status line + errors above) */}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Cymatica"
          description="Conduct the physical Chladni standing-wave figure of the harmony inside one of Karel's piano recordings — 160,000 grains of GPU-simulated sand migrating to the nodal lines of the chord he's playing."
          howTo={HOW_TO}
        />
      )}
    </main>
  );
}
