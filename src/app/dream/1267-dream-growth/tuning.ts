// ── Dream Growth · shared just-intonation tuning ────────────────────────────
// One mode, one source of truth, shared by the scene, the growth field and the
// audio engine. A-Dorian in pure ratios (A B C D E F# G) — a REAL mode with
// real semitone steps, not a "no-wrong-notes" pentatonic. Everything the room
// grows is tuned from these degrees, so the architecture you build IS a chord.

export const DORIAN: readonly number[] = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5];

export const DEGREE_NAMES: readonly string[] = ["A", "B", "C", "D", "E", "F♯", "G"];

/** Base roots per structural voice (Hz), an octave apart. */
export const ROOT_PILLAR = 110; // A2 — the cavernous colonnade
export const ROOT_ARCH = 220; // A3 — spanning mid voice
export const ROOT_CHIME = 440; // A4 — the bright thicket

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Just-intonation frequency for a Dorian degree at an octave offset. */
export function degreeFreq(root: number, degree: number, octaveUp: number): number {
  const d = mod(Math.round(degree), DORIAN.length);
  return root * DORIAN[d] * Math.pow(2, octaveUp);
}

/** A stable degree for a patch of open ground, so the floor is spatially tuned
 *  (walk east and the ground rings a different degree than walking west). */
export function groundDegree(x: number, z: number): number {
  const gx = Math.round(x / 3.2);
  const gz = Math.round(z / 3.2);
  // a cheap spatial hash → a repeatable degree per ~3m cell
  const h = Math.abs(gx * 73856093) ^ Math.abs(gz * 19349663);
  return mod(h, DORIAN.length);
}

/** Map a frequency to a 0..1 "brightness" used to shape grown geometry. */
export function pitchNorm(freq: number): number {
  const lo = Math.log2(90);
  const hi = Math.log2(1000);
  return Math.min(1, Math.max(0, (Math.log2(freq) - lo) / (hi - lo)));
}
