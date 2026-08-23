"use client";

/* ── 15824 · Canon ──────────────────────────────────────────────────────────
 *
 *  ONE IDEA: two-hand POLYPHONIC conducting. This deepens 15760-conduct's "your
 *  hands are the baton" into TWO INDEPENDENT VOICES. Karel's ONE real piano take
 *  is split by a frequency CROSSOVER into a BASS voice (low-register pad) and a
 *  TREBLE voice (the melody). Each hand conducts the TIME-BASE of ONE voice:
 *  your LEFT hand drives the bass's playbackRate, your RIGHT hand drives the
 *  treble's. Because your two hands move independently, his recording plays in
 *  COUNTERPOINT AGAINST ITSELF — a canon of his own take, the low pad dragging
 *  slow while the melody pushes forward, or the reverse.
 *
 *  Reference: arXiv:2604.27957 "Real-Time Control of a Virtual Orchestra by
 *  Recognition of Conducting Gestures" (conducting is control of TIME, not just
 *  loudness — the lineage from conduct); the July-2026 real-time low-latency
 *  music source separation cluster (arXiv:2607.12872 and "Towards Practical
 *  Real-Time Low-Latency Music Source Separation") — the fresh capability of
 *  splitting a recording into independent stems live. Honest reframe: we realize
 *  the split with a lightweight frequency CROSSOVER of his own take (bass/treble
 *  bands), not a neural model, so it is browser-real and 100% his audio. And
 *  BachDuet — human-machine counterpoint — the "two voices conversing" lineage.
 *
 *  AUDIO is pure Web Audio and is the ONLY thing you ever hear: his one decoded
 *  recording, played by TWO independent loop heads, band-split and transformed
 *  (per-voice playbackRate / crossover filters / tone lowpass / gain / a
 *  feedback-delay of his own signal). No oscillators, no synths, no generated
 *  tone anywhere.
 *
 *  VISUAL is the WebGPU compute-shader grain engine from conduct, now driving
 *  TWO clouds — a BASS cloud (deep ember/oxblood) and a TREBLE cloud (gold →
 *  violet) — each swept by its own hand, interleaving so you SEE the
 *  counterpoint. Degrades to a Canvas2D two-cloud render; audio never waits on
 *  the GPU. See README.md for the full writeup.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── MediaPipe HandLandmarker via runtime CDN (build-safe: new Function so the
//    bundler never resolves the URL) ─────────────────────────────────────────
const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

interface Landmark {
  x: number;
  y: number;
  z: number;
}
interface Category {
  categoryName?: string;
  displayName?: string;
  score?: number;
}
interface HandResult {
  landmarks: Landmark[][];
  handednesses?: Category[][];
  handedness?: Category[][];
}
interface HandLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): HandResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numHands?: number;
      },
    ): Promise<HandLandmarkerInst>;
  };
}
async function createHandLandmarker(): Promise<HandLandmarkerInst> {
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

// ── The two-voice conducting reading, from hands OR a single-pointer fallback ──
interface Vec2 {
  x: number; // pos-space, mirrored (right = +x)
  y: number; // pos-space (up = +y)
}
interface CanonState {
  bassPresent: boolean;
  treblePresent: boolean;
  bassHeight: number; // 0..1 — left hand height → bass time-base
  trebleHeight: number; // 0..1 — right hand height → treble time-base
  bassOpen: number; // 0..1 — left hand openness → bass tone
  trebleOpen: number; // 0..1 — right hand openness → treble tone
  bassFist: boolean;
  trebleFist: boolean;
  spread: number; // 0..1 — distance between the two hands → dynamics
  bassCenter: Vec2; // bass cloud push point
  trebleCenter: Vec2; // treble cloud push point
}

const REST: CanonState = {
  bassPresent: false,
  treblePresent: false,
  bassHeight: 0.42,
  trebleHeight: 0.58,
  bassOpen: 0.5,
  trebleOpen: 0.55,
  bassFist: false,
  trebleFist: false,
  spread: 0.35,
  bassCenter: { x: -0.42, y: -0.24 },
  trebleCenter: { x: 0.42, y: 0.3 },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

interface HandFeat {
  cx: number;
  cy: number;
  open: number;
  fist: boolean;
  height: number;
}

// Normalized hand landmark (0..1) → pos-space center + openness + height.
function computeHandFeatures(lm: Landmark[]): HandFeat {
  const cxN = 1 - lm[9].x; // mirror x so it reads like a mirror
  const cyN = lm[9].y;
  const wrist = lm[0];
  const palm = dist2(1 - wrist.x, wrist.y, 1 - lm[9].x, lm[9].y) + 1e-4;
  const tips = [4, 8, 12, 16, 20];
  let sum = 0;
  for (const t of tips) {
    sum += dist2(1 - lm[t].x, lm[t].y, 1 - wrist.x, wrist.y);
  }
  const ratio = sum / tips.length / palm;
  const open = clamp01((ratio - 1.4) / (2.6 - 1.4));
  const cx = (cxN * 2 - 1) * 1.2;
  const cy = ((1 - cyN) * 2 - 1) * 1.2;
  return {
    cx,
    cy,
    open,
    fist: open < 0.14,
    height: clamp01((cy + 1.2) / 2.4),
  };
}

// Assign the (up to two) hands to the BASS and TREBLE voices. Your LEFT hand
// conducts the bass, your RIGHT hand the treble. The display is mirrored, so
// your left hand appears on the RIGHT of the frame (larger cx). We prefer
// MediaPipe's handedness label when the two hands are labelled distinctly, and
// fall back to screen-x position (both paths agree: bass = your left hand).
function assignVoices(
  feats: HandFeat[],
  labels: (string | undefined)[],
): { bass: HandFeat | null; treble: HandFeat | null } {
  if (feats.length === 0) return { bass: null, treble: null };
  if (feats.length === 1) return { bass: feats[0], treble: feats[0] };

  const l0 = labels[0];
  const l1 = labels[1];
  const distinct = l0 && l1 && l0 !== l1;
  if (distinct) {
    // categoryName "Left" = the visitor's left hand = bass.
    const bassIdx = l0 === "Left" ? 0 : 1;
    return { bass: feats[bassIdx], treble: feats[1 - bassIdx] };
  }
  // fall back to position: larger cx (screen-right = your left hand) = bass.
  const bassIdx = feats[0].cx >= feats[1].cx ? 0 : 1;
  return { bass: feats[bassIdx], treble: feats[1 - bassIdx] };
}

function computeCanonFromHands(res: HandResult): CanonState {
  const hands = res.landmarks;
  if (!hands.length) return { ...REST, bassPresent: false, treblePresent: false };
  const feats = hands.slice(0, 2).map(computeHandFeatures);
  const handed = res.handednesses ?? res.handedness ?? [];
  const labels = feats.map((_, i) => handed[i]?.[0]?.categoryName);
  const { bass, treble } = assignVoices(feats, labels);
  const b = bass ?? feats[0];
  const t = treble ?? feats[0];

  // distance between the two physical hands → dynamics.
  let spread = 0.3;
  if (feats.length >= 2) {
    const d = dist2(feats[0].cx, feats[0].cy, feats[1].cx, feats[1].cy);
    spread = clamp01((d - 0.25) / (2.4 - 0.25));
  } else {
    spread = 0.2 + feats[0].open * 0.4;
  }

  return {
    bassPresent: true,
    treblePresent: true,
    bassHeight: b.height,
    trebleHeight: t.height,
    bassOpen: b.open,
    trebleOpen: t.open,
    bassFist: b.fist,
    trebleFist: t.fist,
    spread,
    bassCenter: { x: b.cx, y: b.cy },
    trebleCenter: { x: t.cx, y: t.cy },
  };
}

// ── Audio: his ONE decoded buffer, split by a crossover into two voices, each
//    with its own loop head + time-base so the take plays against itself. ──────
interface VoiceNodes {
  source: AudioBufferSourceNode;
  cross1: BiquadFilterNode;
  cross2: BiquadFilterNode;
  tone: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wet: GainNode;
}
interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  bass: VoiceNodes;
  treble: VoiceNodes;
  title: string;
}

const CROSSOVER_HZ = 380;

function makeVoice(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  band: "bass" | "treble",
): VoiceNodes {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  // start the two heads at a slight offset so they never phase-lock to unison.
  source.playbackRate.value = band === "bass" ? 0.82 : 1.02;

  // crossover: two cascaded biquads ≈ a Linkwitz-Riley slope of HIS signal.
  const cross1 = ctx.createBiquadFilter();
  const cross2 = ctx.createBiquadFilter();
  cross1.type = band === "bass" ? "lowpass" : "highpass";
  cross2.type = cross1.type;
  cross1.frequency.value = CROSSOVER_HZ;
  cross2.frequency.value = CROSSOVER_HZ;
  cross1.Q.value = 0.707;
  cross2.Q.value = 0.707;

  // per-voice tone lowpass, swept by that hand's openness.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = band === "bass" ? 520 : 4200;
  tone.Q.value = 0.4;

  const dry = ctx.createGain();
  dry.gain.value = band === "bass" ? 0.5 : 0.42;

  // per-voice space: a feedback delay of HIS OWN filtered signal.
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = band === "bass" ? 0.42 : 0.29;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.36;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;

  source.connect(cross1);
  cross1.connect(cross2);
  cross2.connect(tone);
  tone.connect(dry);
  dry.connect(master.input);

  tone.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay); // feedback loop of his own band-split signal
  delay.connect(wet);
  wet.connect(master.input);

  source.start();
  return { source, cross1, cross2, tone, dry, delay, feedback, wet };
}

function makeAudioEngine(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): AudioEngine {
  return {
    ctx,
    master,
    bass: makeVoice(ctx, master, buffer, "bass"),
    treble: makeVoice(ctx, master, buffer, "treble"),
    title,
  };
}

const BASS_RATE = { lo: 0.55, hi: 1.15 };
const TREBLE_RATE = { lo: 0.72, hi: 1.4 };

function bassRateOf(height: number): number {
  return BASS_RATE.lo + height * (BASS_RATE.hi - BASS_RATE.lo);
}
function trebleRateOf(height: number): number {
  return TREBLE_RATE.lo + height * (TREBLE_RATE.hi - TREBLE_RATE.lo);
}

// Apply the two-voice reading, everything smoothed so it feels conducted.
function applyCanon(eng: AudioEngine, s: CanonState): void {
  const now = eng.ctx.currentTime;
  const TC = 0.11;

  // ── per-hand HEIGHT → per-voice time-base. THIS is the counterpoint core. ──
  eng.bass.source.playbackRate.setTargetAtTime(bassRateOf(s.bassHeight), now, 0.14);
  eng.treble.source.playbackRate.setTargetAtTime(trebleRateOf(s.trebleHeight), now, 0.14);

  // ── per-hand OPENNESS → that voice's tone (within its own band). ──
  const bOpen = s.bassFist ? 0 : s.bassOpen;
  const tOpen = s.trebleFist ? 0 : s.trebleOpen;
  eng.bass.tone.frequency.setTargetAtTime(140 * Math.pow(1400 / 140, bOpen), now, TC);
  eng.treble.tone.frequency.setTargetAtTime(900 * Math.pow(12000 / 900, tOpen), now, TC);

  // ── DISTANCE between hands → overall dynamics + spatial wet. ──
  const sp = s.spread;
  const bassDry = (s.bassFist ? 0.16 : 0.34) + sp * 0.55;
  const trebleDry = (s.trebleFist ? 0.14 : 0.3) + sp * 0.55;
  eng.bass.dry.gain.setTargetAtTime(bassDry, now, TC);
  eng.treble.dry.gain.setTargetAtTime(trebleDry, now, TC);
  const wetG = 0.05 + sp * 0.5;
  eng.bass.wet.gain.setTargetAtTime(wetG, now, TC);
  eng.treble.wet.gain.setTargetAtTime(wetG * 0.85, now, TC);
  eng.bass.feedback.gain.setTargetAtTime(0.26 + sp * 0.24, now, TC);
  eng.treble.feedback.gain.setTargetAtTime(0.22 + sp * 0.22, now, TC);
  eng.master.setGain(0.5 + sp * 0.38);
}

function teardownVoice(v: VoiceNodes): void {
  try {
    v.source.stop();
  } catch {
    /* already stopped */
  }
  for (const n of [v.source, v.cross1, v.cross2, v.tone, v.dry, v.delay, v.feedback, v.wet]) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
}
function teardownAudio(eng: AudioEngine): void {
  teardownVoice(eng.bass);
  teardownVoice(eng.treble);
  eng.master.disconnect();
}

