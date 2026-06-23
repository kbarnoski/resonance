/**
 * harmony.ts — interval-clash scoring & resolve suggestion
 *
 * Technique: consonance/dissonance "tension and release" pedagogy.
 * A sounding *set* of pitch classes is scored for its worst interval class.
 * Clashing classes (minor 2nd = 1, major 7th = 11, tritone = 6) spawn a
 * wobble-monster. We then compute which single consonant note (3rd / 5th /
 * octave relative to a held note) would best remove the clash, and offer it
 * as a gentle visual invitation.
 *
 * Reference: developmental finding PMC11336827 (2024) — 4-year-olds prefer
 * consonance but only when the dissonant contrast is LARGE. So the monster's
 * dissonance must be UNMISTAKABLE: we only ever flag clearly-beating minor-2nd
 * / major-7th / tritone clashes, never mild ones.
 */

export const NOTE_COUNT = 12;

// Semitone -> frequency (A4 = 440). We center the playable octave low & warm:
// MIDI note 60 (middle C) .. 71 (B). Kept mid/low so nothing is high or scary.
export const BASE_MIDI = 60;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteFreq(index: number): number {
  return midiToFreq(BASE_MIDI + index);
}

// Bold saturated hue per chromatic note (degrees on the color wheel).
export const NOTE_HUE: number[] = [
  8, 28, 45, 95, 130, 160, 185, 210, 250, 285, 315, 345,
];

// Interval classes considered a "clash" — large, unmistakable dissonance only.
// 1 = minor 2nd, 6 = tritone, 11 = major 7th (which folds to ic 1).
function intervalClass(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d); // 0..6
}

export type Clash = {
  a: number; // note index
  b: number; // note index
  /** 0..1 wobble strength — bigger = more dissonant = more wobble */
  strength: number;
};

/**
 * Score the currently-held set. Returns every clashing pair plus the overall
 * worst clash strength. Only minor-2nd and tritone classes count (large
 * contrast, per PMC11336827).
 */
export function scoreClashes(held: number[]): { clashes: Clash[]; worst: number } {
  const clashes: Clash[] = [];
  let worst = 0;
  for (let i = 0; i < held.length; i++) {
    for (let j = i + 1; j < held.length; j++) {
      const ic = intervalClass(held[i], held[j]);
      let strength = 0;
      if (ic === 1) strength = 1.0; // minor 2nd / major 7th — maximum wobble
      else if (ic === 6) strength = 0.75; // tritone — strong wobble
      if (strength > 0) {
        clashes.push({ a: held[i], b: held[j], strength });
        if (strength > worst) worst = strength;
      }
    }
  }
  return { clashes, worst };
}

// Consonant interval classes we steer the child toward: M3/m3 (3,4), P5 (7),
// P4 (5), octave/unison (0). These are the "happy" resolutions.
const CONSONANT_IC = [3, 4, 5, 7];

/**
 * Given the held set, suggest ONE note (index 0..11) to add that removes the
 * worst clash and forms a consonant interval. Returns null if already consonant
 * or no clean resolution exists. This is the key that gently glows.
 */
export function suggestResolution(held: number[]): number | null {
  if (held.length === 0) return null;
  const { worst } = scoreClashes(held);
  if (worst === 0) return null;

  let best: { note: number; score: number } | null = null;
  for (let cand = 0; cand < NOTE_COUNT; cand++) {
    if (held.includes(cand)) continue;
    const next = [...held, cand];
    const after = scoreClashes(next);
    // Must reduce dissonance...
    if (after.worst >= worst) continue;
    // ...and form a consonant interval with at least one held note.
    let consonantBonus = 0;
    for (const h of held) {
      const ic = intervalClass(cand, h);
      if (CONSONANT_IC.includes(ic)) consonantBonus += 1;
    }
    if (consonantBonus === 0) continue;
    const score = (worst - after.worst) * 4 + consonantBonus;
    if (!best || score > best.score) best = { note: cand, score };
  }
  return best ? best.note : null;
}

/** Is the held set fully consonant (no clash)? */
export function isResolved(held: number[]): boolean {
  return scoreClashes(held).worst === 0 && held.length > 0;
}
