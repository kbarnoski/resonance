// ─────────────────────────────────────────────────────────────────────────────
// 15312 · transcript / catalog.ts — the RETRIEVAL + MEMORY-CHAIN engine.
//
// This deepens the answerback idea (a single call→response) into a SELF-
// CONTINUING conversation: the catalog answers, then answers its own answer,
// walking track to track. Every line is a real note-window sliced from a real
// decoded recording — ZERO synthesis, ever.
//
// From a varied subset of Karel's catalog we precompute a BANK of candidate
// phrases: short windows of consecutive notes[] from each track. Each candidate
// carries
//   • its melodic CONTOUR (sequence of pitch intervals),
//   • a 12-bin pitch-class HISTOGRAM (key affinity),
//   • its local CHORD CONTEXT (a chord-tone histogram + dominant root, read from
//     the chords[] that overlap its time span), and
//   • the exact start/end TIME inside the source recording.
//
// The CURRENT phrase becomes the QUERY for the NEXT turn. We score every
// candidate by contour similarity + pitch-class similarity + HARMONIC fit (does
// its chord context relate to / resolve the current phrase's implied harmony?) +
// length affinity, then pick from the top — excluding the phrase just heard and
// biasing toward tracks the conversation has visited least, so the whole catalog
// gets pulled in. That memory is what makes it a conversation, not one exchange.
//
// Lineage: query-by-contour MIR retrieval; the Infinite Jukebox (Paul Lamere,
// 2012) navigating a recording by self-similarity; and the 2026 cross-catalog
// version-identification frontier (arXiv:2608.04543) — here as the artistic,
// REAL-audio, self-continuing take. It is the anti-synthesis of LLM/RL jamming
// (RL-Duet 2020; arXiv:2606.11886, 2026): every partner turn is a real take.
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackChord,
} from "../_shared/trackAnalysis";

export interface Harmony {
  /** 12-bin chord-tone histogram, L2-normalized. */
  chordHist: number[];
  /** dominant chord root pitch-class (0..11), or null if unknown. */
  rootPc: number | null;
}

export interface Candidate {
  trackId: string;
  title: string;
  /** phrase start time in the source recording (seconds). */
  startTime: number;
  /** phrase end time in the source recording (seconds). */
  endTime: number;
  /** melodic contour = intervals between consecutive notes (semitones). */
  contour: number[];
  /** 12-bin pitch-class histogram, L2-normalized. */
  pcHist: number[];
  /** local chord context read from overlapping chords[]. */
  harmony: Harmony;
  /** the raw MIDI sequence — used to draw the contour sparkline. */
  midis: number[];
  noteCount: number;
}

export interface CatalogBank {
  candidates: Candidate[];
  buffers: Map<string, AudioBuffer>;
  loadedTitles: string[];
  loadedIds: string[];
}

export interface Query {
  contour: number[];
  pcHist: number[];
  harmony: Harmony;
  noteCount: number;
}

export interface Weights {
  /** 0..1 — how much chord-fit matters vs pure melody. */
  harmonic: number;
  /** 0..1 — Echo (0, tight) ↔ Wander (1, far). */
  temperature: number;
  /** 0..1 — anti-latch strength: pull toward tracks heard least. */
  spread: number;
}

// ── phrase-window construction params ────────────────────────────────────────
const WINDOW_SIZES = [4, 6, 8];
const STEP = 3;
const MIN_DUR = 0.35;
const MAX_DUR = 5.5;
const PER_TRACK_CAP = 140;
const TOTAL_CAP = 720;
const RESAMPLE_N = 8;

// ── small vector helpers ──────────────────────────────────────────────────────

function intervalsOf(midis: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < midis.length; i++) out.push(midis[i] - midis[i - 1]);
  return out;
}

function l2unit(v: number[]): number[] {
  let n = 0;
  for (const w of v) n += w * w;
  n = Math.sqrt(n);
  if (n < 1e-9) return v.slice();
  return v.map((w) => w / n);
}

