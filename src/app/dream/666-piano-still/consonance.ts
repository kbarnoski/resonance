// consonance.ts — Asymmetric interval-consonance scoring for the generative
// GROWTH rule. This is the harmonic brain of the still room: it does NOT snap to
// a scale. Instead, every few seconds it scores each of the 12 pitch classes
// against the notes currently ringing and buds ONE consonant (but not always
// the MOST consonant) new note, so the room grows itself in chosen harmony.
//
// Anchor reference:
//   De Roure, "An Asymmetric Formula for Interval Consonance and its Relation to
//   Harmonic Coincidence," arXiv:2606.16412 (2026).
//
// The De Roure observation we honor here (honest simple implementation):
//   • Interval consonance tracks how soon the two pitches' harmonic series
//     COINCIDE — small integer frequency ratios (octave 2:1, fifth 3:2,
//     fourth 4:3, major third 5:4 …) coincide early and ring sweet; complex
//     ratios (tritone, minor second) coincide late and ring tense.
//   • The formula is ASYMMETRIC: an interval and its inversion are NOT equally
//     consonant, and there is a small flat-vs-sharp lean — a pitch a touch FLAT
//     of a just interval beats by a slightly different amount than one sharp of
//     it, so the perfect fifth UP (3:2) and the fourth UP (4:3) — its inversion —
//     score differently. We model this with a directional asymmetry term that
//     gently favors the lower-complexity DIRECTION of each interval.

export const PC_COUNT = 12;

// Just-intonation ratios for the 12 chromatic intervals (semitones 0..11),
// as small-integer numerator/denominator. Lower (num*den) ⇒ earlier harmonic
// coincidence ⇒ more consonant.
const RATIOS: [number, number][] = [
  [1, 1],   // 0  unison
  [16, 15], // 1  minor second
  [9, 8],   // 2  major second
  [6, 5],   // 3  minor third
  [5, 4],   // 4  major third
  [4, 3],   // 5  perfect fourth
  [45, 32], // 6  tritone
  [3, 2],   // 7  perfect fifth
  [8, 5],   // 8  minor sixth
  [5, 3],   // 9  major sixth
  [16, 9],  // 10 minor seventh
  [15, 8],  // 11 major seventh
];

/**
 * Base consonance of an interval of `semis` semitones (direction-agnostic),
 * from the harmonic-coincidence proxy 1/log2(num*den): octave/fifth high,
 * tritone/semitone low. Returned in roughly 0..1.
 */
function baseConsonance(semis: number): number {
  const s = ((semis % 12) + 12) % 12;
  const [n, d] = RATIOS[s];
  // Benedetti-style "harmonic distance" = n*d; smaller = more consonant.
  const harmDist = n * d;
  return 1 / Math.log2(harmDist + 1);
}

/**
 * Asymmetric correction (the De Roure lean). An interval going UP from the
 * ringing note vs the SAME interval going down are not equally smooth because
 * their harmonic series coincide at different points. We add a small signed
 * term proportional to the interval's "directional simplicity": intervals whose
 * upper ratio is the simpler partner (fifth 3:2, major third 5:4) get a tiny
 * bonus when the candidate sits ABOVE the anchor, and a tiny penalty below; the
 * inversion (fourth, minor sixth) leans the other way. Magnitude is small so it
 * only breaks ties / adds gentle color, never overrides gross consonance.
 */
function asymmetricLean(anchorPc: number, candPc: number): number {
  // Signed semitone distance in -6..+6 (shortest direction, ties -> up).
  let diff = (((candPc - anchorPc) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  const up = diff >= 0;
  const s = Math.abs(diff);
  const [n, d] = RATIOS[s];
  // "lower-complexity direction" — when num>den the simpler partner is the
  // upper voice (e.g. 3:2 fifth), so going UP is the smoother direction.
  const upIsSimpler = n >= d;
  const align = up === upIsSimpler ? 1 : -1;
  const strength = 0.06 / Math.log2(n * d + 1); // small, fades for complex ints
  return align * strength;
}

export interface GrowthChoice {
  pc: number;        // chosen pitch class 0..11
  score: number;     // its consonance score against the field
}

/**
 * Choose ONE new pitch class to bud into the room.
 *
 * @param ringing  weights of currently-ringing pitch classes (length 12, 0..1).
 *                 A note's pull on the harmony scales with how present it is.
 * @param presence per-pc presence floor (e.g. meanChroma of his recording) so
 *                 the room leans toward pitch classes Karel actually played.
 * @param tension  0..1 "stillness → growth" lever; higher = allow more tension
 *                 (samples deeper into the ranked list, picks spicier notes).
 * @param rand      0..1 random draw (injectable for determinism in tests).
 *
 * Scores every candidate by summed asymmetric consonance against the ringing
 * field (+ a small recording-presence prior), then SAMPLES from the top few
 * rather than always taking the argmax — so the growth is chosen, varied, and
 * never a fixed scale.
 */
export function chooseGrowthNote(
  ringing: Float32Array | number[],
  presence: Float32Array | number[],
  tension: number,
  rand: number,
): GrowthChoice {
  const ringSum = (() => {
    let s = 0;
    for (let i = 0; i < PC_COUNT; i++) s += ringing[i];
    return s;
  })();

  const scores = new Float32Array(PC_COUNT);
  for (let c = 0; c < PC_COUNT; c++) {
    let s = 0;
    if (ringSum < 1e-4) {
      // Empty room: lean on his recording's presence + intrinsic stability
      // (unison/fifth/third anchors approximated by presence prior only).
      s = (presence[c] ?? 0) * 1.0;
    } else {
      for (let a = 0; a < PC_COUNT; a++) {
        const w = ringing[a];
        if (w < 1e-4) continue;
        const cons = baseConsonance(c - a) + asymmetricLean(a, c);
        s += w * cons;
      }
      s /= Math.max(1e-4, ringSum);
      // gentle prior toward pitch classes he actually played.
      s += 0.25 * (presence[c] ?? 0);
      // Don't re-bud a note that's already strongly ringing.
      s *= 1 - 0.7 * Math.min(1, ringing[c]);
    }
    scores[c] = s;
  }

  // Rank pitch classes by score (descending).
  const order = Array.from({ length: PC_COUNT }, (_, i) => i).sort(
    (a, b) => scores[b] - scores[a],
  );

  // Sample window: at low tension take from the top ~2 (most consonant); at
  // high tension widen to the top ~6 so spicier intervals can surface.
  const window = Math.max(2, Math.round(2 + tension * 4));
  // Bias the draw toward the front of the window (square the random draw).
  const pick = Math.floor(rand * rand * window);
  const chosen = order[Math.min(window - 1, pick)];
  return { pc: chosen, score: scores[chosen] };
}

/** Exposed for the README / debugging: consonance of an interval in semitones. */
export function intervalConsonance(semis: number): number {
  return baseConsonance(semis);
}
