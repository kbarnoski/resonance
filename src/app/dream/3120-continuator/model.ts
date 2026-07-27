// ─────────────────────────────────────────────────────────────────────────────
// model.ts — the ONLINE IDIOM MODEL for 3096-continuator.
//
//   A variable-order Markov model / prefix tree built LIVE over everything the
//   human has sung. It models the sequence of pitch *intervals* (in cents, kept
//   continuous — never snapped to equal temperament) and note *durations*.
//
//   • CONTEXT is keyed on coarsely-bucketed intervals (so short phrases still
//     produce repeats the model can learn from) — buckets are ~40 cents, finer
//     than a semitone, so this is NOT equal-temperament quantization.
//   • Each stored CONTINUATION keeps the exact, continuous measured interval and
//     duration. Generation emits those continuous values (plus a tiny seeded
//     humanizing jitter), so answers stay microtonal and in the human's own
//     material.
//   • GENERATION is variable order: it starts at the highest available order and
//     backs off to lower orders when the recent context has not been seen — the
//     core idea of François Pachet's *The Continuator* (2002/2003).
//
//   The only source of randomness is a seeded mulberry32 PRNG (no Math.random /
//   Date), so the whole listen→learn→answer loop is deterministic under the
//   headless autopilot.
// ─────────────────────────────────────────────────────────────────────────────

// ── seeded PRNG ──────────────────────────────────────────────────────────────

/** mulberry32 — deterministic PRNG. The ONLY randomness in this prototype. */
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

// ── pitch <-> cents helpers ───────────────────────────────────────────────────

const CENT_REF_HZ = 440; // A4 as the cents origin (choice is arbitrary)

export function hzToCents(hz: number): number {
  return 1200 * Math.log2(hz / CENT_REF_HZ);
}
export function centsToHz(cents: number): number {
  return CENT_REF_HZ * Math.pow(2, cents / 1200);
}

// ── data shapes ───────────────────────────────────────────────────────────────

/** One sung/generated note: continuous pitch (Hz + cents) and a duration. */
export interface NoteEvent {
  hz: number;
  cents: number;
  dur: number; // seconds
}

/** An observed continuation: the exact continuous interval (cents) taken to
 *  reach the next note, and that next note's continuous duration. */
interface Continuation {
  interval: number; // continuous cents (may be negative)
  dur: number; // seconds
}

/** All continuations observed after one context key (repeats = weighting). */
interface ContextEntry {
  conts: Continuation[];
}

export interface IdiomModel {
  /** orders[k] maps a length-k context key → its observed continuations. */
  orders: Map<string, ContextEntry>[];
  maxOrder: number;
  /** interval-bucket width in cents (context keying only; NOT applied to audio). */
  bucketCents: number;
  totalNotes: number;
  totalTransitions: number;
  phrasesIngested: number;
  phraseLengths: number[];
  /** observed absolute-pitch range (cents) — used to keep answers in register. */
  regMinCents: number;
  regMaxCents: number;
  /** median-ish duration, kept as a fallback for the answer's first note. */
  durSamples: number[];
}

export function createModel(maxOrder = 3, bucketCents = 40): IdiomModel {
  const orders: Map<string, ContextEntry>[] = [];
  for (let k = 0; k <= maxOrder; k++) orders.push(new Map());
  return {
    orders,
    maxOrder,
    bucketCents,
    totalNotes: 0,
    totalTransitions: 0,
    phrasesIngested: 0,
    phraseLengths: [],
    regMinCents: Infinity,
    regMaxCents: -Infinity,
    durSamples: [],
  };
}

function bucketOf(intervalCents: number, bucket: number): number {
  return Math.round(intervalCents / bucket);
}

function addCont(map: Map<string, ContextEntry>, key: string, cont: Continuation) {
  let e = map.get(key);
  if (!e) {
    e = { conts: [] };
    map.set(key, e);
  }
  e.conts.push(cont);
}

// ── ingest ────────────────────────────────────────────────────────────────────

/** Fold one human phrase (a run of notes) into the model. Returns the number of
 *  new transitions added — the visible "it just learned something" quantity. */