/** Resample an interval sequence to a fixed length via linear interpolation. */
function resample(vec: number[], n: number): number[] {
  if (vec.length === 0) return new Array(n).fill(0);
  if (vec.length === 1) return new Array(n).fill(vec[0]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (vec.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(vec.length - 1, lo + 1);
    const frac = t - lo;
    out[i] = vec[lo] * (1 - frac) + vec[hi] * frac;
  }
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-9 || nb < 1e-9) {
    return na < 1e-9 && nb < 1e-9 ? 1 : 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Closeness of two pitch-classes on the circle of fifths, in [0,1]. */
function cofCloseness(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.5; // unknown → neutral
  const pa = (a * 7) % 12;
  const pb = (b * 7) % 12;
  const raw = Math.abs(pa - pb);
  const d = Math.min(raw, 12 - raw); // 0..6
  return 1 - d / 6;
}

// ── harmony construction ──────────────────────────────────────────────────────

/** Chord tones (root triad approximation) as pitch-classes. */
function chordTones(symbol: string): { pcs: number[]; root: number | null } {
  const root = chordRoot(symbol);
  if (root === null) return { pcs: [], root: null };
  const third = (root + (chordIsMinor(symbol) ? 3 : 4)) % 12;
  const fifth = (root + 7) % 12;
  return { pcs: [root, third, fifth], root };
}

/** Build the local chord context for a phrase's [start,end) time span. */
function harmonyFromChords(
  chords: TrackChord[],
  start: number,
  end: number,
  fallbackPc: number[],
): Harmony {
  const hist = new Array<number>(12).fill(0);
  let bestRoot: number | null = null;
  let bestOverlap = 0;
  for (const ch of chords) {
    const cs = ch.time;
    const ce = ch.time + Math.max(0.05, ch.duration);
    const overlap = Math.min(end, ce) - Math.max(start, cs);
    if (overlap <= 0) continue;
    const { pcs, root } = chordTones(ch.chord);
    for (const pc of pcs) hist[pc] += overlap;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestRoot = root;
    }
  }
  // No chord overlapped this window → derive implied harmony from the melody.
  if (bestOverlap === 0) {
    let root: number | null = null;
    let max = -1;
    for (let i = 0; i < 12; i++) {
      if (fallbackPc[i] > max) {
        max = fallbackPc[i];
        root = i;
      }
    }
    return { chordHist: l2unit(fallbackPc), rootPc: root };
  }
  return { chordHist: l2unit(hist), rootPc: bestRoot };
}

/** How well a candidate's harmony relates to / resolves the query's. [0,1]. */
function harmonicFit(q: Harmony, c: Harmony): number {
  const histSim = cosine(q.chordHist, c.chordHist);
  const rootRel = cofCloseness(q.rootPc, c.rootPc);
  return 0.55 * histSim + 0.45 * rootRel;
}

// ── query construction ────────────────────────────────────────────────────────

/** A human-played phrase (MIDI onsets) → the same representation. */
export function buildQuery(midis: number[]): Query {
  const pc = new Array<number>(12).fill(0);
  for (const m of midis) pc[((m % 12) + 12) % 12] += 1;
  const pcUnit = l2unit(pc);
  // implied harmony: root = most-present pitch-class.
  let root: number | null = null;
  let max = -1;
  for (let i = 0; i < 12; i++) {
    if (pc[i] > max) {
      max = pc[i];
      root = i;
    }
  }
  return {
    contour: intervalsOf(midis),
    pcHist: pcUnit,
    harmony: { chordHist: pcUnit, rootPc: root },
    noteCount: midis.length,
  };
}

/** A chosen candidate becomes the query for the NEXT turn (the memory chain). */
export function queryFromCandidate(c: Candidate): Query {
  return {
    contour: c.contour,
    pcHist: c.pcHist,
    harmony: c.harmony,
    noteCount: c.noteCount,
  };
}

// ── scoring ───────────────────────────────────────────────────────────────────

/** Similarity in [0,1]. Melody (contour + pitch-class) blended with harmonic
 *  fit by `harmonic` weight, plus a gentle length affinity. */
export function scorePhrase(q: Query, c: Candidate, w: Weights): number {
  const contourSim =
    (cosine(resample(q.contour, RESAMPLE_N), resample(c.contour, RESAMPLE_N)) +
      1) /
    2;
  const pcSim = cosine(q.pcHist, c.pcHist);
  const harmSim = harmonicFit(q.harmony, c.harmony);
  const lenSim = 1 - Math.min(1, Math.abs(q.noteCount - c.noteCount) / 6);
  const melody = 0.62 * contourSim + 0.38 * pcSim;
  const hw = Math.min(1, Math.max(0, w.harmonic));
  const core = (1 - hw) * melody + hw * harmSim;
  return 0.9 * core + 0.1 * lenSim;
}

export function candidateKey(c: Candidate): string {
  return `${c.trackId}@${c.startTime.toFixed(3)}`;
}

export interface Answer {
  candidate: Candidate;
  score: number;
}

export interface PickOptions {
  prevKey: string | null;
  weights: Weights;
  /** per-track spoken counts (the conversation's memory of where it's been). */
  visitCounts: Map<string, number>;
  /** the "nudge" — jump to a more distant answer than usual. */
  forceDistant?: boolean;
}

/**
 * Score the whole bank and pick the next turn. Echo↔Wander (temperature) sets
 * how wide a top slice we draw from and how sharply we favor the best match;
 * spread multiplies each candidate's weight down by how often its track has
 * already spoken (anti-latch); the immediately-previous phrase is excluded.
 */
export function pickAnswer(
  bank: CatalogBank,
  q: Query,
  opts: PickOptions,
): Answer | null {
  if (bank.candidates.length === 0) return null;
  const { prevKey, weights, visitCounts } = opts;

  const scored = bank.candidates
    .map((c) => ({ c, s: scorePhrase(q, c, weights) }))
    .sort((a, b) => b.s - a.s);

  // temperature widens the pool: Echo draws from ~top 4, Wander from ~top 30.
  const K = Math.round(4 + weights.temperature * 26);
  let pool = scored.slice(0, Math.min(K, scored.length));
  const filtered = pool.filter((e) => candidateKey(e.c) !== prevKey);
  if (filtered.length > 0) pool = filtered;

  // nudge: skip the closest half so the answer leaps further.
  if (opts.forceDistant && pool.length > 2) {
    pool = pool.slice(Math.floor(pool.length / 2));
  }

  const floor = pool[pool.length - 1]?.s ?? 0;
  // cold (Echo) → sharp exponent favors the very best; hot (Wander) → flat.
  const sharp = 1 + (1 - weights.temperature) * 3;
  const spread = Math.min(1, Math.max(0, weights.spread));

  let total = 0;
  const w = pool.map((e) => {
    const sw = Math.pow(Math.max(0.02, e.s - floor + 0.05), sharp);
    const visits = visitCounts.get(e.c.trackId) ?? 0;
    const anti = 1 / (1 + spread * 2.2 * visits);
    const weight = sw * anti;
    total += weight;
    return weight;
  });

  let r = Math.random() * total;
  let idx = 0;
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r <= 0) {
      idx = i;
      break;
    }
  }
  const chosen = pool[idx];
  return { candidate: chosen.c, score: chosen.s };
}

