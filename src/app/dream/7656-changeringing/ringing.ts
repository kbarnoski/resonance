// ─────────────────────────────────────────────────────────────────────────────
// 7656-changeringing · ringing.ts
//
// A from-scratch English change-ringing engine (Plain Bob), no dependencies.
//
// Change-ringing rings a set of tuned bells through a sequence of "changes"
// (rows), where every row is a permutation of the previous one produced by the
// method's PLACE NOTATION. Plain Bob, the oldest and simplest method (Fabian
// Stedman, Tintinnalogia 1668 / Campanalogia 1677), alternates a "cross" change
// (all adjacent bells swap) with a change that keeps two bells in their place
// while the rest swap in pairs. A full "plain course" cycles through many
// hundreds of distinct rows and returns home to "rounds" (1,2,3,…,N) — never
// repeating a row until it does.
//
// A row is stored as an array of bell numbers indexed by POSITION:
//   row[position] = which bell rings in that position (1 = first / earliest).
// ─────────────────────────────────────────────────────────────────────────────

/** A single row: bell numbers (1..N) listed in ringing order (position 0 = first). */
export type Row = number[];

/** One change is described by the set of PLACES (1-indexed) that are "made"
 *  (stay put). Every position not made must pair with its neighbour and swap. */
type Change = Set<number>;

export type Call = "plain" | "bob";

/** Rounds: bells in their home order 1,2,3,…,N. */
export function rounds(n: number): Row {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Apply one change (place-notation rule) to a row, returning the next row.
 *  Positions in `made` hold; every other position swaps with its right neighbour. */
export function applyChange(row: Row, made: Change): Row {
  const n = row.length;
  const out = row.slice();
  let i = 0;
  while (i < n) {
    const place = i + 1; // 1-indexed place
    if (made.has(place) || i + 1 >= n) {
      out[i] = row[i]; // held
      i += 1;
    } else {
      out[i] = row[i + 1]; // swap the adjacent pair
      out[i + 1] = row[i];
      i += 2;
    }
  }
  return out;
}

/** The full place-notation of ONE lead of Plain Bob on `n` bells.
 *  Even stages (Minor 6) alternate cross `x` with `1n`; odd stages (Triples 7)
 *  alternate back-place `n` with front-place `1`. The final change of the lead
 *  (the "lead end") is `12` (plain) or `14` (bob) — for odd stages `12n`/`14n`. */
export function leadNotation(n: number, call: Call): Change[] {
  const even = n % 2 === 0;
  const total = 2 * n; // a lead is always 2N changes
  const changes: Change[] = [];
  for (let k = 0; k < total; k++) {
    const last = k === total - 1;
    if (even) {
      if (last) changes.push(new Set(call === "bob" ? [1, 4] : [1, 2]));
      else if (k % 2 === 0) changes.push(new Set()); // cross
      else changes.push(new Set([1, n])); // 1n
    } else {
      if (last) changes.push(new Set(call === "bob" ? [1, 4, n] : [1, 2, n]));
      else if (k % 2 === 0) changes.push(new Set([n])); // back place
      else changes.push(new Set([1])); // front place
    }
  }
  return changes;
}

export interface MethodInfo {
  stage: number;
  /** Rows in one full plain course (excluding the opening rounds). */
  courseLength: number;
  /** Leads per plain course = stage − 1. */
  leadLength: number;
}

/**
 * A perpetual row generator. `next()` returns the next row forever, weaving
 * plain leads (default) and, when `bobs` is on, calling a bob at every lead end.
 * Both the plain course and the bob touch are guaranteed to return to rounds.
 */
export class Ringer {
  readonly stage: number;
  private bobs: boolean;
  private row: Row;
  private notation: Change[];
  private idx = 0; // index within the current lead
  /** True on the row that has just returned to rounds (a "home" moment). */
  home = false;

  constructor(stage: number, bobs = false) {
    this.stage = stage;
    this.bobs = bobs;
    this.row = rounds(stage);
    this.notation = leadNotation(stage, bobs ? "bob" : "plain");
  }

  /** The current row (the one most recently produced / the opening rounds). */
  current(): Row {
    return this.row.slice();
  }

  /** Advance one change and return the new row. */
  next(): Row {
    const made = this.notation[this.idx];
    this.row = applyChange(this.row, made);
    this.idx += 1;
    if (this.idx >= this.notation.length) {
      // Lead end reached — start a new lead (re-pick notation in case of a call).
      this.idx = 0;
      this.notation = leadNotation(this.stage, this.bobs ? "bob" : "plain");
    }
    this.home = this.row.every((b, i) => b === i + 1);
    return this.row.slice();
  }

  setBobs(bobs: boolean): void {
    this.bobs = bobs;
  }
}

/** Compute descriptive info + verify (in dev) that the plain course comes round. */
export function methodInfo(stage: number): MethodInfo {
  return {
    stage,
    courseLength: 2 * stage * (stage - 1),
    leadLength: stage - 1,
  };
}

/** Just-intonation bell tuning for a ring of `n` bells, tenor (bell N) = tonic.
 *  Bells sound a descending diatonic scale: the treble (bell 1) is highest.
 *  Returns frequencies indexed by bell number − 1 (so freqs[0] is the treble). */
export function bellFrequencies(n: number, tenorHz = 146.83 /* D3 */): number[] {
  // Just-intonation major scale ratios, degree 0 (tonic) … up.
  const scale = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4];
  const freqs: number[] = [];
  for (let bell = 1; bell <= n; bell++) {
    // Tenor (bell n) = degree 0 = tonic (lowest); treble (bell 1) = highest.
    const degree = n - bell;
    freqs[bell - 1] = tenorHz * scale[degree];
  }
  return freqs;
}
