"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════════════
// Echo Halls — Tonnetz (1019)
//
// The harmonic rooms are laid out as a TONNETZ: the neo-Riemannian lattice of
// major/minor triads. Stepping across a lattice edge applies a P / L / R
// transformation (parallel / leading-tone-exchange / relative) — a single-
// semitone voice-leading move. The resonating BODY of each room is a live
// WebGPU-COMPUTE Gray-Scott reaction-diffusion field whose bloom modulates the
// sound. You walk smooth voice-leading paths while a Turing pattern sings.
//
// Reuses the proven scaffolding of 977-echo-room-gpu (WebGPU init, HRTF panner-
// per-source chain, MediaPipe Pose CDN import, renderer fallback, auto-demo,
// clean teardown) — copied, not imported.
// ════════════════════════════════════════════════════════════════════════════

// ── Minimal local WebGPU typings (avoid adding @webgpu/types to package.json) ──
// Careful `as any`/`unknown` casts only at the navigator.gpu boundary.
interface NavGPU {
  gpu?: {
    requestAdapter: (o?: unknown) => Promise<unknown>;
    getPreferredCanvasFormat: () => string;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// NEO-RIEMANNIAN TONNETZ HARMONY MODEL
//
// A triad is { root: pitch-class 0..11, minor: bool }. The three canonical
// neo-Riemannian transforms each hold two common tones and move one voice by a
// single semitone or whole tone — smooth voice leading:
//
//   P (Parallel)         : C major <-> C minor      (move the 3rd by 1 semitone)
//   L (Leading-tone exch): C major <-> E minor      (move the root down a semitone)
//   R (Relative)          : C major <-> A minor      (move the 5th up a whole tone)
//
// We tile the plane with a triangular Tonnetz: each grid position maps to a
// triad, and crossing to a neighbour applies exactly one of P / L / R. This is
// REAL functional/neo-Riemannian harmony, not a pentatonic no-wrong-notes scale.
// ════════════════════════════════════════════════════════════════════════════

type Transform = "P" | "L" | "R" | "I"; // I = identity (start)

interface Triad {
  root: number; // pitch class 0..11
  minor: boolean;
}

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function triadName(t: Triad): string {
  return PC_NAMES[((t.root % 12) + 12) % 12] + (t.minor ? "m" : "");
}

// The three transforms as pure functions on a triad.
function applyP(t: Triad): Triad {
  return { root: t.root, minor: !t.minor };
}
function applyR(t: Triad): Triad {
  // major C -> relative minor Am (root down a minor third);
  // minor Am -> relative major C (root up a minor third).
  return t.minor
    ? { root: (t.root + 3) % 12, minor: false }
    : { root: (t.root + 9) % 12, minor: true };
}
function applyL(t: Triad): Triad {
  // major C -> Em (leading-tone exchange: root up a major third, becomes minor);
  // minor Em -> C (root down a major third, becomes major).
  return t.minor
    ? { root: (t.root + 8) % 12, minor: false }
    : { root: (t.root + 4) % 12, minor: true };
}

function applyTransform(t: Triad, x: Transform): Triad {
  if (x === "P") return applyP(t);
  if (x === "L") return applyL(t);
  if (x === "R") return applyR(t);
  return t;
}

// The triad-tones as MIDI notes around a comfortable register (root octave ~4).
function triadMidi(t: Triad): number[] {
  const r = 48 + (((t.root % 12) + 12) % 12); // C3..B3 base
  const third = t.minor ? 3 : 4;
  return [r, r + third, r + 7]; // root, 3rd, 5th
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Hue per pitch-class around the circle of fifths so neighbouring keys are near
// in colour. Minor triads sit a touch cooler/darker.
function triadHue(t: Triad): number {
  // circle-of-fifths index
  const cof = ((t.root * 7) % 12) / 12;
  return cof; // 0..1
}

// ── Lattice geometry: the AUTHENTIC triangular Tonnetz ──────────────────────────
// The note at integer lattice coordinate (p, q) has pitch class (7p + 4q) mod 12 —
// the right axis advances by perfect fifths (+7), the up axis by major thirds (+4).
// Every triangle of three mutually adjacent notes is a triad:
//   • an "up" triangle at (p,q) — notes (p,q),(p+1,q),(p,q+1) — is a MAJOR triad
//     with root pc(p,q);
//   • a "down" triangle at (p,q) — notes (p+1,q),(p,q+1),(p+1,q+1) — is a MINOR
//     triad with root pc(p,q+1).
// Two triangles that share an EDGE differ by exactly one neo-Riemannian transform.
// For an up-triangle (p,q) the three edge-neighbours are:
//   dn(p,q)   = L      dn(p-1,q) = R      dn(p,q-1) = P
// and the down-triangle relations are the inverses. So physically stepping across
// a shared threshold applies a real P / L / R single-voice voice-leading move.
// This is verified exhaustively: every shared edge in the cell set is a genuine
// P/L/R transform of the cell's actual triad.

interface Cell {
  id: string; // "p,q,u" / "p,q,d"
  p: number;
  q: number;
  up: boolean; // true = major (up triangle), false = minor (down triangle)
  cx: number; // normalized canvas x (0..1)
  cy: number; // normalized canvas y (0..1)
  triad: Triad;
  hue: number;
}

const PW = 4; // lattice columns (p)
const QH = 3; // lattice rows (q)

function pcAt(p: number, q: number): number {
  return (((7 * p + 4 * q) % 12) + 12) % 12;
}

function triadOfCell(p: number, q: number, up: boolean): Triad {
  return up ? { root: pcAt(p, q), minor: false } : { root: pcAt(p, q + 1), minor: true };
}

function cellId(p: number, q: number, up: boolean): string {
  return `${p},${q},${up ? "u" : "d"}`;
}

// Note screen position in lattice units: x = p + q/2, y = -q (thirds go upward).
function notePos(p: number, q: number): [number, number] {
  return [p + q * 0.5, -q];
}

function buildLattice(): Cell[] {
  // First pass: compute raw centroids to find the bounding box for normalization.
  const raw: { p: number; q: number; up: boolean; rx: number; ry: number }[] = [];
  for (let q = 0; q < QH; q++) {
    for (let p = 0; p < PW; p++) {
      for (const up of [true, false]) {
        const pts = up
          ? [notePos(p, q), notePos(p + 1, q), notePos(p, q + 1)]
          : [notePos(p + 1, q), notePos(p, q + 1), notePos(p + 1, q + 1)];
        const rx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const ry = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        raw.push({ p, q, up, rx, ry });
      }
    }
  }
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (const r of raw) {
    minx = Math.min(minx, r.rx);
    maxx = Math.max(maxx, r.rx);
    miny = Math.min(miny, r.ry);
    maxy = Math.max(maxy, r.ry);
  }
  const xPad = 0.12;
  const yPad = 0.18;
  const cells: Cell[] = [];
  for (const r of raw) {
    const nx = (r.rx - minx) / (maxx - minx || 1);
    const ny = (r.ry - miny) / (maxy - miny || 1);
    const cx = xPad + nx * (1 - xPad * 2);
    const cy = yPad + ny * (1 - yPad * 2);
    const triad = triadOfCell(r.p, r.q, r.up);
    cells.push({ id: cellId(r.p, r.q, r.up), p: r.p, q: r.q, up: r.up, cx, cy, triad, hue: triadHue(triad) });
  }
  return cells;
}

function cellById(cells: Cell[], id: string): Cell | undefined {
  return cells.find((c) => c.id === id);
}

// The (up to three) edge-neighbours of a cell, each tagged with its transform.
function neighborsOf(cells: Cell[], c: Cell): { xf: Transform; cell: Cell }[] {
  const specs: { xf: Transform; p: number; q: number; up: boolean }[] = c.up
    ? [
        { xf: "L", p: c.p, q: c.q, up: false },
        { xf: "R", p: c.p - 1, q: c.q, up: false },
        { xf: "P", p: c.p, q: c.q - 1, up: false },
      ]
    : [
        { xf: "L", p: c.p, q: c.q, up: true },
        { xf: "R", p: c.p + 1, q: c.q, up: true },
        { xf: "P", p: c.p, q: c.q + 1, up: true },
      ];
  const out: { xf: Transform; cell: Cell }[] = [];
  for (const s of specs) {
    const nb = cellById(cells, cellId(s.p, s.q, s.up));
    if (nb) out.push({ xf: s.xf, cell: nb });
  }
  return out;
}

// Which transform takes triad a -> triad b (truthful label).
function transformBetween(a: Triad, b: Triad): Transform {
  for (const cand of ["P", "L", "R"] as Transform[]) {
    const t = applyTransform(a, cand);
    if (t.root === b.root && t.minor === b.minor) return cand;
  }
  return "I";
}

// Find the nearest cell to a normalized point.
function nearestCell(cells: Cell[], x: number, y: number): Cell {
  let best = cells[0];
  let bd = Infinity;
  for (const c of cells) {
    const d = (c.cx - x) ** 2 + (c.cy - y) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

const BAR_SECONDS = 7; // loop length
const MAX_GHOSTS = 6;
const SAMPLE_HZ = 30;

// ── Types for ghosts ──────────────────────────────────────────────────────────
interface PathPoint {
  x: number;
  y: number;
  cell: string; // cell id at this sample
}

interface Ghost {
  id: number;
  path: PathPoint[];
  hue: number;
  voices: { osc: OscillatorNode; gain: GainNode }[];
  sumGain: GainNode;
  panner: PannerNode;
  filter: BiquadFilterNode;
  lastCell: string;
}

interface LiveState {
  x: number;
  y: number;
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIO ENGINE — HRTF panner-per-source, master lowpass + compressor/limiter,
// AudioListener = the performer. (Mirrors 977.)
// ════════════════════════════════════════════════════════════════════════════
class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  busGain: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  listener: AudioListener;
  // The "resonating body" partial layer driven by the RD field.
  shimmer: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  live: { voices: { osc: OscillatorNode; gain: GainNode }[]; sumGain: GainNode } | null = null;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.listener = this.ctx.listener;
    this.busGain = this.ctx.createGain();
    this.busGain.gain.value = 1;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 4800;
    this.lowpass.Q.value = 0.4;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.busGain.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  setListenerPos(x: number, y: number) {
    const lx = (x - 0.5) * 6;
    const lz = (0.5 - y) * 4;
    const t = this.ctx.currentTime;
    if (this.listener.positionX) {
      this.listener.positionX.setTargetAtTime(lx, t, 0.05);
      this.listener.positionY.setTargetAtTime(0, t, 0.05);
      this.listener.positionZ.setTargetAtTime(lz, t, 0.05);
    } else {
      (
        this.listener as unknown as { setPosition: (a: number, b: number, c: number) => void }
      ).setPosition?.(lx, 0, lz);
    }
  }

  ensureLive() {
    if (this.live) return this.live;
    const sumGain = this.ctx.createGain();
    sumGain.gain.value = 0.0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2800;
    sumGain.connect(filter);
    filter.connect(this.busGain);
    const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      const g = this.ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g);
      g.connect(sumGain);
      osc.start();
      voices.push({ osc, gain: g });
    }
    this.live = { voices, sumGain };
    return this.live;
  }

  // Set the live performer's chord (3 voices), softly glided for voice leading.
  setLiveChord(midi: number[], active: boolean) {
    const l = this.ensureLive();
    const t = this.ctx.currentTime;
    for (let i = 0; i < l.voices.length; i++) {
      const f = midiToFreq(midi[i % midi.length] + 12);
      l.voices[i].osc.frequency.setTargetAtTime(f, t, 0.08); // slow glide = audible voice leading
    }
    l.sumGain.gain.setTargetAtTime(active ? 0.16 : 0.0, t, 0.08);
  }

  // ── Resonating body: an extra partial layer modulated by the RD field. ──
  ensureShimmer() {
    if (this.shimmer) return this.shimmer;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.busGain);
    osc.start();
    this.shimmer = { osc, gain, filter };
    return this.shimmer;
  }

  // coverage 0..1 (how much of the field has bloomed), edge 0..1 (edge energy).
  // baseMidi is the current chord root to keep the shimmer in tune.
  setBody(coverage: number, edge: number, baseMidi: number) {
    const s = this.ensureShimmer();
    const t = this.ctx.currentTime;
    // shimmer tracks a high partial (2 octaves + a fifth) of the chord root.
    const f = midiToFreq(baseMidi + 31);
    s.osc.frequency.setTargetAtTime(f, t, 0.1);
    // coverage opens a partial; edge energy adds brightness via filter sweep.
    s.gain.gain.setTargetAtTime(0.02 + coverage * 0.1, t, 0.15);
    s.filter.frequency.setTargetAtTime(900 + edge * 3200 + coverage * 1500, t, 0.15);
    // the master lowpass also "breathes" with bloom — the sim is the body.
    this.lowpass.frequency.setTargetAtTime(3200 + coverage * 4000, t, 0.2);
  }

  normalize(count: number) {
    const g = count <= 0 ? 1 : 1 / Math.sqrt(count + 1);
    this.busGain.gain.setTargetAtTime(0.9 * Math.max(0.32, g), this.ctx.currentTime, 0.2);
  }

  makeGhost(id: number, hue: number): Ghost {
    const sumGain = this.ctx.createGain();
    sumGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.6;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 14;
    panner.rolloffFactor = 0.7;
    sumGain.connect(filter);
    filter.connect(panner);
    panner.connect(this.busGain);
    const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "sawtooth" : "triangle";
      const g = this.ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g);
      g.connect(sumGain);
      osc.start();
      voices.push({ osc, gain: g });
    }
    return { id, path: [], hue, voices, sumGain, panner, filter, lastCell: "" };
  }

