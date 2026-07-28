// ─────────────────────────────────────────────────────────────────────────────
// harmony.ts — a lightweight harmonic-tension model (Lerdahl-inspired).
//
//   Fred Lerdahl's *Tonal Pitch Space* (2001) quantifies harmonic/melodic
//   tension as DISTANCE in a structured pitch space. We don't implement his full
//   model; we take three of its ingredients and fold them into a single scalar
//   tension ∈ [0,1] for each melodic note, measured against a fixed key (C major)
//   whose tonic is sounding as a drone:
//
//     1. Region distance — how far the note's pitch-class sits from the tonic on
//        the circle of fifths (tonic near, tritone far).
//     2. Chord-tone status — is it a tonic-triad tone, a diatonic colour tone, or
//        an out-of-key chromatic note?
//     3. Melodic-leap dissonance — the interval class of the step FROM the last
//        note (semitone/tritone jars, fifth/third is smooth).
//
//   The tension scalar drives the walker's balance physics (see physics.ts): low
//   tension steadies him and advances him along the wire; high tension shoves him
//   toward the edge. Tension therefore has an audible AND a physical consequence —
//   the wrong note can actually topple him.
// ─────────────────────────────────────────────────────────────────────────────

/** C major. Tonic pitch-class = 0. */
const DIATONIC = new Set([0, 2, 4, 5, 7, 9, 11]); // C D E F G A B
const CHORD_TONES = new Set([0, 4, 7]); // tonic triad C E G

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

/** Signed position on the circle of fifths, in [-6, 6]. Sharp-side keys are
 *  positive, flat-side negative; the tritone (F♯) sits at the far edge (+6). */
function cofSigned(pc: number): number {
  const idx = (pc * 7) % 12; // fifths from C
  return idx > 6 ? idx - 12 : idx;
}

/** Interval-class dissonance for a melodic step, indexed by interval class 0–6.
 *  Unison/octave smoothest, semitone & tritone most jarring (classic ranking). */
const IC_DISSONANCE = [0.0, 1.0, 0.5, 0.25, 0.2, 0.1, 0.85];

export interface NoteAnalysis {
  /** Total tension ∈ [0,1]. */
  tension: number;
  /** Harmonic component ∈ [0,1] (key/chord distance). */
  harmonic: number;
  /** Melodic component ∈ [0,1] (leap dissonance). */
  melodic: number;
  /** Lateral balance bias ∈ [-1,1] the note wants to impart (sharp → +, flat → −). */
  direction: number;
  isChordTone: boolean;
  isDiatonic: boolean;
  /** Human-readable note name, e.g. "F♯". */
  name: string;
}

/** Harmonic tension for a pitch-class against C major's tonic. */
function harmonicTension(pc: number): number {
  const cof = Math.abs(cofSigned(pc)) / 6; // 0 (tonic) … 1 (tritone)
  if (CHORD_TONES.has(pc)) return 0.04 + 0.06 * cof; // C E G — home
  if (DIATONIC.has(pc)) return 0.3 + 0.2 * cof; // D F A B — in-key colour
  return 0.62 + 0.38 * cof; // chromatic — the danger zone
}

/** Melodic tension from the previous note (interval-class dissonance). */
function melodicTension(prevMidi: number | null, midi: number): number {
  if (prevMidi == null) return 0;
  const semis = Math.abs(midi - prevMidi) % 12;
  const ic = Math.min(semis, 12 - semis);
  return IC_DISSONANCE[ic];
}

/**
 * Analyse a played note against the sounding key (C major).
 * `prevMidi` is the previously played MIDI note, or null for the first note.
 */
export function analyzeNote(midi: number, prevMidi: number | null): NoteAnalysis {
  const pc = ((midi % 12) + 12) % 12;
  const harmonic = harmonicTension(pc);
  const melodic = melodicTension(prevMidi, midi);
  const tension = Math.min(1, 0.62 * harmonic + 0.38 * melodic);

  const cofBias = cofSigned(pc) / 6; // sharp side pushes right, flat side left
  const leapSign =
    prevMidi == null ? 0 : Math.sign(midi - prevMidi);
  const direction = Math.max(
    -1,
    Math.min(1, 0.75 * cofBias + 0.25 * leapSign),
  );

  return {
    tension,
    harmonic,
    melodic,
    direction,
    isChordTone: CHORD_TONES.has(pc),
    isDiatonic: DIATONIC.has(pc),
    name: NOTE_NAMES[pc],
  };
}

// ── Keyboard → pitch mapping ────────────────────────────────────────────────
//
// A tracker/piano layout across two QWERTY rows. The lower row is a full
// chromatic octave (white keys on Z X C V B N M, sharps on S D G H J); the upper
// row is the octave above (white keys Q W E R T Y U, sharps 2 3 5 6 7). Every
// chromatic pitch is reachable, so dissonance — and danger — is always a keypress
// away. Base = C3 (MIDI 48).

const BASE_MIDI = 48;

/** Ordered [key, semitone-offset] for the two-octave layout. */
const LAYOUT: ReadonlyArray<readonly [string, number]> = [
  // lower octave (C3…)
  ["z", 0],
  ["s", 1],
  ["x", 2],
  ["d", 3],
  ["c", 4],
  ["v", 5],
  ["g", 6],
  ["b", 7],
  ["h", 8],
  ["n", 9],
  ["j", 10],
  ["m", 11],
  [",", 12],
  // upper octave (C4…)
  ["q", 12],
  ["2", 13],
  ["w", 14],
  ["3", 15],
  ["e", 16],
  ["r", 17],
  ["5", 18],
  ["t", 19],
  ["6", 20],
  ["y", 21],
  ["7", 22],
  ["u", 23],
  ["i", 24],
];

export const KEY_TO_MIDI: Readonly<Record<string, number>> = Object.fromEntries(
  LAYOUT.map(([k, off]) => [k, BASE_MIDI + off]),
);

/** The sounding key's tonic MIDI, used for the drone. */
export const TONIC_MIDI = BASE_MIDI; // C3
