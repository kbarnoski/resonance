/// <reference types="@webgpu/types" />
"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Third Room (486) — Cycle 3 of the "Resonant Room" spine
//
// THE ONE QUESTION: Can you negotiate a tritone into rest — not by collapsing
// it, but by routing it through a THIRD room a just-fifth above that shares
// its harmonics — finding the pivot note where all three rooms momentarily agree?
//
// Core technique: THREE parallel banks of N=8 tuned resonator filters
//   Room A: reference spectrum (harmonics of played note) — panned center/−20° L
//   Room B: tritone interloper, shifted +detune (0–600 cents) — panned +35° R
//   Room C: just-fifth above A (+702 cents) — panned −35° L
//
// Room A & C share harmonics (3rd harmonic of A ≈ 2nd of C), so A+C is
// partially consonant — the bridge. The player blends C in, finds a pivot note
// where all three rooms align, then collapses the tritone.
//
// Roughness: Plomp–Levelt / Sethares dyad model over all partial pairs.
// WebGPU compute shader (WGSL) particle vorticity field, fallback Canvas2D.
//
// References:
//   Plomp & Levelt (JASA 1965) — sensory dissonance curves
//   Sethares, "Local consonance..." JASA 94(3), 1993
//   MacCallum & Einbond, CMMR 2008 — roughness in spectral composition
//   Stautner & Puckette (CMJ 1982); Jot & Chaigne (AES 1991) — FDN lineage
//   Just intonation 3:2 ratio (702 cents) — Pythagorean fifth
// ─────────────────────────────────────────────────────────────────────────────

import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const NUM_RESONATORS = 8;
const DECAY_T60_SEC = 5.5;
const NOTE_A4 = 440;
const TRITONE_CENTS = 600;
const FIFTH_CENTS = 702; // just fifth, 3:2 ratio

// Plomp-Levelt roughness model constants
const PL_B1 = 3.5;
const PL_B2 = 5.75;

// QWERTY chromatic map
const QWERTY_KEYS: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69,
  u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ";": 76,
};

// On-screen keyboard: 2 octaves C4–C6
const SCREEN_KEYS: Array<{ midi: number; black: boolean; label: string }> = [];
(function buildKeys() {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let i = 0; i < 25; i++) {
    const midi = 60 + i;
    const name = noteNames[midi % 12];
    SCREEN_KEYS.push({ midi, black: name.includes("#"), label: name });
  }
})();

// Demo phrase — tritone full then blend Room C in
type DemoEvent =
  | { kind: "note"; note: number; vel: number; dur: number; t: number }
  | { kind: "detune"; val: number; t: number }
  | { kind: "cblend"; val: number; t: number };

