// tuning.ts — the musical heart: pitch ↔ arc-position mapping and the
// just-intonation consonance scoring that decides when the two stars LOCK.
//
// We deliberately use JUST intonation (small whole-number frequency ratios).
// Helmholtz (On the Sensations of Tone) showed consonance is the absence of
// audible "beating" between partials; pure integer ratios minimise that
// roughness. Two stars are "in tune" when their frequency ratio is within a
// generous ±35 cents of one of these ratios — generous because the players
// are four years old.

import { D2_HZ } from "./audio";

export const JI_RATIOS = [1, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2] as const;
export const JI_LABELS = ["1:1", "6:5", "5:4", "4:3", "3:2", "5:3", "2:1"] as const;

// How close (in cents) counts as "locked". Forgiving for little hands/voices.
export const LOCK_CENTS = 35;

// Playable pitch range along the arc, expressed as a multiple of the D2 drone.
// From ~D4 (×4) up to ~D5+ (×8.5) — a comfortable, bright, kid-friendly octave+.
export const FREQ_MIN = D2_HZ * 4; // ≈ 293.7 Hz (D4)
export const FREQ_MAX = D2_HZ * 8.5; // ≈ 624 Hz

/** Map an arc position t∈[0,1] (0 = bottom, 1 = top) to a frequency (Hz),
 *  exponentially so equal screen distance = equal musical interval. */
export function posToFreq(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, c);
}

/** Inverse: frequency → arc position t∈[0,1]. Clamped to the playable range. */
export function freqToPos(hz: number): number {
  const c = Math.log(hz / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
  return Math.max(0, Math.min(1, c));
}

/** Cents between two frequencies (signed). */
export function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

export interface Consonance {
  /** Closest JI ratio index, or -1 if somehow none. */
  ratioIndex: number;
  /** Absolute cents distance to the nearest JI ratio. */
  cents: number;
  /** True when within LOCK_CENTS → the stars LINK. */
  locked: boolean;
  /** 0..1 "reach" — how close to a lock we are (1 = locked). Drives the
   *  dotted line solidifying as you approach. */
  nearness: number;
  /** Beat frequency |f1 − f2| in Hz — drives the visible/audible shimmer. */
  beatHz: number;
}

/** Score the interval between two frequencies against the JI consonance set.
 *  We fold the ratio into a single octave so 3:2 and 3:1 both read as "a fifth",
 *  matching how a child hears "the same nice chord, just higher". */
export function scoreInterval(f1: number, f2: number): Consonance {
  const hi = Math.max(f1, f2);
  const lo = Math.min(f1, f2);
  const beatHz = Math.abs(f1 - f2);

  // Fold ratio into [1, 2): octave-equivalence.
  let r = hi / lo;
  while (r >= 2 - 1e-9) r /= 2;
  if (r < 1) r *= 2;

  let best = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < JI_RATIOS.length; i++) {
    // compare against the ratio AND its octave (covers 2:1 wrap at the edges)
    const candidates = [JI_RATIOS[i], JI_RATIOS[i] / 2, JI_RATIOS[i] * 2];
    for (const cand of candidates) {
      const d = Math.abs(centsBetween(r, cand));
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
  }

  const locked = best <= LOCK_CENTS;
  // nearness ramps 0→1 over a window 4× the lock window, so the beam "reaches".
  const window = LOCK_CENTS * 4;
  const nearness = Math.max(0, Math.min(1, 1 - best / window));

  return { ratioIndex: bestIdx, cents: best, locked, nearness, beatHz };
}
