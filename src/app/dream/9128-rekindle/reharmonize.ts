/**
 * Functional reharmonization for `9128-rekindle`.
 *
 * Given a transcribed melody, estimate a key (Krumhansl–Schmuckler pitch-class
 * correlation) and generate a NEW chord progression underneath it. The melody is
 * preserved; only the harmony is re-voiced — tritone subs, modal interchange,
 * ii–V insertion and pedal points, steered by a style + a density control. Chord
 * spelling goes through the `tonal` music-theory library.
 */

import { Chord, Note } from "tonal";
import { mulberry32, SEED, pick } from "./prng";
import type { NoteEvent } from "./transcribe";

export type ReharmStyle = "warm" | "modal" | "cinematic" | "sparse";

export const STYLE_LABELS: Record<ReharmStyle, string> = {
  warm: "Warm",
  modal: "Modal",
  cinematic: "Cinematic",
  sparse: "Sparse",
};

export interface ChordEvent {
  /** Chord symbol as spelled by tonal, e.g. "Cmaj7". */
  symbol: string;
  /** Root pitch-class (0–11). */
  rootPc: number;
  /** MIDI pitch numbers of the voiced chord (low → high). */
  voicing: number[];
  /** Onset time in seconds. */
  start: number;
  /** Duration in seconds. */
  dur: number;
  /** Roman-numeral / functional tag for the read-out. */
  roman: string;
}

export interface KeyEstimate {
  tonicPc: number;
  mode: "major" | "minor";
  name: string;
}

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl–Kessler key profiles (major / minor), rotated to the candidate tonic.
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function correlate(hist: number[], profile: number[], shift: number): number {
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += hist[i] * profile[(i - shift + 12) % 12];
  return dot;
}

/** Estimate key from duration-weighted pitch-class content. Deterministic. */
export function estimateKey(notes: NoteEvent[]): KeyEstimate {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[((n.midi % 12) + 12) % 12] += n.dur * (0.4 + n.vel);

  let best = { score: -Infinity, tonic: 0, mode: "major" as "major" | "minor" };
  for (let tonic = 0; tonic < 12; tonic++) {
    const maj = correlate(hist, MAJOR_PROFILE, tonic);
    const min = correlate(hist, MINOR_PROFILE, tonic);
    if (maj > best.score) best = { score: maj, tonic, mode: "major" };
    if (min > best.score) best = { score: min, tonic, mode: "minor" };
  }
  return {
    tonicPc: best.tonic,
    mode: best.mode,
    name: `${PC_NAMES[best.tonic]} ${best.mode}`,
  };
}

// Roman numeral → { degree semitones above tonic, chord quality suffix, label }.
// Quality suffixes are tonal-parseable (e.g. "maj7", "m7", "7", "m7b5").
interface Deg {
  semi: number;
  q: string;
  roman: string;
}

// Diatonic seventh chords for a major key.
const MAJOR_DEGREES: Record<string, Deg> = {
  I: { semi: 0, q: "maj7", roman: "Imaj7" },
  ii: { semi: 2, q: "m7", roman: "ii7" },
  iii: { semi: 4, q: "m7", roman: "iii7" },
  IV: { semi: 5, q: "maj7", roman: "IVmaj7" },
  V: { semi: 7, q: "7", roman: "V7" },
  vi: { semi: 9, q: "m7", roman: "vi7" },
  vii: { semi: 11, q: "m7b5", roman: "viiø" },
};

// Diatonic seventh chords for a (natural/harmonic-ish) minor key.
const MINOR_DEGREES: Record<string, Deg> = {
  i: { semi: 0, q: "m7", roman: "i7" },
  ii: { semi: 2, q: "m7b5", roman: "iiø" },
  III: { semi: 3, q: "maj7", roman: "♭IIImaj7" },
  iv: { semi: 5, q: "m7", roman: "iv7" },
  v: { semi: 7, q: "7", roman: "V7" },
  VI: { semi: 8, q: "maj7", roman: "♭VImaj7" },
  VII: { semi: 10, q: "7", roman: "♭VII7" },
};

// Borrowed / color chords (modal interchange, chromatic mediants) keyed by style.
const BORROWED_MAJOR: Deg[] = [
  { semi: 5, q: "m7", roman: "iv7 (borrowed)" }, // minor iv
  { semi: 8, q: "maj7", roman: "♭VImaj7" }, // bVI
  { semi: 10, q: "7", roman: "♭VII7" }, // bVII
  { semi: 3, q: "maj7", roman: "♭IIImaj7" }, // bIII
];

// Functional progression templates (as degree keys) per style.
const TEMPLATES: Record<ReharmStyle, string[][]> = {
  warm: [
    ["I", "vi", "ii", "V"],
    ["I", "IV", "ii", "V"],
    ["vi", "ii", "V", "I"],
  ],
  modal: [
    ["I", "IV", "I", "IV"],
    ["ii", "IV", "I", "V"],
    ["vi", "IV", "I", "V"],
  ],
  cinematic: [
    ["I", "iii", "IV", "V"],
    ["I", "vi", "IV", "V"],
    ["IV", "I", "V", "vi"],
  ],
  sparse: [
    ["I", "V"],
    ["I", "IV"],
    ["vi", "V"],
  ],
};

