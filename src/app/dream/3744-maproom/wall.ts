/**
 * MAPROOM — pure, deterministic helpers for the operator monitor.
 *
 * Everything here is a pure function of (surfaceIndex, beat, seed): the same
 * seed + the same beat number produces the byte-identical frame on any machine.
 * That is the whole conceit — this single browser is a preview of an N-wall /
 * N-phone install whose surfaces share ONE deterministic "now".
 *
 * No `Math.random`, no `Date.now`. Randomness only ever comes from
 * `mulberry32(seed)` fed a seed derived from the shared clock.
 */

import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";

/* ── deterministic PRNG (the substrate) ──────────────────────────────── */

/** mulberry32 — tiny, fast, fully reproducible from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One deterministic float from an arbitrary integer key. */
export function hash01(key: number): number {
  return mulberry32(key >>> 0)();
}

/* ── surfaces ────────────────────────────────────────────────────────── */

export interface SurfaceDef {
  name: string;
  pattern: number;
}

/** A 3×3 flattened map of a venue's projection surfaces. */
export const SURFACES: SurfaceDef[] = [
  { name: "WALL-1", pattern: 0 }, // spectrum bars
  { name: "WALL-2", pattern: 4 }, // waveform ribbon
  { name: "CEIL", pattern: 3 }, // plasma
  { name: "SIDE-L", pattern: 1 }, // lissajous ring
  { name: "PORTAL", pattern: 5 }, // radial pulse
  { name: "SIDE-R", pattern: 6 }, // concentric rings
  { name: "FLOOR-L", pattern: 2 }, // particle drift
  { name: "STAGE", pattern: 7 }, // starfield pulse
  { name: "FLOOR-R", pattern: 8 }, // VU columns
];

export const GRID_COLS = 3;
export const GRID_ROWS = 3;

export interface SurfaceConst {
  seed: number;
  a: number;
  b: number;
  c: number;
  d: number;
  hue: number; // 0..1 position along the violet ramp
}

/** Per-surface constants — deterministic function of the global seed only. */
export function makeSurfaceConst(globalSeed: number, i: number): SurfaceConst {
  const rng = mulberry32((globalSeed ^ (i * 0x9e3779b1)) >>> 0);
  return {
    seed: (globalSeed ^ (i * 0x85ebca6b)) >>> 0,
    a: 0.5 + rng() * 2.5,
    b: 0.5 + rng() * 2.5,
    c: rng() * Math.PI * 2,
    d: 0.4 + rng() * 1.2,
    hue: 0.15 + rng() * 0.7,
  };
}

/* ── cue list (Resolume-style scenes) ────────────────────────────────── */

export interface Cue {
  id: string;
  name: string;
  bpm: number;
  intensity: number; // palette / motion energy 0..1
  hot: boolean[]; // which of the 9 surfaces are "hot" this scene
  density: number; // pluck probability 0..1
  padLevel: number; // pad bed level 0..1
  kick: boolean;
}

const ALL = [true, true, true, true, true, true, true, true, true];
const mask = (idx: number[]): boolean[] =>
  ALL.map((_, i) => idx.includes(i));

export const CUES: Cue[] = [
  {
    id: "load-in",
    name: "Load-in",
    bpm: 92,
    intensity: 0.4,
    hot: mask([0, 4, 8]),
    density: 0.18,
    padLevel: 0.5,
    kick: false,
  },
  {
    id: "build",
    name: "Build",
    bpm: 116,
    intensity: 0.65,
    hot: mask([0, 1, 3, 4, 6, 8]),
    density: 0.4,
    padLevel: 0.6,
    kick: true,
  },
  {
    id: "peak",
    name: "Peak",
    bpm: 128,
    intensity: 1.0,
    hot: [...ALL],
    density: 0.7,
    padLevel: 0.7,
    kick: true,
  },
  {
    id: "breakdown",
    name: "Breakdown",
    bpm: 104,
    intensity: 0.55,
    hot: mask([2, 4, 5, 7]),
    density: 0.32,
    padLevel: 0.75,
    kick: false,
  },
  {
    id: "blackout",
    name: "Blackout",
    bpm: 84,
    intensity: 0.16,
    hot: mask([4]),
    density: 0.08,
    padLevel: 0.35,
    kick: false,
  },
];

/* ── palette ramp (violet world) ─────────────────────────────────────── */

