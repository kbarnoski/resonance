// 9160-tasteprint — feature extraction, the online preference model, the
// localStorage persistence layer, and the seeded synthetic listener that keeps
// the piece alive (visually) on a muted phone.
//
// NO ML library. The taste model is a plain online logistic regression over an
// 8-D feature vector, updated one Keep(+1)/Pass(0) bit at a time by the standard
// perceptron-style rule  w += lr·(y − p)·x. Candidates are ranked by the raw
// logit; the top candidate is proposed, so proposals drift toward whatever the
// listener keeps. What tasteprint adds over its ancestor: the model + running
// stats + a session counter are serialized to localStorage, so on return it
// GREETS you back with a legible portrait of your own ear.

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

/** Short, human phrases describing a strong lean on each axis (high / low). */
export const AXIS_LEAN: { high: string; low: string }[] = [
  { high: "bright, high register", low: "low & grounded" },
  { high: "wide-ranging", low: "narrow-compass" },
  { high: "busy & dense", low: "sparse & spacious" },
  { high: "syncopated, off-kilter", low: "on-the-beat steady" },
  { high: "rising lines", low: "falling lines" },
  { high: "far melodic reach", low: "close & stepwise" },
  { high: "spicy & chromatic", low: "consonant & clean" },
  { high: "leaping", low: "conjunct" },
];

// Which two feature axes the taste-space scatter is drawn on.
export const SCATTER_X = 2; // density → horizontal
export const SCATTER_Y = 0; // register → vertical

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
  const syncopation = clamp01(syncSum / Math.max(notes.length, 1));
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
  keptMean: number[]; // running mean feature vector of KEPT phrases
  keptCount: number; // kept phrases
  passCount: number; // passed phrases
  sessions: number; // how many visits this model has seen
}

export function makeModel(): TasteModel {
  return {
    w: new Array(FEATURE_DIM).fill(0),
    b: 0,
    keptMean: new Array(FEATURE_DIM).fill(0.5),
    keptCount: 0,
    passCount: 0,
    sessions: 1,
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

/** One online step from a single Keep(1)/Pass(0) bit. */
export function learn(model: TasteModel, x: number[], y: number): void {
  const p = predict(model, x);
  const err = y - p;
  for (let i = 0; i < model.w.length; i++) {
    model.w[i] += LR * (err * x[i] - L2 * model.w[i]);
  }
  model.b += LR * err;
  if (y >= 0.5) {
    model.keptCount++;
    const k = Math.max(1 / model.keptCount, 0.08);
    for (let i = 0; i < model.keptMean.length; i++) {
      model.keptMean[i] += (x[i] - model.keptMean[i]) * k;
    }
  } else {
    model.passCount++;
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

/**
 * The "learned ideal ear" per axis, in [0,1] — the polygon the portrait draws.
 * Blends the weight direction (what the model has learned DISCRIMINATES keep vs
 * pass) with the running mean of kept phrases (what you literally keep). Both
 * are bounded and morph smoothly, so the radar reads as a stable self-portrait.
 */
export function idealAxes(model: TasteModel): number[] {
  const out: number[] = new Array(FEATURE_DIM);
  for (let i = 0; i < FEATURE_DIM; i++) {
    const fromWeight = 0.5 + 0.5 * Math.tanh(0.85 * model.w[i]);
    out[i] = clamp01(0.55 * fromWeight + 0.45 * model.keptMean[i]);
  }
  return out;
}

/** Top-N strongest leanings (by |weight|), as short human phrases. */
export function topLeanings(model: TasteModel, n: number): string[] {
  const order = model.w
    .map((w, i) => ({ i, w }))
    .filter((e) => Math.abs(e.w) > 0.06)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, n);
  return order.map((e) => (e.w >= 0 ? AXIS_LEAN[e.i].high : AXIS_LEAN[e.i].low));
}

/** A one-line greet-back summarizing a restored ear's strongest leanings. */
export function proposeGreeting(model: TasteModel): string {
  const leans = topLeanings(model, 2);
  if (leans.length === 0) {
    return "Welcome back — your ear is still taking shape. Keep going.";
  }
  if (leans.length === 1) {
    return `Welcome back — you lean toward ${leans[0]}.`;
  }
  return `Welcome back — you lean toward ${leans[0]} and ${leans[1]}.`;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export const STORAGE_KEY = "resonance.dream.9160.taste.v1";

interface StoredModel {
  v: 1;
  w: number[];
  b: number;
  keptMean: number[];
  keptCount: number;
  passCount: number;
  sessions: number;
}

/** Result of trying to restore a persisted model on mount. */
export interface RestoreResult {
  model: TasteModel;
  returning: boolean; // a saved model with real bits was found
  available: boolean; // localStorage worked (false → private mode etc.)
}

/**
 * Load a saved model if present. Bumps the session counter on a real return.
 * Never throws — private-mode / blocked storage returns available=false and a
 * fresh model, so the piece runs without persistence.
 */
export function restoreModel(): RestoreResult {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { model: makeModel(), returning: false, available: true };
    }
    const s = JSON.parse(raw) as StoredModel;
    if (
      !s ||
      s.v !== 1 ||
      !Array.isArray(s.w) ||
      s.w.length !== FEATURE_DIM ||
      !Array.isArray(s.keptMean) ||
      s.keptMean.length !== FEATURE_DIM
    ) {
      return { model: makeModel(), returning: false, available: true };
    }
    const model: TasteModel = {
      w: s.w.map((n) => (Number.isFinite(n) ? n : 0)),
      b: Number.isFinite(s.b) ? s.b : 0,
      keptMean: s.keptMean.map((n) => (Number.isFinite(n) ? clamp01(n) : 0.5)),
      keptCount: s.keptCount | 0,
      passCount: s.passCount | 0,
      sessions: (s.sessions | 0) + 1,
    };
    const returning = model.keptCount + model.passCount > 0;
    return { model, returning, available: true };
  } catch {
    return { model: makeModel(), returning: false, available: false };
  }
}

/** Persist the model. Returns false if storage is unavailable. */
export function saveModel(model: TasteModel): boolean {
  try {
    const s: StoredModel = {
      v: 1,
      w: model.w,
      b: model.b,
      keptMean: model.keptMean,
      keptCount: model.keptCount,
      passCount: model.passCount,
      sessions: model.sessions,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Forget everything. Returns false if storage is unavailable. */
export function clearModel(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ── The seeded synthetic listener (hidden taste) ─────────────────────────────
//
// It has a fixed, HIDDEN ideal — it likes DENSE, SYNCOPATED, HIGH phrases — and
// keeps stochastically, so accuracy caps realistically below 100%. The model
// never sees this ideal; it must infer it from Keep/Pass alone. The demo drives
// a SEPARATE model (never the persisted human one), so it can never pollute your
// saved taste.

const DEMO_IDEAL = [0.85, 0.45, 0.85, 0.8, 0.55, 0.45, 0.3, 0.4];
const DEMO_IMPORTANCE = [1.4, 0.35, 1.4, 1.25, 0.3, 0.4, 0.5, 0.4];

export function syntheticKeeps(rng: () => number, x: number[]): boolean {
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    const diff = x[i] - DEMO_IDEAL[i];
    d += DEMO_IMPORTANCE[i] * diff * diff;
  }
  const pKeep = sigmoid(4 * (0.9 - d));
  return rng() < pKeep;
}
