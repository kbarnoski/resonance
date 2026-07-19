// ─────────────────────────────────────────────────────────────────────────────
// harmony.ts — the DRIFTING MODAL SCALE for 1996-splice-cassette.
//
// The headline idea: notes are stored as scale DEGREES (0–6) + octave, NOT as
// frozen frequencies. A modal scale rotates continuously underneath the whole
// piece — Dorian → Phrygian → Lydian → Mixolydian → Aeolian → Locrian → Ionian,
// one full lap ≈ 119 s. So `degree → frequency` is time-varying: a phrase you
// recorded a minute ago RE-VOICES ITSELF as the mode turns, without you touching
// a thing. The mode integer steps every ~17 s (in-tune, equal-tempered); the
// float underneath drifts smoothly for the visual.
//
// Explicitly NOT the banned just-intonation partial stack
// [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2]. Equal-tempered diatonic modes only.
// ─────────────────────────────────────────────────────────────────────────────

export interface Mode {
  name: string;
  /** Semitone offset of each scale degree (0–6) from the tonic. */
  intervals: number[];
}

// Drift order: warm/minor → bright, closing on Ionian (home).
export const MODES: Mode[] = [
  { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Aeolian", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { name: "Ionian", intervals: [0, 2, 4, 5, 7, 9, 11] },
];

export const SECONDS_PER_MODE = 17;
export const MODE_LAP = SECONDS_PER_MODE * MODES.length; // ≈ 119 s

export const ROOT_HZ = 174.61; // F3 — warm, low centre of gravity.

function wrap(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** The smooth mode phase — used for the visual drift. */
export function modeFloatAt(elapsed: number): number {
  return elapsed / SECONDS_PER_MODE;
}

export function modeAt(elapsed: number): { index: number; name: string; frac: number } {
  const f = modeFloatAt(elapsed);
  const index = wrap(Math.floor(f), MODES.length);
  return { index, name: MODES[index].name, frac: f - Math.floor(f) };
}

/** Semitone offset of (degree, octave) in a given mode. */
export function degreeToSemis(degree: number, octave: number, modeIndex: number): number {
  const m = MODES[wrap(modeIndex, MODES.length)];
  return m.intervals[wrap(degree, 7)] + 12 * octave;
}

/** Time-varying degree → frequency. Same degree, different colour as mode turns. */
export function degreeToFreq(degree: number, octave: number, modeIndex: number): number {
  return ROOT_HZ * Math.pow(2, degreeToSemis(degree, octave, modeIndex) / 12);
}

/** Deterministic PRNG — a constant seed makes the ghost performer reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
