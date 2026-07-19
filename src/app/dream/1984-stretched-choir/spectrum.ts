/**
 * spectrum.ts — the harmonic model of the Stretched Choir.
 *
 * The novelty: every voice is an ADDITIVE stack of partials whose frequencies
 * are STRETCHED. Partial `n` does not sit at the pure harmonic `n * f0`; it
 * sits at `f0 * n^β` where `β = log2(stretch)`. When `stretch === 2` this
 * collapses to the ordinary harmonic series (β = 1). When `stretch > 2` the
 * overtones drift progressively sharp — the Railsback piano-tuning stretch,
 * generalised — so stacked notes beat and shimmer.
 *
 * The SCALE is derived from the SAME kind of stretch (Sethares: dissonance is
 * minimised when the scale's step ratio matches the timbre's partial spacing).
 * A note `midi` semitones is tuned to `REF * scaleStretch^((midi-69)/12)`.
 * When `scaleStretch === timbreStretch` the partials of stacked notes re-align
 * and chords lock into an eerie, glassy consonance — even though the whole
 * thing is detuned from equal temperament. Decouple the two and consonance
 * melts. That melt/re-form is the demo.
 */

/** A4 = 440 Hz anchor (MIDI 69). All tuning is relative to this. */
export const REF_MIDI = 69;
export const REF_FREQ = 440;

/** Number of partials per additive voice. Higher = richer, heavier. */
export const PARTIAL_COUNT = 6;

/** Slider range for the pseudo-octave stretch. 2.0 == pure harmonic. */
export const STRETCH_MIN = 1.98;
export const STRETCH_MAX = 2.12;
export const STRETCH_DEFAULT = 2.05;

/**
 * Frequency of partial `n` (1-indexed) of a voice with fundamental `f0`,
 * under a given pseudo-octave `stretch`. β = log2(stretch).
 *   stretch = 2   -> f0 * n            (harmonic)
 *   stretch = 2.05-> f0 * n^1.0356     (partials drift sharp)
 */
export function partialFreq(f0: number, n: number, stretch: number): number {
  const beta = Math.log2(stretch);
  return f0 * Math.pow(n, beta);
}

/**
 * Tune a MIDI note number to Hz through a stretched division of the
 * pseudo-octave. Twelve equal steps span one `scaleStretch`, so each
 * semitone is the ratio `scaleStretch^(1/12)`.
 */
export function noteFreq(midi: number, scaleStretch: number): number {
  return REF_FREQ * Math.pow(scaleStretch, (midi - REF_MIDI) / 12);
}

/** Amplitude of partial `n` — a gentle 1/n^0.8 rolloff keeps highs present. */
export function partialAmp(n: number): number {
  return 1 / Math.pow(n, 0.8);
}

/** Note name for a MIDI number (display only; names are the ET labels). */
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Sethares sensory-dissonance between two partials.
 * Standard Plomp–Levelt parametrisation (Sethares 1998, eq. for d(f1,f2)).
 */
function partialDissonance(
  f1: number,
  f2: number,
  a1: number,
  a2: number,
): number {
  const b1 = 3.5;
  const b2 = 5.75;
  const dstar = 0.24;
  const s1 = 0.0207;
  const s2 = 18.96;
  const fmin = Math.min(f1, f2);
  const df = Math.abs(f2 - f1);
  const s = dstar / (s1 * fmin + s2);
  const amin = Math.min(a1, a2);
  return amin * (Math.exp(-b1 * s * df) - Math.exp(-b2 * s * df));
}

/**
 * Total sensory dissonance of a set of sounding fundamentals, expanding each
 * into its stretched partial stack under `timbreStretch`. Returned value is a
 * raw sum; callers normalise for display. Higher = rougher / more beating.
 */
export function chordDissonance(
  fundamentals: number[],
  timbreStretch: number,
): number {
  const freqs: number[] = [];
  const amps: number[] = [];
  for (const f0 of fundamentals) {
    for (let n = 1; n <= PARTIAL_COUNT; n++) {
      freqs.push(partialFreq(f0, n, timbreStretch));
      amps.push(partialAmp(n));
    }
  }
  let d = 0;
  for (let i = 0; i < freqs.length; i++) {
    for (let j = i + 1; j < freqs.length; j++) {
      d += partialDissonance(freqs[i], freqs[j], amps[i], amps[j]);
    }
  }
  return d;
}
