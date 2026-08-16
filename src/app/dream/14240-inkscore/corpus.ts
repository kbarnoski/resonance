// ─────────────────────────────────────────────────────────────────────────────
// 14240-inkscore · corpus.ts
//
// Pure, React-free machinery for the Ink Score composer:
//   1. PHRASE CORPUS — split each track's note-roll into contiguous phrases
//      (broken at silences), each carrying its own 12-bin chroma, mean pitch,
//      energy and a compact pitch contour for drawing the ink glyph.
//   2. HARMONY ENGINE — Krumhansl-Schmuckler key profiles for scoring how well
//      a phrase fits a running key, plus diatonic snapping for the small
//      playback-rate detune that pulls a woven phrase into that key.
//
// No audio, no synthesis, no DOM here — just the numbers that turn a pile of
// sampled phrases into something that can be composed in key.
// ─────────────────────────────────────────────────────────────────────────────

import type { TrackNote } from "../_shared/trackAnalysis";

/** A single point along a phrase's melodic contour (for the ink glyph). */
export interface ContourPoint {
  /** position along the phrase, 0..1. */
  p: number;
  midi: number;
}

/** One woven-able unit: a real slice of one recording. */
export interface Phrase {
  trackId: string;
  /** index within its track's phrase list — stable id for React keys / round-robin. */
  localIndex: number;
  /** seconds into the decoded buffer. */
  startTime: number;
  endTime: number;
  /** 12-bin chroma (unit-normalised), pitch-class energy of the phrase. */
  chroma: Float32Array;
  /** energy-weighted mean MIDI pitch (register). */
  meanMidi: number;
  /** mean pitch class 0..11 (rounded target for diatonic snapping). */
  meanPc: number;
  /** mean velocity 0..1 (ink weight). */
  energy: number;
  /** compact melodic contour for drawing. */
  contour: ContourPoint[];
  /** true when we had no pitch analysis — a raw time-slice, flat chroma. */
  unpitched: boolean;
}

const GAP = 0.6; // s of silence that ends a phrase
const MAX_LEN = 8; // s — hard cap on a phrase
const MIN_LEN = 0.4; // s — drop anything shorter
const MIN_NOTES = 2; // need at least a gesture, not a single stab
const MAX_PHRASES = 64; // per track, keep memory bounded
const MAX_CONTOUR = 28; // points kept for the glyph

/**
 * Split a time-sorted note roll into phrases at silences (> GAP) or at MAX_LEN.
 * Returns [] when there is nothing usable; callers can fall back to time-slices.
 */
export function buildPhrases(trackId: string, notes: TrackNote[]): Phrase[] {
  if (!notes.length) return [];
  const phrases: Phrase[] = [];
  let bucket: TrackNote[] = [];
  let phraseStart = notes[0].time;
  let prevEnd = notes[0].time;

  const flush = () => {
    if (bucket.length >= MIN_NOTES) {
      const p = makePhrase(trackId, phrases.length, bucket);
      if (p) phrases.push(p);
    }
    bucket = [];
  };

  for (const n of notes) {
    const noteEnd = n.time + Math.max(0, n.duration);
    if (bucket.length === 0) {
      phraseStart = n.time;
      prevEnd = noteEnd;
      bucket.push(n);
      continue;
    }
    const silent = n.time - prevEnd > GAP;
    const tooLong = n.time - phraseStart > MAX_LEN;
    if (silent || tooLong) {
      flush();
      phraseStart = n.time;
      prevEnd = noteEnd;
      bucket.push(n);
    } else {
      bucket.push(n);
      if (noteEnd > prevEnd) prevEnd = noteEnd;
    }
    if (phrases.length >= MAX_PHRASES) break;
  }
  flush();
  return phrases.slice(0, MAX_PHRASES);
}

function makePhrase(
  trackId: string,
  localIndex: number,
  notes: TrackNote[],
): Phrase | null {
  const start = notes[0].time;
  let end = start;
  for (const n of notes) end = Math.max(end, n.time + Math.max(0, n.duration));
  end = Math.min(end, start + MAX_LEN);
  const dur = end - start;
  if (dur < MIN_LEN) return null;

  const chroma = new Float32Array(12);
  let midiAcc = 0;
  let weightAcc = 0;
  let velAcc = 0;
  for (const n of notes) {
    const w = Math.max(0.05, (n.velocity / 127) * Math.max(0.05, n.duration));
    chroma[((n.midi % 12) + 12) % 12] += w;
    midiAcc += n.midi * w;
    weightAcc += w;
    velAcc += n.velocity / 127;
  }
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let i = 0; i < 12; i++) chroma[i] /= norm;

  const meanMidi = weightAcc > 0 ? midiAcc / weightAcc : 60;
  const meanPc = ((Math.round(meanMidi) % 12) + 12) % 12;
  const energy = Math.min(1, velAcc / notes.length);

  // contour: sample notes (decimate if long), position 0..1 along the phrase.
  const stride = Math.max(1, Math.ceil(notes.length / MAX_CONTOUR));
  const contour: ContourPoint[] = [];
  for (let i = 0; i < notes.length; i += stride) {
    const n = notes[i];
    contour.push({ p: dur > 0 ? (n.time - start) / dur : 0, midi: n.midi });
  }
  if (contour.length === 1) contour.push({ p: 1, midi: contour[0].midi });

  return {
    trackId,
    localIndex,
    startTime: start,
    endTime: end,
    chroma,
    meanMidi,
    meanPc,
    energy,
    contour,
    unpitched: false,
  };
}

