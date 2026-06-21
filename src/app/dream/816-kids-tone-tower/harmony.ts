/**
 * 816 · Tone Tower — harmony.ts
 *
 * The just-intonation consonance lattice. Each block in the tower sits a chosen
 * INTERVAL above the block beneath it. The child picks the interval by how big a
 * vertical gap they make when dropping a block; we snap that gap to the nearest
 * entry in this lattice. Every entry is a small-whole-number frequency ratio
 * (Harry Partch tonality-diamond style) so any stack is consonant — but the CHILD
 * decides open vs. close, simple vs. rich.
 */

export type Interval = {
  /** frequency ratio above the block below (just intonation) */
  ratio: number;
  /** ratio expressed in cents — used only to snap a pixel gap to an interval */
  cents: number;
  /** a friendly name (grown-up affordance only; never shown to the child) */
  name: string;
  /** bold saturated hue (deg) tied to the interval's "color" */
  hue: number;
};

// Consonant just-intonation intervals, smallest → largest gap. Ordered so a
// bigger vertical gap in the play area picks a wider interval. Unison is the
// "stack tight" option; octave is the "reach high" option.
export const LATTICE: Interval[] = [
  { ratio: 1 / 1, cents: 0, name: "unison", hue: 50 }, // warm gold
  { ratio: 9 / 8, cents: 204, name: "major second", hue: 95 }, // lime
  { ratio: 6 / 5, cents: 316, name: "minor third", hue: 150 }, // teal-green
  { ratio: 5 / 4, cents: 386, name: "major third", hue: 175 }, // aqua
  { ratio: 4 / 3, cents: 498, name: "perfect fourth", hue: 205 }, // sky
  { ratio: 3 / 2, cents: 702, name: "perfect fifth", hue: 250 }, // indigo
  { ratio: 5 / 3, cents: 884, name: "major sixth", hue: 290 }, // violet
  { ratio: 2 / 1, cents: 1200, name: "octave", hue: 330 }, // magenta-rose
];

/** The base frequency the bottom block always sounds at. A low, soft root. */
export const ROOT_HZ = 174.6; // ~F3, gentle and warm, never high-ringing

/**
 * Map a normalized vertical gap (0 = no gap, 1 = full play-area height) to the
 * nearest lattice interval. We map the gap onto a cents range and snap. This is
 * the heart of the toy: the child's gesture (gap size) genuinely chooses the
 * harmony, but the result is always a consonant ratio.
 */
export function gapToInterval(gapNorm: number): Interval {
  const clamped = Math.max(0, Math.min(1, gapNorm));
  // Spread the gesture across 0..1200 cents (unison..octave).
  const targetCents = clamped * 1200;
  let best = LATTICE[0];
  let bestDist = Infinity;
  for (const iv of LATTICE) {
    const d = Math.abs(iv.cents - targetCents);
    if (d < bestDist) {
      bestDist = d;
      best = iv;
    }
  }
  return best;
}

/** A block's absolute pitch = product of all interval ratios from root up. */
export type Block = {
  id: number;
  interval: Interval; // interval above the block below (root block = unison)
  freq: number; // resolved absolute frequency in Hz
  gapNorm: number; // the gap the child made (for replaying the visual)
};

/** Recompute absolute frequencies bottom→top from the chain of intervals. */
export function resolveFreqs(blocks: Block[]): Block[] {
  let f = ROOT_HZ;
  return blocks.map((b, i) => {
    if (i === 0) {
      f = ROOT_HZ;
    } else {
      f = f * b.interval.ratio;
    }
    return { ...b, freq: f };
  });
}

export const MAX_VOICES = 8;
