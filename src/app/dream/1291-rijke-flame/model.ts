// 1291-rijke-flame — model.ts
//
// The physics of a Rijke tube, reduced to two numbers the player controls:
//   • heat position  h ∈ [0,1]  (0 = bottom open end, 1 = top open end)
//   • tube length    (picked from a quantised scale; longer = lower pitch)
//
// A Rijke tube is an open–open pipe with a heat source inside. Its fundamental
// standing wave has a PRESSURE antinode at the centre and VELOCITY antinodes at
// the two open ends:
//     p_n(x) ∝ sin(nπx/L)      u_n(x) ∝ cos(nπx/L)
// Rayleigh's criterion (1878): heat added where/when acoustic pressure is rising
// feeds the oscillation. For a compact heater with the usual velocity-coupled
// time lag, the linear growth rate of mode n is ∝ p_n(x)·u_n(x) ∝ sin(2nπx/L).
// For the fundamental (n=1) that is sin(2πh): POSITIVE (driving) in the lower
// half, peaking at h = 1/4, and NEGATIVE (damping) in the upper half. This is
// exactly the textbook Rijke behaviour — heat low sings, heat high goes silent.
// The second mode (n=2) grows as sin(4πh), giving a pure-octave pocket near
// h ≈ 0.625 where the fundamental is being damped but the octave is driven.

export const SCALE_ROOT = 98; // ~G2, a warm low fundamental
// 5-limit-ish just intonation, ascending over ~1.5 octaves. Dragging the tube
// length steps through this so every pitch is playable/consonant.
export const SCALE_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 8 / 3];

export const SCALE_LEN = SCALE_RATIOS.length;

export interface TubeState {
  freq: number; // fundamental Hz
  noteIndex: number; // index into SCALE_RATIOS
  a1: number; // fundamental amplitude 0..1 (the limit-cycle envelope)
  a2: number; // second-mode / octave amplitude 0..1
  breath: number; // breath-noise amount 0..1 (loud at onset, fades when pure)
  drive: number; // overall loudness 0..1
  rayleigh1: number; // signed fundamental gain -1..1 (drives colour/UI)
  heat: number; // heat position 0..1
  lengthNorm: number; // 0..1 visual tube length fraction
}

/** Fundamental frequency for a scale index (clamped). Lower index = lower pitch. */
export function noteFreq(index: number): number {
  const i = Math.max(0, Math.min(SCALE_LEN - 1, Math.round(index)));
  return SCALE_ROOT * SCALE_RATIOS[i];
}

/** Visual tube length for a scale index. Physically L ∝ 1/f, so lower notes
 *  render as taller tubes. Normalised into a pleasant on-screen range. */
export function noteLengthNorm(index: number): number {
  const f = noteFreq(index);
  const fMin = noteFreq(0);
  const fMax = noteFreq(SCALE_LEN - 1);
  // Inverse-frequency (length) normalised 0..1, then squeezed into [0.42, 0.98].
  const inv = 1 / f;
  const invMin = 1 / fMax;
  const invMax = 1 / fMin;
  const t = (inv - invMin) / (invMax - invMin);
  return 0.42 + 0.56 * t;
}

/** Signed fundamental Rayleigh gain sin(2πh): + drives, − damps. */
export function rayleighFundamental(h: number): number {
  return Math.sin(2 * Math.PI * h);
}

/** Signed second-mode Rayleigh gain sin(4πh). */
export function rayleighSecond(h: number): number {
  return Math.sin(4 * Math.PI * h);
}

/**
 * The thermoacoustic limit cycle. Each mode's amplitude relaxes toward a target
 * set by its (positive) Rayleigh gain — SLOWLY on the way up (the satisfying
 * onset swell as the tube spontaneously breaks into song) and a touch faster on
 * the way down (heat moved into the damping zone → it dies away). Named
 * `runStep` (not `useStep`) so ESLint doesn't mistake it for a React hook.
 */
export class TubeModel {
  a1 = 0;
  a2 = 0;

  runStep(dt: number, heat: number, active: boolean): void {
    const inside = heat > 0.02 && heat < 0.98;
    const r1 = active && inside ? Math.max(0, rayleighFundamental(heat)) : 0;
    const r2 = active && inside ? Math.max(0, rayleighSecond(heat)) : 0;

    // Sharpen slightly so the sweet spot is worth hunting for by ear + hand.
    const t1 = Math.pow(r1, 1.15);
    const t2 = Math.pow(r2, 1.4) * 0.82;

    const tau1 = t1 > this.a1 ? 0.85 : 0.42; // slow swell, quicker decay
    const tau2 = t2 > this.a2 ? 1.05 : 0.38;
    this.a1 += (t1 - this.a1) * (1 - Math.exp(-dt / tau1));
    this.a2 += (t2 - this.a2) * (1 - Math.exp(-dt / tau2));
  }
}

/** Assemble the full audible/visual state from the model + current controls. */
export function computeState(model: TubeModel, heat: number, noteIndex: number): TubeState {
  const a1 = Math.max(0, Math.min(1, model.a1));
  const a2 = Math.max(0, Math.min(1, model.a2));
  const drive = Math.max(a1, a2 * 0.9);
  // Breathy at onset (mid amplitude), pure at full drive: peaks near a1≈0.5.
  const breath = Math.max(0, Math.min(1, a1 * (1 - a1) * 2.2 + a2 * (1 - a2) * 1.2));
  return {
    freq: noteFreq(noteIndex),
    noteIndex: Math.max(0, Math.min(SCALE_LEN - 1, Math.round(noteIndex))),
    a1,
    a2,
    breath,
    drive,
    rayleigh1: rayleighFundamental(heat),
    heat,
    lengthNorm: noteLengthNorm(noteIndex),
  };
}