  updateGhost(g: Ghost, midi: number[], x: number, y: number) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < g.voices.length; i++) {
      g.voices[i].osc.frequency.setTargetAtTime(midiToFreq(midi[i % midi.length]), t, 0.06);
    }
    g.sumGain.gain.setTargetAtTime(0.14, t, 0.08);
    g.filter.frequency.setTargetAtTime(1200 + y * 2200, t, 0.1);
    const px = (x - 0.5) * 6;
    const pz = (0.5 - y) * 4;
    if (g.panner.positionX) {
      g.panner.positionX.setTargetAtTime(px, t, 0.05);
      g.panner.positionY.setTargetAtTime(0, t, 0.05);
      g.panner.positionZ.setTargetAtTime(pz, t, 0.05);
    } else {
      (
        g.panner as unknown as { setPosition: (a: number, b: number, c: number) => void }
      ).setPosition?.(px, 0, pz);
    }
  }

  killGhost(g: Ghost) {
    try {
      for (const v of g.voices) v.osc.stop();
    } catch {
      /* already stopped */
    }
    for (const v of g.voices) {
      v.osc.disconnect();
      v.gain.disconnect();
    }
    g.sumGain.disconnect();
    g.filter.disconnect();
    g.panner.disconnect();
  }

  async resume() {
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    try {
      if (this.live) {
        for (const v of this.live.voices) {
          v.osc.stop();
          v.osc.disconnect();
          v.gain.disconnect();
        }
        this.live.sumGain.disconnect();
      }
      if (this.shimmer) {
        this.shimmer.osc.stop();
        this.shimmer.osc.disconnect();
        this.shimmer.filter.disconnect();
        this.shimmer.gain.disconnect();
      }
    } catch {
      /* ignore */
    }
    this.busGain.disconnect();
    this.lowpass.disconnect();
    this.comp.disconnect();
    this.master.disconnect();
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

// ════════════════════════════════════════════════════════════════════════════
// REACTION-DIFFUSION SIM — WebGPU compute (ping-pong storage buffers), with a
// WebGL2 fragment fallback and a Canvas2D/CPU last resort. The sim's coverage +
// edge-energy summary feeds the audio body.
// ════════════════════════════════════════════════════════════════════════════

interface FieldSummary {
  coverage: number;
  edge: number;
  grid: Float32Array;
  gw: number;
  gh: number;
}

interface RdSim {
  kind: "webgpu-compute" | "webgl2" | "cpu";
  size: number;
  // run `iters` steps this frame
  step: (iters: number) => void;
  // paint activator at normalized (x,y)
  splat: (x: number, y: number, radius: number) => void;
  // sample the field into a {coverage, edge, grid} summary for audio + draw
  sample: () => Promise<FieldSummary>;
  dispose: () => void;
}

// Gray-Scott params (coral-ish, blooms readily).
const GS = { dA: 1.0, dB: 0.5, feed: 0.0367, kill: 0.0649, dt: 1.0 };

// ── WebGPU COMPUTE reaction-diffusion ──────────────────────────────────────────
async function makeRdWebGPU(size: number): Promise<RdSim | null> {
  const navGpu = navigator as unknown as NavGPU;
  if (!navGpu.gpu) return null;
  let adapter: unknown;
  try {
    adapter = await navGpu.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;
  const device = (await (adapter as { requestDevice: () => Promise<unknown> }).requestDevice()) as {
    createShaderModule: (o: unknown) => unknown;
    createBuffer: (o: unknown) => unknown;
    createComputePipeline: (o: unknown) => unknown;
    createBindGroup: (o: unknown) => unknown;
    createCommandEncoder: () => unknown;
    queue: {
      writeBuffer: (
        b: unknown,
        o: number,
        d: BufferSource,
        dataOffset?: number,
        size?: number
      ) => void;
      submit: (c: unknown[]) => void;
      onSubmittedWorkDone?: () => Promise<void>;
    };
  } | null;
  if (!device) return null;
  const dev = device;

  const N = size * size;
  // GPUBufferUsage: STORAGE=0x80, COPY_SRC=0x4, COPY_DST=0x8, MAP_READ=0x1, UNIFORM=0x40
  const STORAGE = 0x80;
  const COPY_SRC = 0x4;
  const COPY_DST = 0x8;
  const MAP_READ = 0x1;
  const UNIFORM = 0x40;

  // Two state buffers of vec2<f32> (A,B) -> 2 floats per cell.
  const bytes = N * 2 * 4;
  const bufA = dev.createBuffer({ size: bytes, usage: STORAGE | COPY_DST | COPY_SRC });
  const bufB = dev.createBuffer({ size: bytes, usage: STORAGE | COPY_DST | COPY_SRC });

  // initialize A=1,B=0 everywhere
  const init = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    init[i * 2] = 1;
    init[i * 2 + 1] = 0;
  }
  dev.queue.writeBuffer(bufA, 0, init);
  dev.queue.writeBuffer(bufB, 0, init);

  // uniform: size, feed, kill, dA, dB, dt  (pad to 16-byte multiples)
  const uni = dev.createBuffer({ size: 32, usage: UNIFORM | COPY_DST });
  const uniData = new Float32Array(8);
  uniData[0] = size; // sizeF
  uniData[1] = GS.feed;
  uniData[2] = GS.kill;
  uniData[3] = GS.dA;
  uniData[4] = GS.dB;
  uniData[5] = GS.dt;
  dev.queue.writeBuffer(uni, 0, uniData);

  const stepWGSL = `
  struct Uni { sz: f32, feed: f32, kill: f32, dA: f32, dB: f32, dt: f32, _p0: f32, _p1: f32 };
  @group(0) @binding(0) var<storage, read> src: array<vec2<f32>>;
  @group(0) @binding(1) var<storage, read_write> dst: array<vec2<f32>>;
  @group(0) @binding(2) var<uniform> u: Uni;

  fn idx(x: i32, y: i32, n: i32) -> i32 {
    let xx = (x + n) % n;
    let yy = (y + n) % n;
    return yy * n + xx;
  }

  @compute @workgroup_size(8, 8)
  fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(u.sz);
    let x = i32(gid.x);
    let y = i32(gid.y);
    if (x >= n || y >= n) { return; }
    let c = src[idx(x, y, n)];
    var lap = c * -1.0;
    lap += src[idx(x+1, y,   n)] * 0.2;
    lap += src[idx(x-1, y,   n)] * 0.2;
    lap += src[idx(x,   y+1, n)] * 0.2;
    lap += src[idx(x,   y-1, n)] * 0.2;
    lap += src[idx(x+1, y+1, n)] * 0.05;
    lap += src[idx(x-1, y+1, n)] * 0.05;
    lap += src[idx(x+1, y-1, n)] * 0.05;
    lap += src[idx(x-1, y-1, n)] * 0.05;
    let a = c.x;
    let b = c.y;
    let reaction = a * b * b;
    let na = a + (u.dA * lap.x - reaction + u.feed * (1.0 - a)) * u.dt;
    let nb = b + (u.dB * lap.y + reaction - (u.kill + u.feed) * b) * u.dt;
    dst[idx(x, y, n)] = vec2<f32>(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0));
  }`;

  const stepMod = dev.createShaderModule({ code: stepWGSL });
  const pipeline = dev.createComputePipeline({
    layout: "auto",
    compute: { module: stepMod, entryPoint: "main" },
  }) as { getBindGroupLayout: (i: number) => unknown };

  function makeBind(read: unknown, write: unknown) {
    return dev.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: read } },
        { binding: 1, resource: { buffer: write } },
        { binding: 2, resource: { buffer: uni } },
      ],
    });
  }
  let bindAB = makeBind(bufA, bufB);
  let bindBA = makeBind(bufB, bufA);

  let cur = bufA; // current state lives here at frame start
  let curIsA = true;
  const wg = Math.ceil(size / 8);

  // staging buffer for readback (mappable)
  const readBuf = dev.createBuffer({ size: bytes, usage: COPY_DST | MAP_READ });
  let reading = false;
  let lastSummary: FieldSummary = { coverage: 0, edge: 0, grid: new Float32Array(0), gw: 0, gh: 0 };

  function step(iters: number) {
    const enc = dev.createCommandEncoder() as {
      beginComputePass: () => {
        setPipeline: (p: unknown) => void;
        setBindGroup: (i: number, g: unknown) => void;
        dispatchWorkgroups: (x: number, y: number) => void;
        end: () => void;
      };
      finish: () => unknown;
    };
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    for (let i = 0; i < iters; i++) {
      // ping-pong: if cur is A, run A->B with bindAB, else B->A with bindBA.
      pass.setBindGroup(0, curIsA ? bindAB : bindBA);
      pass.dispatchWorkgroups(wg, wg);
      curIsA = !curIsA;
      cur = curIsA ? bufA : bufB;
    }
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  // splat: we keep a CPU mirror of the field (re-synced from the GPU on every
  // sample()), paint a soft brush into it, and write back ONLY the affected rows
  // as contiguous spans. Writing per-row spans means an out-of-band ghost splat
  // never clobbers cells the GPU has since evolved outside the brush footprint.
  const cpuMirror = init.slice();
  function splat(nx: number, ny: number, radius: number) {
    const r = Math.max(1, Math.floor(radius * size));
    const cx = Math.floor(nx * size);
    const cy = Math.floor((1 - ny) * size);
    // clamp the brush box to the interior so each row is a single contiguous span
    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(size - 1, cx + r);
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(size - 1, cy + r);
    if (x1 < x0 || y1 < y0) return;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r;
        if (d > 1) continue;
        const i = (y * size + x) * 2;
        const brush = 1 - d;
        cpuMirror[i + 1] = Math.min(1, cpuMirror[i + 1] + brush * 0.9);
        cpuMirror[i] = Math.max(0, cpuMirror[i] - brush * 0.2);
      }
      // write just this row's affected span: vec2 per cell => 2 floats.
      const rowStartFloat = (y * size + x0) * 2;
      const spanFloats = (x1 - x0 + 1) * 2;
      dev.queue.writeBuffer(
        cur,
        rowStartFloat * 4,
        cpuMirror,
        rowStartFloat,
        spanFloats
      );
    }
  }

  async function sample() {
    if (reading) return lastSummary;
    reading = true;
    try {
      const enc = dev.createCommandEncoder() as {
        copyBufferToBuffer: (s: unknown, so: number, d: unknown, dofs: number, sz: number) => void;
        finish: () => unknown;
      };
      enc.copyBufferToBuffer(cur, 0, readBuf, 0, bytes);
      dev.queue.submit([enc.finish()]);
      const rb = readBuf as unknown as {
        mapAsync: (mode: number) => Promise<void>;
        getMappedRange: () => ArrayBuffer;
        unmap: () => void;
      };
      await rb.mapAsync(MAP_READ);
      const data = new Float32Array(rb.getMappedRange().slice(0));
      rb.unmap();
      // sync CPU mirror to GPU truth so splats build on the live field
      cpuMirror.set(data);
      const summary = summarizeField(data, size);
      lastSummary = summary;
      return summary;
    } catch {
      return lastSummary;
    } finally {
      reading = false;
    }
  }

  return {
    kind: "webgpu-compute",
    size,
    step,
    splat,
    sample,
    dispose() {
      for (const b of [bufA, bufB, uni, readBuf]) {
        try {
          (b as { destroy?: () => void }).destroy?.();
        } catch {
          /* ignore */
        }
      }
      bindAB = null;
      bindBA = null;
    },
  };
}