// ── WebGPU compute grain cloud — now TWO interleaved clouds ───────────────────
const GRAIN_COUNT = 20000; // first half = bass cloud, second half = treble cloud
const WG = 64;
const STRIDE = 6; // pos.xy, vel.xy, seed, wave

const PARAMS_WGSL = /* wgsl */ `
struct Params {
  n:u32, time:f32, dt:f32, aspect:f32,
  energy:f32, bassHeight:f32, trebleHeight:f32, spread:f32,
  bassOpen:f32, trebleOpen:f32, h0x:f32, h0y:f32,
  h1x:f32, h1y:f32, bassPresent:f32, treblePresent:f32,
  reduce:f32, present:f32, pad0:f32, pad1:f32,
}
`;

// warm chromatic ramp shared by both voices so they read as ONE instrument in
// two registers: near-black → oxblood → ember → gold → violet.
const PALETTE_WGSL = /* wgsl */ `
fn warmPalette(x: f32) -> vec3f {
  let deep    = vec3f(0.035, 0.012, 0.020);
  let oxblood = vec3f(0.420, 0.075, 0.098);
  let ember   = vec3f(0.820, 0.255, 0.090);
  let gold    = vec3f(0.985, 0.735, 0.310);
  let violet  = vec3f(0.610, 0.325, 0.870);
  let t = clamp(x, 0.0, 1.0);
  if (t < 0.25) { return mix(deep, oxblood, t / 0.25); }
  if (t < 0.5)  { return mix(oxblood, ember, (t - 0.25) / 0.25); }
  if (t < 0.75) { return mix(ember, gold, (t - 0.5) / 0.25); }
  return mix(gold, violet, (t - 0.75) / 0.25);
}
`;

