// ════════════════════════════════════════════════════════════════════════════
// Dulcet (6568) — pure math for a modal-synthesis hammered dulcimer.
//
// This file holds ONLY deterministic, side-effect-free helpers: the seeded PRNG,
// the trapezoidal soundboard geometry, the just-intonation pitch map, and the
// modal-synthesis core `computeStrike` that turns a (course, strike-position,
// velocity) gesture into a bank of resonant modes. The SAME mode bank drives both
// the audio (real mode frequencies + decay) and the visible string displacement
// (mode SHAPES sin(k·π·x), time-scaled so the vibration is perceptible) — that
// single source is what welds see = hear.
//
// Determinism: no Math.random / Date.now / new Date anywhere. Randomness (strike
// noise, attract phrase) is drawn from mulberry32 seeded 0x6568 by the caller.
// ════════════════════════════════════════════════════════════════════════════

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Stage / soundboard geometry ─────────────────────────────────────────────
export const VIEW_W = 1000;
export const VIEW_H = 680;
export const COURSES = 15; // ~2 octaves of a diatonic just-major scale
export const N = 64; // samples along each course polyline

const TOP_Y = 84;
const BOTTOM_Y = 600;
const CENTER_X = 500;
const HALF_TOP = 196; // narrow top of the trapezoid
const HALF_BOTTOM = 428; // wide bottom

// Course i: 0 = bottom (lowest pitch, widest), COURSES-1 = top (highest, narrow).
export const courseY: number[] = Array.from({ length: COURSES }, (_, i) => {
  const f = i / (COURSES - 1); // 0 bottom .. 1 top
  return lerp(BOTTOM_Y, TOP_Y, f);
});
function halfWidthAt(y: number): number {
  const vf = (y - TOP_Y) / (BOTTOM_Y - TOP_Y); // 0 top .. 1 bottom
  return lerp(HALF_TOP, HALF_BOTTOM, vf);
}
export const courseX0: number[] = courseY.map((y) => CENTER_X - halfWidthAt(y));
export const courseX1: number[] = courseY.map((y) => CENTER_X + halfWidthAt(y));

// Two bridges cross the board (the trapezoid look): fractions along each course.
export const BRIDGE_L = 0.34;
export const BRIDGE_R = 0.66;
export const bridgeLeftX: number[] = courseY.map((_, i) =>
  lerp(courseX0[i], courseX1[i], BRIDGE_L),
);
export const bridgeRightX: number[] = courseY.map((_, i) =>
  lerp(courseX0[i], courseX1[i], BRIDGE_R),
);

// ── Pitch map: just-intonation major scale, ~2 octaves, low→high ────────────
const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const BASE_HZ = 130.81; // C3

export function noteHz(i: number): number {
  const octave = Math.floor(i / RATIOS.length);
  const degree = i % RATIOS.length;
  return BASE_HZ * Math.pow(2, octave) * RATIOS[degree];
}

// ── Modal synthesis core ────────────────────────────────────────────────────
export const M = 7; // modes per struck course
export const VIS_FUND = 3.1; // visible fundamental (Hz) — oscillation slowed to see

export interface Mode {
  k: number; // mode number (1 = fundamental) → spatial shape sin(k·π·x)
  f: number; // real modal frequency (Hz), slightly inharmonic
  amp: number; // relative amplitude (peak-normalised to 1)
  tau: number; // decay time constant (s)
}

// A struck string's spectrum, from the classic modal model:
//   • strike POSITION `pos` weights each mode by |sin(k·π·pos)| — striking the
//     middle kills even modes and favours the fundamental; striking near an end
//     (pos→0/1) lets the high partials through → genuinely brighter timbre.
//   • strike VELOCITY `vel` tilts the spectrum: a hard hit flattens the 1/kⁿ
//     roll-off, pushing energy into higher modes (more brightness), a soft hit
//     steepens it (darker).
//   • higher modes decay faster (tau shrinks with k); `damp` (palm mute) scales
//     every decay down for a short, choked tone.
export function computeStrike(
  i: number,
  pos: number,
  vel: number,
  damp: boolean,
): Mode[] {
  const f0 = noteHz(i);
  const p = clamp(pos, 0.04, 0.96);
  const v = clamp(vel, 0, 1);
  const B = 0.0007; // string inharmonicity (metallic dulcimer wire)
  const tilt = 1.75 - 1.05 * v; // hard hit → flatter spectrum → brighter
  const tau0 = clamp(3.4 * Math.pow(180 / f0, 0.45), 0.7, 3.6); // low notes ring longer
  const dmul = damp ? 0.24 : 1;

  const modes: Mode[] = [];
  let peak = 1e-9;
  for (let k = 1; k <= M; k++) {
    const f = f0 * k * Math.sqrt(1 + B * k * k);
    const w = Math.abs(Math.sin(k * Math.PI * p)); // strike-position weighting
    const amp = w / Math.pow(k, tilt);
    const tau = (tau0 / (1 + 0.8 * (k - 1))) * dmul;
    if (amp > peak) peak = amp;
    modes.push({ k, f, amp, tau });
  }
  // Peak-normalise so overall loudness is governed by velocity, not mode count.
  for (const m of modes) m.amp /= peak;
  return modes;
}

// Nearest course to a view-space y (strike lands on the closest string).
export function nearestCourse(py: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < COURSES; i++) {
    const d = Math.abs(py - courseY[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// Fraction along a course (0 = left end, 1 = right end) for a view-space x.
export function strikePosOn(i: number, px: number): number {
  return clamp((px - courseX0[i]) / (courseX1[i] - courseX0[i]), 0, 1);
}
