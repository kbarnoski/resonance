// arc.ts — Gustav Freytag's pyramid (1863) as a quantitative target-tension
// curve. This is the *dramaturgy*: a through-composed shape (NOT a loop) that
// the generation engine is asked to hit at every moment.
//
//   Exposition → (inciting incident) → Rising action → Climax →
//   Falling action → Dénouement
//
// targetTension(pos) ∈ [0,1] is the demanded emotional pressure at normalised
// journey position pos ∈ [0,1]. tension.ts turns this number into register,
// dynamics, harmony, density and tempo; the audio then realises it.

export interface Act {
  id: string;
  name: string;
  start: number; // normalised position where the act begins
  end: number;
  blurb: string;
}

// Freytag's five parts. The inciting incident lives at the seam between the
// exposition and the rising action, as a discrete dramatic event.
export const ACTS: Act[] = [
  { id: "exposition", name: "Exposition", start: 0.0, end: 0.13, blurb: "sparse tonic calm" },
  { id: "rising", name: "Rising Action", start: 0.13, end: 0.66, blurb: "density, register & dissonance climbing" },
  { id: "climax", name: "Climax", start: 0.66, end: 0.76, blurb: "the tension peak — fullest & brightest" },
  { id: "falling", name: "Falling Action", start: 0.76, end: 0.9, blurb: "the pressure releases" },
  { id: "denouement", name: "Dénouement", start: 0.9, end: 1.0, blurb: "a transformed, resolved tonic" },
];

// The inciting incident: a clear harmonic + dynamic event that ends the calm.
export const INCITING_INCIDENT = 0.13;

/** Which act contains a given normalised position. */
export function actAt(pos: number): Act {
  const p = Math.max(0, Math.min(1, pos));
  for (const a of ACTS) {
    if (p >= a.start && p < a.end) return a;
  }
  return ACTS[ACTS.length - 1];
}

// Control points of the Freytag shape. Deliberately asymmetric: a long slow
// exposition, a sharp inciting jump, a stepped rising action, a single tall
// climax, then a graceful fall to a resolution slightly above absolute zero
// (the tonic is "transformed", not merely restored).
const CONTROL: Array<[number, number]> = [
  [0.0, 0.07],
  [0.08, 0.09],
  [0.125, 0.1], // end of the calm
  [0.14, 0.31], // inciting incident — a step up
  [0.28, 0.41],
  [0.45, 0.53],
  [0.58, 0.67],
  [0.66, 0.79],
  [0.71, 0.99], // climax peak
  [0.76, 0.81],
  [0.83, 0.55],
  [0.9, 0.31],
  [0.95, 0.19],
  [1.0, 0.13],
];

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** The demanded tension at normalised position pos ∈ [0,1]. */
export function targetTension(pos: number): number {
  const p = Math.max(0, Math.min(1, pos));
  let base = CONTROL[CONTROL.length - 1][1];
  for (let i = 0; i < CONTROL.length - 1; i++) {
    const [x0, y0] = CONTROL[i];
    const [x1, y1] = CONTROL[i + 1];
    if (p >= x0 && p <= x1) {
      const localT = x1 === x0 ? 0 : (p - x0) / (x1 - x0);
      base = y0 + (y1 - y0) * smoothstep(localT);
      break;
    }
  }
  // A very small textural ripple, present only during the rising action, so
  // the climb feels alive without ever muddying the climax read.
  const risingWindow =
    smoothstep((p - 0.14) / 0.08) * (1 - smoothstep((p - 0.62) / 0.06));
  const ripple = 0.012 * Math.sin(p * 57.0) * risingWindow;
  return Math.max(0, Math.min(1, base + ripple));
}

/** Signed trend of the target curve at pos (positive = rising). */
export function tensionTrend(pos: number): number {
  const eps = 0.006;
  return targetTension(pos + eps) - targetTension(pos - eps);
}