const COMPUTE_WGSL = /* wgsl */ `
${PARAMS_WGSL}
struct Grain { pos: vec2f, vel: vec2f, seed: f32, wave: f32 }
@group(0) @binding(0) var<storage, read_write> grains: array<Grain>;
@group(0) @binding(1) var<uniform> P: Params;

fn hashf(p: vec2f) -> f32 {
  var q = fract(p * 0.3183099 + vec2f(0.1, 0.1));
  q *= 17.0;
  return fract(q.x * q.y * (q.x + q.y));
}
fn curl(pos: vec2f, t: f32) -> vec2f {
  let e = 0.03;
  let tp = pos + vec2f(t * 0.11, t * 0.07);
  let dy = (hashf(tp + vec2f(0.0, e)) - hashf(tp - vec2f(0.0, e))) / (2.0 * e);
  let dx = (hashf(tp + vec2f(e, 0.0)) - hashf(tp - vec2f(e, 0.0))) / (2.0 * e);
  return vec2f(-dy, dx);
}
fn handPush(pos: vec2f, hand: vec2f, spread: f32) -> vec2f {
  let d = pos - hand;
  let dl = length(d) + 1e-4;
  let rad = 0.62;
  if (dl >= rad) { return vec2f(0.0); }
  let f = 1.0 - dl / rad;
  var force = (d / dl) * f * f * (0.055 + spread * 0.09);
  force += vec2f(-d.y, d.x) / dl * f * 0.025;
  return force;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.n) { return; }
  let half = P.n / 2u;
  let isTreble = i >= half;
  var g = grains[i];
  let pos = g.pos;
  var force = vec2f(0.0);

  // pick this grain's voice: hand, its conducting height, its presence.
  let handx = select(P.h0x, P.h1x, isTreble);
  let handy = select(P.h0y, P.h1y, isTreble);
  let vheight = select(P.bassHeight, P.trebleHeight, isTreble);
  let present = select(P.bassPresent, P.treblePresent, isTreble);

  // his music breathes the whole cloud.
  force += curl(pos * 1.7 + g.seed, P.time * 0.6) * (0.018 + P.energy * 0.11);

  // gentle gather so each cloud persists as a body to be shaped.
  force += -pos * 0.011;

  // register bias: bass settles LOW, treble rises HIGH — you see the two voices
  // separate into their registers, and the counterpoint interleave between.
  let regBias = select(-0.014, 0.014, isTreble);
  force += vec2f(0.0, regBias);

  // this voice's conducting height = an upward tide (its time moving forward).
  force += vec2f(0.0, (vheight - 0.42) * 0.05 * (0.4 + P.energy * 1.6));

  // each cloud is swept by ITS OWN hand.
  if (present > 0.5) { force += handPush(pos, vec2f(handx, handy), P.spread); }

  // soft containment
  let r = length(pos) + 1e-4;
  if (r > 1.34) { force -= (pos / r) * (r - 1.34) * 0.14; }

  let motion = select(1.0, 0.5, P.reduce > 0.5);
  g.vel += force * motion;
  let maxs = (0.011 + P.energy * 0.02) * motion;
  let spd = length(g.vel);
  if (spd > maxs) { g.vel *= maxs / spd; }
  g.vel *= 0.90;
  g.pos = g.pos + g.vel;
  grains[i] = g;
}
`;

