// listener.ts — the LISTENER (machine listening / score-following his playing).
// Pure analysis helpers + a small stateful tracker. No browser globals here.
// Given an AnalyserNode's frequency magnitudes, we:
//   (a) fold FFT bins into a 12-bin chroma vector, smooth it, fit a triad;
//   (b) track energy (RMS-ish) and spectral flux for onsets;
//   (c) detect PHRASE GAPS: sustained activity followed by a quiet window.

export const PITCH_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export type ChordQuality = "maj" | "min";

export type ChordEstimate = {
  root: number; // 0..11 pitch class
  quality: ChordQuality;
  name: string; // e.g. "A min"
  strength: number; // 0..1 correlation confidence
  tension: number; // 0..1 (1 = ambiguous / dissonant)
};

// Chroma templates for a triad rooted at pitch class 0 (relative).
const MAJ_TEMPLATE = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const MIN_TEMPLATE = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

// Fold FFT magnitudes into 12 pitch-class bins.
export function computeChroma(
  mags: Uint8Array,
  sampleRate: number,
  fftSize: number,
): Float32Array {
  const chroma = new Float32Array(12);
  const binHz = sampleRate / fftSize;
  // Ignore the lowest bins (rumble) and the very top (noise).
  const minBin = Math.max(1, Math.floor(70 / binHz));
  const maxBin = Math.min(mags.length - 1, Math.floor(2000 / binHz));
  for (let i = minBin; i <= maxBin; i++) {
    const m = mags[i] / 255;
    if (m < 0.04) continue;
    const freq = i * binHz;
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += m * m; // energy-weighted
  }
  // Normalize.
  let max = 0;
  for (let i = 0; i < 12; i++) max = Math.max(max, chroma[i]);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

// Correlate a (normalized) chroma vector against all 24 major/minor triads.
export function fitChord(chroma: Float32Array): ChordEstimate {
  let best = { root: 9, quality: "min" as ChordQuality, score: -1 };
  let second = -1;
  const qualities: Array<{ q: ChordQuality; tpl: number[] }> = [
    { q: "maj", tpl: MAJ_TEMPLATE },
    { q: "min", tpl: MIN_TEMPLATE },
  ];
  for (const { q, tpl } of qualities) {
    for (let root = 0; root < 12; root++) {
      let dot = 0;
      for (let i = 0; i < 12; i++) {
        dot += chroma[i] * tpl[(i - root + 12) % 12];
      }
      if (dot > best.score) {
        second = best.score;
        best = { root, quality: q, score: dot };
      } else if (dot > second) {
        second = dot;
      }
    }
  }
  const strength = Math.min(1, best.score / 3);
  // Tension: how close the runner-up was to the winner (ambiguity).
  const tension =
    best.score > 0 ? Math.max(0, Math.min(1, second / best.score)) : 1;
  return {
    root: best.root,
    quality: best.quality,
    name: `${PITCH_NAMES[best.root]} ${best.quality}`,
    strength,
    tension,
  };
}

// ─── Phrase / gap tracker (stateful, but plain object — no globals) ──────────
export type ListenerState = {
  smoothChroma: Float32Array;
  prevMags: Float32Array;
  energy: number; // smoothed 0..1
  flux: number; // smoothed spectral flux 0..1
  chord: ChordEstimate;
  // Gap detection bookkeeping:
  activeMs: number; // how long he has been sounding
  quietMs: number; // how long it has been quiet
  inGap: boolean; // currently in a phrase gap
  gapJustOpened: boolean; // true exactly on the frame a gap opens (one-shot)
  lastRoot: number; // root of his last confident chord (for the answer)
  lastBrightChroma: number; // a "contour" hint: high-PC energy 0..1
};

export function makeListenerState(): ListenerState {
  return {
    smoothChroma: new Float32Array(12),
    prevMags: new Float32Array(0),
    energy: 0,
    flux: 0,
    chord: { root: 9, quality: "min", name: "A min", strength: 0, tension: 1 },
    activeMs: 0,
    quietMs: 0,
    inGap: false,
    gapJustOpened: false,
    lastRoot: 9,
    lastBrightChroma: 0.5,
  };
}

const ENERGY_ACTIVE = 0.16; // above this = he is playing
const ENERGY_QUIET = 0.09; // below this = quiet
const GAP_AFTER_MS = 320; // quiet this long (after activity) = phrase gap
const MIN_PHRASE_MS = 600; // need this much activity before a gap "counts"

// Advance the listener by one analysis frame.
export function runListenerFrame(
  state: ListenerState,
  mags: Uint8Array,
  sampleRate: number,
  fftSize: number,
  dtMs: number,
): void {
  // Energy (mean magnitude in voice band).
  let sum = 0;
  let count = 0;
  for (let i = 2; i < mags.length; i++) {
    sum += mags[i];
    count++;
  }
  const rawEnergy = count > 0 ? sum / count / 255 : 0;
  // Spectral flux (positive differences vs previous frame).
  let flux = 0;
  if (state.prevMags.length === mags.length) {
    for (let i = 2; i < mags.length; i++) {
      const d = mags[i] / 255 - state.prevMags[i] / 255;
      if (d > 0) flux += d;
    }
    flux /= mags.length;
  }
  if (state.prevMags.length !== mags.length) {
    state.prevMags = new Float32Array(mags.length);
  }
  state.prevMags.set(mags);

  // Smooth.
  state.energy = state.energy * 0.82 + rawEnergy * 0.18;
  state.flux = state.flux * 0.7 + Math.min(1, flux * 14) * 0.3;

  // Chroma + chord (smoothed).
  const chroma = computeChroma(mags, sampleRate, fftSize);
  for (let i = 0; i < 12; i++) {
    state.smoothChroma[i] = state.smoothChroma[i] * 0.78 + chroma[i] * 0.22;
  }
  const chord = fitChord(state.smoothChroma);
  // Only adopt a new chord when we have some confidence.
  if (chord.strength > 0.18) {
    state.chord = chord;
    if (state.energy > ENERGY_ACTIVE) state.lastRoot = chord.root;
  }

  // A crude "contour" hint: energy in the upper half of the chroma.
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 12; i++) {
    if (i >= 6) hi += state.smoothChroma[i];
    else lo += state.smoothChroma[i];
  }
  const tot = hi + lo;
  if (tot > 0) state.lastBrightChroma = hi / tot;

  // Gap state machine.
  state.gapJustOpened = false;
  if (state.energy > ENERGY_ACTIVE) {
    state.activeMs += dtMs;
    state.quietMs = 0;
    if (state.inGap) state.inGap = false;
  } else if (state.energy < ENERGY_QUIET) {
    state.quietMs += dtMs;
    if (
      !state.inGap &&
      state.activeMs > MIN_PHRASE_MS &&
      state.quietMs > GAP_AFTER_MS
    ) {
      state.inGap = true;
      state.gapJustOpened = true; // one-shot: "his phrase just ended, my turn"
      state.activeMs = 0;
    }
  }
}
