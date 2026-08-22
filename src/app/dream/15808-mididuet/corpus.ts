// ─────────────────────────────────────────────────────────────────────────────
// 15808 · corpus.ts — the concatenative retrieval + anticipation engine.
//
// Pure, throw-free helpers over Karel's note catalog. `buildCorpus` folds the
// per-track note rolls (from `loadTrackAnalysis`) into a flat, indexed corpus.
// `retrieveNearest` is CataRT-style nearest-unit lookup (match pitch-class, then
// closeness in register). `predictContinuation` is the ReaLJam idea reduced to a
// robust nearest-neighbour over pitch-class n-grams: given the visitor's last few
// notes, find where in Karel's playing a similar shape occurred and return the
// NEXT notes he actually played there — the phrase he would complete with.
//
// Every function guards for empty input and never throws.
// ─────────────────────────────────────────────────────────────────────────────

import type { TrackNote } from "../_shared/trackAnalysis";

/** One real note Karel played, tagged with its home track + position. */
export interface CorpusNote {
  /** index into the loaded-track arrays (buffer / title). */
  track: number;
  /** MIDI pitch he actually played. */
  midi: number;
  /** onset in seconds within that track's recording. */
  time: number;
  duration: number;
  velocity: number;
  /** index within its own track's time-sorted note stream. */
  idx: number;
}

export interface Corpus {
  /** every note, across all loaded tracks. */
  notes: CorpusNote[];
  /** time-sorted note stream per track (for continuation lookups). */
  byTrack: CorpusNote[][];
  /** 12 buckets keyed by pitch-class, for fast nearest-unit retrieval. */
  byPitchClass: CorpusNote[][];
}

const pc = (m: number) => ((m % 12) + 12) % 12;

/** Circular pitch-class distance, 0 (same) .. 6 (tritone). */
function pcDist(a: number, b: number): number {
  const d = Math.abs(pc(a) - pc(b));
  return Math.min(d, 12 - d);
}

/** Fold the per-track note rolls into an indexed corpus. */
export function buildCorpus(trackNotes: TrackNote[][]): Corpus {
  const byTrack: CorpusNote[][] = [];
  const notes: CorpusNote[] = [];
  const byPitchClass: CorpusNote[][] = Array.from({ length: 12 }, () => []);

  trackNotes.forEach((roll, track) => {
    const stream: CorpusNote[] = [];
    roll.forEach((n) => {
      if (!Number.isFinite(n.midi) || !Number.isFinite(n.time)) return;
      const cn: CorpusNote = {
        track,
        midi: Math.round(n.midi),
        time: n.time,
        duration: Number.isFinite(n.duration) ? n.duration : 0.4,
        velocity: Number.isFinite(n.velocity) ? n.velocity : 80,
        idx: stream.length,
      };
      stream.push(cn);
      notes.push(cn);
      byPitchClass[pc(cn.midi)].push(cn);
    });
    byTrack.push(stream);
  });

  return { notes, byTrack, byPitchClass };
}

/**
 * CataRT-style nearest-unit retrieval: find a real note Karel played that shares
 * the target's pitch-class and sits closest in register. Picks at random among
 * the few nearest so a repeated key stays alive. Returns null on an empty corpus.
 */
export function retrieveNearest(
  corpus: Corpus,
  targetMidi: number,
  rnd: number = Math.random(),
): CorpusNote | null {
  if (corpus.notes.length === 0) return null;

  const bucket = corpus.byPitchClass[pc(targetMidi)];
  const pool = bucket.length > 0 ? bucket : corpus.notes;

  // rank by closeness in register (then by pitch-class distance as a tiebreak)
  const ranked = [...pool].sort((a, b) => {
    const da =
      Math.abs(a.midi - targetMidi) + pcDist(a.midi, targetMidi) * 0.01;
    const db =
      Math.abs(b.midi - targetMidi) + pcDist(b.midi, targetMidi) * 0.01;
    return da - db;
  });

  const top = ranked.slice(0, Math.min(5, ranked.length));
  const pick = Math.min(top.length - 1, Math.floor(rnd * top.length));
  return top[pick] ?? ranked[0] ?? null;
}

/**
 * Anticipation: given the visitor's recent MIDI line, find where a similar shape
 * occurs in Karel's playing and return the notes he played NEXT — the phrase he
 * would use to complete the line the visitor is implying. Matches on pitch-class
 * n-grams plus melodic contour. Robust: always returns something usable when the
 * corpus is non-empty, never throws.
 */
export function predictContinuation(
  corpus: Corpus,
  recentMidi: number[],
  answerLen = 4,
): CorpusNote[] {
  if (corpus.notes.length === 0) return [];

  const query = recentMidi.slice(-4);
  if (query.length === 0) return [];
  const queryPc = query.map(pc);
  const k = query.length;

  let best = { score: -Infinity, track: -1, j: -1 };

  for (let t = 0; t < corpus.byTrack.length; t++) {
    const s = corpus.byTrack[t];
    const last = s.length - k - 1; // need at least one following note
    for (let j = 0; j <= last; j++) {
      let score = 0;
      for (let m = 0; m < k; m++) {
        // pitch-class agreement, later notes weighted more (recency)
        score += (6 - pcDist(s[j + m].midi, queryPc[m])) * (m + 1);
      }
      // contour: reward matching interval direction
      for (let m = 1; m < k; m++) {
        const qd = Math.sign(query[m] - query[m - 1]);
        const nd = Math.sign(s[j + m].midi - s[j + m - 1].midi);
        if (qd === nd) score += 2;
      }
      if (score > best.score) best = { score, track: t, j };
    }
  }

  if (best.track >= 0) {
    const s = corpus.byTrack[best.track];
    const ans = s.slice(best.j + k, best.j + k + answerLen);
    if (ans.length > 0) return ans;
  }

  // fallback: nearest unit to the last note, then whatever he played after it
  const near = retrieveNearest(corpus, query[query.length - 1], 0.0);
  if (!near) return [];
  const s = corpus.byTrack[near.track];
  const ans = s.slice(near.idx + 1, near.idx + 1 + answerLen);
  return ans.length > 0 ? ans : [near];
}