const GRAIN_WGSL = /* wgsl */ `
${PARAMS_WGSL}
${PALETTE_WGSL}
struct Grain { pos: vec2f, vel: vec2f, seed: f32, wave: f32 }
@group(0) @binding(0) var<storage, read> grains: array<Grain>;
@group(0) @binding(1) var<uniform> P: Params;
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) corner: vec2f,
  @location(1) col: vec3f,
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let g = grains[ii];
  let half = P.n / 2u;
  let isTreble = ii >= half;
  var corners = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let c = corners[vi];
  let spd = length(g.vel);
  let open = select(P.bassOpen, P.trebleOpen, isTreble);
  let sz = 0.0036 + spd * 0.32 + P.energy * 0.006 + open * 0.0022;
  var ndc = g.pos * 0.66;
  ndc.x = ndc.x / P.aspect;
  // his waveform sample is the grain's timbre; each voice sits on its OWN half
  // of the shared warm ramp — bass deep ember/oxblood, treble gold → violet.
  let vheight = select(P.bassHeight, P.trebleHeight, isTreble);
  let t = clamp(g.wave * 0.5 + P.energy * 0.45 + spd * 5.0 + vheight * 0.14, 0.0, 1.0);
  let seg = select(t * 0.46, 0.54 + t * 0.46, isTreble);
  let present = select(P.bassPresent, P.treblePresent, isTreble);
  let bright = 0.34 + P.energy * 0.9 + open * 0.3 + present * 0.15;
  let col = warmPalette(seg) * bright;
  return VO(vec4f(ndc + c * vec2f(sz / P.aspect, sz), 0.0, 1.0), c, col);
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = 1.0 - d * d;
  let a2 = a * a * 0.5;
  return vec4f(v.col * a2, a2);
}
`;

const FADE_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy, 0, 1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var<uniform> fade: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(trail, smp, uv) * fade.x;
}
`;

const DISPLAY_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy, 0, 1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var col = textureSample(trail, smp, uv).rgb;
  col = col / (1.0 + dot(col, vec3f(0.299, 0.587, 0.114)));
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(0.64)), 1.0);
}
`;

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  grainBuf: GPUBuffer;
  paramsBuf: GPUBuffer;
  fadeBuf: GPUBuffer;
  trail: [GPUTexture, GPUTexture];
  trailR: 0 | 1;
  sampler: GPUSampler;
  computePl: GPUComputePipeline;
  fadePl: GPURenderPipeline;
  grainPl: GPURenderPipeline;
  displayPl: GPURenderPipeline;
}

interface FieldParams {
  time: number;
  aspect: number;
  energy: number;
  bassHeight: number;
  trebleHeight: number;
  spread: number;
  bassOpen: number;
  trebleOpen: number;
  bassPresent: number;
  treblePresent: number;
  present: number;
  reduce: number;
  fade: number;
  h0x: number;
  h0y: number;
  h1x: number;
  h1y: number;
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

// Sample his waveform into a per-grain "voice" value (0..1) — the grains ARE
// his take made visible.
function makeWaveSamples(buffer: AudioBuffer, count: number): Float32Array {
  const data = buffer.getChannelData(0);
  const out = new Float32Array(count);
  const step = data.length / count;
  let peak = 1e-4;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(data.length, Math.floor((i + 1) * step));
    let s = 0;
    let m = 0;
    for (let j = start; j < end; j += 8) {
      s += Math.abs(data[j]);
      m++;
    }
    const v = m ? s / m : 0;
    out[i] = v;
    if (v > peak) peak = v;
  }
  for (let i = 0; i < count; i++) out[i] = Math.min(1, (out[i] / peak) * 1.3);
  return out;
}

// Seed both clouds. First half = bass (starts lower), second half = treble
// (starts higher), so they begin already in their registers.
function spawnGrains(count: number, wave: Float32Array): Float32Array {
  const rand = mulberry32(0x15824);
  const buf = new Float32Array(count * STRIDE);
  const half = count >> 1;
  for (let i = 0; i < count; i++) {
    const treble = i >= half;
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.1;
    const yBias = treble ? 0.28 : -0.28;
    buf[i * STRIDE + 0] = Math.cos(ang) * rad;
    buf[i * STRIDE + 1] = Math.sin(ang) * rad * 0.8 + yBias;
    buf[i * STRIDE + 2] = (rand() - 0.5) * 0.002;
    buf[i * STRIDE + 3] = (rand() - 0.5) * 0.002;
    buf[i * STRIDE + 4] = rand() * 10;
    buf[i * STRIDE + 5] = wave[i % wave.length];
  }
  return buf;
}

async function buildGpu(canvas: HTMLCanvasElement, wave: Float32Array): Promise<GpuState> {
  if (!navigator.gpu) throw new Error("WebGPU not supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context");
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const W = canvas.width;
  const H = canvas.height;
  const trailFmt: GPUTextureFormat = "rgba16float";
  const mkTrail = (): GPUTexture =>
    device.createTexture({
      size: [W, H],
      format: trailFmt,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const grainBuf = device.createBuffer({
    size: GRAIN_COUNT * STRIDE * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(grainBuf, 0, spawnGrains(GRAIN_COUNT, wave).buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const fadeBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });
  const grainMod = device.createShaderModule({ code: GRAIN_WGSL });
  const grainPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: grainMod, entryPoint: "vs" },
    fragment: {
      module: grainMod,
      entryPoint: "fs",
      targets: [
        {
          format: trailFmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-strip" },
  });
  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const fadePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vs" },
    fragment: { module: fadeMod, entryPoint: "fs", targets: [{ format: trailFmt }] },
    primitive: { topology: "triangle-strip" },
  });
  const dispMod = device.createShaderModule({ code: DISPLAY_WGSL });
  const displayPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: dispMod, entryPoint: "vs" },
    fragment: { module: dispMod, entryPoint: "fs", targets: [{ format: canvasFmt }] },
    primitive: { topology: "triangle-strip" },
  });

  return {
    device,
    ctx,
    grainBuf,
    paramsBuf,
    fadeBuf,
    trail: [mkTrail(), mkTrail()],
    trailR: 0,
    sampler,
    computePl,
    fadePl,
    grainPl,
    displayPl,
  };
}

