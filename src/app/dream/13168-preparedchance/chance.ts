// ─────────────────────────────────────────────────────────────────────────────
// chance.ts — the chance engine, after John Cage's *Music of Changes* (1951),
// which was composed by consulting the I-Ching. Here a seeded coin-oracle tosses
// a hexagram for each note you play and, sometimes, re-composes it: displacing
// its onset, transposing it within the scale, muting it, or doubling it.
//
// Determinism is total: every verdict comes from a mulberry32 PRNG seeded from a
// fixed base + an integer event counter. No Math.random / Date / performance —
// the seeded muted demo tosses the exact same hexagrams on every load.
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32 — a tiny, fast, fully deterministic 32-bit PRNG. */
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

export type ChanceOp = "keep" | "displace" | "transpose" | "mute" | "double";

export interface Verdict {
  /** Did the oracle intervene at all? */
  touched: boolean;
  op: ChanceOp;
  /** Six line values, bottom-to-top: 6 = old yin, 7 = yang, 8 = yin, 9 = old yang. */
  hexagram: number[];
  /** Scale steps to transpose (signed). */
  transposeSteps: number;
  /** Onset displacement in beats (>= 0). */
  displaceBeats: number;
  /** Interval in scale steps for the doubled voice. */
  doubleInterval: number;
  /** Short human label of the verdict. */
  label: string;
}

// A single I-Ching line by the three-coin method: three coins, each 2 or 3.
// Sum 6..9. 6 & 9 are "moving" (changing) lines — the engine of transformation.
function tossLine(rng: () => number): number {
  const c1 = rng() < 0.5 ? 2 : 3;
  const c2 = rng() < 0.5 ? 2 : 3;
  const c3 = rng() < 0.5 ? 2 : 3;
  return c1 + c2 + c3;
}

/** Toss a full hexagram: six lines, bottom-to-top. */
export function tossHexagram(rng: () => number): number[] {
  const lines: number[] = [];
  for (let i = 0; i < 6; i++) lines.push(tossLine(rng));
  return lines;
}

/** How many lines are "moving" (6 or 9). Cage's changing lines. */
export function movingCount(hex: number[]): number {
  return hex.filter((v) => v === 6 || v === 9).length;
}

const OP_LABEL: Record<ChanceOp, string> = {
  keep: "as written",
  displace: "displaced",
  transpose: "transposed",
  mute: "silenced",
  double: "doubled",
};

/**
 * Consult the oracle for one note. `chanceAmount` (0..1) scales how often the
 * oracle intervenes; the hexagram's moving lines steer *which* transformation
 * and how far — more change in the coins, more change in the note.
 */
export function consult(rng: () => number, chanceAmount: number): Verdict {
  const hexagram = tossHexagram(rng);
  const moving = movingCount(hexagram);

  const gate = rng();
  const touched = gate < chanceAmount;

  if (!touched) {
    return {
      touched: false,
      op: "keep",
      hexagram,
      transposeSteps: 0,
      displaceBeats: 0,
      doubleInterval: 0,
      label: OP_LABEL.keep,
    };
  }

  // Weighted operation choice. Gentle ops (displace, transpose) dominate; muting
  // is rare so the melody stays recognisably yours.
  const pick = rng();
  let op: ChanceOp;
  if (pick < 0.4) op = "displace";
  else if (pick < 0.75) op = "transpose";
  else if (pick < 0.9) op = "double";
  else op = "mute";

  // Magnitudes drawn from the coins — short, small, in-scale.
  const displaceMenu = [0.25, 0.5, 0.5, 1];
  const stepMenu = [-2, -1, 1, 2];
  const doubleMenu = [7, 7, -7, 4]; // octave up (7 diatonic steps), sometimes down / a third

  const displaceBeats =
    op === "displace" ? displaceMenu[Math.floor(rng() * displaceMenu.length)] : 0;
  let transposeSteps =
    op === "transpose" ? stepMenu[Math.floor(rng() * stepMenu.length)] : 0;
  // A hexagram thick with moving lines can push the transpose a scale step further.
  if (op === "transpose" && moving >= 4) {
    transposeSteps += transposeSteps >= 0 ? 1 : -1;
  }
  const doubleInterval =
    op === "double" ? doubleMenu[Math.floor(rng() * doubleMenu.length)] : 0;

  return {
    touched: true,
    op,
    hexagram,
    transposeSteps,
    displaceBeats,
    doubleInterval,
    label: OP_LABEL[op],
  };
}

/**
 * A stateful oracle: holds a fixed seed + integer counter so a run of consults
 * is fully reproducible. The seeded demo uses one of these seeded to a constant.
 */
export class ChanceEngine {
  private counter = 0;
  constructor(private seed: number) {}

  next(chanceAmount: number): Verdict {
    // Decorrelate successive seeds with a Knuth-style multiplicative hash.
    const s = (this.seed + Math.imul(this.counter, 0x9e3779b1)) >>> 0;
    this.counter += 1;
    return consult(mulberry32(s), chanceAmount);
  }

  reset(): void {
    this.counter = 0;
  }
}