// Summarize a vec2 (A,B) field into coverage + edge energy + a downsampled grid.
function summarizeField(data: Float32Array, size: number): FieldSummary {
  const gw = 48;
  const gh = 48;
  const grid = new Float32Array(gw * gh);
  const stepX = size / gw;
  const stepY = size / gh;
  let covered = 0;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const sx = Math.min(size - 1, Math.floor(gx * stepX));
      const sy = Math.min(size - 1, Math.floor(gy * stepY));
      const b = data[(sy * size + sx) * 2 + 1];
      grid[gy * gw + gx] = b;
      if (b > 0.25) covered++;
    }
  }
  const coverage = covered / (gw * gh);
  // edge energy: mean absolute gradient of B on the small grid
  let edgeSum = 0;
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const c = grid[gy * gw + gx];
      const dxv = Math.abs(grid[gy * gw + gx + 1] - c);
      const dyv = Math.abs(grid[(gy + 1) * gw + gx] - c);
      edgeSum += dxv + dyv;
    }
  }
  const edge = Math.min(1, (edgeSum / (gw * gh)) * 6);
  return { coverage, edge, grid, gw, gh };
}

// ── WebGL2 fragment-shader reaction-diffusion (fallback) ────────────────────────
function makeRdWebGL2(gl: WebGL2RenderingContext, size: number): RdSim | null {
  const ext = gl.getExtension("EXT_color_buffer_float");
  if (!ext) return null;
  const QUAD = `#version 300 es
  in vec2 a_pos; out vec2 v_uv;
  void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }`;
  const SIM = `#version 300 es
  precision highp float; in vec2 v_uv; out vec4 o;
  uniform sampler2D u_state; uniform vec2 u_texel;
  uniform float u_dA,u_dB,u_f,u_k,u_dt;
  vec2 lap(vec2 uv){
    vec2 s = texture(u_state,uv).xy*-1.0;
    s+=texture(u_state,uv+vec2(u_texel.x,0)).xy*0.2;
    s+=texture(u_state,uv+vec2(-u_texel.x,0)).xy*0.2;
    s+=texture(u_state,uv+vec2(0,u_texel.y)).xy*0.2;
    s+=texture(u_state,uv+vec2(0,-u_texel.y)).xy*0.2;
    s+=texture(u_state,uv+vec2(u_texel.x,u_texel.y)).xy*0.05;
    s+=texture(u_state,uv+vec2(-u_texel.x,u_texel.y)).xy*0.05;
    s+=texture(u_state,uv+vec2(u_texel.x,-u_texel.y)).xy*0.05;
    s+=texture(u_state,uv+vec2(-u_texel.x,-u_texel.y)).xy*0.05;
    return s;
  }
  void main(){
    vec2 c=texture(u_state,v_uv).xy; float a=c.x,b=c.y; vec2 l=lap(v_uv);
    float rr=a*b*b;
    float na=a+(u_dA*l.x-rr+u_f*(1.0-a))*u_dt;
    float nb=b+(u_dB*l.y+rr-(u_k+u_f)*b)*u_dt;
    o=vec4(clamp(na,0.0,1.0),clamp(nb,0.0,1.0),0.0,1.0);
  }`;
  const SPLAT = `#version 300 es
  precision highp float; in vec2 v_uv; out vec4 o;
  uniform sampler2D u_state; uniform vec2 u_pt; uniform float u_r;
  void main(){
    vec2 c=texture(u_state,v_uv).xy; float d=length(v_uv-u_pt);
    float br=1.0-smoothstep(0.0,u_r,d);
    o=vec4(clamp(c.x-br*0.2,0.0,1.0),clamp(c.y+br*0.9,0.0,1.0),0.0,1.0);
  }`;
  function comp(type: number, src: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }
  function prog(vs: string, fs: string) {
    const v = comp(gl.VERTEX_SHADER, vs);
    const f = comp(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return p;
  }
  const simP = prog(QUAD, SIM);
  const splatP = prog(QUAD, SPLAT);
  if (!simP || !splatP) return null;
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  function target() {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }
  let read = target();
  let write = target();
  for (const t of [read, write]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  const sl = {
    texel: gl.getUniformLocation(simP, "u_texel"),
    dA: gl.getUniformLocation(simP, "u_dA"),
    dB: gl.getUniformLocation(simP, "u_dB"),
    f: gl.getUniformLocation(simP, "u_f"),
    k: gl.getUniformLocation(simP, "u_k"),
    dt: gl.getUniformLocation(simP, "u_dt"),
    state: gl.getUniformLocation(simP, "u_state"),
  };
  const pl = {
    state: gl.getUniformLocation(splatP, "u_state"),
    pt: gl.getUniformLocation(splatP, "u_pt"),
    r: gl.getUniformLocation(splatP, "u_r"),
  };
  function swap() {
    const t = read;
    read = write;
    write = t;
  }
  const readPx = new Float32Array(size * size * 4);
  let lastSummary: FieldSummary = { coverage: 0, edge: 0, grid: new Float32Array(0), gw: 0, gh: 0 };
  return {
    kind: "webgl2",
    size,
    step(iters) {
      gl.useProgram(simP);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, size, size);
      gl.uniform2f(sl.texel, 1 / size, 1 / size);
      gl.uniform1f(sl.dA, GS.dA);
      gl.uniform1f(sl.dB, GS.dB);
      gl.uniform1f(sl.f, GS.feed);
      gl.uniform1f(sl.k, GS.kill);
      gl.uniform1f(sl.dt, GS.dt);
      gl.uniform1i(sl.state, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < iters; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.bindTexture(gl.TEXTURE_2D, read.tex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        swap();
      }
    },
    splat(x, y, radius) {
      gl.useProgram(splatP);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, size, size);
      gl.uniform2f(pl.pt, x, y);
      gl.uniform1f(pl.r, radius);
      gl.uniform1i(pl.state, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      swap();
    },
    async sample() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, read.fbo);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, readPx);
      // pack into vec2-style data for the shared summarizer
      const packed = new Float32Array(size * size * 2);
      for (let i = 0; i < size * size; i++) {
        packed[i * 2] = readPx[i * 4];
        packed[i * 2 + 1] = readPx[i * 4 + 1];
      }
      lastSummary = summarizeField(packed, size);
      return lastSummary;
    },
    dispose() {
      gl.deleteProgram(simP);
      gl.deleteProgram(splatP);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      for (const t of [read, write]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    },
  };
}

