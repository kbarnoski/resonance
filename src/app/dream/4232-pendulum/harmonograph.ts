// harmonograph.ts — the pure math of a decaying-Lissajous "harmonograph".
//
// Two pendulums, one per axis, each a decaying sinusoid. Device tilt sets the
// two frequency RATIOS live; when a ratio sits near a small-integer just ratio
// it softly LOCKS (a Gaussian basin) and the traced figure CLOSES; between
// basins it precesses and never closes. The same two ratios drive two audio
// oscillators, so a closed figure IS a consonant dyad — sight and sound agree.
//
// No `Math.random`, no `Date.now`, no `new Date` — determinism via mulberry32
// seeded on the folder number (0x4232) and a `performance.now()` clock owned by
// the caller. Everything here is a pure function or a small explicit stepper.

// ── Deterministic PRNG (self-demo drift only) ───────────────────────────────
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

// ── Just-ratio basins ───────────────────────────────────────────────────────
// The Pythagorean small-integer intervals the pendulums lock toward. These are
// ratio VALUES, not 12-TET — a locked figure sounds a pure dyad, not an
// equal-tempered approximation.
export interface JustRatio {
  r: number;
  num: number;
  den: number;
  name: string;
}

export const JUST_RATIOS: readonly JustRatio[] = [
  { r: 1, num: 1, den: 1, name: "unison" },
  { r: 5 / 4, num: 5, den: 4, name: "major third" },
  { r: 4 / 3, num: 4, den: 3, name: "perfect fourth" },
  { r: 3 / 2, num: 3, den: 2, name: "perfect fifth" },
  { r: 5 / 3, num: 5, den: 3, name: "major sixth" },
  { r: 2, num: 2, den: 1, name: "octave" },
] as const;

// A single pendulum's ratio range. Tilt maps the full comfortable hold arc into
// [RATIO_MIN, RATIO_MAX], which spans every basin above.
export const RATIO_MIN = 1;
export const RATIO_MAX = 2;

// Basin width (in ratio units). Small enough that the 5/4 (1.25) and 4/3
// (1.333) basins stay distinct; wide enough that a locked figure is easy to
// find by hand.
export const SNAP_SIGMA = 0.032;

export interface Snap {
  /** Effective ratio after the soft pull (continuous — never a hard quantiser). */
  value: number;
  /** The just ratio this axis is nearest. */
  target: JustRatio;
  /** 0 (fully between basins, precessing) … 1 (dead-locked, figure closes). */
  strength: number;
}

/**
 * Soft-snap a raw ratio toward its nearest just ratio via a Gaussian basin.
 * Near a target the pull → 1 and the value locks exactly (closed figure);
 * far from any target the pull → 0 and the raw value passes through (precession
 * + audible beating). This is a basin, NOT a quantiser: you can sit anywhere
 * between two ratios and hear the roughness, which is the whole point.
 */
export function snapRatio(raw: number, sigma = SNAP_SIGMA): Snap {
  const clamped = Math.min(RATIO_MAX, Math.max(RATIO_MIN, raw));
  let target = JUST_RATIOS[0];
  let best = Infinity;
  for (const jr of JUST_RATIOS) {
    const d = Math.abs(clamped - jr.r);
    if (d < best) {
      best = d;
      target = jr;
    }
  }
  const z = (clamped - target.r) / sigma;
  const strength = Math.exp(-(z * z));
  const value = clamped + (target.r - clamped) * strength;
  return { value, target, strength };
}

/** Cents deviation of a ratio from a reference (1200·log2). */
export function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

export interface IntervalReading {
  /** The audible dyad ratio, folded into [1, 2). */
  ratio: number;
  name: string;
  num: number;
  den: number;
  /** Cents away from the nearest just interval (0 = pure). */
  cents: number;
}

/**
 * Name the interval the two pendulum ratios sound together. The two oscillators
 * are 220·rx and 220·ry; their audible dyad is the larger over the smaller,
 * folded into one octave, then matched to the nearest just interval.
 */
export function describeInterval(rx: number, ry: number): IntervalReading {
  let ratio = rx > ry ? rx / ry : ry / rx; // ≥ 1
  while (ratio >= 2) ratio /= 2; // fold into [1, 2)
  let nearest = JUST_RATIOS[0];
  let best = Infinity;
  for (const jr of JUST_RATIOS) {
    const d = Math.abs(centsBetween(ratio, jr.r));
    if (d < best) {
      best = d;
      nearest = jr;
    }
  }
  return {
    ratio,
    name: nearest.name,
    num: nearest.num,
    den: nearest.den,
    cents: centsBetween(ratio, nearest.r),
  };
}

// ── The pen: a stateful, phase-continuous stepper ───────────────────────────
// We accumulate PHASE (not `sin(ω·t)`) so that when the ratios glide under a
// tilt the curve stays continuous instead of jumping. A shared exponential
// envelope rings the whole figure down over ~26 s (τ = 11 s), spiralling the
// rosette inward — the harmonograph's signature decay.

export const FBASE = 0.55; // Hz — base pendulum frequency
export const PHI_X = Math.PI / 2; // quarter-phase offset → open Lissajous
export const TAU = 11; // s — ring-down time constant
export const MAX_POINTS = 2600; // trail cap (brief spec)
const SIM_STEP = 1 / 90; // fixed sim dt → frame-rate-independent density

export interface PenSample {
  x: number; // [-1, 1]
  y: number; // [-1, 1]
  b: number; // brightness/envelope 0…1
}

export interface HarmonographState {
  t: number;
  phaseX: number;
  phaseY: number;
  acc: number;
  samples: PenSample[];
}

export function createHarmonographState(): HarmonographState {
  return { t: 0, phaseX: 0, phaseY: 0, acc: 0, samples: [] };
}

/** Re-strike: reset the clock, phases and trail. */
export function strikeHarmonograph(s: HarmonographState): void {
  s.t = 0;
  s.phaseX = 0;
  s.phaseY = 0;
  s.acc = 0;
  s.samples.length = 0;
}

/** Current envelope brightness (0…1). Below ~0.02 the figure has rung out. */
export function envAt(t: number): number {
  return Math.exp(-t / TAU);
}

/**
 * Advance the pen by `dt` real seconds at the current ratios, emitting fixed-dt
 * samples so the traced density is independent of frame rate. Phase-continuous:
 * ratio changes bend the curve rather than tearing it.
 */
export function stepHarmonograph(
  s: HarmonographState,
  dt: number,
  rx: number,
  ry: number,
): void {
  s.acc += Math.min(dt, 0.1); // clamp huge gaps (tab was backgrounded)
  const wx = 2 * Math.PI * FBASE * rx;
  const wy = 2 * Math.PI * FBASE * ry;
  while (s.acc >= SIM_STEP) {
    s.t += SIM_STEP;
    s.phaseX += wx * SIM_STEP;
    s.phaseY += wy * SIM_STEP;
    const b = envAt(s.t);
    s.samples.push({
      x: b * Math.sin(s.phaseX + PHI_X),
      y: b * Math.sin(s.phaseY),
      b,
    });
    if (s.samples.length > MAX_POINTS) s.samples.shift();
    s.acc -= SIM_STEP;
  }
}
