// ─────────────────────────────────────────────────────────────────────────────
// temperament.ts — the tuning subsystem for the Wolf Ring.
//
//   A *circulating historical temperament* is a way of tuning the 12 notes of a
//   keyboard so that most fifths and thirds are sweeter (closer to pure whole-
//   number ratios) than equal temperament — but the leftover error (the comma)
//   cannot vanish. It has to be banked somewhere. In the pre-1700 temperaments
//   here it is dumped almost entirely into ONE fifth, which then howls: the
//   wolf. This file computes, for each temperament, the exact cent position of
//   every note and therefore the exact quality of every fifth around the circle.
//
//   Refs: Werckmeister & Vallotti well-temperaments; quarter-comma meantone
//   (Pietro Aron, 1523); and, as a living explainer, Adam Neely's tuning videos.
// ─────────────────────────────────────────────────────────────────────────────

/** The circle of fifths, laid out as consecutive ascending fifths from C.
 *  Index i sits a fifth above index i-1. The wrap edge (F → C) closes the ring.
 *  `chainK` is the note's position on the chain of fifths measured from C, which
 *  is all the pitch math needs. The wolf lives on the edge index 8 → 9 (G♯→E♭),
 *  where the chain is deliberately broken and the banked comma is spent. */
export interface RingNote {
  label: string;
  chainK: number;
}

export const RING: RingNote[] = [
  { label: "C", chainK: 0 },
  { label: "G", chainK: 1 },
  { label: "D", chainK: 2 },
  { label: "A", chainK: 3 },
  { label: "E", chainK: 4 },
  { label: "B", chainK: 5 },
  { label: "F♯", chainK: 6 }, // F#
  { label: "C♯", chainK: 7 }, // C#
  { label: "G♯", chainK: 8 }, // G#  ── wolf edge starts here
  { label: "E♭", chainK: -3 }, // Eb ── …and lands here
  { label: "B♭", chainK: -2 }, // Bb
  { label: "F", chainK: -1 },
];

export const RING_SIZE = RING.length; // 12

/** The single edge that carries the banked comma. G♯(8) → E♭(9). */
export const WOLF_LO = 8;
export const WOLF_HI = 9;

/** A pure fifth is the 3:2 ratio: 701.955 cents. Everything is measured against
 *  it, because a fifth's audible "sweetness or howl" is its distance from 3:2. */
export const PURE_FIFTH_CENTS = 1200 * Math.log2(3 / 2); // 701.955…

export interface Temperament {
  id: "12tet" | "meantone" | "pythagorean";
  name: string;
  shortName: string;
  blurb: string;
  /** The size of a *generating* fifth in cents. 11 of the 12 fifths are this
   *  size; the 12th (the wolf) mops up whatever is left over to close 7 octaves. */
  fifthCents: number;
  /** The size of a major third in the tuned regions, in cents. Pure = 386.31. */
  majorThirdCents: number;
}

// Quarter-comma meantone: four fifths up make a PURE 5:4 major third
// (386.314¢), so each fifth is flattened by a quarter of the syntonic comma to
// 696.578¢. Pythagorean: fifths are pure 3:2, so its thirds go sharp (407.8¢).
const MEANTONE_FIFTH = 300 * Math.log2(5); // 696.578…  (= 5^(1/4) as a fifth)
const PURE_MAJOR_THIRD = 1200 * Math.log2(5 / 4); // 386.314…