const DEMO_PHRASE: DemoEvent[] = [
  // Phase 1: tritone clash
  { kind: "note", note: 60, vel: 90, dur: 1400, t: 200 },
  { kind: "note", note: 64, vel: 80, dur: 1200, t: 600 },
  { kind: "note", note: 67, vel: 85, dur: 1400, t: 1100 },
  { kind: "note", note: 70, vel: 75, dur: 1200, t: 1800 },
  // Phase 2: blend Room C in (starts at 2.8s)
  { kind: "cblend", val: 0.3, t: 2800 },
  { kind: "note", note: 65, vel: 80, dur: 1000, t: 3200 },
  { kind: "cblend", val: 0.6, t: 3400 },
  { kind: "note", note: 62, vel: 85, dur: 1400, t: 3800 },
  { kind: "cblend", val: 0.85, t: 4200 },
  { kind: "note", note: 60, vel: 90, dur: 2000, t: 4600 },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resonator {
  freq: number;
  freqBase: number; // Hz in Room A reference
  amp: number;
  decayPerFrame: number;
  room: 0 | 1 | 2; // 0=A, 1=B, 2=C
  partial: number;
  midi: number;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface ActiveNote {
  midi: number;
  velocity: number;
  resonators: Resonator[];
}

interface EngineState {
  ctx: AudioContext;
  masterGain: GainNode;
  panA: StereoPannerNode;
  panB: StereoPannerNode;
  panC: StereoPannerNode;
  gainC: GainNode; // Room C blend 0..1
  limiter: DynamicsCompressorNode;
  activeNotes: Map<number, ActiveNote>;
  detuneCents: number;
  cBlend: number;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function midiToHz(midi: number): number {
  return NOTE_A4 * Math.pow(2, (midi - 69) / 12);
}

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

function midiNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const oct = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${oct}`;
}

// ── Roughness engine (Plomp–Levelt) ──────────────────────────────────────────

function plDyad(f1: number, a1: number, f2: number, a2: number): number {
  if (a1 < 0.001 || a2 < 0.001) return 0;
  const fMin = Math.min(f1, f2);
  if (fMin <= 0) return 0;
  const df = Math.abs(f2 - f1);
  const s = 0.24 / (0.0207 * fMin + 18.96);
  const x = s * df;
  return Math.max(0, a1 * a2 * (Math.exp(-PL_B1 * x) - Math.exp(-PL_B2 * x)));
}

function computeRoughness(partials: Array<{ f: number; a: number }>): number {
  if (partials.length < 2) return 0;
  let roughSum = 0;
  const n = partials.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      roughSum += plDyad(partials[i].f, partials[i].a, partials[j].f, partials[j].a);
    }
  }
  const norm = (n * (n - 1)) / 2;
  return Math.min(1, roughSum / (norm * 0.04 + 0.001));
}

// Predict roughness for a candidate pivot note given current state
function predictRoughness(
  candidateMidi: number,
  detuneCents: number,
  cBlend: number,
): number {
  const baseFreq = midiToHz(candidateMidi);
  const detunedRatio = centsToRatio(detuneCents);
  const fifthRatio = centsToRatio(FIFTH_CENTS);

  const partials: Array<{ f: number; a: number }> = [];
  for (let p = 1; p <= NUM_RESONATORS; p++) {
    const fBase = baseFreq * p;
    if (fBase > 18000) break;
    const ampA = 1 / p;
    const ampB = (1 / p) * 0.85;
    const ampC = (1 / p) * cBlend * 0.85;

    partials.push({ f: fBase, a: ampA });
    partials.push({ f: fBase * detunedRatio, a: ampB });
    if (cBlend > 0.01) {
      partials.push({ f: fBase * fifthRatio, a: ampC });
    }
  }
  return computeRoughness(partials);
}

// Find top-N pivot note candidates that most reduce roughness
function findPivotNotes(
  detuneCents: number,
  cBlend: number,
  topN: number = 3,
): Array<{ midi: number; roughness: number }> {
  const candidates: Array<{ midi: number; roughness: number }> = [];
  for (let midi = 48; midi <= 84; midi++) {
    const r = predictRoughness(midi, detuneCents, cBlend);
    candidates.push({ midi, roughness: r });
  }
  candidates.sort((a, b) => a.roughness - b.roughness);
  return candidates.slice(0, topN);
}

// ── Audio engine ──────────────────────────────────────────────────────────────

function createEngine(): EngineState {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "interactive" });

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.65;

  const panA = ctx.createStereoPanner();
  panA.pan.value = -0.2;
  const panB = ctx.createStereoPanner();
  panB.pan.value = 0.35;
  const panC = ctx.createStereoPanner();
  panC.pan.value = -0.35;

  // Room C blend gain (0 = off, 1 = full)
  const gainC = ctx.createGain();
  gainC.gain.value = 0;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  panA.connect(masterGain);
  panB.connect(masterGain);
  panC.connect(gainC);
  gainC.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  return {
    ctx,
    masterGain,
    panA,
    panB,
    panC,
    gainC,
    limiter,
    activeNotes: new Map(),
    detuneCents: TRITONE_CENTS,
    cBlend: 0,
  };
}

function createExcitationBurst(
  ctx: AudioContext,
  velocity: number,
  destination: AudioNode,
): void {
  const bufSize = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const velScale = velocity / 127;
  for (let i = 0; i < bufSize; i++) {
    const env = Math.exp(-i / (bufSize * 0.12));
    data[i] = (Math.random() * 2 - 1) * env * velScale;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const prefilter = ctx.createBiquadFilter();
  prefilter.type = "bandpass";
  prefilter.frequency.value = 1200;
  prefilter.Q.value = 0.7;
  src.connect(prefilter);
  prefilter.connect(destination);
  src.start();
  src.stop(ctx.currentTime + 0.05);
}

function addNote(engine: EngineState, midi: number, velocity: number): void {
  releaseNote(engine, midi);

  const baseFreq = midiToHz(midi);
  const velScale = velocity / 127;
  const detunedRatio = centsToRatio(engine.detuneCents);
  const fifthRatio = centsToRatio(FIFTH_CENTS);
  const resonators: Resonator[] = [];
  const ctx = engine.ctx;
  const decayK = Math.log(1000) / DECAY_T60_SEC;
  const decayPerFrame = Math.exp(-decayK / 60);

  for (let room = 0; room < 3; room++) {
    const pan = room === 0 ? engine.panA : room === 1 ? engine.panB : engine.panC;

    const excGain = ctx.createGain();
    excGain.gain.value = velScale * 0.8;
    createExcitationBurst(ctx, velocity, excGain);

    const roomRatio =
      room === 0 ? 1 : room === 1 ? detunedRatio : fifthRatio;

    for (let p = 1; p <= NUM_RESONATORS; p++) {
      const freqBase = baseFreq * p;
      if (freqBase > 18000) break;
      const freq = freqBase * roomRatio;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = Math.min(freq, 20000);
      filter.Q.value = 60 + p * 8;

      const gain = ctx.createGain();
      const ampScale = (1 / p) * velScale;
      // Room C slightly quieter until blended in
      const roomAmpMult = room === 2 ? 0.85 : 0.9;
      gain.gain.value = ampScale * roomAmpMult;

      excGain.connect(filter);
      filter.connect(gain);
      gain.connect(pan);

      resonators.push({
        freq,
        freqBase,
        amp: ampScale,
        decayPerFrame,
        room: room as 0 | 1 | 2,
        partial: p,
        midi,
        filter,
        gain,
      });
    }
  }

  engine.activeNotes.set(midi, { midi, velocity, resonators });
}

function releaseNote(engine: EngineState, midi: number): void {
  const note = engine.activeNotes.get(midi);
  if (!note) return;
  const ctx = engine.ctx;
  const now = ctx.currentTime;
  for (const r of note.resonators) {
    r.gain.gain.setTargetAtTime(0, now, 0.15);
    setTimeout(() => {
      try { r.filter.disconnect(); } catch { /* already gone */ }
      try { r.gain.disconnect(); } catch { /* already gone */ }
    }, 2000);
  }
  engine.activeNotes.delete(midi);
}

function applyDetune(engine: EngineState, cents: number): void {
  engine.detuneCents = cents;
  const ratio = centsToRatio(cents);
  const now = engine.ctx.currentTime;
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      if (r.room === 1) {
        const newFreq = r.freqBase * ratio;
        r.freq = newFreq;
        r.filter.frequency.setTargetAtTime(Math.min(newFreq, 20000), now, 0.02);
      }
    }
  }
}

function applyCBlend(engine: EngineState, blend: number): void {
  engine.cBlend = blend;
  engine.gainC.gain.setTargetAtTime(blend, engine.ctx.currentTime, 0.05);
}

function collectPartials(
  engine: EngineState,
): Array<{ f: number; a: number; room: 0 | 1 | 2 }> {
  const result: Array<{ f: number; a: number; room: 0 | 1 | 2 }> = [];
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      if (r.amp > 0.002) {
        // Scale Room C by blend for roughness computation
        const aEff = r.room === 2 ? r.amp * engine.cBlend : r.amp;
        if (aEff > 0.002) {
          result.push({ f: r.freq, a: aEff, room: r.room });
        }
      }
    }
  }
  return result;
}

function disposeEngine(engine: EngineState): void {
  for (const note of engine.activeNotes.values()) {
    for (const r of note.resonators) {
      try { r.filter.disconnect(); } catch { /* ignore */ }
      try { r.gain.disconnect(); } catch { /* ignore */ }
    }
  }
  engine.activeNotes.clear();
  engine.ctx.close().catch(() => { /* ignore */ });
}

// ── WebGPU support check ──────────────────────────────────────────────────────

async function checkWebGPU(): Promise<boolean> {
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await (navigator as { gpu: GPU }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// ── WebGPU Renderer ───────────────────────────────────────────────────────────

interface GPURendererState {
  kind: "gpu";
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  particleBuffers: [GPUBuffer, GPUBuffer];
  uniformBuffer: GPUBuffer;
  computeBindGroups: [GPUBindGroup, GPUBindGroup];
  renderBindGroups: [GPUBindGroup, GPUBindGroup];
  numParticles: number;
  ping: number;
  raf: number;
  time: number;
  roughness: number;
  smoothRoughness: number;
}

const COMPUTE_SHADER = /* wgsl */`
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  room: f32,
  age: f32,
  energy: f32,
  _pad: f32,
};

struct Uniforms {
  roughness: f32,
  cBlend: f32,
  detuneFrac: f32,
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<storage, read> srcBuf: array<Particle>;
@group(0) @binding(1) var<storage, read_write> dstBuf: array<Particle>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn hash(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u);
  x = x * 0x45d9f3bu;
  x = x ^ (x >> 16u);
  return f32(x & 0x00ffffffu) / f32(0x01000000u);
}

fn flowField(pos: vec2<f32>, t: f32, roughness: f32, room: f32) -> vec2<f32> {
  let w = u.width;
  let h = u.height;

  // Three attractor centers (A, B, C)
  let centerA = vec2<f32>(w * 0.5 - w * 0.15, h * 0.45);
  let centerB = vec2<f32>(w * 0.5 + w * 0.20, h * 0.45);
  let centerC = vec2<f32>(w * 0.5 - w * 0.25, h * 0.32);

  // Per-room attractor
  var myCenter = centerA;
  if (room > 1.5) { myCenter = centerC; }
  else if (room > 0.5) { myCenter = centerB; }

  let toCenter = myCenter - pos;
  let dist = length(toCenter) + 0.001;
  let attract = normalize(toCenter) * (0.12 + 0.05 / (1.0 + dist * 0.003));

  // Vorticity — higher roughness = more turbulent spin
  let perpA = vec2<f32>(-(pos.y - centerA.y), pos.x - centerA.x);
  let perpB = vec2<f32>(-(pos.y - centerB.y), pos.x - centerB.x);
  let perpC = vec2<f32>(-(pos.y - centerC.y), pos.x - centerC.x);
  let distA = length(pos - centerA) + 1.0;
  let distB = length(pos - centerB) + 1.0;
  let distC = length(pos - centerC) + 1.0;

  let vortA = normalize(perpA) * (roughness * 0.9 + 0.05) * (200.0 / distA);
  let vortB = normalize(perpB) * (roughness * 0.7 + 0.02) * (160.0 / distB) * u.detuneFrac;
  let vortC = normalize(perpC) * (1.0 - roughness) * 0.5 * (180.0 / distC) * u.cBlend;

  // Noise-like perturbation using sin/cos harmonics
  let noiseScale = roughness * 0.8 + 0.15;
  let nx = sin(pos.x * 0.015 + t * 0.7 + room * 1.3) * cos(pos.y * 0.012 + t * 0.5);
  let ny = cos(pos.x * 0.013 + t * 0.6) * sin(pos.y * 0.014 + t * 0.8 + room * 0.9);
  let noise = vec2<f32>(nx, ny) * noiseScale * 0.6;

  return attract + vortA + vortB + vortC + noise;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let count = arrayLength(&srcBuf);
  if (idx >= count) { return; }

  var p = srcBuf[idx];
  let w = u.width;
  let h = u.height;

  // Respawn dead particles
  if (p.age <= 0.0) {
    let seed = idx * 2654435761u + u32(u.time * 1000.0);
    p.pos = vec2<f32>(hash(seed) * w, hash(seed + 1u) * h);
    p.room = floor(hash(seed + 2u) * 3.0);
    p.age = 0.3 + hash(seed + 3u) * 0.7;
    p.energy = 0.4 + hash(seed + 4u) * 0.6;
    p.vel = vec2<f32>(0.0, 0.0);
    dstBuf[idx] = p;
    return;
  }

  let flow = flowField(p.pos, u.time, u.roughness, p.room);

  let damping = 0.88;
  p.vel = p.vel * damping + flow * 0.4;
  // Clamp velocity
  let spd = length(p.vel);
  if (spd > 4.0) { p.vel = p.vel * (4.0 / spd); }

  p.pos = p.pos + p.vel;

  // Wrap at boundaries with gentle fade
  if (p.pos.x < 0.0) { p.pos.x += w; }
  if (p.pos.x > w)   { p.pos.x -= w; }
  if (p.pos.y < 0.0) { p.pos.y += h; }
  if (p.pos.y > h)   { p.pos.y -= h; }

  p.age -= 0.003 + u.roughness * 0.004;

  dstBuf[idx] = p;
}
`;

const VERTEX_SHADER = /* wgsl */`
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  room: f32,
  age: f32,
  energy: f32,
  _pad: f32,
};

struct Uniforms {
  roughness: f32,
  cBlend: f32,
  detuneFrac: f32,
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;

struct VertOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) pointCoord: vec2<f32>,
};

