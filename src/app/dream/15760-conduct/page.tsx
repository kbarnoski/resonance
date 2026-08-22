"use client";

/* ── 15760 · Conduct ───────────────────────────────────────────────────────
 *
 *  ONE IDEA: you don't press play — you CONDUCT. Karel's real piano take is the
 *  orchestra; your two hands are the baton. Conducting is control of TIME, not
 *  just loudness: your conducting hand's HEIGHT drives the time-base (playback
 *  rate) of his actual recording in real time, the DISTANCE between your hands
 *  swells the dynamics + spatial wet, and HAND OPENNESS opens or muffles the
 *  timbre.
 *
 *  Reference: arXiv:2604.27957, "Real-Time Control of a Virtual Orchestra by
 *  Recognition of Conducting Gestures" (April 2026) — the load-bearing claim
 *  that a conductor drives the ensemble's TIME-BASE, not merely its volume.
 *
 *  AUDIO is pure Web Audio and is the ONLY thing you ever hear: his one decoded
 *  recording, transformed (playbackRate / lowpass / gain / a feedback-delay of
 *  his own signal). No oscillators, no synths, no generated tone anywhere.
 *
 *  VISUAL is a WebGPU compute-shader grain cloud: ~20k luminous grains sampled
 *  from his waveform, advanced + scattered on the GPU and pushed/gathered by
 *  where your hands are in the frame. If WebGPU is unavailable it degrades to a
 *  Canvas2D grain render running the identical model — audio is never blocked
 *  on the GPU. See README.md for the full writeup.
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
interface HandResult {
  landmarks: Landmark[][];
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

// ── The conducting reading, distilled from hands OR a pointer fallback ───────
interface HandCenter {
  x: number; // pos-space, mirrored (right = +x)
  y: number; // pos-space (up = +y)
}
interface ConductState {
  present: boolean;
  height: number; // 0..1 — conducting hand height (1 = raised)
  spread: number; // 0..1 — distance between the two hands
  openness: number; // 0..1 — finger spread / palm scale
  fist: boolean;
  centers: HandCenter[]; // up to 2, for the visual push
}

const REST: ConductState = {
  present: false,
  height: 0.5,
  spread: 0.35,
  openness: 0.55,
  fist: false,
  centers: [],
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

// Normalized hand landmark (0..1) → pos-space center + openness reading.
function computeHandFeatures(lm: Landmark[]): { cx: number; cy: number; open: number } {
  // hand center = MCP-of-middle-finger (landmark 9), mirrored on x.
  const cxN = 1 - lm[9].x;
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
  // pos-space: full frame maps to roughly [-1.2, 1.2]; y flips (0=top → +y).
  return {
    cx: (cxN * 2 - 1) * 1.2,
    cy: ((1 - cyN) * 2 - 1) * 1.2,
    open,
  };
}

function computeConductFromHands(hands: Landmark[][]): ConductState {
  if (!hands.length) return { ...REST, present: false };
  const feats = hands.slice(0, 2).map(computeHandFeatures);
  const centers: HandCenter[] = feats.map((f) => ({ x: f.cx, y: f.cy }));
  // conducting hand = the raised one (max pos-y).
  const topY = Math.max(...feats.map((f) => f.cy));
  const height = clamp01((topY + 1.2) / 2.4);
  const openness = feats.reduce((a, f) => a + f.open, 0) / feats.length;
  let spread = 0.32;
  if (feats.length >= 2) {
    const d = dist2(feats[0].cx, feats[0].cy, feats[1].cx, feats[1].cy);
    spread = clamp01((d - 0.25) / (2.4 - 0.25));
  } else {
    // one hand: openness stands in for how "wide" the gesture reads.
    spread = 0.2 + openness * 0.4;
  }
  const fist = openness < 0.14;
  return { present: true, height, spread, openness, fist, centers };
}

// ── Audio: his ONE decoded buffer, transformed by the conducting gesture ─────
interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode;
  mainLP: BiquadFilterNode;
  spaceLP: BiquadFilterNode;
  delay: DelayNode;
  feedback: GainNode;
  dry: GainNode;
  wet: GainNode;
  title: string;
}

function makeAudioEngine(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): AudioEngine {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // main path: his signal → lowpass (brightness) → dry gain → master
  const mainLP = ctx.createBiquadFilter();
  mainLP.type = "lowpass";
  mainLP.frequency.value = 3200;
  mainLP.Q.value = 0.4;

  const dry = ctx.createGain();
  dry.gain.value = 0.6;

  // parallel "space": his own filtered signal into a feedback delay → wet gain
  const spaceLP = ctx.createBiquadFilter();
  spaceLP.type = "lowpass";
  spaceLP.frequency.value = 2400;
  spaceLP.Q.value = 0.3;

  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.34;

  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;

  const wet = ctx.createGain();
  wet.gain.value = 0.25;

  source.connect(mainLP);
  mainLP.connect(dry);
  dry.connect(master.input);

  source.connect(spaceLP);
  spaceLP.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay); // feedback loop of HIS own signal
  delay.connect(wet);
  wet.connect(master.input);

  source.start();

  return { ctx, master, source, mainLP, spaceLP, delay, feedback, dry, wet, title };
}

// Apply a conducting reading to the audio graph, everything smoothed so it
// feels like conducting, not twitching.
function applyConduct(eng: AudioEngine, s: ConductState): void {
  const now = eng.ctx.currentTime;
  const TC = 0.11;

  // HEIGHT → time-base (playbackRate). THIS is the "conducting = time" core.
  const rate = 0.72 + s.height * (1.35 - 0.72);
  eng.source.playbackRate.setTargetAtTime(rate, now, 0.13);

  // OPENNESS → lowpass cutoff (open palm = bright; fist = intimate/muffled).
  const openEff = s.fist ? 0 : s.openness;
  const cutoff = 520 * Math.pow(12000 / 520, openEff);
  eng.mainLP.frequency.setTargetAtTime(cutoff, now, TC);
  eng.spaceLP.frequency.setTargetAtTime(Math.min(cutoff, 5000), now, TC);

  // DISTANCE BETWEEN HANDS → dynamics: mix gain swell + spatial wet amount.
  const spreadEff = s.fist ? s.spread * 0.25 : s.spread;
  const dryG = 0.22 + spreadEff * 0.72;
  const wetG = 0.05 + spreadEff * 0.6;
  const masterG = 0.5 + spreadEff * 0.4;
  eng.dry.gain.setTargetAtTime(dryG, now, TC);
  eng.wet.gain.setTargetAtTime(wetG, now, TC);
  eng.master.setGain(masterG);
  // wider hands = longer, more open echo tail
  eng.feedback.gain.setTargetAtTime(0.28 + spreadEff * 0.28, now, TC);
}

function teardownAudio(eng: AudioEngine): void {
  try {
    eng.source.stop();
  } catch {
    /* already stopped */
  }
  for (const n of [
    eng.source,
    eng.mainLP,
    eng.spaceLP,
    eng.delay,
    eng.feedback,
    eng.dry,
    eng.wet,
  ]) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  eng.master.disconnect();
}

