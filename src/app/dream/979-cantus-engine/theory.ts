// theory.ts — deterministic music-theory primitives for the cantus engine.
//
// Everything here is pure and reproducible: a seeded PRNG, diatonic
// scale math, and the named contrapuntal operations (transposition,
// inversion, retrograde, augmentation, diminution, tonal answer).
// No Math.random, no global state.

// ── seeded PRNG (mulberry32) ──────────────────────────────────────────────
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: Rng, items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── pitch / scale model ───────────────────────────────────────────────────
// We represent pitch as MIDI note numbers. A "key" is a tonic pitch-class
// plus a mode (major/minor natural). Diatonic degree math is done by
// indexing into the key's scale-step pattern.

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export type Mode = "major" | "minor";

export interface Key {
  tonicPc: number; // 0..11
  mode: Mode;
  name: string; // e.g. "C major"
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

export function makeKey(tonicPc: number, mode: Mode): Key {
  const pc = ((tonicPc % 12) + 12) % 12;
  return { tonicPc: pc, mode, name: `${NOTE_NAMES[pc]} ${mode}` };
}

export function scaleSteps(mode: Mode): number[] {
  return mode === "major" ? MAJOR_STEPS : MINOR_STEPS;
}

// Convert a diatonic degree (0-based, can be negative or > 6 across octaves)
// into a MIDI pitch in the given key, anchored near the given octave.
export function degreeToMidi(key: Key, degree: number, octave: number): number {
  const steps = scaleSteps(key.mode);
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return (octave + oct + 1) * 12 + key.tonicPc + steps[idx];
}

// Snap an arbitrary MIDI pitch to the nearest in-key pitch, returning the
// diatonic degree relative to the tonic of the given octave anchor.
export function midiToDegree(key: Key, midi: number, octave: number): number {
  const steps = scaleSteps(key.mode);
  const base = (octave + 1) * 12 + key.tonicPc;
  const rel = midi - base;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  // nearest scale step
  let best = 0;
  let bestDist = 99;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i] - pc);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return oct * 7 + best;
}

export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

// ── motif representation ──────────────────────────────────────────────────
// A motif is a sequence of (degree, duration) pairs. Degree is a diatonic
// scale degree (0 = tonic). Duration is in beats (quarter = 1).
export interface MotifNote {
  degree: number;
  dur: number;
}
export type Motif = MotifNote[];

// ── named contrapuntal operations ─────────────────────────────────────────
// Each returns a NEW motif; none mutate the input. These are the
// human-legible transformations the engine narrates on screen.

/** Diatonic transposition: shift every degree by n scale steps. */
export function applyTranspose(m: Motif, steps: number): Motif {
  return m.map((n) => ({ degree: n.degree + steps, dur: n.dur }));
}

/** Real answer: chromatic transposition up a perfect fifth (7 semitones).
 *  Realized diatonically as +4 scale degrees (a fifth in diatonic terms). */
export function applyAnswerReal(m: Motif): Motif {
  return applyTranspose(m, 4);
}

/** Tonal answer: like a real answer but the opening tonic↔dominant
 *  relationship is adjusted so the answer stays in key. We approximate the
 *  classic tonal adjustment: the first note is answered a fourth up instead
 *  of a fifth, the remainder a fifth up. */
export function applyAnswerTonal(m: Motif): Motif {
  return m.map((n, i) => ({
    degree: n.degree + (i === 0 ? 3 : 4),
    dur: n.dur,
  }));
}

/** Inversion: mirror intervals around the first note's degree (axis). */
export function applyInversion(m: Motif): Motif {
  if (m.length === 0) return [];
  const axis = m[0].degree;
  return m.map((n) => ({ degree: axis - (n.degree - axis), dur: n.dur }));
}

/** Retrograde: reverse the order of notes. */
export function applyRetrograde(m: Motif): Motif {
  return [...m].reverse().map((n) => ({ degree: n.degree, dur: n.dur }));
}

/** Augmentation: stretch durations by a factor (default 2 = twice as slow). */
export function applyAugmentation(m: Motif, factor = 2): Motif {
  return m.map((n) => ({ degree: n.degree, dur: n.dur * factor }));
}

/** Diminution: compress durations (default 0.5 = twice as fast). */
export function applyDiminution(m: Motif, factor = 0.5): Motif {
  return m.map((n) => ({ degree: n.degree, dur: n.dur * factor }));
}

export type OpName =
  | "SUBJECT"
  | "ANSWER (real)"
  | "ANSWER (tonal)"
  | "TRANSPOSE"
  | "INVERSION"
  | "RETROGRADE"
  | "AUGMENTATION"
  | "DIMINUTION"
  | "STRETTO"
  | "MODULATE";

// ── built-in subjects (diatonic degrees in the current tonic) ─────────────
export interface BuiltInSubject {
  id: string;
  label: string;
  motif: Motif;
}

// B-A-C-H spells (in German notation) Bb, A, C, B-natural. As a compact
// chromatic cell we represent it as a stepwise sigh + leap, mapped to
// diatonic degrees that preserve its semitone-rich contour.
export const BUILT_IN_SUBJECTS: BuiltInSubject[] = [
  {
    id: "bach",
    label: "B-A-C-H cell",
    motif: [
      { degree: 6, dur: 1 },
      { degree: 5, dur: 1 },
      { degree: 0, dur: 1 },
      { degree: 6, dur: 1 },
    ],
  },
  {
    id: "fourth",
    label: "Ascending fourth",
    motif: [
      { degree: 0, dur: 1 },
      { degree: 3, dur: 1 },
      { degree: 2, dur: 0.5 },
      { degree: 1, dur: 0.5 },
      { degree: 2, dur: 1 },
    ],
  },
  {
    id: "ricercar",
    label: "Royal-theme sigh",
    motif: [
      { degree: 0, dur: 1.5 },
      { degree: 4, dur: 1 },
      { degree: 5, dur: 0.5 },
      { degree: 4, dur: 1 },
      { degree: 2, dur: 1 },
      { degree: 0, dur: 1 },
    ],
  },
];

// Related keys for modulation: dominant, subdominant, relative.
export function relatedKeys(key: Key): Key[] {
  const dom = makeKey(key.tonicPc + 7, key.mode);
  const sub = makeKey(key.tonicPc + 5, key.mode);
  const rel =
    key.mode === "major"
      ? makeKey(key.tonicPc + 9, "minor")
      : makeKey(key.tonicPc + 3, "major");
  return [dom, sub, rel];
}
