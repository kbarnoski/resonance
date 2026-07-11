// ─────────────────────────────────────────────────────────────────────────────
// arc.ts — the CONDUCTOR (nested polyrhythmic phase engine) and the long-form
// ~6-minute stateful ascent for 1478 "Sema Ascent".
//
// This module is the single source of truth for time in the piece. Both the
// three.js scene and the Web-Audio layer read from the SAME conductor phases, so
// what you SEE spinning is literally what you HEAR pulsing.
//
// Determinism: no Math.random / Date anywhere. A seeded mulberry32 PRNG supplies
// the only pseudo-randomness (per-ring tilt jitter), and all timing comes from
// performance.now() deltas fed in as `dt`.
// ─────────────────────────────────────────────────────────────────────────────

// ── seeded PRNG (mulberry32) ────────────────────────────────────────────────
function makePRNG(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── ring architecture ───────────────────────────────────────────────────────
export const RING_COUNT = 9;

// Polyrhythm: relative angular speeds. Coprime-ish integers so the rings only
// momentarily align; their combined pattern does not repeat on any short loop.
export const RATIOS = [2, 3, 4, 5, 6, 7, 8, 9, 11] as const;

// Alternating spin direction — counter-rotating shells read as a gyroscope.
export const DIRS = [1, -1, 1, -1, 1, -1, 1, -1, 1] as const;

// Per-ring pulse subdivisions: how many audio gates per revolution. Small so the
// drum stays legible; the polyrhythm emerges from RATIOS, not from dense gates.
export const PULSE = [2, 3, 2, 4, 3, 4, 3, 5, 4] as const;

// INHARMONIC pitch multipliers — deliberately NOT integer harmonics and NOT a
// just / pentatonic scale (both banned this cycle). Bell-like, continuous.
export const PITCH = [1.0, 1.26, 1.57, 1.93, 2.35, 2.78, 3.31, 3.94, 4.62] as const;

// Base angular velocity per ratio-unit, in revolutions/second.
const OMEGA = 0.022;
// The shared velocity all rings converge toward as they phase-LOCK at the peak.
const LOCK_RATIO = 6;

export interface RingConfig {
  radius: number; // ring radius in world units
  tilt: number; // static tilt of the ring plane (radians)
  yaw: number; // static yaw offset so shells don't overlap
  z: number; // depth offset for orrery layering
  petals: number; // instanced elements around the ring
}

export function makeRingConfigs(): RingConfig[] {
  const rnd = makePRNG(0x5e3a); // constant seed → reproducible builds
  const cfgs: RingConfig[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    cfgs.push({
      radius: 1.35 + i * 0.52,
      tilt: 0.22 + i * 0.13 + (rnd() - 0.5) * 0.12,
      yaw: rnd() * Math.PI * 2,
      z: (i - RING_COUNT / 2) * 0.14 + (rnd() - 0.5) * 0.1,
      petals: 12 + (i % 3) * 4,
    });
  }
  return cfgs;
}

// ── the phase conductor ─────────────────────────────────────────────────────
export class Conductor {
  readonly phase = new Float64Array(RING_COUNT); // signed revolutions (rotation)
  private travel = new Float64Array(RING_COUNT); // unsigned revolutions (gates)
  private prevGate = new Float64Array(RING_COUNT);
  readonly crossings = new Int16Array(RING_COUNT); // gate hits this frame

  step(dt: number, tempo: number, lock: number): void {
    for (let i = 0; i < RING_COUNT; i++) {
      const eff = RATIOS[i] + (LOCK_RATIO - RATIOS[i]) * lock; // converge at peak
      const omega = tempo * eff * OMEGA * DIRS[i];
      this.phase[i] += omega * dt;
      this.travel[i] += Math.abs(omega) * dt;
      const g = this.travel[i] * PULSE[i];
      const c = Math.floor(g) - Math.floor(this.prevGate[i]);
      this.crossings[i] = c > 0 ? c : 0;
      this.prevGate[i] = g;
    }
  }
}

// ── the long-form arc (~6 minutes, non-repeating within a cycle) ─────────────
export const TOTAL = 360; // seconds

export type Movement =
  | "Invocation"
  | "Gathering"
  | "Acceleration"
  | "Fana — the lock"
  | "Descent";

export interface ArcDrivers {
  ringsLit: number; // how many shells are ignited (1..9)
  tempo: number; // global angular-velocity scale
  warmth: number; // 0 = deep gold, 1 = white-hot
  intensity: number; // overall brightness / energy
  lock: number; // 0..1 phase-lock amount (rings converge)
  flare: number; // 0..1 white-hot core swell (smooth, ≤3 Hz)
  density: number; // audio density / drum weight
  movement: Movement;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function bump(x: number, c: number, w: number): number {
  const d = (x - c) / w;
  return Math.exp(-d * d);
}

function movementAt(t: number): Movement {
  if (t < 40) return "Invocation";
  if (t < 130) return "Gathering";
  if (t < 250) return "Acceleration";
  if (t < 300) return "Fana — the lock";
  return "Descent";
}

/**
 * Evaluate the arc at absolute elapsed seconds. `energy` (0..1) is accumulated
 * "trance energy" from user surges — it is the piece's memory, biasing the climb
 * so no two runs are identical. `reduced` damps everything for reduced-motion.
 *
 * The parameters evolve MONOTONICALLY through five movements and do not loop on
 * any short cycle: the Fana peak (~t=278) is a one-time white-hot alignment, and
 * the Descent cools to amber embers — so minute 6 genuinely differs from minute 1.
 */
export function evalArc(
  elapsed: number,
  energy: number,
  reduced: boolean,
): ArcDrivers {
  const t = elapsed;

  const litF = 1 + 8 * smoothstep(18, 232, t);
  let ringsLit = Math.floor(litF + energy * 1.5);
  ringsLit = Math.max(1, Math.min(RING_COUNT, ringsLit));

  const fana = bump(t, 278, 26); // the ecstatic peak window
  const descent = smoothstep(300, 360, t);

  let tempo =
    0.55 + 1.0 * smoothstep(35, 130, t) + 2.2 * smoothstep(130, 250, t);
  tempo += 2.4 * fana;
  tempo *= 1 - 0.92 * descent; // slow toward stillness
  tempo += energy * 1.6;

  let warmth =
    0.15 + 0.55 * smoothstep(60, 250, t) + 0.35 * fana - 0.5 * descent;
  warmth = clamp01(warmth + energy * 0.15);

  let intensity =
    (0.25 + 0.55 * smoothstep(30, 250, t) + 0.3 * fana) * (1 - 0.7 * descent);
  intensity = clamp01(intensity + energy * 0.2);

  let lock = clamp01(bump(t, 278, 22) * 1.15);
  let flare = clamp01(bump(t, 278, 15) * (0.85 + 0.3 * energy));

  let density = clamp01(
    0.2 +
      0.6 * smoothstep(40, 250, t) +
      0.3 * fana -
      0.7 * descent +
      energy * 0.2,
  );

  if (reduced) {
    tempo = Math.min(tempo, 1.1);
    flare *= 0.2; // no bright flare — hold a calm version
    lock *= 0.4;
    warmth = Math.min(warmth, 0.6);
    intensity = Math.min(intensity, 0.6);
    density = Math.min(density, 0.5);
  }

  return {
    ringsLit,
    tempo,
    warmth,
    intensity,
    lock,
    flare,
    density,
    movement: movementAt(t),
  };
}

// Dim, slow auto-preview shown before the user presses Begin (never a black
// rectangle, never silent-with-nothing-moving).
export const PREVIEW: ArcDrivers = {
  ringsLit: 3,
  tempo: 0.42,
  warmth: 0.18,
  intensity: 0.3,
  lock: 0,
  flare: 0,
  density: 0,
  movement: "Invocation",
};