// ── CPU reaction-diffusion (last resort, smaller grid) ──────────────────────────
function makeRdCpu(size: number): RdSim {
  const n = size * size;
  let a = new Float32Array(n).fill(1);
  let b = new Float32Array(n).fill(0);
  let a2 = new Float32Array(n);
  let b2 = new Float32Array(n);
  const W = [
    [0.05, 0.2, 0.05],
    [0.2, -1.0, 0.2],
    [0.05, 0.2, 0.05],
  ];
  function step(iters: number) {
    for (let it = 0; it < iters; it++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let la = 0;
          let lb = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const xx = (x + i + size) % size;
              const yy = (y + j + size) % size;
              const idx = yy * size + xx;
              const w = W[j + 1][i + 1];
              la += a[idx] * w;
              lb += b[idx] * w;
            }
          }
          const idx = y * size + x;
          const av = a[idx];
          const bv = b[idx];
          const rr = av * bv * bv;
          a2[idx] = Math.min(1, Math.max(0, av + (GS.dA * la - rr + GS.feed * (1 - av)) * GS.dt));
          b2[idx] = Math.min(1, Math.max(0, bv + (GS.dB * lb + rr - (GS.kill + GS.feed) * bv) * GS.dt));
        }
      }
      [a, a2] = [a2, a];
      [b, b2] = [b2, b];
    }
  }
  function splat(nx: number, ny: number, radius: number) {
    const r = Math.max(1, Math.floor(radius * size));
    const cx = Math.floor(nx * size);
    const cy = Math.floor((1 - ny) * size);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d > 1) continue;
        const x = ((cx + dx) % size + size) % size;
        const y = ((cy + dy) % size + size) % size;
        const idx = y * size + x;
        b[idx] = Math.min(1, b[idx] + (1 - d) * 0.9);
        a[idx] = Math.max(0, a[idx] - (1 - d) * 0.2);
      }
    }
  }
  return {
    kind: "cpu",
    size,
    step,
    splat,
    async sample() {
      const packed = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        packed[i * 2] = a[i];
        packed[i * 2 + 1] = b[i];
      }
      return summarizeField(packed, size);
    },
    dispose() {
      /* no GPU resources */
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ════════════════════════════════════════════════════════════════════════════
type InputMode = "auto" | "pointer" | "camera";

// HSL -> rgb
function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 1) * 6;
  const xc = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, xc, 0];
  else if (hp < 2) [r, g, b] = [xc, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, xc];
  else if (hp < 4) [r, g, b] = [0, xc, c];
  else if (hp < 5) [r, g, b] = [xc, 0, c];
  else [r, g, b] = [c, 0, xc];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}
