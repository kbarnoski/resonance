// ─────────────────────────────────────────────────────────────────────────────
// model.ts — the PREDICTION verb for Foreshadow.
//
// Karel's chord progression is read as a Markov process over functional scale
// degrees. The transition prior comes from standard functional-harmony tables
// (one for major keys, one for minor) BLENDED with the take's OWN chord bigrams,
// so the forecast is both "what harmony usually does" and "what Karel does".
//
// From the current chord we Markov-propagate the next likely chords 1–4 steps
// ahead (`forecast`), and on each real arrival we score surprisal = −log₂ p(actual)
// (`probOf`). Surprisal is never shown as a number — the page turns it into the
// intensity of a felt visual RUPTURE and a subtle audible bloom.
//
// Ref: HookTheory-style next-chord transition statistics; David Huron,
// *Sweet Anticipation* (expectation + the ITPRA surprise response).
// ─────────────────────────────────────────────────────────────────────────────

import { chordRoot, chordIsMinor, type TrackChord } from "../_shared/trackAnalysis";

export interface KeyGuess {
  root: number; // pitch class 0..11
  minor: boolean;
}

export interface ForecastItem {
  symbol: string;
  prob: number; // 0..1, normalized across returned candidates
  root: number; // pitch class of the chord root (for hue)
  minor: boolean;
}

export interface Forecaster {
  key: KeyGuess;
  vocab: string[];
  /** Markov-propagate `horizon` (>=1) steps from `fromSymbol`; sorted desc. */
  forecast(fromSymbol: string, horizon: number): ForecastItem[];
  /** One-step transition probability p(to | from) — the arrival likelihood. */
  probOf(fromSymbol: string, toSymbol: string): number;
  /** Surprisal in bits of an actual arrival: −log₂ p(to | from). */
  surprisal(fromSymbol: string, toSymbol: string): number;
}

// Functional scale degrees (semitone offsets from the tonic).
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]; // I ii iii IV V vi vii°
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 11]; // i ii° III iv V(harmonic) VI VII

// Row = current degree, col = next degree. Rough functional weights; the piece
// normalizes each row, so these are read as relative tendencies, not exact probs.
const T_MAJOR: number[][] = [
  // I    ii   iii  IV   V    vi   vii
  [0.18, 0.15, 0.05, 0.2, 0.2, 0.17, 0.05], // I
  [0.1, 0.1, 0.1, 0.1, 0.4, 0.1, 0.1], // ii
  [0.1, 0.1, 0.05, 0.2, 0.1, 0.4, 0.05], // iii
  [0.2, 0.15, 0.05, 0.05, 0.35, 0.1, 0.1], // IV
  [0.5, 0.05, 0.05, 0.1, 0.05, 0.2, 0.05], // V
  [0.1, 0.25, 0.1, 0.25, 0.2, 0.05, 0.05], // vi
  [0.5, 0.05, 0.2, 0.05, 0.1, 0.1, 0.0], // vii°
];
const T_MINOR: number[][] = [
  // i    ii°  III  iv   V    VI   VII
  [0.2, 0.1, 0.1, 0.2, 0.2, 0.15, 0.05], // i
  [0.15, 0.05, 0.05, 0.1, 0.45, 0.1, 0.1], // ii°
  [0.1, 0.05, 0.05, 0.15, 0.1, 0.35, 0.2], // III
  [0.25, 0.1, 0.05, 0.05, 0.35, 0.15, 0.05], // iv
  [0.55, 0.05, 0.05, 0.1, 0.03, 0.2, 0.02], // V
  [0.1, 0.05, 0.15, 0.2, 0.2, 0.05, 0.25], // VI
  [0.25, 0.03, 0.35, 0.1, 0.15, 0.1, 0.02], // VII
];

function circDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

