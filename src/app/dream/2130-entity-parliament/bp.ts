// Bohlen–Pierce scale — 13 equal divisions of the TRITAVE (3:1), not the octave.
// Step ratio = 3^(1/13). BP sounds consonant-but-alien on odd-harmonic timbres,
// which suits an "other" presence. Each held note = one being singing.

export const BP_TRITAVE = 3;
export const BP_STEPS = 13;
export const BP_STEP_RATIO = Math.pow(BP_TRITAVE, 1 / BP_STEPS); // ≈ 1.08818
export const BP_ROOT_HZ = 220; // root of the parliament's voice

/** Frequency of a BP step, with an optional whole-tritave shift. */
export function bpFreq(step: number, tritaveShift = 0): number {
  return BP_ROOT_HZ * Math.pow(BP_TRITAVE, (step + tritaveShift * BP_STEPS) / BP_STEPS);
}

/** A BP pitch-class (0..12) for symmetry math. */
export function bpPitchClass(step: number): number {
  return ((step % BP_STEPS) + BP_STEPS) % BP_STEPS;
}

// Computer keyboard as a polyphonic instrument. Home row + top row map onto a
// contiguous run of BP steps (~1.5 tritaves). z / x shift the whole hand a
// tritave down / up.
export interface KeyDef {
  key: string;
  label: string;
  step: number;
}

const HOME = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const TOP = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];

export const KEY_DEFS: KeyDef[] = [
  ...HOME.map((key, i) => ({ key, label: key.toUpperCase(), step: i })),
  ...TOP.map((key, i) => ({ key, label: key.toUpperCase(), step: i + 9 })),
];

export const KEY_TO_STEP = new Map<string, number>(KEY_DEFS.map((d) => [d.key, d.step]));

// MIDI: a chromatic keyboard plays BP steps chromatically off a base note, so a
// physical device is immediately playable (velocity is expressive).
export const MIDI_BASE = 48; // C3 → BP step 0
export function midiToStep(note: number): number {
  return note - MIDI_BASE;
}
