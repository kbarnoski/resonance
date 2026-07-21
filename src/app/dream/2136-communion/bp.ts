// Bohlen–Pierce scale — 13 equal divisions of the TRITAVE (3:1), NOT the octave,
// and NOT a pentatonic / JI major-minor stack. Step ratio = 3^(1/13). BP rings
// consonant-but-radiant on odd-harmonic timbres, so when many detuned voices
// LOCK onto the shared BP lattice the result is one over-bright consonant chord:
// the "many become one" made literally audible.

export const BP_TRITAVE = 3;
export const BP_STEPS = 13;
export const BP_STEP_RATIO = Math.pow(BP_TRITAVE, 1 / BP_STEPS); // ≈ 1.08818
export const BP_ROOT_HZ = 110; // deep root of the communion

// A voice's X position selects a step across this many BP steps — two tritaves
// of playable range so several hands can spread into a wide chord.
export const BP_SPAN = 26;

/** Frequency of a (possibly fractional) BP step above the root. */
export function bpFreq(step: number): number {
  return BP_ROOT_HZ * Math.pow(BP_TRITAVE, step / BP_STEPS);
}

/** Map a normalized X in [0,1] to a continuous BP step across the span. */
export function xToStep(nx: number): number {
  return Math.max(0, Math.min(1, nx)) * BP_SPAN;
}
