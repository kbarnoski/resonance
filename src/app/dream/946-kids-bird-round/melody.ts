// melody.ts — drag → time/pitch capture, quantize to a step grid, snap to a
// pentatonic-major scale. The captured melodic CONTOUR is the star; quantizing
// to one scale + one tempo grid is what lets time-offset copies (a canon)
// stack harmoniously.

// C-major pentatonic across ~2 octaves, low (tree-root) → high (treetop).
// Index 0 is the lowest note. Frequencies in Hz.
export const SCALE_HZ: number[] = [
  196.0, // G3
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
];

export const SCALE_LEN = SCALE_HZ.length;

// Tempo grid. One melody loop is BEATS beats long, divided into STEPS slots.
export const BEATS = 4;
export const STEPS = 8; // 8 eighth-ish steps over 4 beats
export const BPM = 96;
export const SECONDS_PER_BEAT = 60 / BPM;
export const LOOP_SECONDS = BEATS * SECONDS_PER_BEAT;
export const STEP_SECONDS = LOOP_SECONDS / STEPS;

// A single sung note inside the loop. step is the slot index [0..STEPS-1];
// scaleIdx is the index into SCALE_HZ (-1 = rest / silence).
export interface MelodyNote {
  step: number;
  scaleIdx: number;
}

// A raw drag sample: normalized vertical position (0 = bottom/low, 1 = top/high)
// captured at a wall-clock time (ms).
export interface DragSample {
  t: number; // ms
  pitch01: number; // 0..1, 1 = high
}

// Map a normalized vertical position to a scale index (nearest snap).
export function applyPitchSnap(pitch01: number): number {
  const clamped = Math.max(0, Math.min(1, pitch01));
  return Math.round(clamped * (SCALE_LEN - 1));
}

// Convert a normalized vertical position straight to a frequency (for live
// chirp under the finger).
export function applyPitchHz(pitch01: number): number {
  return SCALE_HZ[applyPitchSnap(pitch01)];
}

// Turn a raw drag (list of samples over wall time) into a quantized melody:
// fold the drag duration onto STEPS slots, pick the dominant pitch per slot,
// snap to scale. Short / empty drags fall back to the default melody.
export function makeMelodyFromDrag(samples: DragSample[]): MelodyNote[] {
  if (samples.length < 2) return makeDefaultMelody();

  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const span = Math.max(1, t1 - t0);

  // Accumulate pitch per step by averaging samples that fall in each slot.
  const sums = new Array<number>(STEPS).fill(0);
  const counts = new Array<number>(STEPS).fill(0);

  for (const s of samples) {
    const frac = (s.t - t0) / span; // 0..1 across the drag
    let step = Math.floor(frac * STEPS);
    if (step >= STEPS) step = STEPS - 1;
    if (step < 0) step = 0;
    sums[step] += s.pitch01;
    counts[step] += 1;
  }

  // Fill empty slots by holding the previous note (sustained contour reads as
  // more song-like to a young listener than scattered rests).
  const notes: MelodyNote[] = [];
  let lastIdx = applyPitchSnap(samples[0].pitch01);
  for (let i = 0; i < STEPS; i++) {
    let scaleIdx: number;
    if (counts[i] > 0) {
      scaleIdx = applyPitchSnap(sums[i] / counts[i]);
      lastIdx = scaleIdx;
    } else {
      scaleIdx = lastIdx;
    }
    notes.push({ step: i, scaleIdx });
  }
  return notes;
}

// A pleasant default tune (used for the idle auto-demo and as a fallback).
// Gentle rising-then-settling contour inside the pentatonic.
export function makeDefaultMelody(): MelodyNote[] {
  const idxs = [2, 4, 5, 6, 5, 4, 2, 4];
  return idxs.map((scaleIdx, step) => ({ step, scaleIdx }));
}