const RAMP_HEX = [
  VIOLET[900],
  VIOLET[700],
  INDIGO,
  VIOLET[500],
  MAGENTA,
  VIOLET[300],
];

function parseHex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const RAMP_RGB = RAMP_HEX.map(parseHex);

/** Sample the canonical violet ramp at t∈[0,1] as an rgba() string. */
export function rampColor(t: number, alpha = 1): string {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP_RGB.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP_RGB[i];
  const b = RAMP_RGB[Math.min(RAMP_RGB.length - 1, i + 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgba(${r},${g},${bl},${alpha})`;
}

/* ── music theory (deterministic, continuous-pitch, diatonic) ─────────── */

/** Diatonic major (7 notes) — NOT a pentatonic safety net. */
export const SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROOT_MIDI = 45; // A2

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Deterministic pluck note for a given eighth-note index. */
export function pluckMidiForEighth(seed: number, eighth: number): number {
  const rng = mulberry32((seed ^ Math.imul(eighth, 0x27d4eb2f)) >>> 0);
  const deg = SCALE[Math.floor(rng() * SCALE.length)];
  const oct = 12 * (2 + Math.floor(rng() * 2)); // two octaves up, deterministic
  // tiny continuous detune so pitch is never mechanically quantized
  const detune = (rng() - 0.5) * 0.35;
  return ROOT_MIDI + deg + oct + detune;
}

/** Deterministic pad triad (root/third/fifth midis) for a given bar. */
export function chordForBar(seed: number, bar: number): number[] {
  const rng = mulberry32((seed ^ Math.imul(bar, 0x165667b1)) >>> 0);
  const degIdx = Math.floor(rng() * SCALE.length);
  const root = ROOT_MIDI + SCALE[degIdx];
  const third = ROOT_MIDI + SCALE[(degIdx + 2) % SCALE.length] + 12;
  const fifth = ROOT_MIDI + SCALE[(degIdx + 4) % SCALE.length] + 12;
  return [root, third, fifth];
}

/* ── per-surface generative draw functions ───────────────────────────── */

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  beat: number; // continuous beats since start (shared clock)
  bands: number[]; // 16 frequency bands, 0..1
  level: number; // overall level 0..1
  k: SurfaceConst;
  intensity: number; // master * cue intensity, 0..1
  hot: boolean;
}

const TAU = Math.PI * 2;

/** Dispatch to the pattern for a surface. Every branch is pure in `beat`. */
export function drawSurface(pattern: number, args: DrawArgs): void {
  switch (pattern) {
    case 0:
      drawSpectrum(args);
      break;
    case 1:
      drawLissajous(args);
      break;
    case 2:
      drawParticles(args);
      break;
    case 3:
      drawPlasma(args);
      break;
    case 4:
      drawWaveform(args);
      break;
    case 5:
      drawRadial(args);
      break;
    case 6:
      drawRings(args);
      break;
    case 7:
      drawStarfield(args);
      break;
    default:
      drawColumns(args);
      break;
  }
}

function energy(hot: boolean, intensity: number): number {
  return (hot ? 1 : 0.28) * intensity;
}

function drawSpectrum({ ctx, w, h, bands, k, intensity, hot }: DrawArgs): void {
  const e = energy(hot, intensity);
  const n = bands.length;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = bands[i] * e;
    const bh = Math.min(h, v * h * 1.05 + 2);
    ctx.fillStyle = rampColor(k.hue * 0.5 + v * 0.5, 0.35 + e * 0.55);
    ctx.fillRect(i * bw + 0.5, h - bh, bw - 1, bh);
  }
}

function drawWaveform({
  ctx,
  w,
  h,
  bands,
  beat,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cy = h / 2;
  ctx.lineWidth = 1.5 + e * 2;
  ctx.strokeStyle = rampColor(0.35 + k.hue * 0.4, 0.5 + e * 0.5);
  ctx.beginPath();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const band = bands[Math.floor((i / steps) * (bands.length - 1))];
    const phase = beat * k.d + k.c;
    const y =
      cy +
      Math.sin((i / steps) * TAU * k.a + phase) *
        (band * e * h * 0.42 + e * 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawPlasma({ ctx, w, h, beat, k, intensity, hot }: DrawArgs): void {
  const e = energy(hot, intensity);
  const cols = 14;
  const rows = 14;
  const cw = w / cols;
  const ch = h / rows;
  const t = beat * 0.5 + k.c;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v =
        (Math.sin(x * 0.6 * k.a + t) +
          Math.sin(y * 0.55 * k.b + t * 1.2) +
          Math.sin((x + y) * 0.4 + t * 0.7) +
          3) /
        6;
      ctx.fillStyle = rampColor(v, 0.16 + v * e * 0.7);
      ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
    }
  }
}

function drawLissajous({
  ctx,
  w,
  h,
  beat,
  level,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * (0.28 + level * 0.12 * e);
  ctx.lineWidth = 1.4 + e * 1.6;
  ctx.strokeStyle = rampColor(0.55 + k.hue * 0.3, 0.4 + e * 0.55);
  ctx.beginPath();
  const steps = 160;
  const ph = beat * 0.25 + k.c;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const x = cx + Math.sin(k.a * t + ph) * r;
    const y = cy + Math.sin(k.b * t) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawParticles({
  ctx,
  w,
  h,
  beat,
  level,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cx = w / 2;
  const cy = h / 2;
  const count = 64;
  const rng = mulberry32(k.seed);
  for (let i = 0; i < count; i++) {
    const base = rng();
    const spin = rng();
    const rad = rng();
    const ang = base * TAU + beat * (0.15 + spin * 0.5) * k.d;
    const rr =
      Math.min(w, h) *
      (0.08 + rad * 0.42) *
      (0.85 + Math.sin(beat * 1.5 + base * TAU) * 0.15 + level * 0.1);
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.8;
    const s = 0.8 + spin * 1.8 + level * e * 2;
    ctx.fillStyle = rampColor(0.3 + rad * 0.6, 0.25 + e * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
  }
}

function drawRadial({
  ctx,
  w,
  h,
  beat,
  level,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.5;
  for (let i = 5; i >= 0; i--) {
    const phase = (beat * k.d + i * 0.5) % 3;
    const r = (phase / 3) * maxR * (1 + level * 0.2);
    const fade = 1 - phase / 3;
    ctx.fillStyle = rampColor(0.4 + k.hue * 0.4, fade * (0.12 + e * 0.4));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
}

function drawRings({
  ctx,
  w,
  h,
  beat,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.5;
  const n = 7;
  ctx.lineWidth = 1.2 + e * 1.4;
  for (let i = 0; i < n; i++) {
    const t = ((beat * 0.35 * k.d + i / n) % 1);
    const r = t * maxR;
    ctx.strokeStyle = rampColor(0.3 + t * 0.6, (1 - t) * (0.25 + e * 0.6));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
}

function drawStarfield({
  ctx,
  w,
  h,
  beat,
  bands,
  k,
  intensity,
  hot,
}: DrawArgs): void {
  const e = energy(hot, intensity);
  const cols = 10;
  const rows = 7;
  const rng = mulberry32(k.seed ^ 0x1234);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ph = rng() * TAU;
      const band = bands[(x + y) % bands.length];
      const tw = 0.5 + 0.5 * Math.sin(beat * 2 + ph);
      const b = tw * (0.3 + band * 0.7) * e;
      const px = (x + 0.5) * (w / cols);
      const py = (y + 0.5) * (h / rows);
      ctx.fillStyle = rampColor(0.45 + k.hue * 0.35, 0.1 + b);
      ctx.beginPath();
      ctx.arc(px, py, 1 + b * 2.5, 0, TAU);
      ctx.fill();
    }
  }
}

function drawColumns({ ctx, w, h, bands, intensity, hot }: DrawArgs): void {
  const e = energy(hot, intensity);
  const n = 9;
  const cw = w / n;
  const segs = 12;
  const sh = h / segs;
  for (let i = 0; i < n; i++) {
    const v = bands[Math.floor((i / n) * (bands.length - 1))] * e;
    const lit = Math.floor(v * segs * 1.1);
    for (let s = 0; s < segs; s++) {
      const on = s < lit;
      const yt = h - (s + 1) * sh;
      ctx.fillStyle = rampColor(
        0.25 + (s / segs) * 0.65,
        on ? 0.35 + e * 0.5 : 0.06,
      );
      ctx.fillRect(i * cw + 1, yt + 1, cw - 2, sh - 2);
    }
  }
}
