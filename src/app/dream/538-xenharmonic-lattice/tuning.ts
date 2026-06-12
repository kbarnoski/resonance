/**
 * tuning.ts — Xenharmonic Lattice tuning systems
 *
 * Each tuning defines a 2-D harmonic lattice where:
 *   - axis U steps by ratio `uRatio`
 *   - axis V steps by ratio `vRatio`
 *   - frequency at (u, v) = baseHz × uRatio^u × vRatio^v
 *
 * All ratios are exact rational numbers — NOT 12-TET approximations.
 */

export interface LatticeNode {
  u: number;
  v: number;
  freq: number;
  label: string;
  ratioLabel: string;
}

export interface TuningSystem {
  id: string;
  name: string;
  shortName: string;
  description: string;
  uRatio: number;
  vRatio: number;
  uLabel: string;
  vLabel: string;
  baseHz: number;
  color: string; // Tailwind-compatible HSL color for nodes
  uRange: [number, number]; // [min, max] cols
  vRange: [number, number]; // [min, max] rows
}

/**
 * 5-Limit Just Intonation (Euler's Tonnetz)
 * U axis = perfect fifth    3/2  (~702 cents)
 * V axis = major third      5/4  (~386 cents)
 * Base = C4 = 261.63 Hz
 *
 * Frequency = 261.63 × (3/2)^u × (5/4)^v
 *
 * The "octave equivalence" fold is optional — here we let pitches range
 * freely (no octave reduction) for clarity of the lattice structure.
 */
export const FIVE_LIMIT_JI: TuningSystem = {
  id: "5limit",
  name: "5-Limit Just Intonation",
  shortName: "5-JI",
  description:
    "Euler's Tonnetz — perfect fifths (3/2) on the horizontal axis, major thirds (5/4) on vertical. Pure intervals, no compromise.",
  uRatio: 3 / 2,
  vRatio: 5 / 4,
  uLabel: "3/2 fifths →",
  vLabel: "↑ 5/4 thirds",
  baseHz: 261.63, // C4
  color: "violet",
  uRange: [-4, 4],
  vRange: [-2, 2],
};

/**
 * Bohlen–Pierce Scale
 * Built on the 3:1 "tritave" (not 2:1 octave) using odd harmonics 3, 5, 7, 9.
 * U axis = BP "fifth"  = 7/3  (~968 cents — slightly less than 12-TET minor 7th)
 * V axis = BP "third"  = 5/3  (~884 cents — close to 12-TET major 6th but pure)
 * Base = A3 = 220 Hz
 *
 * Frequency = 220 × (7/3)^u × (5/3)^v
 *
 * These are exact BP ratios from the Bohlen–Pierce scale's odd-harmonic series.
 * The tritave (3:1) replaces the octave; BP intervals are completely alien to
 * the piano. Notes refuse to "resolve" in the Western sense.
 */
export const BOHLEN_PIERCE: TuningSystem = {
  id: "bp",
  name: "Bohlen–Pierce",
  shortName: "B–P",
  description:
    "Non-octave scale on tritave (3:1). Axes: 7/3 BP-fifth and 5/3 BP-third. No octave — pure alien harmony.",
  uRatio: 7 / 3,
  vRatio: 5 / 3,
  uLabel: "7/3 BP-fifth →",
  vLabel: "↑ 5/3 BP-third",
  baseHz: 220.0, // A3
  color: "emerald",
  uRange: [-3, 3],
  vRange: [-2, 2],
};

/**
 * 19-EDO (19 Equal Divisions of the Octave)
 * Each step = 2^(1/19) ≈ 63.16 cents
 * U axis = 3 steps of 19-EDO = 189.47 cents (close to 12-TET whole tone)
 * V axis = 5 steps of 19-EDO = 315.79 cents (close to minor third — but slightly different)
 * Base = C4 = 261.63 Hz
 *
 * In 19-EDO, thirds are much purer than 12-TET and fifths remain close.
 * The texture is recognizably Western but subtly "off" — uncanny valley tuning.
 */
export const EDO_19: TuningSystem = {
  id: "19edo",
  name: "19-EDO",
  shortName: "19-EDO",
  description:
    "19 equal divisions of the octave. Purer major thirds than 12-TET, an extra neutral second. Uncanny valley: almost Western, but subtly wrong.",
  uRatio: Math.pow(2, 3 / 19), // 3 steps
  vRatio: Math.pow(2, 5 / 19), // 5 steps
  uLabel: "3-step →",
  vLabel: "↑ 5-step",
  baseHz: 261.63, // C4
  color: "amber",
  uRange: [-4, 4],
  vRange: [-2, 2],
};