// ── WebGPU compute grain cloud ───────────────────────────────────────────────
const GRAIN_COUNT = 20000;
const WG = 64;
const STRIDE = 6; // pos.xy, vel.xy, seed, wave

const PARAMS_WGSL = /* wgsl */ `
struct Params {
  n:u32, time:f32, dt:f32, aspect:f32,
  energy:f32, height:f32, spread:f32, openness:f32,
  h0x:f32, h0y:f32, h1x:f32, h1y:f32,
  hands:f32, reduce:f32, present:f32, pad0:f32,
}
`;

// warm chromatic: near-black → oxblood → ember → gold → violet
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
  // push the cloud away from the palm (you sculpt the grain field)…
  var force = (d / dl) * f * f * (0.055 + spread * 0.09);
  // …with a conductor's sweep swirl around the hand.
  force += vec2f(-d.y, d.x) / dl * f * 0.025;
  return force;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.n) { return; }
  var g = grains[i];
  let pos = g.pos;
  var force = vec2f(0.0);

  // his music breathes the whole cloud: energy swells the turbulence.
  force += curl(pos * 1.7 + g.seed, P.time * 0.6) * (0.018 + P.energy * 0.11);

  // gentle gather so the cloud persists as a body to be shaped.
  force += -pos * 0.011;

  // conducting height = an upward tide (time moving forward/brighter up high).
  force += vec2f(0.0, (P.height - 0.42) * 0.045 * (0.4 + P.energy * 1.6));

  // the hands push + sweep the grains.
  if (P.hands > 0.5) { force += handPush(pos, vec2f(P.h0x, P.h0y), P.spread); }
  if (P.hands > 1.5) { force += handPush(pos, vec2f(P.h1x, P.h1y), P.spread); }

  // soft containment
  let r = length(pos) + 1e-4;
  if (r > 1.32) { force -= (pos / r) * (r - 1.32) * 0.14; }

  let motion = select(1.0, 0.5, P.reduce > 0.5);
  g.vel += force * motion;
  let maxs = (0.011 + P.energy * 0.02) * motion;
  let sp = length(g.vel);
  if (sp > maxs) { g.vel *= maxs / sp; }
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
  var corners = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let c = corners[vi];
  let sp = length(g.vel);
  let sz = 0.0038 + sp * 0.32 + P.energy * 0.006 + P.openness * 0.0022;
  var ndc = g.pos * 0.66;
  ndc.x = ndc.x / P.aspect;
  // colour: his waveform sample is the grain's timbre, lifted by energy + speed.
  let t = clamp(g.wave * 0.55 + P.energy * 0.5 + sp * 5.0 + P.height * 0.12, 0.0, 1.0);
  let bright = 0.35 + P.energy * 0.9 + P.openness * 0.3 + P.present * 0.15;
  let col = warmPalette(t) * bright;
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
  height: number;
  spread: number;
  openness: number;
  hands: number;
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