/** The opening line — a random candidate to start the conversation. */
export function pickOpening(bank: CatalogBank): Answer | null {
  if (bank.candidates.length === 0) return null;
  const c = bank.candidates[Math.floor(Math.random() * bank.candidates.length)];
  return { candidate: c, score: 1 };
}

// ── bank construction from the real catalog ───────────────────────────────────

interface TrackSeed {
  id: string;
  title: string;
}

/**
 * Load a subset of Karel's catalog and build the candidate bank. Each track
 * needs both its decoded audio buffer AND its note/chord analysis; a track that
 * fails either is skipped (never fatal). Returns whatever loaded.
 */
export async function buildBank(
  ctx: AudioContext,
  seeds: readonly TrackSeed[],
  onProgress?: (msg: string) => void,
): Promise<CatalogBank> {
  const buffers = new Map<string, AudioBuffer>();
  const loadedTitles: string[] = [];
  const loadedIds: string[] = [];
  const candidates: Candidate[] = [];

  for (const seed of seeds) {
    onProgress?.(`loading ${seed.title}…`);
    let buffer: AudioBuffer | null = null;
    try {
      const r = await loadRealTrackBuffer(ctx, seed.id);
      buffer = r.buffer;
    } catch {
      buffer = null;
    }
    if (!buffer) continue;

    let analysis;
    try {
      analysis = await loadTrackAnalysis(seed.id);
    } catch {
      analysis = null;
    }
    if (!analysis || analysis.notes.length < 4) continue;

    buffers.set(seed.id, buffer);
    loadedTitles.push(seed.title);
    loadedIds.push(seed.id);

    const notes = analysis.notes;
    const chords = analysis.chords ?? [];
    let perTrack = 0;
    for (const win of WINDOW_SIZES) {
      for (let i = 0; i + win <= notes.length; i += STEP) {
        if (perTrack >= PER_TRACK_CAP) break;
        const slice = notes.slice(i, i + win);
        const start = slice[0].time;
        const last = slice[slice.length - 1];
        const end = last.time + Math.max(0.05, last.duration);
        const dur = end - start;
        if (dur < MIN_DUR || dur > MAX_DUR) continue;

        const midis = slice.map((n) => n.midi);
        const pcRaw = new Array<number>(12).fill(0);
        for (const n of slice) {
          pcRaw[((n.midi % 12) + 12) % 12] += Math.max(0.05, n.duration);
        }
        candidates.push({
          trackId: seed.id,
          title: seed.title,
          startTime: start,
          endTime: Math.min(end, buffer.duration),
          contour: intervalsOf(midis),
          pcHist: l2unit(pcRaw),
          harmony: harmonyFromChords(chords, start, end, pcRaw),
          midis,
          noteCount: win,
        });
        perTrack++;
      }
    }
    if (candidates.length >= TOTAL_CAP) break;
  }

  return { candidates, buffers, loadedTitles, loadedIds };
}

