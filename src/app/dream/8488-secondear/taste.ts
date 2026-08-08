// 8488-secondear — feature extraction, the online preference model, and the
// seeded synthetic listener that keeps the piece alive on a muted phone.
//
// NO ML library. The taste model is a plain online logistic regression over an
// 8-D feature vector, updated one keep(+)/pass(−) bit at a time by the standard
// perceptron-style gradient rule  w += lr·(y − p)·x. Candidates are ranked by
// the raw logit; the top-scoring candidate is proposed, so proposals drift
// toward whatever the listener keeps. This is the TuneJury pairwise-preference
// idea (arXiv:2606.21670) run LIVE, per-player, in seconds — see README.md.

import type { Phrase } from "./compose";

export const FEATURE_DIM = 8;

/** Human-readable axis names, index-aligned with extractFeatures(). */
export const FEATURE_LABELS = [
  "register",
  "range",
  "density",
  "syncopation",
  "contour",
  "interval",
  "dissonance",
  "leaps",
] as const;

// The two features the taste-space MAP is drawn on.
export const AXIS_X = 2; // rhythmic density  → horizontal
export const AXIS_Y = 0; // register (pitch height) → vertical

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Read an 8-D feature vector (each ~0..1) off a realized phrase. */
export function extractFeatures(phrase: Phrase): number[] {
  const notes = phrase.notes;
  const pitches = notes.map((n) => n.midi);
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);

  let up = 0;
  let down = 0;
  let absSum = 0;
  let diss = 0;
  let leaps = 0;
  const intervals = pitches.length - 1;
  for (let i = 1; i < pitches.length; i++) {
    const d = pitches[i] - pitches[i - 1];
    if (d > 0) up++;
    else if (d < 0) down++;
    absSum += Math.abs(d);
    const ic = Math.abs(d) % 12;
    if (ic === 1 || ic === 2 || ic === 6 || ic === 10 || ic === 11) diss++;
    if (Math.abs(d) > 4) leaps++;
  }

  // Metric weight of each onset → higher when notes land off the beat.
  let syncSum = 0;
  for (const n of notes) {
    if (n.step % 8 === 0) syncSum += 0;
    else if (n.step % 4 === 0) syncSum += 0.35;
    else if (n.step % 2 === 0) syncSum += 0.65;
    else syncSum += 1;
  }

  const register = clamp01((mean - 48) / 36);
  const range = clamp01((max - min) / 24);
  const density = clamp01(notes.length / phrase.steps);
  const syncopation = clamp01(syncSum / notes.length);
  const contour = up + down === 0 ? 0.5 : up / (up + down);
  const interval = intervals === 0 ? 0 : clamp01(absSum / intervals / 12);
  const dissonance = intervals === 0 ? 0 : diss / intervals;
  const leapRatio = intervals === 0 ? 0 : leaps / intervals;

  return [register, range, density, syncopation, contour, interval, dissonance, leapRatio];
}

// ── The online preference model ──────────────────────────────────────────────

export interface TasteModel {
  w: number[]; // preference weights, one per feature
  b: number; // bias
  mean: number[]; // running feature mean (used to slice the 2-D taste field)
  count: number;
}

export function makeModel(): TasteModel {
  return {
    w: new Array(FEATURE_DIM).fill(0),
    b: 0,
    mean: new Array(FEATURE_DIM).fill(0.5),
    count: 0,
  };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function dot(w: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * x[i];
  return s;
}

/** Raw logit — used to RANK candidates (higher = more "you"). */
export function scoreLogit(model: TasteModel, x: number[]): number {
  return dot(model.w, x) + model.b;
}

/** Predicted probability the listener KEEPS this phrase. Starts at 0.5. */
export function predict(model: TasteModel, x: number[]): number {
  return sigmoid(scoreLogit(model, x));
}

const LR = 0.4;
const L2 = 0.004;

/** One online step from a single keep(1)/pass(0) bit. */
export function learn(model: TasteModel, x: number[], y: number): void {
  const p = predict(model, x);
  const err = y - p;
  for (let i = 0; i < model.w.length; i++) {
    model.w[i] += LR * (err * x[i] - L2 * model.w[i]);
  }
  model.b += LR * err;
  // Running feature mean, so the taste-field slice tracks what's been heard.
  model.count++;
  const k = 1 / model.count;
  for (let i = 0; i < model.mean.length; i++) {
    model.mean[i] += (x[i] - model.mean[i]) * Math.max(k, 0.08);
  }
}

/** Rank a batch by logit and return the single best candidate's index. */
export function bestCandidate(model: TasteModel, feats: number[][]): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < feats.length; i++) {
    const s = scoreLogit(model, feats[i]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

// ── The seeded synthetic listener (hidden taste) ─────────────────────────────
//
// It has a fixed, HIDDEN ideal — it likes DENSE, SYNCOPATED, HIGH phrases — and
// keeps stochastically (so accuracy caps realistically below 100%). The model
// never sees this ideal; it must infer it from keep/pass alone.

const IDEAL = [0.85, 0.45, 0.85, 0.8, 0.55, 0.45, 0.35, 0.4];
const IMPORTANCE = [1.4, 0.35, 1.4, 1.25, 0.3, 0.4, 0.5, 0.4];

export interface SyntheticListener {
  decide(x: number[]): boolean;
}

export function makeSyntheticListener(rng: () => number): SyntheticListener {
  return {
    decide(x: number[]): boolean {
      let d = 0;
      for (let i = 0; i < x.length; i++) {
        const diff = x[i] - IDEAL[i];
        d += IMPORTANCE[i] * diff * diff;
      }
      const pKeep = sigmoid(4 * (0.9 - d));
      return rng() < pKeep;
    },
  };
}
