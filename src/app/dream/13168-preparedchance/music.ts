// ─────────────────────────────────────────────────────────────────────────────
// music.ts — the scale, the keyboard map, and the pitch math for 13168.
//
// Everything the keyboardist plays is diatonic (A natural minor / Aeolian) so
// that the chance engine's transpositions stay consonant — a gentle collaborator
// rather than noise. White keys walk the scale; black keys fill the whole-step
// gaps exactly where a real piano's black keys sit (a 2-then-3 grouping).
// ─────────────────────────────────────────────────────────────────────────────

import type { Preparation } from "./strings";

/** MIDI note of scale degree 0. A3. */
export const ROOT = 57;

/** A natural-minor / Aeolian scale as semitone offsets over one octave. */
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** Lowest / highest MIDI we plot on the time-lane (for pitch → y). */
export const PITCH_LO = ROOT - 4;
export const PITCH_HI = ROOT + 24;

/** Convert a (possibly out-of-octave) diatonic degree to a semitone offset. */
export function degreeToSemitone(degree: number): number {
  const oct = Math.floor(degree / MINOR.length);
  const idx = ((degree % MINOR.length) + MINOR.length) % MINOR.length;
  return oct * 12 + MINOR[idx];
}

/** A single playable key: which pitch, which scale slot, which preparation. */
export interface NoteSpec {
  /** MIDI note number that will actually sound. */
  midi: number;
  /** Diatonic degree of the underlying white key. */
  degree: number;
  /** True when this is a black key (a +1 semitone accidental). */
  accidental: boolean;
  /** The fixed "preparation object" wedged against this string. */
  prep: Preparation;
}

// Preparation is a physical property of the struck string, so it is keyed to
// pitch class and stays stable for a given note. Evokes a prepared piano where
// only certain keys carry a bolt, a screw, or a strip of felt.
const PREP_CYCLE: Preparation[] = [
  "felt",
  "harmonic",
  "bolt",
  "detune",
  "felt",
  "detune",
  "harmonic",
  "bolt",
];

/** Deterministic preparation for a MIDI note. */
export function prepFor(midi: number): Preparation {
  const i = ((midi % PREP_CYCLE.length) + PREP_CYCLE.length) % PREP_CYCLE.length;
  return PREP_CYCLE[i];
}

/** Build the full NoteSpec for a white-key degree (optionally sharped). */
export function specFromDegree(degree: number, accidental = false): NoteSpec {
  const midi = ROOT + degreeToSemitone(degree) + (accidental ? 1 : 0);
  return { midi, degree, accidental, prep: prepFor(midi) };
}

/** Transpose a spec by N diatonic steps, keeping it in the scale + its prep. */
export function transposeSpec(spec: NoteSpec, steps: number): NoteSpec {
  const degree = spec.degree + steps;
  const midi = ROOT + degreeToSemitone(degree) + (spec.accidental ? 1 : 0);
  // Preparation belongs to the KEY the player struck, so it does not move.
  return { midi, degree, accidental: spec.accidental, prep: spec.prep };
}

/** Normalise a MIDI note to 0..1 across the lane's pitch window (for y). */
export function pitchNorm(midi: number): number {
  const t = (midi - PITCH_LO) / (PITCH_HI - PITCH_LO);
  return Math.min(1, Math.max(0, t));
}

// ── QWERTY fallback keyboard ────────────────────────────────────────────────
// Bottom row = white keys (scale degrees 0..7). Top row = black keys wedged
// into the whole-step gaps, in the same 2-then-3 shape as a piano octave.
export interface KeyMapEntry {
  key: string;
  label: string;
  spec: NoteSpec;
  black: boolean;
}

const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
// Black key -> the lower white degree it sharpens. Gaps of a whole step in
// A-minor sit above degrees 0, 2, 3, 5, 6.
const BLACK_KEYS: { key: string; degree: number }[] = [
  { key: "w", degree: 0 },
  { key: "e", degree: 2 },
  { key: "t", degree: 3 },
  { key: "y", degree: 5 },
  { key: "u", degree: 6 },
];

export function buildKeyMap(): Map<string, KeyMapEntry> {
  const map = new Map<string, KeyMapEntry>();
  WHITE_KEYS.forEach((key, degree) => {
    map.set(key, {
      key,
      label: key.toUpperCase(),
      spec: specFromDegree(degree, false),
      black: false,
    });
  });
  for (const { key, degree } of BLACK_KEYS) {
    map.set(key, {
      key,
      label: key.toUpperCase(),
      spec: specFromDegree(degree, true),
      black: true,
    });
  }
  return map;
}

/** Build a NoteSpec straight from a raw MIDI note (Web MIDI path). */
export function specFromMidi(midi: number): NoteSpec {
  // Snap the incoming note to the nearest diatonic degree so hardware input
  // and the chance engine share one scale. Search degrees around the root.
  let best = 0;
  let bestErr = Infinity;
  for (let d = -14; d <= 21; d++) {
    const white = ROOT + degreeToSemitone(d);
    for (const acc of [0, 1]) {
      const err = Math.abs(white + acc - midi);
      if (err < bestErr) {
        bestErr = err;
        best = d;
        // accidental captured below via recompute
      }
    }
  }
  const whiteMidi = ROOT + degreeToSemitone(best);
  const accidental = Math.abs(whiteMidi + 1 - midi) < Math.abs(whiteMidi - midi);
  const snapped = whiteMidi + (accidental ? 1 : 0);
  return { midi: snapped, degree: best, accidental, prep: prepFor(snapped) };
}