// ── phrase playback — slices of the REAL buffer, click-free ───────────────────

/**
 * Plays retrieved phrases as slices of Karel's real recordings. No oscillators,
 * no synthesis — just AudioBufferSourceNode.start(when, offset, dur) with a
 * short fade envelope so each slice never clicks.
 */
export class SlicePlayer {
  private cur: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
  ) {}

  stop(): void {
    if (!this.cur) return;
    const { src, gain } = this.cur;
    const t = this.ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.04);
      src.stop(t + 0.18);
    } catch {
      /* already stopped */
    }
    this.cur = null;
  }

  /** Play a slice; returns its duration in seconds. */
  play(
    buffer: AudioBuffer,
    startTime: number,
    endTime: number,
    level = 0.92,
  ): number {
    this.stop();
    const ctx = this.ctx;
    const dur = Math.max(MIN_DUR, Math.min(MAX_DUR, endTime - startTime));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.dest);

    const t = ctx.currentTime + 0.02;
    const fadeIn = 0.03;
    const fadeOut = Math.min(0.14, dur * 0.3);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + fadeIn);
    gain.gain.setValueAtTime(level, t + dur - fadeOut);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    src.start(t, startTime, dur + 0.05);

    const entry = { src, gain };
    this.cur = entry;
    src.onended = () => {
      if (this.cur === entry) this.cur = null;
    };
    return dur;
  }

  dispose(): void {
    this.stop();
  }
}