export const TEMPERAMENTS: Temperament[] = [
  {
    id: "12tet",
    name: "Equal temperament",
    shortName: "12-TET",
    blurb:
      "The modern piano. Every fifth identical (700¢), every key equally usable — and equally impure. No wolf, but no sweetness either.",
    fifthCents: 700,
    majorThirdCents: 400,
  },
  {
    id: "meantone",
    name: "Quarter-comma meantone",
    shortName: "¼-comma meantone",
    blurb:
      "Pietro Aron, 1523. Major thirds are perfectly pure; fifths flattened to 696.6¢. The banked comma erupts as one wolf fifth at 737.6¢.",
    fifthCents: MEANTONE_FIFTH,
    majorThirdCents: PURE_MAJOR_THIRD,
  },
  {
    id: "pythagorean",
    name: "Pythagorean",
    shortName: "Pythagorean",
    blurb:
      "Pure 3:2 fifths stacked all the way round. Sweet, ringing fifths — but thirds go sharp, and the leftover Pythagorean comma leaves a narrow wolf.",
    fifthCents: PURE_FIFTH_CENTS,
    majorThirdCents: 4 * PURE_FIFTH_CENTS - 2400, // 407.82
  },
];

const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Pitch-class cents (0..1200) of each ring note, built genuinely by walking the
 *  chain of fifths outward from C at the temperament's generating fifth. For
 *  12-TET this reproduces 0,700,200,900… For meantone the wolf simply *emerges*
 *  as the gap between the two ends of the broken chain — it is not hand-placed. */
export function pitchClassCents(t: Temperament): number[] {
  return RING.map((n) => mod(n.chainK * t.fifthCents, 1200));
}

export interface EdgeReading {
  loIdx: number;
  hiIdx: number;
  isWolf: boolean;
  /** Root frequency (Hz) of the lower note of the fifth. */
  rootHz: number;
  /** The fifth's size in cents, as actually tuned (696.6, 700, 737.6 …). */
  fifthCents: number;
  /** Signed distance from a pure 3:2 fifth: − = narrow, + = wide. */
  centsFromPure: number;
  /** Audible beat rate (Hz) of the fifth's clashing partials — the "howl". */
  beatHz: number;
}

/** C3 = 130.81 Hz anchors the ring one octave, so every root sits in a warm,
 *  beat-legible register. */
const BASE_HZ = 130.8128;

export function tileFrequencies(t: Temperament): number[] {
  const pc = pitchClassCents(t);
  return pc.map((c) => BASE_HZ * Math.pow(2, c / 1200));
}

/** Read the fifth living on the edge whose lower note is `loIdx` (upper note is
 *  loIdx+1, wrapping). This is the genuine measured interval between the two
 *  tuned pitch classes — so the wolf's width falls out of the arithmetic. */
export function readEdge(t: Temperament, loIdx: number): EdgeReading {
  const hiIdx = mod(loIdx + 1, RING_SIZE);
  const pc = pitchClassCents(t);
  let fifth = pc[hiIdx] - pc[loIdx];
  fifth = mod(fifth, 1200);
  if (fifth < 600) fifth += 1200; // force into the "a fifth" band ~[678,738]

  const freqs = tileFrequencies(t);
  const rootHz = freqs[loIdx];
  const ratio = Math.pow(2, fifth / 1200);
  // The 3rd partial of the root (3f) and the 2nd partial of the fifth (2·f·ratio)
  // should coincide for a pure 3:2. Their gap is the beat rate you hear.
  const beatHz = rootHz * Math.abs(3 - 2 * ratio);

  const centsFromPure = fifth - PURE_FIFTH_CENTS;
  return {
    loIdx,
    hiIdx,
    // The wolf is not positional — it is whichever fifth is grossly out of tune.
    // So it emerges in meantone/Pythagorean and simply vanishes in 12-TET, where
    // every fifth is a tame 700¢.
    isWolf: Math.abs(centsFromPure) > 20,
    rootHz,
    fifthCents: fifth,
    centsFromPure,
    beatHz,
  };
}

/** Resolve which edge you traverse when you step from `from` to `to`. Adjacent
 *  steps cross the shared edge; a jump lands on the target's own incoming fifth
 *  (so the wolf tile always howls when you arrive on it). */
export function edgeForStep(from: number, to: number): number {
  const forward = mod(from + 1, RING_SIZE) === to; // walked up a fifth
  const backward = mod(from - 1, RING_SIZE) === to; // walked down a fifth
  if (forward) return from;
  if (backward) return to;
  return mod(to - 1, RING_SIZE); // jump: the target's incoming fifth
}
