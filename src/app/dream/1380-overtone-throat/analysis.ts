// ─────────────────────────────────────────────────────────────────────────────
// 1380 · OVERTONE THROAT — analysis helpers
// Pure functions: pitch detection (autocorrelation), note naming, the harmonic
// ladder metadata, and the glyph ramp. No React, no Web Audio nodes here.
// ─────────────────────────────────────────────────────────────────────────────

export const NUM_HARMONICS = 12;

/** Glyph luminance ramp — index 0 is empty, last is a full block. Row density
 *  along a trace ramps up this scale with that overtone's energy. */
export const RAMP = " ·:+*#█"; // " ·:+*#█"  (7 levels)

/** Number of columns in each harmonic trace (an oscilloscope-style history). */
export const TRACE_COLS = 44;

export const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;

/** Metadata for harmonics 1..12: the ratio (reduced into one octave) and the
 *  musical interval each partial approximates above the fundamental. */
export interface HarmonicMeta {
  h: number;
  ratio: string;
  interval: string;
}

export const HARMONICS: HarmonicMeta[] = [
  { h: 1, ratio: "1:1", interval: "fundamental" },
  { h: 2, ratio: "2:1", interval: "octave" },
  { h: 3, ratio: "3:2", interval: "fifth" },
  { h: 4, ratio: "4:1", interval: "two octaves" },
  { h: 5, ratio: "5:4", interval: "major third" },
  { h: 6, ratio: "3:2", interval: "fifth" },
  { h: 7, ratio: "7:4", interval: "harmonic 7th" },
  { h: 8, ratio: "8:1", interval: "three octaves" },
  { h: 9, ratio: "9:8", interval: "major second" },
  { h: 10, ratio: "5:4", interval: "major third" },
  { h: 11, ratio: "11:8", interval: "neutral fourth" },
  { h: 12, ratio: "3:2", interval: "fifth" },
];

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

export interface NoteName {
  name: string; // e.g. "A2"
  cents: number; // deviation from equal-tempered pitch
  midi: number;
}

export function freqFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Nearest equal-tempered note name + cents deviation for a frequency. */
export function noteName(freq: number): NoteName {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  const exact = freqFromMidi(midi);
  const cents = Math.round(1200 * Math.log2(freq / exact));
  return { name: `${name}${oct}`, cents, midi };
}

/** Autocorrelation pitch detector (normalized-difference, ml5-style).
 *  Returns f0 in Hz, or -1 when the signal is too quiet / unpitched.
 *  O(n^2) on the buffer — call on demand (a button), not every frame. */
export function detectF0(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1; // too quiet to trust

  // Trim leading/trailing near-silence to sharpen the correlation.
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }
  const b = buf.subarray(r1, r2);
  const size2 = b.length;
  if (size2 < 32) return -1;

  const c = new Float32Array(size2);
  for (let i = 0; i < size2; i++) {
    let sum = 0;
    for (let j = 0; j < size2 - i; j++) sum += b[j] * b[j + i];
    c[i] = sum;
  }

  // Walk past the initial descent, then find the first strong peak.
  let d = 0;
  while (d < size2 - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size2; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  let T0 = maxpos;
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a !== 0) T0 = T0 - bb / (2 * a);

  const f = sampleRate / T0;
  if (f < 50 || f > 1000) return -1;
  return f;
}

/** Render a history ring of energies (0..1) into a glyph trace string. */
export function traceString(hist: number[], ramp: string): string {
  const L = ramp.length - 1;
  let s = "";
  for (let i = 0; i < hist.length; i++) {
    let idx = Math.round(clamp(hist[i], 0, 1) * L);
    if (idx < 0) idx = 0;
    if (idx > L) idx = L;
    s += ramp[idx];
  }
  return s;
}