function rgbStr(rgb: [number, number, number], a: number): string {
  return `rgba(${(rgb[0] * 255) | 0},${(rgb[1] * 255) | 0},${(rgb[2] * 255) | 0},${a})`;
}

export default function EchoHallsTonnetz() {
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // 2D lattice + ghosts
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null); // WebGL2 sim host (offscreen-ish)
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [rendererKind, setRendererKind] = useState<string>("…");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [armed, setArmed] = useState(false);
  const [ghostCount, setGhostCount] = useState(0);
  const [notice, setNotice] = useState<string>("");
  const [cameraState, setCameraState] = useState<"off" | "loading" | "on" | "error">("off");
  const [showNotes, setShowNotes] = useState(false);
  const [nowChord, setNowChord] = useState<string>("C");
  const [lastXform, setLastXform] = useState<string>("start");

  const engineRef = useRef<AudioEngine | null>(null);
  const simRef = useRef<RdSim | null>(null);
  const cellsRef = useRef<Cell[]>(buildLattice());
  const ghostsRef = useRef<Ghost[]>([]);
  const liveRef = useRef<LiveState>({ x: 0.5, y: 0.5 });
  const curCellRef = useRef<Cell | null>(null);
  const armedRef = useRef(false);
  const recBufRef = useRef<PathPoint[]>([]);
  const recStartRef = useRef(0);
  const rafRef = useRef(0);
  const idRef = useRef(1);
  const lastSampleRef = useRef(0);
  const phaseRef = useRef(0);
  const inputModeRef = useRef<InputMode>("auto");
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<{ close?: () => void } | null>(null);
  const autoDemoRef = useRef<{ phase: number } | null>(null);
  const simSummaryRef = useRef<FieldSummary>({ coverage: 0, edge: 0, grid: new Float32Array(0), gw: 0, gh: 0 });
  const tickChordRef = useRef("C");
  const tickXformRef = useRef("start");

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  const commitGhost = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const buf = recBufRef.current;
    if (buf.length < 4) {
      recBufRef.current = [];
      return;
    }
    const mid = buf[Math.floor(buf.length / 2)];
    const midCell = cellById(cellsRef.current, mid.cell);
    const hue = midCell ? midCell.hue : 0.5;
    const g = eng.makeGhost(idRef.current++, hue);
    g.path = buf.slice();
    ghostsRef.current.push(g);
    while (ghostsRef.current.length > MAX_GHOSTS) {
      const old = ghostsRef.current.shift();
      if (old) eng.killGhost(old);
    }
    eng.normalize(ghostsRef.current.length);
    setGhostCount(ghostsRef.current.length);
    recBufRef.current = [];
  }, []);

  const armLoop = useCallback(() => {
    if (armedRef.current) return;
    recBufRef.current = [];
    recStartRef.current = performance.now();
    setArmed(true);
  }, []);

  const clearAll = useCallback(() => {
    const eng = engineRef.current;
    if (eng) for (const g of ghostsRef.current) eng.killGhost(g);
    ghostsRef.current = [];
    if (eng) eng.normalize(0);
    setGhostCount(0);
  }, []);

  // ── draw the lattice + RD bloom + ghosts (2D overlay) ──
  const drawOverlay = useCallback(
    (live: LiveState, curCell: Cell, ghostHeads: { x: number; y: number; hue: number }[]) => {
      const cv = overlayRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const W = cv.width;
      const H = cv.height;
      const cells = cellsRef.current;

      ctx.fillStyle = "rgba(8,9,16,0.34)";
      ctx.fillRect(0, 0, W, H);

      // edges (P/L/R) between adjacent triangle cells. We draw each up-triangle's
      // three edges (to its L/R/P down-triangle neighbours) so every drawn edge is
      // a genuine transform; iterating only up-cells avoids drawing each edge twice.
      ctx.lineWidth = Math.max(1, W * 0.0018);
      for (const c of cells) {
        if (!c.up) continue;
        for (const { xf, cell: nb } of neighborsOf(cells, c)) {
          // P=violet, L=emerald, R=amber
          const col =
            xf === "P" ? "rgba(167,139,250,0.28)" : xf === "L" ? "rgba(110,231,183,0.28)" : "rgba(252,211,77,0.28)";
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.moveTo(c.cx * W, c.cy * H);
          ctx.lineTo(nb.cx * W, nb.cy * H);
          ctx.stroke();
        }
      }

      // RD bloom drawn under the active cell, using the sim grid
      const sum = simSummaryRef.current;
      if (sum.gw > 0) {
        const bloomR = Math.min(W, H) * 0.16;
        const bx = curCell.cx * W;
        const by = curCell.cy * H;
        const rgb = hsl(curCell.hue, 0.6, 0.6);
        // sample the grid as a soft splatter of dots around the active cell
        const stepN = 2;
        for (let gy = 0; gy < sum.gh; gy += stepN) {
          for (let gx = 0; gx < sum.gw; gx += stepN) {
            const b = sum.grid[gy * sum.gw + gx];
            if (b < 0.18) continue;
            const u = (gx / sum.gw - 0.5) * 2;
            const v = (gy / sum.gh - 0.5) * 2;
            const px = bx + u * bloomR;
            const py = by + v * bloomR;
            const a = Math.min(0.85, b * 1.1);
            ctx.fillStyle = rgbStr(rgb, a);
            const rad = 1 + b * (W * 0.004);
            ctx.beginPath();
            ctx.arc(px, py, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // cells (triad nodes)
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontPx = Math.max(11, W * 0.013);
      ctx.font = `${fontPx}px ui-monospace, monospace`;
      for (const c of cells) {
        const isCur = curCell && c.id === curCell.id;
        const rgb = hsl(c.hue, c.triad.minor ? 0.45 : 0.62, c.triad.minor ? 0.5 : 0.62);
        const r = isCur ? W * 0.02 : W * 0.012;
        ctx.beginPath();
        ctx.fillStyle = rgbStr(rgb, isCur ? 0.95 : 0.42);
        ctx.arc(c.cx * W, c.cy * H, r, 0, Math.PI * 2);
        ctx.fill();
        if (isCur) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = Math.max(1.5, W * 0.0022);
          ctx.stroke();
        }
        ctx.fillStyle = isCur ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.6)";
        ctx.fillText(triadName(c.triad), c.cx * W, c.cy * H - r - fontPx * 0.7);
      }

      // ghosts (heads)
      for (const gh of ghostHeads) {
        const rgb = hsl(gh.hue, 0.55, 0.6);
        const grd = ctx.createRadialGradient(gh.x * W, gh.y * H, 0, gh.x * W, gh.y * H, W * 0.04);
        grd.addColorStop(0, rgbStr(rgb, 0.7));
        grd.addColorStop(1, rgbStr(rgb, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(gh.x * W, gh.y * H, W * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }

      // live performer marker (brightest)
      const lrgb = hsl(curCell.hue, 0.7, 0.7);
      const grd = ctx.createRadialGradient(live.x * W, live.y * H, 0, live.x * W, live.y * H, W * 0.06);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.4, rgbStr(lrgb, 0.7));
      grd.addColorStop(1, rgbStr(lrgb, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(live.x * W, live.y * H, W * 0.06, 0, Math.PI * 2);
      ctx.fill();
    },
    []
  );

  // ── main loop ──
  const runLoop = useCallback(() => {
    let lastSimSample = 0;
    const tick = () => {
      const eng = engineRef.current;
      const sim = simRef.current;
      const now = performance.now();
      phaseRef.current = ((now / 1000) % BAR_SECONDS) / BAR_SECONDS;

      // auto-demo: walk a small P–L–R cycle out from C major and back. The four
      // waypoints are the C-major seed and its three single-transform neighbours,
      // so every leg of the demo is a real P / L / R move.
      if (inputModeRef.current === "auto" && autoDemoRef.current) {
        autoDemoRef.current.phase += 0.006;
        const a = autoDemoRef.current.phase;
        const cells = cellsRef.current;
        const seed = cellById(cells, cellId(0, 0, true)) ?? cells[0];
        const nbs = neighborsOf(cells, seed);
        const byXf = (x: Transform) => nbs.find((n) => n.xf === x)?.cell;
        const path = [seed, byXf("L"), seed, byXf("R"), seed, byXf("P")].filter(Boolean) as Cell[];
        if (path.length >= 2) {
          const seg = (a % 1) * path.length;
          const i0 = Math.floor(seg) % path.length;
          const i1 = (i0 + 1) % path.length;
          const f = seg - Math.floor(seg);
          liveRef.current.x = path[i0].cx + (path[i1].cx - path[i0].cx) * f;
          liveRef.current.y = path[i0].cy + (path[i1].cy - path[i0].cy) * f;
        }
      }

      const live = liveRef.current;
      const cells = cellsRef.current;
      const cell = nearestCell(cells, live.x, live.y);

      // detect threshold crossing -> a transform (truthful label from actual triads)
      const prev = curCellRef.current;
      if (prev && prev.id !== cell.id) {
        const xf = transformBetween(prev.triad, cell.triad);
        const label = xf === "I" ? `→ ${triadName(cell.triad)}` : `${xf} → ${triadName(cell.triad)}`;
        tickXformRef.current = label;
        // seed the RD body at the new cell on crossing
        if (sim) sim.splat(cell.cx, cell.cy, 0.05);
      }
      curCellRef.current = cell;
      tickChordRef.current = triadName(cell.triad);

      const midi = triadMidi(cell.triad);

      if (eng) {
        eng.setListenerPos(live.x, live.y);
        eng.setLiveChord(midi, true);
        const s = simSummaryRef.current;
        eng.setBody(s.coverage, s.edge, midi[0]);
      }

      // step the RD sim every frame; continually seed under the live marker
      if (sim) {
        sim.step(8);
        // sample the field ~10Hz to drive audio + draw; seed under the marker too
        if (now - lastSimSample > 100) {
          lastSimSample = now;
          sim.splat(live.x, live.y, 0.02);
          sim.sample().then((s) => {
            simSummaryRef.current = s;
          });
        }
      }

      // recording
      if (armedRef.current) {
        const elapsed = (now - recStartRef.current) / 1000;
        if (now - lastSampleRef.current > 1000 / SAMPLE_HZ) {
          lastSampleRef.current = now;
          recBufRef.current.push({ x: live.x, y: live.y, cell: cell.id });
        }
        if (elapsed >= BAR_SECONDS) {
          commitGhost();
          if (ghostsRef.current.length < MAX_GHOSTS) {
            recBufRef.current = [];
            recStartRef.current = now;
          } else {
            armedRef.current = false;
            setArmed(false);
          }
        }
      }

      // playback ghosts
      const ghostHeads: { x: number; y: number; hue: number }[] = [];
      for (const g of ghostsRef.current) {
        const len = g.path.length;
        if (len === 0) continue;
        const idx = Math.floor(phaseRef.current * len) % len;
        const p = g.path[idx];
        const pcell = cellById(cellsRef.current, p.cell);
        const tri = pcell ? pcell.triad : { root: 0, minor: false };
        if (eng) eng.updateGhost(g, triadMidi(tri), p.x, p.y);
        // when a ghost crosses a cell threshold, give the body a little splat too
        if (p.cell !== g.lastCell && sim) {
          sim.splat(p.x, p.y, 0.03);
          g.lastCell = p.cell;
        }
        ghostHeads.push({ x: p.x, y: p.y, hue: g.hue });
      }

      drawOverlay(live, cell, ghostHeads);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [commitGhost, drawOverlay]);

  useEffect(() => {
    const iv = setInterval(() => {
      setNowChord(tickChordRef.current);
      setLastXform(tickXformRef.current);
    }, 150);
    return () => clearInterval(iv);
  }, []);

  const onPointer = useCallback((e: React.PointerEvent) => {
    if (inputModeRef.current === "camera") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    liveRef.current.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    liveRef.current.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (inputModeRef.current === "auto") {
      autoDemoRef.current = null;
      setInputMode("pointer");
      setNotice("Pointer = your body. Cross a threshold to apply a P / L / R transform.");
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setNotice("Requesting camera + loading MediaPipe Pose…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    } catch {
      setCameraState("error");
      setNotice("Camera unavailable or denied — staying on pointer control.");
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play().catch(() => {});
    try {
      const cdnBase = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
      const visionUrl = `${cdnBase}/vision_bundle.mjs`;
      const vision = await import(/* webpackIgnore: true */ visionUrl);
      const { FilesetResolver, PoseLandmarker } = vision as unknown as {
        FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
        PoseLandmarker: { createFromOptions: (f: unknown, o: unknown) => Promise<unknown> };
      };
      const fileset = await FilesetResolver.forVisionTasks(`${cdnBase}/wasm`);
      const landmarker = (await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      })) as { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: unknown[][] }; close: () => void };
      poseRef.current = { close: () => landmarker.close() };
      inputModeRef.current = "camera";
      autoDemoRef.current = null;
      setInputMode("camera");
      setCameraState("on");
      setNotice("Camera live — your torso centroid walks the Tonnetz; step across edges to transform.");
      const detectLoop = () => {
        if (inputModeRef.current !== "camera" || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          try {
            const res = landmarker.detectForVideo(v, performance.now());
            const lms = res.landmarks && res.landmarks[0];
            if (lms && lms.length > 24) {
              const pts = lms as { x: number; y: number }[];
              const cx = (pts[11].x + pts[12].x + pts[23].x + pts[24].x) / 4;
              const cy = (pts[11].y + pts[12].y + pts[23].y + pts[24].y) / 4;
              liveRef.current.x = Math.min(1, Math.max(0, 1 - cx));
              liveRef.current.y = Math.min(1, Math.max(0, cy));
            }
          } catch {
            /* skip frame */
          }
        }
        requestAnimationFrame(detectLoop);
      };
      requestAnimationFrame(detectLoop);
    } catch {
      setCameraState("error");
      setNotice("MediaPipe could not load (offline?) — using pointer control instead.");
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    engineRef.current.resume();
    return engineRef.current;
  }, []);

  const autoRecord = useCallback(
    (delay: number) => {
      window.setTimeout(() => {
        if (inputModeRef.current !== "auto") return;
        if (ghostsRef.current.length >= MAX_GHOSTS) return;
        armLoop();
        window.setTimeout(() => {
          armedRef.current = false;
          setArmed(false);
        }, BAR_SECONDS * 1000 + 80);
      }, delay);
    },
    [armLoop]
  );

  // ── boot ──
  useEffect(() => {
    let mounted = true;
    const overlay = overlayRef.current!;
    const simCanvas = simCanvasRef.current!;

    const sizeTo = () => {
      const r = overlay.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      overlay.width = Math.max(2, Math.floor(r.width * dpr));
      overlay.height = Math.max(2, Math.floor(r.height * dpr));
    };

    (async () => {
      // RD sim chain: WebGPU compute -> WebGL2 -> CPU
      let sim: RdSim | null = null;
      try {
        sim = await makeRdWebGPU(192);
      } catch {
        sim = null;
      }
      if (!sim) {
        const gl = simCanvas.getContext("webgl2", { antialias: false });
        if (gl) {
          try {
            sim = makeRdWebGL2(gl, 256);
          } catch {
            sim = null;
          }
        }
      }
      if (!sim) sim = makeRdCpu(96);
      if (!mounted) {
        sim.dispose();
        return;
      }
      simRef.current = sim;
      setRendererKind(sim.kind);
      // seed a couple of splats so the field blooms immediately
      sim.splat(0.5, 0.5, 0.06);
      sim.splat(0.4, 0.45, 0.04);

      sizeTo();
      window.addEventListener("resize", sizeTo);
      runLoop();

      setTimeout(() => {
        if (!mounted) return;
        if (inputModeRef.current !== "auto") return;
        ensureEngine();
        autoDemoRef.current = { phase: 0 };
        setNotice("Auto-demo: walking a P–L–R cycle through chord-space while the field blooms.");
        autoRecord(0);
        autoRecord(BAR_SECONDS * 1000 + 200);
      }, 1500);
    })();

    return () => {
      mounted = false;
      window.removeEventListener("resize", sizeTo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPrimary = useCallback(() => {
    ensureEngine();
    armLoop();
  }, [ensureEngine, armLoop]);

  const onOverlayDown = useCallback(
    (e: React.PointerEvent) => {
      ensureEngine();
      onPointer(e);
    },
    [ensureEngine, onPointer]
  );

  // ── teardown ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        poseRef.current?.close?.();
      } catch {
        /* ignore */
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      simRef.current?.dispose();
      engineRef.current?.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#080910] text-white">
      <video ref={videoRef} className="hidden" playsInline muted />
      {/* offscreen sim host for WebGL2 fallback (kept tiny + hidden) */}
      <canvas ref={simCanvasRef} width={256} height={256} className="pointer-events-none absolute -z-10 h-1 w-1 opacity-0" />

      <canvas
        ref={overlayRef}
        onPointerMove={onPointer}
        onPointerDown={onOverlayDown}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <div className="pointer-events-auto max-w-2xl">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Echo Halls — Tonnetz
          </h1>
          <p className="mt-2 text-base text-white/80">
            Walk a lattice of triads; stepping across each threshold applies a P / L / R
            voice-leading transform while a live GPU reaction-diffusion field blooms and sings as the
            room&rsquo;s resonating body.
          </p>
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onPrimary}
            className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base font-medium transition ${
              armed
                ? "bg-violet-400 text-[#0c0a16] shadow-lg shadow-violet-500/20"
                : "bg-white/90 text-[#0c0a16] hover:bg-white"
            }`}
          >
            {armed ? "Recording a path-ghost…" : "Start a loop"}
          </button>

          <button
            onClick={startCamera}
            disabled={cameraState === "loading" || cameraState === "on"}
            className="min-h-[44px] rounded-lg border border-white/25 bg-white/5 px-4 py-2.5 text-base font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50"
          >
            {cameraState === "on"
              ? "Camera live"
              : cameraState === "loading"
              ? "Loading…"
              : "Start camera (full body)"}
          </button>

          <button
            onClick={clearAll}
            className="min-h-[44px] rounded-lg border border-white/20 bg-transparent px-4 py-2.5 text-base font-medium text-white/75 transition hover:bg-white/10"
          >
            Clear all
          </button>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-base text-white/75 transition hover:bg-white/10"
          >
            Read the design notes
          </button>

          <div className="ml-auto flex items-center gap-4 font-mono text-base text-white/75">
            <span>
              ghosts <span className="text-white/95">{ghostCount}</span>/{MAX_GHOSTS}
            </span>
            <span>
              chord <span className="text-violet-300">{nowChord}</span>
            </span>
            <span>
              move <span className="text-emerald-300/95">{lastXform}</span>
            </span>
            <span className="hidden sm:inline">
              sim <span className="text-amber-300/95">{rendererKind}</span>
            </span>
          </div>
        </div>

        {notice && (
          <p className={`mt-3 text-base ${cameraState === "error" ? "text-rose-300" : "text-white/75"}`}>
            {notice}
          </p>
        )}
      </div>

      {/* design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-6">
          <div className="max-h-[85vh] max-w-lg overflow-auto rounded-xl border border-white/15 bg-[#10111c] p-6 text-base text-white/80 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <span className="text-white/95">Tonnetz lattice:</span> every node is a major or
                minor triad. Crossing an edge applies a single neo-Riemannian transform —{" "}
                <span className="text-violet-300">P</span> (parallel),{" "}
                <span className="text-emerald-300/95">L</span> (leading-tone exchange),{" "}
                <span className="text-amber-300/95">R</span> (relative) — each a one-voice,
                common-tone-rich voice-leading move. Real functional harmony, not a no-wrong-notes
                scale.
              </li>
              <li>
                <span className="text-white/95">Resonating body:</span> a Gray-Scott
                reaction-diffusion field runs on the GPU (WebGPU compute, ping-pong storage buffers).
                Its coverage and edge-energy open a shimmer partial and breathe the master filter —
                the Turing pattern is the instrument&rsquo;s body, not a backdrop.
              </li>
              <li>
                <span className="text-white/95">HRTF + ghosts:</span> the live triad and every ghost
                own an HRTF <span className="font-mono">PannerNode</span>; you are the
                AudioListener, so chords re-pan as you move. &ldquo;Start a loop&rdquo; records your
                lattice path over {BAR_SECONDS}s into a permanent ghost that re-walks and re-triggers
                its transforms forever (up to {MAX_GHOSTS}; oldest drops).
              </li>
              <li>
                <span className="text-white/95">Fallback chain:</span> WebGPU-compute RD → WebGL2
                fragment RD → CPU RD; input MediaPipe Pose → pointer → ~1.5s auto-demo walking a
                P–L–R cycle with zero permissions.
              </li>
            </ul>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-white/90 px-4 py-2.5 text-base font-medium text-[#0c0a16] hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