/** Map a semitone interval above the tonic to the nearest scale degree 0..6. */
function degreeOf(interval: number, scale: number[]): number {
  let bi = 0;
  let bd = 99;
  for (let i = 0; i < 7; i++) {
    const d = circDist(interval, scale[i]);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

/**
 * Detect the key: trust an explicit key string if present ("A minor", "C#",
 * "Dm"), else fall back to a duration-weighted root histogram + minor/major
 * vote. Only steers the prior, which is then blended with Karel's own bigrams.
 */
export function detectKey(keyStr: string | null, chords: TrackChord[]): KeyGuess {
  if (keyStr) {
    const m = keyStr.trim().match(/^([A-Ga-g][#b]?)\s*(maj|major|min|minor|m)?/i);
    if (m) {
      const root = chordRoot(m[1]);
      if (root !== null) {
        const q = (m[2] ?? "").toLowerCase();
        const minor = q === "m" || q === "min" || q === "minor";
        return { root, minor };
      }
    }
  }
  const w = new Array(12).fill(0);
  let minorDur = 0;
  let majorDur = 0;
  for (const c of chords) {
    const r = chordRoot(c.chord);
    if (r === null) continue;
    const d = c.duration > 0 ? c.duration : 1;
    w[r] += d;
    if (chordIsMinor(c.chord)) minorDur += d;
    else majorDur += d;
  }
  let root = 0;
  let best = -1;
  for (let i = 0; i < 12; i++) {
    if (w[i] > best) {
      best = w[i];
      root = i;
    }
  }
  return { root, minor: minorDur > majorDur };
}

interface SymbolInfo {
  symbol: string;
  root: number;
  minor: boolean;
  degree: number;
}

const ALPHA = 0.5; // prior weight vs observed-bigram weight

/**
 * Build a forecaster over the chord progression. Returns null if there is not
 * enough harmony to model (the page then degrades to an ambient gather).
 */
export function createForecaster(
  chords: TrackChord[],
  keyStr: string | null,
): Forecaster | null {
  const parsed: TrackChord[] = chords.filter((c) => chordRoot(c.chord) !== null);
  if (parsed.length < 6) return null;

  const key = detectKey(keyStr, parsed);
  const scale = key.minor ? MINOR_SCALE : MAJOR_SCALE;
  const T = key.minor ? T_MINOR : T_MAJOR;

  // Vocabulary in first-appearance order + duration-weighted global frequency.
  const infoBySym = new Map<string, SymbolInfo>();
  const freq = new Map<string, number>();
  const vocab: string[] = [];
  for (const c of parsed) {
    const root = chordRoot(c.chord)!;
    if (!infoBySym.has(c.chord)) {
      const interval = (root - key.root + 12) % 12;
      infoBySym.set(c.chord, {
        symbol: c.chord,
        root,
        minor: chordIsMinor(c.chord),
        degree: degreeOf(interval, scale),
      });
      vocab.push(c.chord);
    }
    freq.set(c.chord, (freq.get(c.chord) ?? 0) + (c.duration > 0 ? c.duration : 1));
  }
  const V = vocab.length;
  const idx = new Map<string, number>();
  vocab.forEach((s, i) => idx.set(s, i));

  let freqTot = 0;
  for (const s of vocab) freqTot += freq.get(s) ?? 0;
  const freqNorm = vocab.map((s) => (freq.get(s) ?? 0) / Math.max(1e-6, freqTot));

  // Observed symbol bigrams (skip repeats where the symbol is unchanged? no —
  // a held chord simply does not produce consecutive distinct entries here).
  const bigram: number[][] = Array.from({ length: V }, () => new Array(V).fill(0));
  let prev = -1;
  for (const c of parsed) {
    const i = idx.get(c.chord)!;
    if (prev >= 0 && i !== prev) bigram[prev][i] += 1;
    prev = i;
  }

  // Blended one-step transition matrix M (row-normalized).
  const M: number[][] = Array.from({ length: V }, () => new Array(V).fill(0));
  for (let i = 0; i < V; i++) {
    const di = infoBySym.get(vocab[i])!.degree;
    let obsRow = 0;
    for (let j = 0; j < V; j++) obsRow += bigram[i][j];
    for (let j = 0; j < V; j++) {
      const dj = infoBySym.get(vocab[j])!.degree;
      const priorW = T[di][dj] * freqNorm[j]; // degree tendency × who lives there
      const obsW = obsRow > 0 ? bigram[i][j] / obsRow : 0;
      M[i][j] = ALPHA * priorW + (1 - ALPHA) * obsW + 1e-4; // epsilon smoothing
    }
    let row = 0;
    for (let j = 0; j < V; j++) row += M[i][j];
    for (let j = 0; j < V; j++) M[i][j] /= row;
  }

  function stepVec(v: number[]): number[] {
    const out = new Array(V).fill(0);
    for (let i = 0; i < V; i++) {
      const vi = v[i];
      if (vi <= 0) continue;
      const row = M[i];
      for (let j = 0; j < V; j++) out[j] += vi * row[j];
    }
    return out;
  }

  return {
    key,
    vocab,
    forecast(fromSymbol, horizon) {
      const i0 = idx.get(fromSymbol);
      if (i0 === undefined) return [];
      let v = new Array(V).fill(0);
      v[i0] = 1;
      const h = Math.max(1, Math.min(4, Math.round(horizon)));
      for (let s = 0; s < h; s++) v = stepVec(v);
      const items: ForecastItem[] = vocab.map((sym, j) => {
        const info = infoBySym.get(sym)!;
        return { symbol: sym, prob: v[j], root: info.root, minor: info.minor };
      });
      items.sort((a, b) => b.prob - a.prob);
      return items;
    },
    probOf(fromSymbol, toSymbol) {
      const i = idx.get(fromSymbol);
      const j = idx.get(toSymbol);
      if (i === undefined || j === undefined) return 1e-4;
      return M[i][j];
    },
    surprisal(fromSymbol, toSymbol) {
      const p = this.probOf(fromSymbol, toSymbol);
      return -Math.log2(Math.max(1e-6, p));
    },
  };
}
