// mapping.ts — turns raw space-weather physics into normalised [0,1] drive
// parameters shared by the shader field and the audio engine, plus a seeded
// PRNG for repeatable structure and a long-form "memory" accumulator.

import type { SpaceWeather } from "./noaa";

/** Seeded PRNG — mulberry32. Deterministic structure instead of Math.random(). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function norm(x: number, lo: number, hi: number): number {
  return clamp01((x - lo) / (hi - lo));
}

export interface Drive {
  /** Overall geomagnetic storm intensity, 0..1 (the master build). */
  level: number;
  /** Flow velocity from solar-wind speed, 0..1. */
  flow: number;
  /** Line thickness / count from proton density, 0..1. */
  thickness: number;
  /** Southward-Bz tension, 0..1 (1 = strongly southward = reconnection-prone). */
  south: number;
  /** Signed Bz for detune, -1..1 (negative = southward). */
  bzSigned: number;
  /** Kp-driven shimmer / upper-partial energy, 0..1. */
  kp: number;
  /** X-ray flare strength, 0..1 (0 below C, ~1 at X). */
  flare: number;
  /** Human-readable flux class, e.g. "M5.0". */
  flareClass: string;
}

/** Map physical readings → normalised drive parameters. */
export function applyMapping(w: SpaceWeather, flareClass: string): Drive {
  const flow = norm(w.speed, 300, 800);
  const thickness = norm(w.density, 1, 20);
  const south = norm(-w.bz, 0, 20); // more southward → higher
  const kp = norm(w.kp, 0, 9);

  // log-scaled flare: C (1e-6) begins to register, X (1e-4) saturates.
  const lx = Math.log10(Math.max(w.xrayFlux, 1e-9));
  const flare = norm(lx, -6, -4);

  // Master intensity — Kp and southward Bz dominate (they drive real storms),
  // solar wind speed and density fill in.
  const level = clamp01(
    0.34 * kp + 0.3 * south + 0.22 * flow + 0.14 * thickness,
  );

  return {
    level,
    flow,
    thickness,
    south,
    bzSigned: Math.max(-1, Math.min(1, w.bz / 20)),
    kp,
    flare,
    flareClass,
  };
}

/**
 * Long-form memory: a slow accumulator that grows while the storm is active
 * and bleeds away over minutes when it calms. This is what makes the field
 * look meaningfully different after three minutes than at the storm's start —
 * the piece remembers where it has been.
 */
export function advanceMemory(prev: number, level: number, dt: number): number {
  const gain = Math.max(0, level - 0.22) * 0.06; // only real storms deposit
  const decay = 0.008; // ~2 min half-life-ish bleed
  const next = prev + (gain - decay * prev) * dt * 60;
  return next < 0 ? 0 : next > 1 ? 1 : next;
}