function spawnGrains(count: number, wave: Float32Array): Float32Array {
  const rand = mulberry32(0x15760);
  const buf = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.15;
    buf[i * STRIDE + 0] = Math.cos(ang) * rad;
    buf[i * STRIDE + 1] = Math.sin(ang) * rad;
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
    size: 64,
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
  const buf = new Float32Array(16);
  const u = new Uint32Array(buf.buffer);
  u[0] = GRAIN_COUNT;
  buf[1] = p.time;
  buf[2] = 0.016;
  buf[3] = p.aspect;
  buf[4] = p.energy;
  buf[5] = p.height;
  buf[6] = p.spread;
  buf[7] = p.openness;
  buf[8] = p.h0x;
  buf[9] = p.h0y;
  buf[10] = p.h1x;
  buf[11] = p.h1y;
  buf[12] = p.hands;
  buf[13] = p.reduce;
  buf[14] = p.present;
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

// ── Canvas2D fallback — the identical model at a lower grain count ────────────
const FALLBACK_COUNT = 1600;
interface FallbackState {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  seed: Float32Array;
  wave: Float32Array;
}
function createFallback(wave: Float32Array): FallbackState {
  const rand = mulberry32(0x15760);
  const st: FallbackState = {
    x: new Float32Array(FALLBACK_COUNT),
    y: new Float32Array(FALLBACK_COUNT),
    vx: new Float32Array(FALLBACK_COUNT),
    vy: new Float32Array(FALLBACK_COUNT),
    seed: new Float32Array(FALLBACK_COUNT),
    wave: new Float32Array(FALLBACK_COUNT),
  };
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.15;
    st.x[i] = Math.cos(ang) * rad;
    st.y[i] = Math.sin(ang) * rad;
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
  const hands: [number, number][] = [];
  if (p.hands > 0.5) hands.push([p.h0x, p.h0y]);
  if (p.hands > 1.5) hands.push([p.h1x, p.h1y]);
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const px = st.x[i];
    const py = st.y[i];
    let fx = -px * 0.011;
    let fy = -py * 0.011 + (p.height - 0.42) * 0.045 * (0.4 + p.energy * 1.6);
    // cheap turbulence
    const n = Math.sin(px * 3.1 + st.seed[i] + p.time * 0.6) * Math.cos(py * 2.7 - p.time * 0.5);
    fx += n * (0.018 + p.energy * 0.11) * 0.5;
    fy += Math.cos(px * 2.3 - st.seed[i] + p.time * 0.4) * (0.018 + p.energy * 0.11) * 0.5;
    for (const [hx, hy] of hands) {
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
    if (r > 1.32) {
      fx -= (px / r) * (r - 1.32) * 0.14;
      fy -= (py / r) * (r - 1.32) * 0.14;
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
    const t = clamp01(st.wave[i] * 0.55 + p.energy * 0.5 + sp * 5 + p.height * 0.12);
    const [rr, gg, bb] = warmColorJs(t);
    const bright = 0.4 + p.energy * 0.9 + p.openness * 0.3;
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
  smooth: ConductState;
  usingPointer: boolean;
  pointer: { x: number; y: number; down: boolean; active: boolean };
  reduce: boolean;
}

type Mode = "idle" | "loading" | "running";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Bath")?.id ?? REAL_TRACKS[0].id;

export default function ConductPage() {
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

  const rateLabelRef = useRef<HTMLSpanElement | null>(null);
  const dynLabelRef = useRef<HTMLSpanElement | null>(null);
  const brightLabelRef = useRef<HTMLSpanElement | null>(null);

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

  const drawOverlay = useCallback((eng: Engine, s: ConductState) => {
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
    if (!s.present) return;
    // hand centers: pos-space (-1.2..1.2) → preview box.
    for (const c of s.centers) {
      const px = ((c.x / 1.2) * 0.5 + 0.5) * w;
      const py = (0.5 - (c.y / 1.2) * 0.5) * h;
      ctx.beginPath();
      ctx.arc(px, py, s.fist ? 6 : 10, 0, Math.PI * 2);
      ctx.strokeStyle = "hsl(28 90% 62%)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
    }
    if (s.centers.length >= 2) {
      const a = s.centers[0];
      const b = s.centers[1];
      ctx.beginPath();
      ctx.moveTo(((a.x / 1.2) * 0.5 + 0.5) * w, (0.5 - (a.y / 1.2) * 0.5) * h);
      ctx.lineTo(((b.x / 1.2) * 0.5 + 0.5) * w, (0.5 - (b.y / 1.2) * 0.5) * h);
      ctx.strokeStyle = "hsl(45 92% 60%)";
      ctx.globalAlpha = 0.5;
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

      // ── read the conducting gesture ──
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
          target = computeConductFromHands(res.landmarks);
          haveHands = true;
          if (eng.usingPointer) {
            eng.usingPointer = false;
            setDriver("hands");
          }
        } else if (!eng.usingPointer) {
          // camera live but no hand this frame — hold, gently returning to rest.
          target = { ...eng.smooth, present: false, centers: [] };
          haveHands = true;
        }
      }
      if (!haveHands) {
        const p = eng.pointer;
        if (p.active) {
          const cx = (p.x * 2 - 1) * 1.1;
          const cy = ((1 - p.y) * 2 - 1) * 1.1;
          target = {
            present: true,
            height: clamp01(1 - p.y),
            spread: clamp01(p.x),
            openness: p.down ? 0.05 : 0.4 + p.x * 0.5,
            fist: p.down,
            centers: [{ x: cx, y: cy }],
          };
        } else {
          target = { ...REST, present: false };
        }
      }

      // ── smooth the reading (conducting, not twitching) ──
      const k = 0.14;
      const sm = eng.smooth;
      sm.height += (target.height - sm.height) * k;
      sm.spread += (target.spread - sm.spread) * k;
      sm.openness += (target.openness - sm.openness) * k;
      sm.fist = target.fist;
      sm.present = target.present;
      sm.centers = target.centers;

      applyConduct(eng.audio, sm);

      // ── his music's live energy drives the cloud ──
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
      const c0 = sm.centers[0];
      const c1 = sm.centers[1];
      const fp: FieldParams = {
        time: eng.time,
        aspect: w / h,
        energy: eng.energy,
        height: sm.height,
        spread: sm.spread,
        openness: sm.openness,
        hands: sm.present ? sm.centers.length : 0,
        present: sm.present ? 1 : 0,
        reduce: eng.reduce ? 1 : 0,
        fade: eng.reduce ? 0.9 : 0.93,
        h0x: c0 ? c0.x : 0,
        h0y: c0 ? c0.y : 0,
        h1x: c1 ? c1.x : 0,
        h1y: c1 ? c1.y : 0,
      };

      if (eng.gpu) {
        stepGpu(eng.gpu, fp);
      } else if (eng.ctx2d && eng.fb) {
        stepFallback(eng.ctx2d, eng.fb, fp, w, h);
      }

      drawOverlay(eng, sm);

      if (rateLabelRef.current) {
        const rate = 0.72 + sm.height * (1.35 - 0.72);
        rateLabelRef.current.textContent = `${rate.toFixed(2)}×`;
      }
      if (dynLabelRef.current) {
        dynLabelRef.current.textContent =
          sm.spread > 0.66 ? "full · spacious" : sm.spread > 0.33 ? "mezzo" : "hushed · close";
      }
      if (brightLabelRef.current) {
        brightLabelRef.current.textContent = sm.fist
          ? "muffled · fist"
          : sm.openness > 0.6
            ? "bright · open"
            : "veiled";
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
      smooth: { ...REST },
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
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.pointer.down = true;
    eng.pointer.active = true;
    onPointerMove(e);
  }, [onPointerMove]);
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
          15760 · conduct · webgpu grain cloud
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Conduct
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          You don&apos;t press play — you conduct. Karel&apos;s real piano take is the
          orchestra; your two hands are the baton. Raise your conducting hand and his
          recording&apos;s time moves forward faster and brighter; spread your hands wide to
          swell the dynamics and open the room; open your palm to let the timbre bloom, close
          it to a hush.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Conduct"}
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
            tap conduct — grant the camera to use your hands, or conduct with the pointer
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
          {/* mirrored webcam preview + hand markers — the video stays mounted so
              the MediaStream never detaches; the box just hides until live. */}
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
              Press Conduct to raise the baton.
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
                time-base
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={rateLabelRef}>1.00×</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                dynamics
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={dynLabelRef}>mezzo</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                timbre
              </span>
              <p className="mt-1 text-base text-foreground">
                <span ref={brightLabelRef}>veiled</span>
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
          input: MediaPipe hand landmarks (pointer fallback) · output: WebGPU compute grain
          cloud sampled from his waveform (Canvas2D fallback) · audio: his real decoded take,
          transformed — playbackRate, lowpass, gain, and a feedback-delay of his own signal.
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
                <span className="text-foreground">Conduct</span> takes the load-bearing idea from{" "}
                <span className="text-foreground">arXiv:2604.27957</span> — &ldquo;Real-Time
                Control of a Virtual Orchestra by Recognition of Conducting Gestures&rdquo; (April
                2026): conducting is control of <span className="text-foreground">time</span>, not
                just loudness. Here the orchestra is one of Karel&apos;s real piano takes, and your
                hands are the baton.
              </p>
              <p>
                <span className="text-foreground">Conducting hand height</span> drives the
                time-base — the <code>playbackRate</code> of his actual recording, bounded to a
                musical <code>0.72×…1.35×</code>. Raise the baton and his time moves forward,
                faster and brighter; lower it and the phrase draws out. This is the dominant
                gesture.
              </p>
              <p>
                <span className="text-foreground">Distance between your two hands</span> swells the
                dynamics: the mix gain and the spatial wet (a feedback delay of his own signal)
                open up when your hands go wide, and close to something quiet and dry when they
                come together. <span className="text-foreground">Hand openness</span> — finger
                spread against palm scale — sweeps a lowpass from an intimate ~520&nbsp;Hz fist up
                to a present ~12&nbsp;kHz open palm.
              </p>
              <p>
                Every audible sound is his one decoded recording, only transformed. The visual is a
                WebGPU compute-shader grain cloud: ~20k grains are seeded from his waveform, advanced
                and scattered each frame by a compute pass, and pushed &amp; swept by where your
                hands are in the frame — you sculpt the field. With no WebGPU it degrades to a
                Canvas2D grain render running the identical model; audio never waits on the GPU.
              </p>
              <p>
                No camera? A single-pointer sensor stands in — X is the hand-spread, Y is the
                conducting height, and press-and-hold is a fist that closes the sound. Track:{" "}
                <span className="text-foreground">Welcome Home / Snowflake</span>, selectable.
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

      <PrototypeNav
        slugs={["15760-conduct", "15696-leanin", "15152-pulse", "15600-keepsake"]}
      />
    </main>
  );
}