function stepGpu(g: GpuState, p: FieldParams): void {
  const { device } = g;
  const buf = new Float32Array(20);
  const u = new Uint32Array(buf.buffer);
  u[0] = GRAIN_COUNT;
  buf[1] = p.time;
  buf[2] = 0.016;
  buf[3] = p.aspect;
  buf[4] = p.energy;
  buf[5] = p.bassHeight;
  buf[6] = p.trebleHeight;
  buf[7] = p.spread;
  buf[8] = p.bassOpen;
  buf[9] = p.trebleOpen;
  buf[10] = p.h0x;
  buf[11] = p.h0y;
  buf[12] = p.h1x;
  buf[13] = p.h1y;
  buf[14] = p.bassPresent;
  buf[15] = p.treblePresent;
  buf[16] = p.reduce;
  buf[17] = p.present;
  device.queue.writeBuffer(g.paramsBuf, 0, buf.buffer as ArrayBuffer);
  device.queue.writeBuffer(
    g.fadeBuf,
    0,
    new Float32Array([p.fade, 0, 0, 0]).buffer as ArrayBuffer,
  );

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  {
    const bg = device.createBindGroup({
      layout: g.computePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.grainBuf } },
        { binding: 1, resource: { buffer: g.paramsBuf } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(g.computePl);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(GRAIN_COUNT / WG));
    pass.end();
  }

  {
    const fadeBg = device.createBindGroup({
      layout: g.fadePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: g.sampler },
        { binding: 1, resource: g.trail[trR].createView() },
        { binding: 2, resource: { buffer: g.fadeBuf } },
      ],
    });
    const grainBg = device.createBindGroup({
      layout: g.grainPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.grainBuf } },
        { binding: 1, resource: { buffer: g.paramsBuf } },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: g.trail[trW].createView(),
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(g.fadePl);
    pass.setBindGroup(0, fadeBg);
    pass.draw(4);
    pass.setPipeline(g.grainPl);
    pass.setBindGroup(0, grainBg);
    pass.draw(4, GRAIN_COUNT);
    pass.end();
  }

  {
    const bg = device.createBindGroup({
      layout: g.displayPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: g.sampler },
        { binding: 1, resource: g.trail[trW].createView() },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: g.ctx.getCurrentTexture().createView(),
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(g.displayPl);
    pass.setBindGroup(0, bg);
    pass.draw(4);
    pass.end();
  }

  device.queue.submit([enc.finish()]);
  g.trailR = trW;
}

function destroyGpu(g: GpuState): void {
  try {
    g.grainBuf.destroy();
    g.paramsBuf.destroy();
    g.fadeBuf.destroy();
    g.trail[0].destroy();
    g.trail[1].destroy();
    g.device.destroy();
  } catch {
    /* already gone */
  }
}

