/**
 * jazz.ts — Jazz theory engine for 526-jazz-room
 *
 * Implements:
 *  - Bill Evans "Type A / Type B" rootless left-hand voicings
 *  - Walking bass line generator (chord tones + chromatic approach on beat 4)
 *  - ii–V–I–vi chord forms in F / Bb jazz blues
 *  - Swing-feel timing helpers
 *  - Phase state machine: head → piano-solo → bass-solo → trade-fours → head-out
 */

// ── Pitch constants ──────────────────────────────────────────────────────────

/** MIDI note number for a pitch name + octave. e.g. midiNote("F", 3) = 53 */
export function midiNote(name: string, octave: number): number {
  const NAMES: Record<string, number> = {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11,
  };
  return (octave + 1) * 12 + (NAMES[name] ?? 0);
}

/** Convert MIDI note to frequency (Hz), A4 = 440 */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Chord types ──────────────────────────────────────────────────────────────

export type ChordQuality = "dom7" | "min7" | "maj7" | "min7b5";

export interface Chord {
  root: string;
  quality: ChordQuality;
  /** Display name, e.g. "F7" */
  name: string;
  /**
   * Intervals (semitones above root) for the full chord:
   * root, 3rd, 5th, 7th, 9th
   */
  tones: number[];
}

function makeChord(root: string, quality: ChordQuality): Chord {
  // Full voicing intervals: root, 3, 5, 7, 9
  const intervals: Record<ChordQuality, number[]> = {
    dom7:   [0, 4, 7, 10, 14],
    min7:   [0, 3, 7, 10, 14],
    maj7:   [0, 4, 7, 11, 14],
    min7b5: [0, 3, 6, 10, 14],
  };
  const suffix: Record<ChordQuality, string> = {
    dom7: "7", min7: "m7", maj7: "maj7", min7b5: "m7b5",
  };
  return {
    root,
    quality,
    name: root + suffix[quality],
    tones: intervals[quality],
  };
}

// ── Chord form: F Jazz Blues (12-bar) ─────────────────────────────────────────
//
// Bar:  1    2    3    4    5    6    7    8    9    10   11   12
//       F7   Bb7  F7   F7   Bb7  Bb7  F7   D7   Gm7  C7   F7   C7

export const JAZZ_BLUES_F: Chord[] = [
  makeChord("F",  "dom7"),   // bar 1
  makeChord("Bb", "dom7"),   // bar 2
  makeChord("F",  "dom7"),   // bar 3
  makeChord("F",  "dom7"),   // bar 4
  makeChord("Bb", "dom7"),   // bar 5
  makeChord("Bb", "dom7"),   // bar 6
  makeChord("F",  "dom7"),   // bar 7
  makeChord("D",  "dom7"),   // bar 8
  makeChord("G",  "min7"),   // bar 9  (Gm7)
  makeChord("C",  "dom7"),   // bar 10 (C7)
  makeChord("F",  "dom7"),   // bar 11
  makeChord("C",  "dom7"),   // bar 12 (turnaround C7)
];

// ── Bill Evans Rootless Voicings ──────────────────────────────────────────────
//
// "Type A" voicing: 3rd on bottom, then 7th, then 9th (or 13th)
// "Type B" voicing: 7th on bottom, then 3rd (or 9th), then 9th (or 13th)
//
// These are voiced without the root — the bass player supplies that.
// Voiced in the mid-range of the piano (MIDI 48–72).

export interface Voicing {
  notes: number[]; // MIDI note numbers, 2–3 notes
  label: string;   // "A" or "B"
}

/**
 * Build a Bill Evans rootless voicing for a chord.
 * rootMidi: the root of the chord in MIDI (we'll voice 3-7-9 above it)
 * type: "A" = 3-7-9, "B" = 7-3-9 (7th on bottom)
 * octave base: target the left-hand range, approx octave 3–4
 */
export function buildVoicing(
  chord: Chord,
  rootMidi: number,
  type: "A" | "B"
): Voicing {
  const [, third, , seventh, ninth] = chord.tones;
  let notes: number[];

  if (type === "A") {
    // Type A: 3 - 7 - 9 (3rd on the bottom)
    const b = rootMidi + third;
    const m = rootMidi + seventh;
    const t = rootMidi + ninth;
    notes = [b, m, t];
  } else {
    // Type B: 7 - 9 - 3 (7th on the bottom, 3rd on top — one octave higher)
    const b = rootMidi + seventh;
    const m = rootMidi + ninth;
    const t = rootMidi + third + 12;
    notes = [b, m, t];
  }

  // Shift voicing into comfortable piano range: center around MIDI 57–65
  // (Bb3–F4), adjusting by ±12 as needed
  notes = notes.map((n) => {
    while (n < 52) n += 12;
    while (n > 74) n -= 12;
    return n;
  });

  return { notes, label: type };
}

// ── Smooth voice-leading between consecutive voicings ─────────────────────────

/**
 * Given the previous voicing and a new target chord, choose Type A or B
 * so the total voice movement is minimised (classic Bill Evans approach).
 */
