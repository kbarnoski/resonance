// ─────────────────────────────────────────────────────────────────────────────
// 1562-constant-q-spiral — cqt.ts
//
// Pure, browser-global-free math for a Constant-Q filterbank. NO Web Audio,
// NO DOM here — just the band layout and the RBJ-cookbook bandpass biquad
// coefficients that audio.ts hands to real IIRFilterNodes.
//
// A Constant-Q Transform (Brown 1991) is a scalogram: a geometrically-spaced
// bank of bandpass filters that all share the SAME quality factor Q — i.e. the
// same number of cycles per band — so pitch is uniform on a log axis and every
// octave is an equal step. That is exactly the wavelet / Morlet-scalogram idea
// and it is what lets us stack octaves cleanly on a spiral.
//
// Determinism: mulberry32 only — no wall-clock, no non-seeded randomness.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG. Deterministic given the same seed — every stochastic choice in
 *  this prototype flows from here so nothing depends on non-seeded entropy. */
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

/** Bands per octave (one filter per equal-tempered semitone). */
export const BANDS_PER_OCTAVE = 12;
/** Lowest band center — C2 (65.41 Hz). */
export const BASE_FREQ = 65.406;
/** Total bands. 60 = five octaves, C2 → C7 (~2093 Hz). */
export const NUM_BANDS = 60;

/** A single filterbank band, precomputed once. */
export interface CqtBand {
  /** Center frequency (Hz). */
  freq: number;
  /** Semitone index from BASE_FREQ (== band index). */
  semitone: number;
  /** Octave number (0 at the base). radius grows with this. */
  octave: number;
  /** Pitch class 0..11 (chroma). angle wraps on this — octave equivalence. */
  pc: number;
}

/** The geometric band layout: freq[i] = BASE_FREQ * 2^(i / BANDS_PER_OCTAVE). */
export function makeBands(): CqtBand[] {
  const bands: CqtBand[] = [];
  for (let i = 0; i < NUM_BANDS; i++) {
    bands.push({
      freq: BASE_FREQ * Math.pow(2, i / BANDS_PER_OCTAVE),
      semitone: i,
      octave: Math.floor(i / BANDS_PER_OCTAVE),
      pc: i % BANDS_PER_OCTAVE,
    });
  }
  return bands;
}

/** Ideal constant-Q for B bands/octave: Q = 1 / (2^(1/2B) - 2^(-1/2B)).
 *  For B = 12 this is ≈ 17.3 — quite sharp / ringy. */
export function idealConstantQ(bandsPerOctave = BANDS_PER_OCTAVE): number {
  const up = Math.pow(2, 1 / (2 * bandsPerOctave));
  const down = Math.pow(2, -1 / (2 * bandsPerOctave));
  return 1 / (up - down);
}

/** We soften the ideal Q slightly so the resonators ring musically without
 *  edging toward feedback howl when the live mic path is open. Still a genuine
 *  CONSTANT Q (identical for every band) — the CQT property is preserved. */
export const Q_SCALE = 0.8;
export const BAND_Q = idealConstantQ() * Q_SCALE; // ≈ 13.8

/** RBJ-cookbook bandpass (constant 0 dB peak gain), normalized by a0.
 *  Returns arrays sized for IIRFilterNode: feedforward (b) and feedback (a),
 *  with feedback[0] === 1. This is a real second-order resonant bandpass —
 *  the beating heart of the constant-Q analysis (never an FFT). */
export function rbjBandpass(
  f0: number,
  sampleRate: number,
  q: number,
): { feedforward: number[]; feedback: number[] } {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);

  // Unnormalized RBJ BPF (0 dB peak):
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  return {
    feedforward: [b0 / a0, b1 / a0, b2 / a0],
    feedback: [1, a1 / a0, a2 / a0],
  };
}
