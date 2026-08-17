// ─────────────────────────────────────────────────────────────────────────────
// 14656 · answerback / catalog.ts — the RETRIEVAL engine. This is the heart of
// the piece: query-by-contour over Karel's OWN recordings.
//
// From a subset of his real catalog we precompute a BANK of candidate phrases —
// short windows of consecutive notes[] from each track's analysis. Each
// candidate carries its melodic CONTOUR (the sequence of pitch intervals), a
// pitch-class HISTOGRAM (key affinity), and — crucially — the exact start/end
// TIME of that phrase inside the source recording, so the answer can be sliced
// straight from the real decoded AudioBuffer.
//
// When Karel pauses, we turn his live phrase into the same representation and
// score every candidate by contour similarity + pitch-class overlap + a gentle
// length affinity, then pick a strong match (with a little variety so it never
// gets stuck answering the same way twice).
//
// Lineage: query-by-humming / query-by-contour MIR retrieval, and the
// call-and-response tradition — here as CROSS-CATALOG answer retrieval rather
// than navigating a single take (cf. the Infinite Jukebox, Paul Lamere, 2012).
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";

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
  noteCount: number;
  firstMidi: number;
}

export interface CatalogBank {
  candidates: Candidate[];
  buffers: Map<string, AudioBuffer>;
  loadedTitles: string[];
}

export interface Query {
  contour: number[];
  pcHist: number[];
  noteCount: number;
}

// ── phrase-window construction params ────────────────────────────────────────
const WINDOW_SIZES = [4, 6, 8]; // multi-length so short + long calls both match
const STEP = 3;
const MIN_DUR = 0.35;
const MAX_DUR = 5.5;
const PER_TRACK_CAP = 160;
const TOTAL_CAP = 640;

const RESAMPLE_N = 8;

// ── small vector helpers ──────────────────────────────────────────────────────

function intervalsOf(midis: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < midis.length; i++) out.push(midis[i] - midis[i - 1]);
  return out;
}

function pcHistUnit(pcWeights: number[]): number[] {
  let norm = 0;
  for (const w of pcWeights) norm += w * w;
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return pcWeights.slice();
  return pcWeights.map((w) => w / norm);
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
    // Both flat (no melodic motion) → treat as a match; one flat one not → no.
    return na < 1e-9 && nb < 1e-9 ? 1 : 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── query construction from a live phrase ─────────────────────────────────────

export function buildQuery(midis: number[]): Query {
  const pc = new Array<number>(12).fill(0);
  for (const m of midis) pc[((m % 12) + 12) % 12] += 1;
  return {
    contour: intervalsOf(midis),
    pcHist: pcHistUnit(pc),
    noteCount: midis.length,
  };
}

// ── scoring ───────────────────────────────────────────────────────────────────

/**
 * Similarity in [0,1]. Contour shape dominates, pitch-class/key affinity and a
 * gentle length match round it out.
 */
export function scorePhrase(q: Query, c: Candidate): number {
  const contourSim =
    (cosine(resample(q.contour, RESAMPLE_N), resample(c.contour, RESAMPLE_N)) +
      1) /
    2; // map cosine [-1,1] → [0,1]
  const pcSim = cosine(q.pcHist, c.pcHist); // already non-negative (counts ≥ 0)
  const lenSim = 1 - Math.min(1, Math.abs(q.noteCount - c.noteCount) / 6);
  return 0.55 * contourSim + 0.33 * pcSim + 0.12 * lenSim;
}

export interface Answer {
  candidate: Candidate;
  score: number;
}

/**
 * Score the whole bank and pick a strong answer. We take the top-K and draw
 * from them weighted toward higher scores, excluding the previous pick, so the
 * duet stays varied instead of latching onto one phrase.
 */
export function pickAnswer(
  bank: CatalogBank,
  q: Query,
  prevKey: string | null,
): Answer | null {
  if (bank.candidates.length === 0) return null;
  const scored = bank.candidates
    .map((c) => ({ c, s: scorePhrase(q, c) }))
    .sort((a, b) => b.s - a.s);

  const topK = scored.slice(0, 8);
  const floor = topK[topK.length - 1]?.s ?? 0;
  const pool = topK.filter(
    (e) => `${e.c.trackId}@${e.c.startTime.toFixed(3)}` !== prevKey,
  );
  const draw = pool.length > 0 ? pool : topK;

  let total = 0;
  const weights = draw.map((e) => {
    const w = Math.max(0.05, e.s - floor + 0.05);
    total += w;
    return w;
  });
  let r = Math.random() * total;
  let idx = 0;
  for (let i = 0; i < draw.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      idx = i;
      break;
    }
  }
  const chosen = draw[idx];
  return { candidate: chosen.c, score: chosen.s };
}

export function candidateKey(c: Candidate): string {
  return `${c.trackId}@${c.startTime.toFixed(3)}`;
}

// ── bank construction from the real catalog ───────────────────────────────────

interface TrackSeed {
  id: string;
  title: string;
}

/**
 * Load a subset of Karel's catalog and build the candidate bank. For each track
 * we fetch the decoded audio buffer AND the note analysis; a track that fails
 * either is skipped (never fatal). Returns whatever loaded — the caller decides
 * if it's enough.
 */
export async function buildBank(
  ctx: AudioContext,
  seeds: readonly TrackSeed[],
  onProgress?: (msg: string) => void,
): Promise<CatalogBank> {
  const buffers = new Map<string, AudioBuffer>();
  const loadedTitles: string[] = [];
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

    const notes = analysis.notes;
    let perTrack = 0;
    for (const w of WINDOW_SIZES) {
      for (let i = 0; i + w <= notes.length; i += STEP) {
        if (perTrack >= PER_TRACK_CAP) break;
        const slice = notes.slice(i, i + w);
        const start = slice[0].time;
        const last = slice[slice.length - 1];
        const end = last.time + Math.max(0.05, last.duration);
        const dur = end - start;
        if (dur < MIN_DUR || dur > MAX_DUR) continue;

        const midis = slice.map((n) => n.midi);
        const pc = new Array<number>(12).fill(0);
        for (const n of slice) {
          pc[((n.midi % 12) + 12) % 12] += Math.max(0.05, n.duration);
        }
        candidates.push({
          trackId: seed.id,
          title: seed.title,
          startTime: start,
          endTime: Math.min(end, buffer.duration),
          contour: intervalsOf(midis),
          pcHist: pcHistUnit(pc),
          noteCount: w,
          firstMidi: midis[0],
        });
        perTrack++;
      }
    }
    if (candidates.length >= TOTAL_CAP) break;
  }

  return { candidates, buffers, loadedTitles };
}

// ── answer playback — slices of the REAL buffer, click-free ───────────────────

/**
 * Plays retrieved phrases as slices of Karel's real recordings. No oscillators,
 * no synthesis — just `AudioBufferSourceNode` with `start(when, offset, dur)`
 * and a short fade envelope so the slice never clicks.
 */
export class AnswerPlayer {
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