// ── Canvas2D fallback — the identical two-cloud model at a lower grain count ───
const FALLBACK_COUNT = 1800; // half bass, half treble
interface FallbackState {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  seed: Float32Array;
  wave: Float32Array;
}
function createFallback(wave: Float32Array): FallbackState {
  const rand = mulberry32(0x15824);
  const st: FallbackState = {
    x: new Float32Array(FALLBACK_COUNT),
    y: new Float32Array(FALLBACK_COUNT),
    vx: new Float32Array(FALLBACK_COUNT),
    vy: new Float32Array(FALLBACK_COUNT),
    seed: new Float32Array(FALLBACK_COUNT),
    wave: new Float32Array(FALLBACK_COUNT),
  };
  const half = FALLBACK_COUNT >> 1;
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const treble = i >= half;
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.1;
    st.x[i] = Math.cos(ang) * rad;
    st.y[i] = Math.sin(ang) * rad * 0.8 + (treble ? 0.28 : -0.28);
    st.seed[i] = rand() * 10;
    st.wave[i] = wave[i % wave.length];
  }
  return st;
}
function warmColorJs(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [9, 3, 5],
    [107, 19, 25],
    [209, 65, 23],
    [251, 187, 79],
    [155, 83, 222],
  ];
  const c = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(c));
  const f = c - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function stepFallback(
  ctx: CanvasRenderingContext2D,
  st: FallbackState,
  p: FieldParams,
  w: number,
  h: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(6,3,5,${p.reduce ? 0.24 : 0.16})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.42;
  const motion = p.reduce ? 0.5 : 1;
  const half = FALLBACK_COUNT >> 1;
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const treble = i >= half;
    const hx = treble ? p.h1x : p.h0x;
    const hy = treble ? p.h1y : p.h0y;
    const present = treble ? p.treblePresent : p.bassPresent;
    const vheight = treble ? p.trebleHeight : p.bassHeight;
    const open = treble ? p.trebleOpen : p.bassOpen;
    const regBias = treble ? 0.014 : -0.014;
    const px = st.x[i];
    const py = st.y[i];
    let fx = -px * 0.011;
    let fy = -py * 0.011 + regBias + (vheight - 0.42) * 0.05 * (0.4 + p.energy * 1.6);
    const n = Math.sin(px * 3.1 + st.seed[i] + p.time * 0.6) * Math.cos(py * 2.7 - p.time * 0.5);
    fx += n * (0.018 + p.energy * 0.11) * 0.5;
    fy += Math.cos(px * 2.3 - st.seed[i] + p.time * 0.4) * (0.018 + p.energy * 0.11) * 0.5;
    if (present > 0.5) {
      const dx = px - hx;
      const dy = py - hy;
      const dl = Math.hypot(dx, dy) + 1e-4;
      const rad = 0.62;
      if (dl < rad) {
        const ff = 1 - dl / rad;
        const s = (ff * ff * (0.055 + p.spread * 0.09)) / dl;
        fx += dx * s - (dy / dl) * ff * 0.025;
        fy += dy * s + (dx / dl) * ff * 0.025;
      }
    }
    const r = Math.hypot(px, py) + 1e-4;
    if (r > 1.34) {
      fx -= (px / r) * (r - 1.34) * 0.14;
      fy -= (py / r) * (r - 1.34) * 0.14;
    }
    let nvx = (st.vx[i] + fx * motion) * 0.9;
    let nvy = (st.vy[i] + fy * motion) * 0.9;
    const maxs = (0.011 + p.energy * 0.02) * motion;
    const sp = Math.hypot(nvx, nvy);
    if (sp > maxs) {
      nvx *= maxs / sp;
      nvy *= maxs / sp;
    }
    st.vx[i] = nvx;
    st.vy[i] = nvy;
    st.x[i] = px + nvx;
    st.y[i] = py + nvy;
    const tRaw = clamp01(st.wave[i] * 0.5 + p.energy * 0.45 + sp * 5 + vheight * 0.14);
    const seg = treble ? 0.54 + tRaw * 0.46 : tRaw * 0.46;
    const [rr, gg, bb] = warmColorJs(seg);
    const bright = 0.4 + p.energy * 0.9 + open * 0.3;
    const sx = cx + st.x[i] * scale;
    const sy = cy - st.y[i] * scale;
    const size = 1 + sp * 40 + p.energy * 2.4;
    ctx.fillStyle = `rgba(${Math.round(rr * bright)},${Math.round(gg * bright)},${Math.round(bb * bright)},0.5)`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── The engine that ties audio + visual + input together ─────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  audio: AudioEngine;
  analyserData: Uint8Array<ArrayBuffer>;
  gpu: GpuState | null;
  ctx2d: CanvasRenderingContext2D | null;
  fb: FallbackState | null;
  landmarker: HandLandmarkerInst | null;
  stream: MediaStream | null;
  raf: number;
  time: number;
  lastMs: number;
  energy: number;
  smooth: CanonState;
  usingPointer: boolean;
  pointer: { x: number; y: number; down: boolean; active: boolean };
  reduce: boolean;
}

type Mode = "idle" | "loading" | "running";

const DEFAULT_TRACK = REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

// voice marker colours (chrome overlay only — his registers)
const BASS_HSL = "hsl(12 82% 56%)"; // ember / oxblood
const TREBLE_HSL = "hsl(276 68% 68%)"; // gold → violet end