@vertex
fn vmain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertOut {
  let p = particles[ii];
  let age = clamp(p.age, 0.0, 1.0);
  let energy = p.energy;

  // Quad corners for point sprite
  let corners = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
  );
  let corner = corners[vi];

  let size = 2.5 + energy * 3.5 * (1.0 + u.roughness * 0.6);
  let px = (p.pos.x + corner.x * size) / u.width * 2.0 - 1.0;
  let py = 1.0 - (p.pos.y + corner.y * size) / u.height * 2.0;

  // Room colors:
  //   Room A (0): violet  rgb(167,139,250)
  //   Room B (1): rose    rgb(251,113,133)
  //   Room C (2): emerald rgb(52,211,153)
  var col = vec3<f32>(0.655, 0.545, 0.980); // violet (room A)
  if (p.room > 1.5) {
    // Room C — emerald, stronger when cBlend is high
    col = mix(
      vec3<f32>(0.204, 0.827, 0.600),
      vec3<f32>(0.100, 0.980, 0.500),
      u.cBlend
    );
  } else if (p.room > 0.5) {
    // Room B — rose at high detune, shifts amber/gold when detuning decreases
    col = mix(
      vec3<f32>(0.980, 0.545, 0.200),
      vec3<f32>(0.984, 0.443, 0.522),
      u.detuneFrac
    );
  }

  // Laminar convergence: high roughness = turbulent (saturate), low = calm (desaturate)
  let lum = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(lum), col, 0.5 + u.roughness * 0.5);

  let alpha = age * energy * (0.5 + u.roughness * 0.35);

  var out: VertOut;
  out.pos = vec4<f32>(px, py, 0.0, 1.0);
  out.color = vec4<f32>(col, clamp(alpha, 0.0, 0.9));
  out.pointCoord = corner;
  return out;
}