export function ingestPhrase(model: IdiomModel, notes: NoteEvent[]): number {
  if (notes.length < 2) {
    // still count the note & register, but no transitions to learn
    for (const n of notes) noteStats(model, n);
    model.phrasesIngested += 1;
    model.phraseLengths.push(notes.length);
    return 0;
  }

  for (const n of notes) noteStats(model, n);

  // interval sequence: intervals[j] = cents(note[j+1]) - cents(note[j])
  const intervals: number[] = [];
  for (let j = 1; j < notes.length; j++) {
    intervals.push(notes[j].cents - notes[j - 1].cents);
  }
  const buckets = intervals.map((iv) => bucketOf(iv, model.bucketCents));

  let added = 0;
  for (let j = 0; j < intervals.length; j++) {
    const cont: Continuation = { interval: intervals[j], dur: notes[j + 1].dur };
    for (let k = 0; k <= model.maxOrder; k++) {
      if (j - k < 0) break; // not enough history for order k (or higher)
      const key = buckets.slice(j - k, j).join(',');
      addCont(model.orders[k], key, cont);
      added += 1;
    }
  }

  model.totalTransitions += intervals.length;
  model.phrasesIngested += 1;
  model.phraseLengths.push(notes.length);
  return added;
}

function noteStats(model: IdiomModel, n: NoteEvent) {
  model.totalNotes += 1;
  if (n.cents < model.regMinCents) model.regMinCents = n.cents;
  if (n.cents > model.regMaxCents) model.regMaxCents = n.cents;
  model.durSamples.push(n.dur);
  if (model.durSamples.length > 200) model.durSamples.shift();
}

// ── model growth readout ──────────────────────────────────────────────────────

export interface ModelStats {
  /** distinct context keys of order ≥ 1 — "how much idiom has been mapped". */
  uniqueContexts: number;
  /** distinct order-1 contexts. */
  order1Contexts: number;
  /** distinct order-2 contexts. */
  order2Contexts: number;
  totalNotes: number;
  totalTransitions: number;
  phrasesIngested: number;
}

export function modelStats(model: IdiomModel): ModelStats {
  let unique = 0;
  for (let k = 1; k <= model.maxOrder; k++) unique += model.orders[k].size;
  return {
    uniqueContexts: unique,
    order1Contexts: model.orders[1]?.size ?? 0,
    order2Contexts: model.orders[2]?.size ?? 0,
    totalNotes: model.totalNotes,
    totalTransitions: model.totalTransitions,
    phrasesIngested: model.phrasesIngested,
  };
}

// ── generation (variable order + back-off) ────────────────────────────────────