export const TUNING_SYSTEMS: TuningSystem[] = [
  FIVE_LIMIT_JI,
  BOHLEN_PIERCE,
  EDO_19,
];

/** Compute frequency for a lattice node */
export function nodeFreq(
  tuning: TuningSystem,
  u: number,
  v: number
): number {
  return tuning.baseHz * Math.pow(tuning.uRatio, u) * Math.pow(tuning.vRatio, v);
}

/** Compute a human-readable ratio label for (u, v) in 5-limit JI */
function fractionLabel(n: number, d: number): string {
  const g = gcd(Math.abs(n), Math.abs(d));
  return `${n / g}/${d / g}`;
}

function gcd(a: number, b: number): number {
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Build the label for a node at (u, v) */
export function nodeLabel(tuning: TuningSystem, u: number, v: number): string {
  if (tuning.id === "5limit") {
    // Express as exact ratio over 1, reducing to lowest octave for readability
    // numerator = 3^u * 5^v (when u, v >= 0), denominator = 2^k for octave reduction
    // We'll just show cents deviation from 12-TET for simplicity
    const freq = nodeFreq(tuning, u, v);
    const nearest12tet = 261.63 * Math.pow(2, Math.round(12 * Math.log2(freq / 261.63)) / 12);
    const cents = Math.round(1200 * Math.log2(freq / nearest12tet));
    const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    const semitones = ((Math.round(12 * Math.log2(freq / 261.63)) % 12) + 12) % 12;
    return `${noteNames[semitones]}${cents >= 0 ? "+" : ""}${cents}¢`;
  }
  if (tuning.id === "bp") {
    const freq = nodeFreq(tuning, u, v);
    const cents = Math.round(1200 * Math.log2(freq / tuning.baseHz));
    return `${cents}¢`;
  }
  if (tuning.id === "19edo") {
    const freq = nodeFreq(tuning, u, v);
    const steps = Math.round(19 * Math.log2(freq / tuning.baseHz));
    return `${steps}st`;
  }
  return `${u},${v}`;
}

/** Ratio label for tooltip */
export function nodeRatioLabel(
  tuning: TuningSystem,
  u: number,
  v: number
): string {
  if (tuning.id === "5limit") {
    // Compute exact rational ratio (before octave reduction)
    // (3/2)^u × (5/4)^v = 3^u × 5^v / (2^u × 4^v) = 3^u × 5^v / 2^(u+2v)
    const num3 = u >= 0 ? Math.pow(3, u) : 1;
    const den3 = u >= 0 ? 1 : Math.pow(3, -u);
    const num5 = v >= 0 ? Math.pow(5, v) : 1;
    const den5 = v >= 0 ? 1 : Math.pow(5, -v);
    const den2u = u >= 0 ? Math.pow(2, u) : 1;
    const num2u = u >= 0 ? 1 : Math.pow(2, -u);
    const den4v = v >= 0 ? Math.pow(4, v) : 1;
    const num4v = v >= 0 ? 1 : Math.pow(4, -v);
    const totalNum = num3 * num5 * num2u * num4v;
    const totalDen = den3 * den5 * den2u * den4v;
    return fractionLabel(totalNum, totalDen);
  }
  if (tuning.id === "bp") {
    const freq = nodeFreq(tuning, u, v);
    return `${freq.toFixed(1)} Hz`;
  }
  if (tuning.id === "19edo") {
    const steps = u * 3 + v * 5;
    return `${steps} steps`;
  }
  return "";
}

/** Build all lattice nodes for a tuning */
export function buildLattice(tuning: TuningSystem): LatticeNode[] {
  const nodes: LatticeNode[] = [];
  const [uMin, uMax] = tuning.uRange;
  const [vMin, vMax] = tuning.vRange;
  for (let v = vMax; v >= vMin; v--) {
    for (let u = uMin; u <= uMax; u++) {
      const freq = nodeFreq(tuning, u, v);
      nodes.push({
        u,
        v,
        freq,
        label: nodeLabel(tuning, u, v),
        ratioLabel: nodeRatioLabel(tuning, u, v),
      });
    }
  }
  return nodes;
}
