/**
 * tuning.ts — Harmonic lattice tuning systems for Dream House 552
 *
 * Exact rational ratios — never 12-TET approximations.
 * Copied from 538-xenharmonic-lattice and extended for long-form use.
 */

export interface TuningSystem {
  id: string;
  name: string;
  shortName: string;
  uRatio: number;
  vRatio: number;
  baseHz: number;
  uRange: [number, number];
  vRange: [number, number];
}

export const FIVE_LIMIT_JI: TuningSystem = {
  id: "5limit",
  name: "5-Limit Just Intonation",
  shortName: "5-JI",
  uRatio: 3 / 2,
  vRatio: 5 / 4,
  baseHz: 261.63,
  uRange: [-4, 4],
  vRange: [-2, 2],
};

export const BOHLEN_PIERCE: TuningSystem = {
  id: "bp",
  name: "Bohlen–Pierce",
  shortName: "B–P",
  uRatio: 7 / 3,
  vRatio: 5 / 3,
  baseHz: 220.0,
  uRange: [-3, 3],
  vRange: [-2, 2],
};

export const EDO_19: TuningSystem = {
  id: "19edo",
  name: "19-EDO",
  shortName: "19-EDO",
  uRatio: Math.pow(2, 3 / 19),
  vRatio: Math.pow(2, 5 / 19),
  baseHz: 261.63,
  uRange: [-4, 4],
  vRange: [-2, 2],
};

export const TUNING_SYSTEMS: TuningSystem[] = [
  FIVE_LIMIT_JI,
  BOHLEN_PIERCE,
  EDO_19,
];

/** Compute raw frequency for a lattice node (u, v) */
export function nodeFreq(t: TuningSystem, u: number, v: number): number {
  return t.baseHz * Math.pow(t.uRatio, u) * Math.pow(t.vRatio, v);
}

/**
 * Fold a frequency into the target register band [loHz, hiHz].
 * Multiplies/divides by 2 (octave), preserving exact ratio relationships.
 */
export function foldFreq(freq: number, loHz: number, hiHz: number): number {
  let f = freq;
  // Max iterations to prevent infinite loops
  for (let i = 0; i < 20 && f < loHz; i++) f *= 2;
  for (let i = 0; i < 20 && f > hiHz; i++) f /= 2;
  return f;
}

/** Cents deviation from 12-TET A440 reference */
export function centsDev(freq: number): number {
  const semis = 12 * Math.log2(freq / 440);
  const nearest = Math.round(semis);
  return Math.round((semis - nearest) * 100);
}

/** Short ratio string for display (5-limit only) */
export function ratioString(u: number, v: number): string {
  // (3/2)^u * (5/4)^v — display as approximate fraction
  const cents = Math.round(
    1200 * (u * Math.log2(3 / 2) + v * Math.log2(5 / 4))
  );
  const sign = cents >= 0 ? "+" : "";
  return `(${u},${v}) ${sign}${cents}¢`;
}