export function chooseSmoothVoicing(
  prev: Voicing | null,
  chord: Chord,
  rootMidi: number
): Voicing {
  const a = buildVoicing(chord, rootMidi, "A");
  const b = buildVoicing(chord, rootMidi, "B");
  if (!prev) return a;

  const dist = (v: Voicing) => {
    let sum = 0;
    for (let i = 0; i < Math.min(prev.notes.length, v.notes.length); i++) {
      sum += Math.abs(v.notes[i] - prev.notes[i]);
    }
    return sum;
  };
  return dist(a) <= dist(b) ? a : b;
}

// ── Walking Bass Generator ────────────────────────────────────────────────────
//
// Classic bebop walking bass rules:
//  Beat 1: chord root
//  Beat 2: 5th or 3rd of chord
//  Beat 3: another chord tone or colour note
//  Beat 4: chromatic approach note to next bar's root (±1 semitone above/below)

export function makeWalkingBar(
  chord: Chord,
  rootMidi: number,
  nextRootMidi: number
): number[] {
  // All chord tones from root up, in bass range (E1–E3, MIDI 28–52)
  const bassMidi = (root: number) => {
    let n = root;
    while (n < 28) n += 12;
    while (n > 52) n -= 12;
    return n;
  };

  const chordMidis = chord.tones.map((t) => bassMidi(rootMidi + t));
  // Remove duplicates
  const uniq = [...new Set(chordMidis)];

  const beat1 = bassMidi(rootMidi);
  const beat2 = uniq.length > 2 ? uniq[2] : uniq[1] ?? beat1 + 7;  // 5th
  const beat3 = uniq.length > 1 ? uniq[1] : beat1 + 3;              // 3rd

  // Approach: half-step below next root, or above if that's closer
  const nextRoot = bassMidi(nextRootMidi);
  const approach = nextRoot - beat3 > 0 ? nextRoot - 1 : nextRoot + 1;

  return [beat1, beat2, beat3, approach];
}

// ── Root MIDI map ─────────────────────────────────────────────────────────────

const ROOT_OCTAVE_BASS = 2; // bass octave
const ROOT_OCTAVE_PIANO = 3;

const NOTE_NAMES: Record<string, number> = {
  C: 0, "C#": 1, Db: 1,
  D: 2, "D#": 3, Eb: 3,
  E: 4,
  F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8,
  A: 9, "A#": 10, Bb: 10,
  B: 11,
};

export function chordRootMidi(chord: Chord, octave: number): number {
  return (octave + 1) * 12 + (NOTE_NAMES[chord.root] ?? 0);
}

export function bassRoot(chord: Chord): number {
  return chordRootMidi(chord, ROOT_OCTAVE_BASS);
}

export function pianoRoot(chord: Chord): number {
  return chordRootMidi(chord, ROOT_OCTAVE_PIANO);
}

// ── Swing timing ──────────────────────────────────────────────────────────────
//
// Swing: divide each beat into two "eighth notes" where the first is ~2/3 of
// a beat and the second is ~1/3, rather than equal halves. Ratio ~2:1.

export const SWING_RATIO = 2 / 3; // long eighth = 2/3 of beat

/** Return the time (in seconds from bar start) of beat `b` and swing-8th `s`
 *  b: 0–3 (beats), s: 0 or 1 (eighth position), bpm: tempo */
export function swingTime(b: number, s: number, bpm: number): number {
  const beatDur = 60 / bpm;
  return b * beatDur + s * SWING_RATIO * beatDur;
}

// ── Performance phases ────────────────────────────────────────────────────────

export type Phase =
  | "head"
  | "piano-solo"
  | "bass-solo"
  | "trade-fours"
  | "head-out";

export interface PhaseConfig {
  label: string;
  choruses: number;      // how many 12-bar choruses
  pianoActivity: number; // 0–1 (how busy piano comping is)
  bassActivity: number;  // 0–1
  drumsActivity: number;
  melodyOn: boolean;     // is the "head" melody playing?
}

export const PHASE_CONFIGS: Record<Phase, PhaseConfig> = {
  "head": {
    label: "Head",
    choruses: 1,
    pianoActivity: 0.6,
    bassActivity: 0.9,
    drumsActivity: 0.7,
    melodyOn: true,
  },
  "piano-solo": {
    label: "Piano Solo",
    choruses: 2,
    pianoActivity: 1.0,
    bassActivity: 0.95,
    drumsActivity: 0.8,
    melodyOn: false,
  },
  "bass-solo": {
    label: "Bass Solo",
    choruses: 1,
    pianoActivity: 0.25,
    bassActivity: 1.0,
    drumsActivity: 0.5,
    melodyOn: false,
  },
  "trade-fours": {
    label: "Trading Fours",
    choruses: 2,
    pianoActivity: 0.85,
    bassActivity: 0.9,
    drumsActivity: 1.0,
    melodyOn: false,
  },
  "head-out": {
    label: "Head Out",
    choruses: 1,
    pianoActivity: 0.7,
    bassActivity: 0.95,
    drumsActivity: 0.75,
    melodyOn: true,
  },
};