/**
 * When a track has no note analysis, cut it into even time-slices so its sound
 * is still weave-able. Flat chroma (unpitched) — the harmony engine will treat
 * it as key-neutral and place it raw.
 */
export function buildFallbackPhrases(trackId: string, duration: number): Phrase[] {
  const phrases: Phrase[] = [];
  const slice = 3.5;
  const n = Math.max(1, Math.min(24, Math.floor(duration / slice)));
  const flat = new Float32Array(12).fill(1 / Math.sqrt(12));
  for (let i = 0; i < n; i++) {
    const start = i * slice;
    const end = Math.min(duration, start + slice);
    if (end - start < MIN_LEN) break;
    phrases.push({
      trackId,
      localIndex: i,
      startTime: start,
      endTime: end,
      chroma: flat.slice(),
      meanMidi: 60,
      meanPc: 0,
      energy: 0.5,
      contour: [
        { p: 0, midi: 58 },
        { p: 0.5, midi: 62 },
        { p: 1, midi: 60 },
      ],
      unpitched: true,
    });
  }
  return phrases;
}

// ── Harmony engine ────────────────────────────────────────────────────────────

// Krumhansl-Schmuckler diatonic key profiles (tonic-relative).
const KRUMHANSL_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KRUMHANSL_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

const MAJOR_SET = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SET = [0, 2, 3, 5, 7, 8, 10];

export const PC_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};

/** Parse a key_signature string like "A# major" / "F minor" → {pc, minor}. */
export function parseKey(sig: string | null): { pc: number; minor: boolean } {
  if (!sig) return { pc: 0, minor: false };
  const m = sig.match(/^([A-Ga-g])([#b]?)/);
  const pc = m
    ? PITCH_CLASS[(m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase()] ?? 0
    : 0;
  const minor = /min|m\b|minor/i.test(sig) && !/maj/i.test(sig);
  return { pc, minor };
}

/** Tonic-rotated, unit-normalised key profile (target chroma for scoring). */
export function keyProfile(tonic: number, minor: boolean): Float32Array {
  const base = minor ? KRUMHANSL_MINOR : KRUMHANSL_MAJOR;
  const out = new Float32Array(12);
  let norm = 0;
  for (let i = 0; i < 12; i++) {
    const v = base[(i - tonic + 12) % 12];
    out[i] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let i = 0; i < 12; i++) out[i] /= norm;
  return out;
}

/** Cosine of a phrase's chroma against a key profile — how in-key it is. */
export function fitScore(chroma: Float32Array, profile: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += chroma[i] * profile[i];
  return dot;
}

/**
 * Signed semitone shift (small) that lands a phrase's mean pitch class on the
 * nearest diatonic degree of the target key. Range roughly ±3; caller clamps.
 */
export function nearestScaleOffset(
  meanPc: number,
  tonic: number,
  minor: boolean,
): number {
  const set = minor ? MINOR_SET : MAJOR_SET;
  const rel = ((Math.round(meanPc) - tonic) % 12 + 12) % 12;
  let best = 0;
  let bestAbs = 99;
  for (const s of set) {
    for (const cand of [s - rel, s - rel - 12, s - rel + 12]) {
      if (Math.abs(cand) < bestAbs) {
        bestAbs = Math.abs(cand);
        best = cand;
      }
    }
  }
  return best;
}

/** Human key label, e.g. "A# minor". */
export function keyName(tonic: number, minor: boolean): string {
  return `${PC_NAMES[((tonic % 12) + 12) % 12]} ${minor ? "minor" : "major"}`;
}

/** Estimate a key from a set of phrase chromas (best-correlating profile). */
export function estimateKey(chromas: Float32Array[]): { pc: number; minor: boolean } {
  const agg = new Float32Array(12);
  for (const c of chromas) for (let i = 0; i < 12; i++) agg[i] += c[i];
  let best = { pc: 0, minor: false };
  let bestScore = -Infinity;
  for (let pc = 0; pc < 12; pc++) {
    for (const minor of [false, true]) {
      const prof = keyProfile(pc, minor);
      let s = 0;
      for (let i = 0; i < 12; i++) s += agg[i] * prof[i];
      if (s > bestScore) {
        bestScore = s;
        best = { pc, minor };
      }
    }
  }
  return best;
}