@fragment
fn fmain(in: VertOut) -> @location(0) vec4<f32> {
  let d = length(in.pointCoord);
  let a = smoothstep(1.0, 0.2, d);
  return vec4<f32>(in.color.rgb, in.color.a * a);
}
`;

async function initGPURenderer(
  canvas: HTMLCanvasElement,
  numParticles: number,
): Promise<GPURendererState | null> {
  try {
    const nav = navigator as { gpu?: GPU };
    if (!nav.gpu) return null;
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "low-power" });
    if (!adapter) return null;
    const device = await adapter.requestDevice();

    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) return null;

    const format = nav.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });

    // Particle struct: pos(2) + vel(2) + room(1) + age(1) + energy(1) + pad(1) = 8 floats = 32 bytes
    const initData = new Float32Array(numParticles * 8);
    for (let i = 0; i < numParticles; i++) {
      const base = i * 8;
      initData[base + 0] = Math.random() * canvas.width;  // pos.x
      initData[base + 1] = Math.random() * canvas.height; // pos.y
      initData[base + 2] = 0; // vel.x
      initData[base + 3] = 0; // vel.y
      initData[base + 4] = Math.floor(Math.random() * 3); // room 0,1,2
      initData[base + 5] = Math.random();                  // age
      initData[base + 6] = 0.4 + Math.random() * 0.6;    // energy
      initData[base + 7] = 0; // pad
    }

    const makeParticleBuffer = (data: Float32Array) => device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    const bufA = makeParticleBuffer(initData);
    new Float32Array(bufA.getMappedRange()).set(initData);
    bufA.unmap();

    const bufB = device.createBuffer({
      size: initData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Uniform buffer: roughness(1) + cBlend(1) + detuneFrac(1) + time(1) + width(1) + height(1) + pad(2) = 8 floats = 32 bytes
    const uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_SHADER });
    const renderModule = device.createShaderModule({ code: VERTEX_SHADER });

    const computeBGLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    const renderBGLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      ],
    });

    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGLayout] }),
      compute: { module: computeModule, entryPoint: "main" },
    });

    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGLayout] }),
      vertex: { module: renderModule, entryPoint: "vmain" },
      fragment: {
        module: renderModule,
        entryPoint: "fmain",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });

    // Build bind groups for ping-pong
    const makeComputeBG = (src: GPUBuffer, dst: GPUBuffer) =>
      device.createBindGroup({
        layout: computeBGLayout,
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });

    const makeRenderBG = (src: GPUBuffer) =>
      device.createBindGroup({
        layout: renderBGLayout,
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: uniformBuffer } },
        ],
      });

    const particleBuffers: [GPUBuffer, GPUBuffer] = [bufA, bufB];
    const computeBindGroups: [GPUBindGroup, GPUBindGroup] = [
      makeComputeBG(bufA, bufB),
      makeComputeBG(bufB, bufA),
    ];
    const renderBindGroups: [GPUBindGroup, GPUBindGroup] = [
      makeRenderBG(bufA),
      makeRenderBG(bufB),
    ];

    return {
      kind: "gpu",
      canvas,
      device,
      context,
      format,
      computePipeline,
      renderPipeline,
      particleBuffers,
      uniformBuffer,
      computeBindGroups,
      renderBindGroups,
      numParticles,
      ping: 0,
      raf: 0,
      time: 0,
      roughness: 0,
      smoothRoughness: 0,
    };
  } catch {
    return null;
  }
}

function renderGPUFrame(
  state: GPURendererState,
  roughness: number,
  cBlend: number,
  detuneFrac: number,
): void {
  state.roughness = roughness;
  state.smoothRoughness += (roughness - state.smoothRoughness) * 0.04;
  state.time += 1 / 60;

  const { device, context, computePipeline, renderPipeline, uniformBuffer,
    computeBindGroups, renderBindGroups, numParticles, canvas } = state;

  // Update uniforms
  const uniforms = new Float32Array([
    state.smoothRoughness, cBlend, detuneFrac, state.time,
    canvas.width, canvas.height, 0, 0,
  ]);
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);

  const encoder = device.createCommandEncoder();

  // Compute pass
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, computeBindGroups[state.ping]);
  computePass.dispatchWorkgroups(Math.ceil(numParticles / 64));
  computePass.end();

  // Render pass (additive blending over dark background)
  const view = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      loadOp: "clear",
      clearValue: { r: 0.039, g: 0.020, b: 0.082, a: 1.0 }, // #0a0514
      storeOp: "store",
    }],
  });
  renderPass.setPipeline(renderPipeline);
  // Read from the OUTPUT buffer (dst of compute = ping^1)
  const renderPing = state.ping ^ 1;
  renderPass.setBindGroup(0, renderBindGroups[renderPing]);
  renderPass.draw(6, numParticles);
  renderPass.end();

  device.queue.submit([encoder.finish()]);

  state.ping ^= 1;
}

function disposeGPURenderer(state: GPURendererState): void {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  for (const buf of state.particleBuffers) {
    try { buf.destroy(); } catch { /* ignore */ }
  }
  try { state.uniformBuffer.destroy(); } catch { /* ignore */ }
  try { state.device.destroy(); } catch { /* ignore */ }
}

// ── Canvas 2D Renderer ────────────────────────────────────────────────────────

interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  room: 0 | 1 | 2;
  age: number;
  energy: number;
}

interface Canvas2DRendererState {
  kind: "canvas2d";
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  particles: Particle2D[];
  raf: number;
  time: number;
  roughness: number;
  smoothRoughness: number;
}

function init2DRenderer(canvas: HTMLCanvasElement, numParticles: number): Canvas2DRendererState {
  const ctx2d = canvas.getContext("2d")!;
  const particles: Particle2D[] = [];
  for (let i = 0; i < numParticles; i++) {
    const room = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0, vy: 0,
      room,
      age: Math.random(),
      energy: 0.4 + Math.random() * 0.6,
    });
  }
  return { kind: "canvas2d", canvas, ctx2d, particles, raf: 0, time: 0, roughness: 0, smoothRoughness: 0 };
}

function render2DFrame(
  state: Canvas2DRendererState,
  roughness: number,
  cBlend: number,
  detuneFrac: number,
): void {
  state.roughness = roughness;
  state.smoothRoughness += (roughness - state.smoothRoughness) * 0.04;
  state.time += 1 / 60;

  const { canvas, ctx2d, particles, smoothRoughness } = state;
  const w = canvas.width;
  const h = canvas.height;
  const t = state.time;

  // Background with trail
  ctx2d.fillStyle = "rgba(10, 5, 20, 0.78)";
  ctx2d.fillRect(0, 0, w, h);

  // Three attractor centers
  const centers = [
    { x: w * 0.5 - w * 0.15, y: h * 0.45 }, // A: violet
    { x: w * 0.5 + w * 0.20, y: h * 0.45 }, // B: rose
    { x: w * 0.5 - w * 0.25, y: h * 0.32 }, // C: emerald
  ];

  // Draw room connection arcs (A–C consonant bridge)
  if (cBlend > 0.05) {
    ctx2d.beginPath();
    const mx = (centers[0].x + centers[2].x) / 2;
    const my = (centers[0].y + centers[2].y) / 2 - 30;
    ctx2d.moveTo(centers[0].x, centers[0].y);
    ctx2d.quadraticCurveTo(mx, my, centers[2].x, centers[2].y);
    ctx2d.strokeStyle = `rgba(52, 211, 153, ${(cBlend * 0.35).toFixed(3)})`;
    ctx2d.lineWidth = 1.5;
    ctx2d.stroke();
  }

  // A–B tritone tension arc
  if (detuneFrac > 0.05) {
    ctx2d.beginPath();
    const mx = (centers[0].x + centers[1].x) / 2;
    const my = (centers[0].y + centers[1].y) / 2 + 30;
    ctx2d.moveTo(centers[0].x, centers[0].y);
    ctx2d.quadraticCurveTo(mx, my, centers[1].x, centers[1].y);
    ctx2d.strokeStyle = `rgba(251, 113, 133, ${(detuneFrac * smoothRoughness * 0.5).toFixed(3)})`;
    ctx2d.lineWidth = 1.5 + smoothRoughness * 2;
    ctx2d.stroke();
  }

  // Update and draw particles
  for (const p of particles) {
    // Respawn
    if (p.age <= 0) {
      const room = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      p.room = room;
      p.x = centers[room].x + (Math.random() - 0.5) * w * 0.3;
      p.y = centers[room].y + (Math.random() - 0.5) * h * 0.3;
      p.vx = 0; p.vy = 0;
      p.age = 0.4 + Math.random() * 0.6;
      p.energy = 0.4 + Math.random() * 0.6;
      continue;
    }

    const c = centers[p.room];
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const attract = 0.08 + 0.04 / (1 + dist * 0.004);

    // Vorticity based on roughness
    const perp = { x: -dy, y: dx };
    const perpLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y) + 0.001;
    const vortStrength = p.room === 0
      ? smoothRoughness * 0.7 + 0.04
      : p.room === 1
        ? (smoothRoughness * 0.6 + 0.02) * detuneFrac
        : (1 - smoothRoughness) * 0.45 * cBlend;

    const fx = dx / dist * attract + perp.x / perpLen * vortStrength * (140 / dist);
    const fy = dy / dist * attract + perp.y / perpLen * vortStrength * (140 / dist);

    // Noise
    const noise = smoothRoughness * 0.5 + 0.1;
    const nx = Math.sin(p.x * 0.015 + t * 0.7 + p.room * 1.3) * Math.cos(p.y * 0.012 + t * 0.5) * noise * 0.5;
    const ny = Math.cos(p.x * 0.013 + t * 0.6) * Math.sin(p.y * 0.014 + t * 0.8) * noise * 0.5;

    p.vx = p.vx * 0.88 + (fx + nx) * 0.4;
    p.vy = p.vy * 0.88 + (fy + ny) * 0.4;
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > 4) { p.vx *= 4 / spd; p.vy *= 4 / spd; }

    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x += w; if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;

    p.age -= 0.003 + smoothRoughness * 0.004;

    const alpha = p.age * p.energy * (0.5 + smoothRoughness * 0.35);
    if (alpha < 0.02) continue;

    const radius = 2.5 + p.energy * 3.5 * (1 + smoothRoughness * 0.6);

    let r: number, g: number, b: number;
    if (p.room === 0) { r = 167; g = 139; b = 250; }
    else if (p.room === 1) {
      r = Math.round(251 * detuneFrac + 245 * (1 - detuneFrac));
      g = Math.round(113 * detuneFrac + 158 * (1 - detuneFrac));
      b = Math.round(133 * detuneFrac + 36 * (1 - detuneFrac));
    } else {
      r = Math.round(52 + (52 * cBlend));
      g = Math.round(211 + (44 * cBlend));
      b = Math.round(153 + ((-53) * cBlend));
    }

    const grad = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${Math.min(0.9, alpha * 2).toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${(alpha * 0.8).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();
  }

  // Draw attractor glows
  const roomColors = [
    { r: 167, g: 139, b: 250, label: "Room A" },
    { r: 251, g: 113, b: 133, label: "Room B" },
    { r: 52, g: 211, b: 153, label: "Room C" },
  ];
  for (let i = 0; i < 3; i++) {
    const c = centers[i];
    const col = roomColors[i];
    const alpha = i === 2 ? cBlend * 0.4 + 0.05 : i === 1 ? detuneFrac * 0.3 + 0.05 : 0.25;
    const glowR = 18 + smoothRoughness * 12;
    const grad = ctx2d.createRadialGradient(c.x, c.y, 0, c.x, c.y, glowR);
    grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${(alpha).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
    ctx2d.beginPath();
    ctx2d.arc(c.x, c.y, glowR, 0, Math.PI * 2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();
    ctx2d.font = "bold 10px monospace";
    ctx2d.fillStyle = `rgba(${col.r},${col.g},${col.b},0.7)`;
    ctx2d.fillText(col.label, c.x - 20, c.y + glowR + 14);
  }
}

function dispose2DRenderer(state: Canvas2DRendererState): void {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
}

// ── Combined renderer type ────────────────────────────────────────────────────

type RendererState = GPURendererState | Canvas2DRendererState;

// ── Main component ────────────────────────────────────────────────────────────

export default function ThirdRoomPage() {
  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [midiStatus, setMidiStatus] = useState<"pending" | "ok" | "denied" | "unavailable">("pending");
  const [detuneCents, setDetuneCents] = useState(TRITONE_CENTS);
  const [cBlend, setCBlend] = useState(0);
  const [roughness, setRoughness] = useState(0);
  const [showDesign, setShowDesign] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
  const [pivotNotes, setPivotNotes] = useState<number[]>([]);
  const [rendererKind, setRendererKind] = useState<"gpu" | "canvas2d" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const rendererRef = useRef<RendererState | null>(null);
  const detuneCentsRef = useRef(TRITONE_CENTS);
  const cBlendRef = useRef(0);
  const activeKeysRef = useRef<Set<number>>(new Set());
  const midiRef = useRef<MIDIAccess | null>(null);
  const demoTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const demoActiveRef = useRef(false);
  const roughnessRef = useRef(0);
  const pivotFrameRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    detuneCentsRef.current = detuneCents;
    if (engineRef.current) applyDetune(engineRef.current, detuneCents);
  }, [detuneCents]);

  useEffect(() => {
    cBlendRef.current = cBlend;
    if (engineRef.current) applyCBlend(engineRef.current, cBlend);
  }, [cBlend]);

  // ── Note on/off ──────────────────────────────────────────────────────────────

  const playNote = useCallback((midi: number, velocity: number) => {
    if (!engineRef.current) return;
    addNote(engineRef.current, midi, velocity);
    setActiveKeys((prev) => new Set([...prev, midi]));
    activeKeysRef.current.add(midi);
  }, []);

  const stopNote = useCallback((midi: number) => {
    if (!engineRef.current) return;
    releaseNote(engineRef.current, midi);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
    activeKeysRef.current.delete(midi);
  }, []);

  // Cancel demo on interaction
  const cancelDemo = useCallback(() => {
    if (!demoActiveRef.current) return;
    demoActiveRef.current = false;
    for (const id of demoTimeoutsRef.current) clearTimeout(id);
    demoTimeoutsRef.current = [];
  }, []);

  // ── Demo phrase ──────────────────────────────────────────────────────────────

  const runDemo = useCallback(() => {
    demoActiveRef.current = true;
    for (const event of DEMO_PHRASE) {
      if (event.kind === "note") {
        const onId = setTimeout(() => {
          if (!demoActiveRef.current) return;
          playNote(event.note, event.vel);
        }, event.t);
        const offId = setTimeout(() => {
          if (!demoActiveRef.current) return;
          stopNote(event.note);
        }, event.t + event.dur);
        demoTimeoutsRef.current.push(onId, offId);
      } else if (event.kind === "cblend") {
        const id = setTimeout(() => {
          if (!demoActiveRef.current) return;
          setCBlend(event.val);
        }, event.t);
        demoTimeoutsRef.current.push(id);
      } else if (event.kind === "detune") {
        const id = setTimeout(() => {
          if (!demoActiveRef.current) return;
          setDetuneCents(event.val);
        }, event.t);
        demoTimeoutsRef.current.push(id);
      }
    }
  }, [playNote, stopNote]);

  // ── Start handler ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    try {
      const engine = createEngine();
      engineRef.current = engine;
    } catch {
      setAudioOk(false);
      return;
    }

    // Setup renderer
    const canvas = canvasRef.current;
    if (canvas) {
      const gpuOk = await checkWebGPU();
      if (gpuOk) {
        const gpuState = await initGPURenderer(canvas, 4000);
        if (gpuState) {
          rendererRef.current = gpuState;
          setRendererKind("gpu");
        } else {
          const state2d = init2DRenderer(canvas, 800);
          rendererRef.current = state2d;
          setRendererKind("canvas2d");
        }
      } else {
        const state2d = init2DRenderer(canvas, 800);
        rendererRef.current = state2d;
        setRendererKind("canvas2d");
      }
    }

    // MIDI
    if (navigator.requestMIDIAccess) {
      try {
        const midi = await navigator.requestMIDIAccess();
        midiRef.current = midi;
        setMidiStatus("ok");

        const handleMidiMessage = (e: MIDIMessageEvent) => {
          if (!e.data) return;
          const status = e.data[0] ?? 0;
          const note = e.data[1] ?? 0;
          const vel = e.data[2] ?? 0;
          const cmd = status & 0xf0;
          cancelDemo();
          if (cmd === 0x90 && vel > 0) playNote(note, vel);
          else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) stopNote(note);
        };

        const attachInputs = () => {
          for (const input of midi.inputs.values()) {
            input.onmidimessage = handleMidiMessage;
          }
        };
        attachInputs();
        midi.onstatechange = () => attachInputs();
      } catch {
        setMidiStatus("denied");
      }
    } else {
      setMidiStatus("unavailable");
    }

    setTimeout(runDemo, 500);
  }, [started, playNote, stopNote, runDemo, cancelDemo]);

  // ── Render loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!started) return;
    let frameCount = 0;
    let rafId = 0;

    function loop() {
      rafId = requestAnimationFrame(loop);
      const renderer = rendererRef.current;

      // Renderer may not be ready yet (async GPU init)
      if (!renderer) return;

      // Keep renderer's raf in sync for cleanup
      renderer.raf = rafId;

      frameCount++;
      const engine = engineRef.current;

      if (!engine) {
        if (renderer.kind === "canvas2d") {
          renderer.ctx2d.fillStyle = "rgb(10,5,20)";
          renderer.ctx2d.fillRect(0, 0, renderer.canvas.width, renderer.canvas.height);
        }
        return;
      }

      // Decay resonator amplitudes each frame
      for (const note of engine.activeNotes.values()) {
        for (const r of note.resonators) {
          r.amp *= r.decayPerFrame;
        }
      }

      // Compute roughness every 3 frames
      let currentRoughness = roughnessRef.current;
      if (frameCount % 3 === 0) {
        const partials = collectPartials(engine);
        const r = computeRoughness(partials.map((p) => ({ f: p.f, a: p.a })));
        roughnessRef.current = r;
        currentRoughness = r;
        setRoughness(r);
      }

      // Update pivot notes every ~18 frames (~3×/sec)
      pivotFrameRef.current++;
      if (pivotFrameRef.current % 18 === 0) {
        const pivots = findPivotNotes(detuneCentsRef.current, cBlendRef.current, 3);
        setPivotNotes(pivots.map((p) => p.midi));
      }

      const detuneFrac = detuneCentsRef.current / 600;
      const blend = cBlendRef.current;

      if (renderer.kind === "gpu") {
        renderGPUFrame(renderer, currentRoughness, blend, detuneFrac);
      } else {
        render2DFrame(renderer, currentRoughness, blend, detuneFrac);
      }
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [started]);
  // Render loop reads refs directly for low-latency state; React state
  // changes are mirrored to refs in their own effects above.

  // ── QWERTY keyboard ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!started) return;
    const pressed = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (pressed.has(key)) return;
      const midi = QWERTY_KEYS[key];
      if (midi !== undefined) {
        pressed.add(key);
        cancelDemo();
        playNote(midi, 90);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      pressed.delete(key);
      const midi = QWERTY_KEYS[key];
      if (midi !== undefined) stopNote(midi);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started, playNote, stopNote, cancelDemo]);

  // ── Canvas resize ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const demoRef = demoTimeoutsRef;
    const engRef = engineRef;
    return () => {
      demoActiveRef.current = false;
      for (const id of demoRef.current) clearTimeout(id);
      const r = rendererRef.current;
      if (r) {
        if (r.kind === "gpu") disposeGPURenderer(r);
        else dispose2DRenderer(r);
      }
      if (engRef.current) disposeEngine(engRef.current);
    };
  }, []);

  // ── Derived display ───────────────────────────────────────────────────────────

  const roughnessPct = Math.round(roughness * 100);
  const tensionLabel =
    roughness < 0.08 ? "Resolved" :
    roughness < 0.25 ? "Settling" :
    roughness < 0.5  ? "Tense" :
    roughness < 0.75 ? "Dissonant" : "Clashing";
  const tensionColor =
    roughness < 0.08 ? "text-violet-300" :
    roughness < 0.35 ? "text-violet-300" : "text-violet-300";

  const whiteKeys = SCREEN_KEYS.filter((k) => !k.black);
  const allKeys = SCREEN_KEYS;

  const detuneLabel =
    detuneCents < 10 ? "≈ Unison" :
    detuneCents > 580 ? "≈ Tritone (↑6 semitones)" :
    `${(detuneCents / 100).toFixed(1)} semitones`;

  return (
    <div className="min-h-screen bg-[#0a0514] text-foreground flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-2 flex flex-col gap-1 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-semibold">
              Third Room
            </h1>
            <p className="text-sm text-violet-300/80 mt-0.5 font-mono tracking-wide">
              Resonant Room — Cycle 3 / 486
            </p>
          </div>
          {rendererKind && (
            <span className={`text-xs font-mono px-2 py-1 rounded border ${
              rendererKind === "gpu"
                ? "text-violet-300/95 border-violet-300/20 bg-violet-300/5"
                : "text-muted-foreground border-border"
            }`}>
              {rendererKind === "gpu" ? "WebGPU" : "Canvas2D"}
            </span>
          )}
        </div>
        <p className="text-base text-foreground mt-1 max-w-prose">
          Negotiate a tritone into rest — not by collapsing it, but by routing it
          through a <span className="text-violet-300/95 font-medium">third room a just-fifth above</span> that shares
          its harmonics. Find the pivot note where all three rooms agree.
        </p>

        {!audioOk && (
          <p className="text-violet-300 text-base font-medium mt-1">
            Web Audio API unavailable. Audio will not play.
          </p>
        )}
        {started && midiStatus === "ok" && (
          <p className="text-violet-300/95 text-sm mt-1">MIDI connected.</p>
        )}
        {started && (midiStatus === "denied" || midiStatus === "unavailable") && (
          <p className="text-muted-foreground text-sm mt-1">
            {midiStatus === "denied"
              ? "MIDI denied — use the on-screen keyboard or QWERTY keys."
              : "No MIDI detected — use the on-screen keyboard or QWERTY keys."}
          </p>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-[280px] mx-4 mt-2 rounded-xl overflow-hidden border border-border">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ background: "#0a0514" }}
        />

        {/* Start overlay */}
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/75">
            <div className="text-center max-w-xs px-4">
              <p className="text-foreground text-base mb-2">
                Three resonant rooms — a tritone interloper, a just-fifth bridge.
              </p>
              <p className="text-muted-foreground text-sm mb-5">
                Blend Room C in. Find the pivot note. Route the tritone to rest.
              </p>
              <button
                onClick={handleStart}
                className="px-6 py-3 rounded-xl text-base font-semibold text-foreground bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all min-w-[44px] min-h-[44px]"
              >
                Begin
              </button>
            </div>
          </div>
        )}

        {/* Room legend (top-right) */}
        {started && (
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400/80" />
              <span className="text-muted-foreground text-xs font-mono">Room A · reference</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-400/80" />
              <span className="text-muted-foreground text-xs font-mono">Room B · tritone +{Math.round(detuneCents)}¢</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full bg-violet-400 transition-opacity"
                style={{ opacity: 0.2 + cBlend * 0.8 }}
              />
              <span className="text-violet-300/95 text-xs font-mono">
                Room C · just 5th · blend {Math.round(cBlend * 100)}%
              </span>
            </div>
            <div className="border-t border-border pt-1 mt-0.5">
              <span className="text-muted-foreground text-[10px] font-mono">A↔C consonant · A↔B tritone</span>
            </div>
          </div>
        )}

        {/* Roughness bar (canvas top) */}
        {started && (
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-bold ${tensionColor}`}>{tensionLabel}</span>
              <span className="text-muted-foreground text-xs font-mono tabular-nums">{roughnessPct}%</span>
            </div>
            <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${roughnessPct}%`,
                  background:
                    roughness < 0.25 ? "#10b981" :
                    roughness < 0.5 ? "#f59e0b" : "#f43f5e",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 pt-4 pb-2 flex flex-col gap-4 shrink-0">
        {/* Two sliders side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Room B detune */}
          <div className="flex flex-col gap-2 rounded-xl bg-muted border border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <label className="text-foreground text-sm font-medium font-mono">
                Room B Detune
              </label>
              <span className="text-muted-foreground text-xs font-mono tabular-nums">
                {Math.round(detuneCents)} ¢
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={600}
              step={1}
              value={detuneCents}
              onChange={(e) => { cancelDemo(); setDetuneCents(Number(e.target.value)); }}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #10b981 0%, #f43f5e ${(detuneCents / 600) * 100}%)`,
              }}
              disabled={!started}
            />
            <div className="flex justify-between text-xs text-muted-foreground/70 font-mono">
              <span>Unison</span>
              <span className="text-muted-foreground">{detuneLabel}</span>
              <span>Tritone</span>
            </div>
          </div>

          {/* Room C blend */}
          <div className="flex flex-col gap-2 rounded-xl bg-muted border border-violet-300/15 px-4 py-3">
            <div className="flex items-center justify-between">
              <label className="text-violet-300/95 text-sm font-medium font-mono">
                Room C Blend
              </label>
              <span className="text-muted-foreground text-xs font-mono tabular-nums">
                {Math.round(cBlend * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cBlend}
              onChange={(e) => { cancelDemo(); setCBlend(Number(e.target.value)); }}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, rgba(52,211,153,0.2) 0%, #10b981 ${cBlend * 100}%)`,
              }}
              disabled={!started}
            />
            <div className="flex justify-between text-xs text-muted-foreground/70 font-mono">
              <span>Off</span>
              <span className="text-violet-300/80">Just fifth bridge</span>
              <span>Full</span>
            </div>
          </div>
        </div>

        {/* Tension readout */}
        <div className="flex items-center gap-4 rounded-xl bg-muted px-4 py-3 border border-border">
          <div className="flex flex-col min-w-[100px]">
            <span className="text-muted-foreground text-xs font-mono">Tension / Roughness</span>
            <span className={`text-xl font-bold font-mono ${tensionColor}`}>
              {tensionLabel}
            </span>
          </div>
          <div className="flex-1">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${roughnessPct}%`,
                  background:
                    roughness < 0.25 ? "linear-gradient(to right, #10b981, #34d399)" :
                    roughness < 0.5 ? "linear-gradient(to right, #f59e0b, #fbbf24)" :
                    "linear-gradient(to right, #f43f5e, #fb7185)",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground/70 mt-1 font-mono">
              <span>Smooth</span>
              <span className="tabular-nums">{roughnessPct}%</span>
              <span>Rough</span>
            </div>
          </div>
        </div>

        {/* Pivot note suggestions */}
        {started && cBlend > 0.05 && pivotNotes.length > 0 && (
          <div className="rounded-xl bg-violet-950/40 border border-violet-300/20 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-violet-300/95 text-sm font-medium font-mono">
                ↓ Pivot suggestions
              </span>
              <span className="text-muted-foreground text-xs font-mono">
                notes that most lower total roughness
              </span>
            </div>
            <div className="flex gap-3 flex-wrap">
              {pivotNotes.map((midi) => (
                <div key={midi} className="flex flex-col items-center">
                  <span className="text-violet-300/95 text-base font-bold font-mono">
                    {midiNoteName(midi)}
                  </span>
                  <span className="text-violet-300/60 text-[10px] font-mono">
                    {predictRoughness(midi, detuneCents, cBlend) < roughness - 0.05
                      ? `↓${Math.round((roughness - predictRoughness(midi, detuneCents, cBlend)) * 100)}%`
                      : "pivot"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* On-screen keyboard */}
      <div className="px-4 pb-3 shrink-0">
        <p className="text-muted-foreground text-sm mb-2 font-mono">
          Play: keys below, QWERTY (a–;), or MIDI · pivot notes glow emerald
        </p>
        <div className="relative select-none overflow-x-auto">
          <div
            className="relative"
            style={{
              height: "84px",
              width: `${whiteKeys.length * 36}px`,
              minWidth: "100%",
            }}
          >
            {/* White keys */}
            {whiteKeys.map((k, i) => {
              const isActive = activeKeys.has(k.midi);
              const isPivot = pivotNotes.includes(k.midi);
              return (
                <button
                  key={k.midi}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    cancelDemo();
                    playNote(k.midi, 90);
                  }}
                  onPointerUp={() => stopNote(k.midi)}
                  onPointerLeave={() => stopNote(k.midi)}
                  className="absolute top-0 rounded-b-md border transition-colors"
                  style={{
                    left: `${i * 36}px`,
                    width: "34px",
                    height: "84px",
                    background: isActive
                      ? "rgb(167, 139, 250)"
                      : isPivot
                        ? "rgba(52, 211, 153, 0.85)"
                        : "rgba(255,255,255,0.92)",
                    borderColor: isPivot && !isActive ? "rgb(52,211,153)" : "rgba(255,255,255,0.2)",
                    zIndex: 1,
                    boxShadow: isPivot && !isActive
                      ? "0 0 8px rgba(52,211,153,0.5)"
                      : undefined,
                  }}
                >
                  <span
                    className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-mono"
                    style={{
                      color: isActive ? "white" : isPivot ? "white" : "#333",
                    }}
                  >
                    {isPivot && !isActive ? "↓" : k.label}
                  </span>
                </button>
              );
            })}

            {/* Black keys */}
            {(() => {
              const blacks: ReactElement[] = [];
              let whiteIdx = -1;
              for (const k of allKeys) {
                if (!k.black) { whiteIdx++; continue; }
                const isActive = activeKeys.has(k.midi);
                const isPivot = pivotNotes.includes(k.midi);
                blacks.push(
                  <button
                    key={k.midi}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      cancelDemo();
                      playNote(k.midi, 100);
                    }}
                    onPointerUp={() => stopNote(k.midi)}
                    onPointerLeave={() => stopNote(k.midi)}
                    className="absolute rounded-b-md border border-black/40 transition-colors"
                    style={{
                      left: `${whiteIdx * 36 + 23}px`,
                      width: "24px",
                      height: "52px",
                      top: 0,
                      background: isActive
                        ? "rgb(124, 58, 237)"
                        : isPivot
                          ? "rgba(52, 211, 153, 0.9)"
                          : "rgba(18,12,40,0.97)",
                      zIndex: 2,
                      boxShadow: isPivot && !isActive
                        ? "0 0 8px rgba(52,211,153,0.5)"
                        : undefined,
                    }}
                  />,
                );
              }
              return blacks;
            })()}
          </div>
        </div>
      </div>

      {/* Three-room geometry explanation */}
      {started && (
        <div className="px-5 pb-3 shrink-0">
          <div className="rounded-xl bg-muted border border-border px-4 py-3 text-sm">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-violet-300 font-mono text-sm font-bold">A</span>
                  <span className="text-muted-foreground/70">─</span>
                  <span className="text-violet-300 font-mono text-sm font-bold">B</span>
                </div>
                <span className="text-muted-foreground text-xs">tritone · clashing</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-violet-300 font-mono text-sm font-bold">A</span>
                  <span className="text-violet-300/60">─</span>
                  <span className="text-violet-300/95 font-mono text-sm font-bold">C</span>
                </div>
                <span className="text-muted-foreground text-xs">just fifth · bridge · consonant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  Blend C in → find pivot → collapse B
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How to play */}
      <div className="px-5 pb-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">How to play: </span>
        Play notes (keyboard, QWERTY, or MIDI) into all three rooms. Hear the
        tritone clash (A vs B). Raise the Room C blend — the just-fifth bridge
        introduces a consonant anchor. Watch for <span className="text-violet-300/95">emerald pivot notes</span> — notes
        where all three rooms momentarily agree. Find one, linger, then drag
        Room B detune toward unison to resolve.
      </div>

      {/* Design notes */}
      <div className="px-5 pb-6 shrink-0">
        <button
          onClick={() => setShowDesign((v) => !v)}
          className="text-violet-300 text-base underline underline-offset-2 hover:text-violet-200 transition-colors px-0 py-1 min-h-[44px] flex items-center"
        >
          {showDesign ? "Hide" : "Show"} Design Notes
        </button>
        {showDesign && (
          <div className="mt-3 rounded-xl bg-muted border border-border px-5 py-4 text-sm text-muted-foreground space-y-3 max-w-prose">
            <p className="text-foreground font-semibold text-base">
              Third Room — Design Notes
            </p>
            <p>
              <strong className="text-foreground">Cycle 3 of the Resonant Room spine.</strong>{" "}
              Cycle 2 (483) placed two rooms a tritone apart and asked the player
              to collapse them toward unison. Here the question is whether
              resolution requires collapse — or whether a{" "}
              <em>third</em> room, tuned a just fifth (702 cents, ratio 3:2) above
              Room A, can offer a consonant path through the dissonance.
            </p>
            <p>
              <strong className="text-foreground">Three rooms.</strong>{" "}
              Room A (violet, center/−20° L) holds the reference harmonic series.
              Room B (rose, +35° R) holds the same series shifted by a
              continuously variable detune (0–600 cents, default tritone).
              Room C (emerald, −35° L) is fixed at a just fifth above Room A —
              702 cents, ratio 3:2. Crucially, A and C share many harmonics:
              the 3rd partial of A (3·f₀) equals the 2nd partial of C (2·f₀·1.5),
              making A↔C partially consonant — the bridge the ear can grab.
            </p>
            <p>
              <strong className="text-foreground">Pivot note mechanic.</strong>{" "}
              A steepest-descent hint layer analytically predicts roughness across
              all candidate notes (MIDI 48–84), given the current C blend and B
              detune, without synthesizing audio. Notes that minimise total
              roughness are marked with emerald glow and a &ldquo;↓&rdquo; marker on the
              on-screen keyboard — these are the &ldquo;pivot notes&rdquo; where all three
              rooms momentarily align in their partial relationships. Resolution
              remains the player&rsquo;s act: find a pivot, linger there, then collapse
              the detune.
            </p>
            <p>
              <strong className="text-foreground">Roughness engine.</strong>{" "}
              Real-time Plomp–Levelt / Sethares dyad model: for each partial pair,{" "}
              roughness ≈ a₁·a₂·(exp(−b₁·s·Δf) − exp(−b₂·s·Δf)), where
              s = 0.24/(0.0207·f_min + 18.96). Summed over all active partial
              pairs across all three rooms. Room C amplitudes are weighted by the
              C-blend scalar, so bringing C in can either raise or lower total
              roughness depending on the note — the pivot notes are exactly those
              where C&rsquo;s harmonics pull the total down.
            </p>
            <p>
              <strong className="text-foreground">WebGPU vorticity field.</strong>{" "}
              The background is a particle simulation running in a WebGPU compute
              shader (WGSL, ping-pong storage buffers, ~4 000 particles). Each
              particle belongs to one of the three room attractors (violet A,
              rose B, emerald C). The vorticity / turbulence term is scaled by
              measured roughness: high roughness = chaotic swirl; as roughness
              falls (C blend + pivot note found) the field goes laminar. Room C
              particles spin smoothly inward when C is blended in and roughness
              drops, making the bridge audible and visible simultaneously. The
              Canvas2D fallback implements the same flow-field logic with the
              same three attractor colors.
            </p>
            <p>
              <strong className="text-foreground">Signal chain.</strong>{" "}
              N=8 high-Q biquad bandpass resonators per room per note. Note-on
              injects a 40ms filtered-noise burst. Panning: A at −20° L, B at
              +35° R, C at −35° L. Master gain → DynamicsCompressor brick-wall
              limiter (threshold −3 dB, ratio 20:1, attack 1 ms, knee 0 dB) →
              destination.
            </p>
            <p>
              <strong className="text-foreground">References.</strong>{" "}
              Plomp &amp; Levelt (JASA 1965); Sethares, &ldquo;Local consonance and the
              relationship between timbre and scale&rdquo; (JASA 94:3, 1993);
              MacCallum &amp; Einbond (CMMR 2008); Stautner &amp; Puckette (CMJ 1982);
              Jot &amp; Chaigne (AES 1991); just intonation 3:2 fifth (702 cents).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
