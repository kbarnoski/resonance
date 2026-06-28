// fm.ts — pure, DOM/audio-free Chowning FM synthesis math.
//
// This module is intentionally dependency-free and side-effect-free so the
// timbre-space mapping and the analytic FM spectrum can be unit-tested
// headlessly. Nothing here touches Web Audio or the DOM.
//
// Reference: John Chowning, "The Synthesis of Complex Audio Spectra by Means
// of Frequency Modulation," J. Audio Eng. Soc. 21(7), 1973. The DX7 (1983)
// arranged 6 operators into 32 "algorithms" — fixed routings of which
// operators modulate which. We model a small subset of that idea.

/* ── tilt → timbre-space mapping ─────────────────────────────────────── */

/** A point in the 2-D FM timbre space, both axes normalised to [0,1]. */
export interface TimbrePoint {
  /** 0 → pure sine carrier, 1 → many bright sidebands. */
  index: number;
  /** 0 → low operator:carrier ratio, 1 → high ratio. */
  ratio: number;
}

/** Musically useful modulator:carrier frequency ratios, low → high.
 *  Integer ratios give harmonic (organ/brass) spectra; non-integer ratios
 *  (1.5, 3.5) give inharmonic, bell-like clusters — the DX7's signature. */
export const RATIO_STEPS = [0.5, 1, 1.5, 2, 3, 3.5, 7] as const;

export const MOD_INDEX_MAX = 12;

/** Clamp x into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Map a normalised [0,1] axis value to the nearest musical ratio step. */
export function snapRatio(axis: number): number {
  const a = clamp(axis, 0, 1);
  const i = Math.round(a * (RATIO_STEPS.length - 1));
  return RATIO_STEPS[i];
}

/** Map a normalised [0,1] axis value to a continuous modulation index. */
export function axisToModIndex(axis: number): number {
  return clamp(axis, 0, 1) * MOD_INDEX_MAX;
}

/**
 * Map raw device-orientation angles to a TimbrePoint.
 *  - gamma (left-right tilt, deg) sweeps the ratio axis.
 *  - beta  (front-back tilt, deg) sweeps the modulation-index axis.
 * The usable tilt range is ±`span` degrees about the centre.
 */
export function tiltToTimbre(
  beta: number,
  gamma: number,
  span = 40,
): TimbrePoint {
  const ratio = clamp(gamma / span, -1, 1) * 0.5 + 0.5;
  const index = clamp(beta / span, -1, 1) * 0.5 + 0.5;
  return { index, ratio };
}

/* ── analytic FM spectrum (Bessel-function sidebands) ────────────────── */

// FM with carrier fc, modulator fm and modulation index I produces sidebands
// at fc ± k·fm whose amplitudes are the Bessel functions J_k(I). As I grows,
// energy spreads into higher-order sidebands — that is the spectral "bloom".

/** Bessel function of the first kind, J_n(x), via series + recurrence.
 *  Accurate enough for visualisation/timbre work over our parameter range. */
export function besselJ(n: number, x: number): number {
  n = Math.abs(n);
  if (x === 0) return n === 0 ? 1 : 0;
  // Direct power series for small/moderate arguments.
  // J_n(x) = sum_{m>=0} (-1)^m / (m! (m+n)!) (x/2)^(2m+n)
  const halfX = x / 2;
  let term = Math.pow(halfX, n) / factorial(n);
  let sum = term;
  for (let m = 1; m < 60; m++) {
    term *= (-(halfX * halfX)) / (m * (m + n));
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return sum;
}

const FACT_CACHE: number[] = [1];
function factorial(k: number): number {
  if (k < FACT_CACHE.length) return FACT_CACHE[k];
  let f = FACT_CACHE[FACT_CACHE.length - 1];
  for (let i = FACT_CACHE.length; i <= k; i++) {
    f *= i;
    FACT_CACHE[i] = f;
  }
  return f;
}

/** A single partial in the analytic FM spectrum. */
export interface Partial {
  /** Frequency in Hz. */
  freq: number;
  /** Linear amplitude (0..~1), already abs-valued. */
  amp: number;
}

/**
 * Compute the analytic FM spectrum for a carrier/modulator pair.
 * Returns partials at fc + k·fm for k in [-order, order], dropping negative
 * frequencies (folded to positive) and near-zero amplitudes.
 */
export function fmSpectrum(
  carrierHz: number,
  ratio: number,
  modIndex: number,
  order = 14,
): Partial[] {
  const fm = carrierHz * ratio;
  const out: Partial[] = [];
  for (let k = -order; k <= order; k++) {
    const amp = besselJ(k, modIndex);
    const aamp = Math.abs(amp);
    if (aamp < 1e-3) continue;
    let freq = carrierHz + k * fm;
    if (freq < 0) freq = -freq; // reflected sideband folds to positive axis
    if (freq < 1) continue;
    out.push({ freq, amp: aamp });
  }
  return out;
}

/** Spectral brightness: amplitude-weighted mean partial frequency (Hz).
 *  Rises monotonically-ish as the modulation index opens up sidebands. */
export function spectralCentroid(partials: Partial[]): number {
  let num = 0;
  let den = 0;
  for (const p of partials) {
    num += p.freq * p.amp;
    den += p.amp;
  }
  return den > 0 ? num / den : 0;
}

/* ── operator algorithms (DX7-style routings) ────────────────────────── */

export type AlgorithmId = "2op" | "stack3" | "parallel";

export interface Algorithm {
  id: AlgorithmId;
  name: string;
  /** Human-readable routing, e.g. "M→C". */
  routing: string;
  /** Operator count this algorithm uses. */
  operators: number;
  /** Modulation links as [fromOp, toOp] indices into the node ring. */
  links: [number, number][];
  /** Which operator indices are carriers (audible). */
  carriers: number[];
}

/** The selectable operator routings. Up to 6 nodes are placed on a ring so the
 *  visualiser can draw any of them; unused nodes simply have no links. */
export const ALGORITHMS: Algorithm[] = [
  {
    id: "2op",
    name: "2-OP",
    routing: "M → C",
    operators: 2,
    links: [[1, 0]],
    carriers: [0],
  },
  {
    id: "stack3",
    name: "3-STACK",
    routing: "M2 → M1 → C",
    operators: 3,
    links: [
      [2, 1],
      [1, 0],
    ],
    carriers: [0],
  },
  {
    id: "parallel",
    name: "PARALLEL",
    routing: "M→C1  ·  M→C2  ·  M→C3",
    operators: 6,
    links: [
      [3, 0],
      [4, 1],
      [5, 2],
    ],
    carriers: [0, 1, 2],
  },
];

export function algorithmById(id: AlgorithmId): Algorithm {
  return ALGORITHMS.find((a) => a.id === id) ?? ALGORITHMS[0];
}

/* ── arpeggio / chord bed ────────────────────────────────────────────── */

// A soft D Lydian pad so tilting morphs timbre over a consonant bed.
// MIDI: D3=50. Lydian on D: D E F# G# A B C#.
export const ARP_MIDI = [50, 57, 62, 66, 69, 73] as const; // D3 A3 D4 F#4 A4 C#5

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
