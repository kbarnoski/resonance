// signal.ts — the seeded idle self-demo curve.
//
// When no mic is granted the mandala must still be alive and spinning from
// mount. This produces a slow, musical pitch+energy wander from fixed seeded
// phases and performance.now() — no nondeterministic entropy. It arpeggiates
// a just-intonation scale so the drone actually moves.

import { mulberry32, SEED } from "./rng";

// A pentatonic-ish set of fundamentals (Hz) the idle demo drifts between.
const IDLE_NOTES = [174.6, 196.0, 220.0, 261.6, 293.7, 329.6];

const rng = mulberry32(SEED ^ 0x33cc);
const PH = [
  rng() * Math.PI * 2,
  rng() * Math.PI * 2,
  rng() * Math.PI * 2,
  rng() * Math.PI * 2,
];

export interface Signal {
  pitch: number;
  energy: number;
}

/** Idle demo at time `t` seconds. */
export function idleSignal(t: number): Signal {
  // energy swells: two slow sines beating against each other.
  const e =
    0.28 +
    0.24 * (0.5 + 0.5 * Math.sin(t * 0.55 + PH[0])) +
    0.18 * (0.5 + 0.5 * Math.sin(t * 0.19 + PH[1]));
  const energy = Math.max(0, Math.min(1, e));

  // pitch steps through the note set on a slow clock with a little glide.
  const stepClock = t * 0.28 + PH[2];
  const idxF =
    (Math.sin(stepClock) * 0.5 + 0.5) * (IDLE_NOTES.length - 1);
  const i0 = Math.floor(idxF);
  const i1 = Math.min(IDLE_NOTES.length - 1, i0 + 1);
  const frac = idxF - i0;
  const pitch = IDLE_NOTES[i0] * (1 - frac) + IDLE_NOTES[i1] * frac;

  return { pitch, energy };
}

/** Map a fundamental (Hz) to a normalized 0..1 position for hue mapping. */
export function pitchNorm(hz: number): number {
  const lo = 90;
  const hi = 560;
  const clamped = Math.max(lo, Math.min(hi, hz));
  // log scale — perceptually even across octaves.
  return (
    (Math.log2(clamped) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo))
  );
}