export const PHASE_ORDER: Phase[] = [
  "head",
  "piano-solo",
  "bass-solo",
  "trade-fours",
  "head-out",
];

// ── Head melody (simplified bebop head over F blues) ─────────────────────────
// A short single-voice melody that outlines the changes. 2 notes per bar,
// MIDI note numbers (mid-range, octave 4–5).

export const HEAD_MELODY: Array<{ beat: number; midi: number; dur: number }[]> =
  [
    // bar 0: F7 — root + 3rd + 7th motif
    [{ beat: 0, midi: 65, dur: 0.4 }, { beat: 1, midi: 67, dur: 0.3 }, { beat: 2, midi: 69, dur: 0.4 }, { beat: 3, midi: 68, dur: 0.25 }],
    // bar 1: Bb7
    [{ beat: 0, midi: 70, dur: 0.5 }, { beat: 2, midi: 68, dur: 0.4 }],
    // bar 2: F7
    [{ beat: 0, midi: 65, dur: 0.35 }, { beat: 1.5, midi: 67, dur: 0.3 }, { beat: 3, midi: 69, dur: 0.25 }],
    // bar 3: F7
    [{ beat: 0, midi: 65, dur: 0.6 }, { beat: 2, midi: 64, dur: 0.4 }],
    // bar 4: Bb7
    [{ beat: 0, midi: 70, dur: 0.4 }, { beat: 1, midi: 72, dur: 0.3 }, { beat: 2.5, midi: 70, dur: 0.4 }],
    // bar 5: Bb7
    [{ beat: 0, midi: 68, dur: 0.5 }, { beat: 2, midi: 67, dur: 0.4 }],
    // bar 6: F7
    [{ beat: 0, midi: 65, dur: 0.4 }, { beat: 1.5, midi: 67, dur: 0.3 }, { beat: 3, midi: 68, dur: 0.25 }],
    // bar 7: D7
    [{ beat: 0, midi: 66, dur: 0.4 }, { beat: 2, midi: 69, dur: 0.4 }],
    // bar 8: Gm7
    [{ beat: 0, midi: 67, dur: 0.4 }, { beat: 1, midi: 70, dur: 0.3 }, { beat: 2.5, midi: 69, dur: 0.35 }],
    // bar 9: C7
    [{ beat: 0, midi: 72, dur: 0.4 }, { beat: 2, midi: 70, dur: 0.35 }],
    // bar 10: F7
    [{ beat: 0, midi: 65, dur: 0.4 }, { beat: 1, midi: 67, dur: 0.3 }, { beat: 3, midi: 65, dur: 0.4 }],
    // bar 11: C7 turnaround
    [{ beat: 0, midi: 64, dur: 0.35 }, { beat: 2, midi: 65, dur: 0.5 }],
  ];

// ── Piano solo motifs ─────────────────────────────────────────────────────────
// Pre-composed snippets that are randomly selected & transposed per bar.
// Each motif is a pattern of {semitone-offset-from-bar-root, beat, dur}.

export type SoloNote = { offset: number; beat: number; dur: number };

export const PIANO_MOTIFS: SoloNote[][] = [
  // Bebop phrase ascending
  [
    { offset: 0, beat: 0, dur: 0.2 },
    { offset: 2, beat: 0.5, dur: 0.2 },
    { offset: 4, beat: 1, dur: 0.2 },
    { offset: 5, beat: 1.5, dur: 0.2 },
    { offset: 7, beat: 2, dur: 0.3 },
    { offset: 9, beat: 2.5, dur: 0.2 },
    { offset: 11, beat: 3, dur: 0.35 },
  ],
  // Call-and-response
  [
    { offset: 7, beat: 0, dur: 0.35 },
    { offset: 5, beat: 0.5, dur: 0.2 },
    { offset: 4, beat: 1, dur: 0.4 },
    { offset: 0, beat: 2.5, dur: 0.25 },
    { offset: 2, beat: 3, dur: 0.3 },
  ],
  // Upper-structure run
  [
    { offset: 14, beat: 0, dur: 0.2 },
    { offset: 12, beat: 0.5, dur: 0.2 },
    { offset: 11, beat: 1, dur: 0.2 },
    { offset: 9, beat: 1.5, dur: 0.2 },
    { offset: 7, beat: 2, dur: 0.4 },
    { offset: 4, beat: 3, dur: 0.4 },
  ],
  // Sparse blues motif
  [
    { offset: 0, beat: 0, dur: 0.5 },
    { offset: 3, beat: 1.5, dur: 0.4 },
    { offset: 7, beat: 2.5, dur: 0.5 },
  ],
  // Chromatic sneak
  [
    { offset: 11, beat: 0, dur: 0.2 },
    { offset: 10, beat: 0.5, dur: 0.2 },
    { offset: 9, beat: 1, dur: 0.4 },
    { offset: 7, beat: 2, dur: 0.35 },
    { offset: 5, beat: 3, dur: 0.3 },
  ],
];