function romanToDeg(mode: "major" | "minor", roman: string): Deg {
  const table = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
  // Map major-style roman keys onto minor equivalents where needed.
  if (table[roman]) return table[roman];
  const fallback: Record<string, string> =
    mode === "minor"
      ? { I: "i", ii: "ii", iii: "III", IV: "iv", V: "v", vi: "VI", vii: "VII" }
      : {};
  return table[fallback[roman] ?? "I"] ?? MAJOR_DEGREES.I;
}

/** Chroma set (0–11) of a chord symbol, via tonal. */
function chordChroma(symbol: string): number[] {
  const notes = Chord.get(symbol).notes;
  return notes.map((n) => Note.chroma(n)).filter((c): c is number => c != null);
}

/**
 * Build a close, non-drone voicing for a chord around a target register.
 * Root in the low register, upper tones stacked; melody stays above.
 */
function voiceChord(rootPc: number, symbol: string, register: number): number[] {
  const chroma = chordChroma(symbol);
  if (chroma.length === 0) return [rootPc + register * 12];
  const rootMidi = rootPc + register * 12;
  const voicing: number[] = [rootMidi];
  let prev = rootMidi;
  for (let i = 1; i < chroma.length; i++) {
    let m = chroma[i] + register * 12 + 12;
    while (m <= prev) m += 12;
    voicing.push(m);
    prev = m;
  }
  return voicing;
}

/** How many chord tones of `symbol` are present in the melody window PCs. */
function fitScore(symbol: string, melodyPcs: number[]): number {
  if (melodyPcs.length === 0) return 0;
  const chroma = new Set(chordChroma(symbol));
  let hit = 0;
  for (const pc of melodyPcs) if (chroma.has(pc)) hit++;
  return hit / melodyPcs.length;
}

export interface ReharmResult {
  key: KeyEstimate;
  chords: ChordEvent[];
}

/**
 * Generate a reharmonization.
 *
 * @param melody  the melody note events to re-voice
 * @param style   reharmonization character
 * @param density 0..1 — higher = more chords + more reharmonizing moves
 */
export function reharmonize(
  melody: NoteEvent[],
  style: ReharmStyle,
  density: number,
): ReharmResult {
  const rng = mulberry32(SEED ^ (Math.round(density * 100) << 3) ^ styleSeed(style));
  const key = estimateKey(melody);
  const chords: ChordEvent[] = [];

  if (melody.length === 0) return { key, chords };

  const end = Math.max(...melody.map((n) => n.start + n.dur));
  // Window count scales with density and length. Sparse style stays open.
  const base = style === "sparse" ? 1.6 : 1.0;
  const perSec = (0.35 + density * 0.85) / base;
  const windowCount = Math.max(2, Math.round(end * perSec));
  const winLen = end / windowCount;

  const template = pick(rng, TEMPLATES[style]);

  const lowRegister = 3; // octave for chord roots (MIDI ~ C3=48)

  for (let w = 0; w < windowCount; w++) {
    const wStart = w * winLen;
    const wEnd = wStart + winLen;
    const melodyPcs = melody
      .filter((n) => n.start < wEnd && n.start + n.dur > wStart)
      .map((n) => ((n.midi % 12) + 12) % 12);

    // Candidate degrees: the templated diatonic chord for this bar, plus
    // style-specific reharmonizing candidates.
    const templeRoman = template[w % template.length];
    const candidates: Deg[] = [romanToDeg(key.mode, templeRoman)];

    // ii–V insertion: on stronger density, precede a V/target with its ii.
    if (density > 0.4 && key.mode === "major") {
      candidates.push(MAJOR_DEGREES.ii, MAJOR_DEGREES.V);
    }
    // Modal interchange / chromatic color.
    if ((style === "modal" || style === "cinematic") && density > 0.3) {
      candidates.push(...BORROWED_MAJOR);
    }
    // Warm adds gentle vi / IV color.
    if (style === "warm") {
      candidates.push(MAJOR_DEGREES.vi, MAJOR_DEGREES.IV);
    }

    // Tritone substitution on dominant chords (cinematic + high density).
    const withSubs: Deg[] = [];
    for (const d of candidates) {
      withSubs.push(d);
      if (
        d.q === "7" &&
        (style === "cinematic" || density > 0.6) &&
        rng() > 0.45
      ) {
        withSubs.push({
          semi: (d.semi + 6) % 12,
          q: "7",
          roman: `${d.roman} (tritone sub)`,
        });
      }
    }

    // Score each candidate by melodic fit; tie-break with the seeded stream.
    let best = withSubs[0];
    let bestScore = -Infinity;
    for (const d of withSubs) {
      const rootPc = (key.tonicPc + d.semi) % 12;
      const symbol = `${PC_NAMES[rootPc]}${d.q}`;
      const score = fitScore(symbol, melodyPcs) + (rng() - 0.5) * 0.15;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }

    const rootPc = (key.tonicPc + best.semi) % 12;
    const symbol = `${PC_NAMES[rootPc]}${best.q}`;
    // Sparse style thins voicings to root + fifth-ish open sound.
    const voicing =
      style === "sparse"
        ? voiceChord(rootPc, symbol, lowRegister).slice(0, 2)
        : voiceChord(rootPc, symbol, lowRegister);

    chords.push({
      symbol,
      rootPc,
      voicing,
      start: wStart,
      dur: winLen,
      roman: best.roman,
    });
  }

  return { key, chords };
}

function styleSeed(style: ReharmStyle): number {
  return { warm: 11, modal: 23, cinematic: 47, sparse: 71 }[style];
}