export default function CanonPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [driver, setDriver] = useState<"pointer" | "hands">("pointer");
  const [using2D, setUsing2D] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");

  const bassRateRef = useRef<HTMLSpanElement | null>(null);
  const trebleRateRef = useRef<HTMLSpanElement | null>(null);
  const canonRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.floor(box.clientWidth * dpr));
    canvas.height = Math.max(2, Math.floor(box.clientHeight * dpr));
  }, []);

  const drawOverlay = useCallback((eng: Engine, s: CanonState) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const toPx = (c: Vec2): [number, number] => [
      ((c.x / 1.2) * 0.5 + 0.5) * w,
      (0.5 - (c.y / 1.2) * 0.5) * h,
    ];
    const marker = (c: Vec2, colour: string, fist: boolean) => {
      const [px, py] = toPx(c);
      ctx.beginPath();
      ctx.arc(px, py, fist ? 6 : 10, 0, Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.92;
      ctx.stroke();
    };
    if (s.bassPresent) marker(s.bassCenter, BASS_HSL, s.bassFist);
    if (s.treblePresent) marker(s.trebleCenter, TREBLE_HSL, s.trebleFist);
    if (s.bassPresent && s.treblePresent) {
      const [ax, ay] = toPx(s.bassCenter);
      const [bx, by] = toPx(s.trebleCenter);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = "hsl(45 60% 60%)";
      ctx.globalAlpha = 0.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, []);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;
      eng.time += dt;

      // ── read the two-hand conducting gesture ──
      let target = REST;
      let haveHands = false;
      if (
        eng.landmarker &&
        eng.stream &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        let res: HandResult | null = null;
        try {
          res = eng.landmarker.detectForVideo(videoRef.current, nowMs);
        } catch {
          res = null;
        }
        if (res && res.landmarks && res.landmarks.length > 0) {
          target = computeCanonFromHands(res);
          haveHands = true;
          if (eng.usingPointer) {
            eng.usingPointer = false;
            setDriver("hands");
          }
        } else if (!eng.usingPointer) {
          // camera live but no hand this frame — hold, gently returning to rest.
          target = { ...eng.smooth, bassPresent: false, treblePresent: false };
          haveHands = true;
        }
      }
      if (!haveHands) {
        const p = eng.pointer;
        const sm = eng.smooth;
        if (p.active) {
          const activeTreble = p.x >= 0.5;
          const cx = (p.x * 2 - 1) * 1.05;
          const cy = ((1 - p.y) * 2 - 1) * 1.05;
          const height = clamp01(1 - p.y);
          const spread = clamp01(Math.abs(p.x - 0.5) * 2);
          const open = p.down ? 0.05 : 0.5;
          target = {
            bassPresent: true,
            treblePresent: true,
            // one pointer drives ONE voice's time-base at a time; the other
            // HOLDS its last rate — you build the canon voice by voice.
            bassHeight: activeTreble ? sm.bassHeight : height,
            trebleHeight: activeTreble ? height : sm.trebleHeight,
            bassOpen: activeTreble ? sm.bassOpen : open,
            trebleOpen: activeTreble ? open : sm.trebleOpen,
            bassFist: p.down && !activeTreble,
            trebleFist: p.down && activeTreble,
            spread,
            bassCenter: activeTreble ? REST.bassCenter : { x: cx, y: cy },
            trebleCenter: activeTreble ? { x: cx, y: cy } : REST.trebleCenter,
          };
        } else {
          target = { ...REST, bassPresent: false, treblePresent: false };
        }
      }

      // ── smooth the reading (conducting, not twitching) ──
      const k = 0.14;
      const sm = eng.smooth;
      sm.bassHeight += (target.bassHeight - sm.bassHeight) * k;
      sm.trebleHeight += (target.trebleHeight - sm.trebleHeight) * k;
      sm.bassOpen += (target.bassOpen - sm.bassOpen) * k;
      sm.trebleOpen += (target.trebleOpen - sm.trebleOpen) * k;
      sm.spread += (target.spread - sm.spread) * k;
      sm.bassCenter = {
        x: sm.bassCenter.x + (target.bassCenter.x - sm.bassCenter.x) * k,
        y: sm.bassCenter.y + (target.bassCenter.y - sm.bassCenter.y) * k,
      };
      sm.trebleCenter = {
        x: sm.trebleCenter.x + (target.trebleCenter.x - sm.trebleCenter.x) * k,
        y: sm.trebleCenter.y + (target.trebleCenter.y - sm.trebleCenter.y) * k,
      };
      sm.bassFist = target.bassFist;
      sm.trebleFist = target.trebleFist;
      sm.bassPresent = target.bassPresent;
      sm.treblePresent = target.treblePresent;

      applyCanon(eng.audio, sm);

      // ── his music's live energy drives the clouds ──
      eng.master.analyser.getByteTimeDomainData(eng.analyserData);
      let sum = 0;
      for (let i = 0; i < eng.analyserData.length; i++) {
        const v = (eng.analyserData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / eng.analyserData.length);
      eng.energy += (Math.min(1, rms * 3.2) - eng.energy) * 0.2;

      const canvas = canvasRef.current;
      const w = canvas?.width || 1;
      const h = canvas?.height || 1;
      const anyPresent = sm.bassPresent || sm.treblePresent;
      const fp: FieldParams = {
        time: eng.time,
        aspect: w / h,
        energy: eng.energy,
        bassHeight: sm.bassHeight,
        trebleHeight: sm.trebleHeight,
        spread: sm.spread,
        bassOpen: sm.bassOpen,
        trebleOpen: sm.trebleOpen,
        bassPresent: sm.bassPresent ? 1 : 0,
        treblePresent: sm.treblePresent ? 1 : 0,
        present: anyPresent ? 1 : 0,
        reduce: eng.reduce ? 1 : 0,
        fade: eng.reduce ? 0.9 : 0.93,
        h0x: sm.bassCenter.x,
        h0y: sm.bassCenter.y,
        h1x: sm.trebleCenter.x,
        h1y: sm.trebleCenter.y,
      };

      if (eng.gpu) {
        stepGpu(eng.gpu, fp);
      } else if (eng.ctx2d && eng.fb) {
        stepFallback(eng.ctx2d, eng.fb, fp, w, h);
      }

      drawOverlay(eng, sm);

      const bRate = bassRateOf(sm.bassHeight);
      const tRate = trebleRateOf(sm.trebleHeight);
      if (bassRateRef.current) bassRateRef.current.textContent = `${bRate.toFixed(2)}×`;
      if (trebleRateRef.current) trebleRateRef.current.textContent = `${tRate.toFixed(2)}×`;
      if (canonRef.current) {
        const gap = Math.abs(tRate - bRate);
        canonRef.current.textContent =
          gap < 0.08 ? "near unison" : gap < 0.3 ? "drifting apart" : "wide canon";
      }

      eng.raf = requestAnimationFrame(renderLoop);
    },
    [drawOverlay],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.landmarker) {
      try {
        eng.landmarker.close();
      } catch {
        /* ignore */
      }
    }
    teardownAudio(eng.audio);
    if (eng.gpu) destroyGpu(eng.gpu);
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
      setCamNotice("Hands unavailable — conducting with pointer.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch {
      setCamNotice("Hands unavailable — conducting with pointer.");
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    eng2.stream = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* ignore */
      }
    }
    try {
      const lm = await createHandLandmarker();
      const eng3 = engineRef.current;
      if (!eng3) {
        lm.close();
        return;
      }
      eng3.landmarker = lm;
      setShowPreview(true);
      setCamNotice(null);
    } catch {
      setCamNotice("Hands unavailable — conducting with pointer.");
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setGpuNotice(null);
    setCamNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setShowPreview(false);
    setDriver("pointer");
    setMode("loading");

    // ── audio first: it must always work, GPU or not ──
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
    const audio = makeAudioEngine(ac, master, loaded.buffer, loaded.title);

    // ── visual: WebGPU compute, else Canvas2D — never blocks audio ──
    sizeCanvas();
    const canvas = canvasRef.current;
    const wave = makeWaveSamples(loaded.buffer, GRAIN_COUNT);
    let gpu: GpuState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fb: FallbackState | null = null;
    if (canvas && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        gpu = await buildGpu(canvas, wave);
      } catch {
        gpu = null;
        setGpuNotice("WebGPU init failed — showing the Canvas2D grain fallback.");
      }
    } else {
      setGpuNotice("WebGPU unavailable here — showing the Canvas2D grain fallback.");
    }
    if (!gpu && canvas) {
      const g2 = canvas.getContext("2d");
      if (g2) {
        ctx2d = g2;
        fb = createFallback(wave);
        setUsing2D(true);
      }
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const eng: Engine = {
      ac,
      master,
      audio,
      analyserData: new Uint8Array(master.analyser.fftSize),
      gpu,
      ctx2d,
      fb,
      landmarker: null,
      stream: null,
      raf: 0,
      time: 0,
      lastMs: 0,
      energy: 0,
      smooth: {
        ...REST,
        bassCenter: { ...REST.bassCenter },
        trebleCenter: { ...REST.trebleCenter },
      },
      usingPointer: true,
      pointer: { x: 0.5, y: 0.5, down: false, active: false },
      reduce,
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
    setUsing2D(false);
    setShowPreview(false);
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
      if (eng?.ctx2d) sizeCanvas();
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

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link
          href="/dream"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← back to the dream lab
        </Link>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          15824 · canon · two-voice conducting
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Canon
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Two hands, one recording, two voices. A frequency crossover splits Karel&apos;s real
          piano take into a <span className="text-primary">bass</span> voice and a{" "}
          <span className="text-primary">treble</span> voice, each played by its own loop head.
          Your <span className="text-foreground">left hand</span> conducts the bass&apos;s time-base;
          your <span className="text-foreground">right hand</span> conducts the treble&apos;s. Move
          them independently and his take plays in counterpoint against itself — the low pad
          dragging slow while the melody pushes forward, or the reverse.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Conduct the canon"}
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
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              conducting:{" "}
              <span className="text-primary">{driver === "hands" ? "your hands" : "pointer"}</span>
            </span>
          )}
        </div>

        {!running && !loading && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap conduct — grant the camera for two-hand conducting, or conduct with the pointer
          </p>
        )}
        {audioNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>
        )}
        {running && driver === "pointer" && camNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{camNotice}</p>
        )}
        {gpuNotice && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {gpuNotice}
          </p>
        )}

        <div
          className="relative mt-5 aspect-video w-full touch-none overflow-hidden rounded-lg border border-border bg-black"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* mirrored webcam preview + voice-coloured hand markers — the video
              stays mounted so the MediaStream never detaches; hidden until live. */}
          <div
            className={`absolute right-2 top-2 h-[26%] w-[26%] overflow-hidden rounded-md border border-border bg-black/40 ${
              showPreview ? "" : "hidden"
            }`}
          >
            <video
              ref={videoRef}
              className="h-full w-full -scale-x-100 object-cover opacity-70"
              playsInline
              muted
            />
            <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" />
          </div>
          {!running && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Conduct the canon to split his take into two voices.
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Decoding his recording…
            </div>
          )}
        </div>

        {running && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                bass · left hand
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={bassRateRef}>0.82×</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                treble · right hand
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={trebleRateRef}>1.02×</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                counterpoint
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={canonRef}>drifting apart</span>
              </p>
            </div>
          </div>
        )}

        {running && using2D && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgpu absent · canvas 2d grain fallback
          </p>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: MediaPipe hand landmarks + handedness, two hands (single-pointer fallback) ·
          output: WebGPU compute grain cloud, two clouds seeded from his waveform (Canvas2D
          fallback) · audio: his real decoded take, band-split by a crossover into two loop heads,
          each transformed — per-voice playbackRate, crossover + tone filters, gain, and a
          feedback-delay of his own signal.
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Canon</span> deepens{" "}
                <span className="text-foreground">15760 · conduct</span> into two-hand{" "}
                <span className="text-foreground">polyphonic</span> conducting. One of Karel&apos;s
                real piano takes is split by a frequency <span className="text-foreground">crossover</span>{" "}
                (a Linkwitz-Riley-ish cascade around ~380&nbsp;Hz) into a bass voice — the
                low-register pad — and a treble voice — the melody. Two independent loop heads read
                the same buffer, so the split is 100% his audio, just band-separated.
              </p>
              <p>
                Each hand conducts the <span className="text-foreground">time-base</span> of one
                voice: your left hand&apos;s height drives the bass&apos;s{" "}
                <code>playbackRate</code> (<code>0.55×…1.15×</code>), your right hand&apos;s drives
                the treble&apos;s (<code>0.72×…1.4×</code>). Because the two hands move
                independently, his take plays in <span className="text-foreground">counterpoint
                against itself</span> — a canon of his own recording. Per-hand openness sweeps that
                voice&apos;s tone within its band; the distance between your hands swells the overall
                dynamics and spatial wet.
              </p>
              <p>
                Hands are assigned to voices by MediaPipe handedness when the two are labelled
                distinctly, else by screen position. The display is a mirror, so your left hand
                appears on the right of the frame; both paths agree — bass is always your left hand.
                With only one hand in view, that hand conducts both voices together.
              </p>
              <p>
                The visual is conduct&apos;s WebGPU compute-shader grain engine, now driving two
                clouds — a bass cloud on the deep ember/oxblood end of the warm ramp and a treble
                cloud on the gold&nbsp;→&nbsp;violet end, so they read as one instrument in two
                registers. Each cloud is swept by its own hand and biased toward its register, so
                you <span className="text-foreground">see</span> the counterpoint interleave. No
                WebGPU degrades to a Canvas2D two-cloud render; audio never waits on the GPU.
              </p>
              <p>
                References: <span className="text-foreground">arXiv:2604.27957</span> (conducting is
                control of time), the July-2026 real-time low-latency music source-separation cluster
                (<span className="text-foreground">arXiv:2607.12872</span> and <span className="text-foreground">
                &ldquo;Towards Practical Real-Time Low-Latency Music Source Separation&rdquo;</span>) —
                whose split we realize honestly with a browser crossover, not a neural stem model —
                and <span className="text-foreground">BachDuet</span> for the two-voices-conversing
                lineage. No camera? One pointer conducts: X picks the voice and the spread, Y is the
                height, press is a hush. Track:{" "}
                <span className="text-foreground">any in his verified catalog</span>, selectable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15824-canon", "15760-conduct", "15808-mididuet", "15152-pulse"]} />
    </main>
  );
}
