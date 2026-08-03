// demo.ts — piece-level constants and a baked sampling of the whole journey.
// The baked curves feed the renderers (a 256-wide texture of target + realised
// tension) and let the UI show the full Freytag arc the instant the page
// loads, before any audio starts — so it reads on a silent phone in 5 seconds.

import { targetTension } from "./arc";
import { computeParams, realizedTension, chordForSlot, slotAt } from "./tension";

/** Length of one full through-composed journey, in seconds (a 6-minute arc). */
export const DURATION_S = 360;

/** Default deterministic journey seed (matches the folder number). */
export const DEFAULT_SEED = 5864;

/** Resolution of the baked tension texture / timeline. */
export const CURVE_SAMPLES = 256;

export interface BakedJourney {
  /** target[i] = demanded (Freytag) tension at position i/(N-1). */
  target: Float32Array;
  /** live[i] = realised tension using the chosen harmony at that position. */
  live: Float32Array;
}

/** Sample the whole arc once for a given seed. Deterministic. */
export function bakeJourney(seed: number, samples = CURVE_SAMPLES): BakedJourney {
  const target = new Float32Array(samples);
  const live = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const pos = i / (samples - 1);
    target[i] = targetTension(pos);
    const params = computeParams(pos);
    const chord = chordForSlot(slotAt(pos), seed);
    live[i] = realizedTension(params, chord.weight);
  }
  return { target, live };
}