export interface GenResult {
  notes: NoteEvent[];
  /** highest context order that produced a hit this turn (the headline). */
  maxOrderUsed: number;
  /** per-step order actually used (for the little "order trail" readout). */
  ordersPerStep: number[];
  /** true if we had to fall back to the raw unconditional (order-0) pool. */
  usedFallbackPool: boolean;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0.42;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Sample one continuation for the current generated context, backing off from
 *  the highest available order down to 0. Returns the chosen continuation and
 *  the order that produced it (-1 if the model is empty). */
function sampleContinuation(
  model: IdiomModel,
  genBuckets: number[],
  rng: () => number
): { cont: Continuation | null; order: number } {
  const maxK = Math.min(model.maxOrder, genBuckets.length);
  for (let k = maxK; k >= 0; k--) {
    const key = genBuckets.slice(genBuckets.length - k).join(',');
    const entry = model.orders[k].get(key);
    if (entry && entry.conts.length > 0) {
      const idx = Math.floor(rng() * entry.conts.length);
      return { cont: entry.conts[idx], order: k };
    }
  }
  return { cont: null, order: -1 };
}

/**
 * Generate a NEW answering phrase sampled from the human's own idiom model.
 *
 * @param anchorCents  starting absolute pitch (cents) — put the answer in the
 *                     human's register, typically their last phrase's start.
 */
export function generatePhrase(
  model: IdiomModel,
  rng: () => number,
  anchorCents: number
): GenResult {
  const notes: NoteEvent[] = [];
  const ordersPerStep: number[] = [];
  let usedFallbackPool = false;

  // Length: track the human's phrase lengths, wander around the median.
  const medLen = Math.round(median(model.phraseLengths.map((l) => l))) || 5;
  const len = Math.max(3, Math.min(9, medLen + Math.floor(rng() * 3) - 1));

  // Register guard rails so a run of same-sign intervals can't drift off-voice.
  const hasReg = Number.isFinite(model.regMinCents) && Number.isFinite(model.regMaxCents);
  const lo = hasReg ? model.regMinCents - 250 : anchorCents - 900;
  const hi = hasReg ? model.regMaxCents + 250 : anchorCents + 900;

  let cents = Math.max(lo, Math.min(hi, anchorCents));
  const firstDur = median(model.durSamples);
  notes.push({ cents, hz: centsToHz(cents), dur: firstDur });

  const genBuckets: number[] = [];
  let maxOrderUsed = 0;

  for (let step = 1; step < len; step++) {
    const { cont, order } = sampleContinuation(model, genBuckets, rng);
    if (!cont) break; // model still empty — nothing to say yet
    if (order === 0) usedFallbackPool = true;
    if (order > maxOrderUsed) maxOrderUsed = order;
    ordersPerStep.push(order);

    // tiny seeded humanizing jitter (±6 cents) — expressive, still microtonal
    const jitter = (rng() - 0.5) * 12;
    let next = cents + cont.interval + jitter;

    // keep it in the human's register; reflect back in rather than clamp-flat
    if (next < lo) next = lo + (lo - next) * 0.5;
    if (next > hi) next = hi - (next - hi) * 0.5;

    cents = next;
    const dur = Math.max(0.14, cont.dur * (0.9 + rng() * 0.2));
    genBuckets.push(bucketOf(cont.interval, model.bucketCents));
    notes.push({ cents, hz: centsToHz(cents), dur });
  }

  return { notes, maxOrderUsed, ordersPerStep, usedFallbackPool };
}

// ── baked demo contours (silent, seeded — headless review path) ───────────────

/**
 * A small library of plausible SUNG human contours, generated deterministically
 * from a seeded PRNG. Under autopilot these are fed through the exact same
 * ingest→generate→sing pipeline as live mic notes, so the "it learns me" loop
 * runs with no microphone. Pitches carry ±cent microtonal offsets, so the baked
 * "human" is itself never in equal temperament.
 */
export function makeDemoPhrases(seed: number): NoteEvent[][] {
  const rng = mulberry32(seed);

  // Scale steps (in semitones) the baked singer tends to move by — a loose,
  // song-like vocabulary. Kept as intervals so phrases share sub-patterns and
  // the higher-order contexts actually accumulate across presses.
  const stepMenu = [0, 2, 2, -2, 3, -3, 5, -5, 4, -4, 7, -7, 1, -1];
  const durMenu = [0.28, 0.34, 0.4, 0.4, 0.46, 0.55, 0.62];

  const startHzMenu = [196, 220, 247, 262, 294]; // G3 A3 B3 C4 D4

  const phrases: NoteEvent[][] = [];
  const count = 6;
  for (let p = 0; p < count; p++) {
    const notes: NoteEvent[] = [];
    const len = 4 + Math.floor(rng() * 4); // 4..7 notes
    let hz = startHzMenu[Math.floor(rng() * startHzMenu.length)];
    for (let i = 0; i < len; i++) {
      // microtonal offset so this is never equal temperament
      const microOffset = (rng() - 0.5) * 30; // ±15 cents
      const cents = hzToCents(hz) + microOffset;
      const dur = durMenu[Math.floor(rng() * durMenu.length)];
      notes.push({ cents, hz: centsToHz(cents), dur });
      // pick next interval
      const semis = stepMenu[Math.floor(rng() * stepMenu.length)];
      hz = hz * Math.pow(2, semis / 12);
      // keep the baked singer inside a comfortable range
      if (hz < 165) hz *= 2;
      if (hz > 415) hz /= 2;
    }
    phrases.push(notes);
  }
  return phrases;
}
