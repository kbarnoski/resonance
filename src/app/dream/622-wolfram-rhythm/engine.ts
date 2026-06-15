/**
 * 622 — Wolfram Rhythm · CA engine
 * ─────────────────────────────────────────────────────────────────────────────
 * A 1D elementary cellular automaton. A row of `width` cells, each 0 or 1,
 * evolves to the next row by an 8-bit "Wolfram rule number" (0–255) applied
 * to each cell's (left, self, right) neighbourhood.
 *
 * For neighbourhood pattern p (a 3-bit value 0..7 = left*4 + self*2 + right),
 * the new cell = bit p of the rule number. That's the whole of Wolfram's
 * elementary CA family — 256 rules, each an integer.
 *
 * References: Stephen Wolfram, "A New Kind of Science" (2002); Matthew Cook's
 * proof that Rule 110 is Turing-complete (2004).
 */

export type Row = Uint8Array;

export interface PresetDef {
  rule: number;
  label: string;
  blurb: string;
}

/** Labelled presets surfaced as quick buttons. Order = display order. */
export const PRESETS: PresetDef[] = [
  { rule: 110, label: "complex", blurb: "Turing-complete · gliders collide" },
  { rule: 30, label: "chaos", blurb: "random, edgy, unpredictable" },
  { rule: 90, label: "fractal", blurb: "Sierpinski · self-similar" },
  { rule: 184, label: "traffic", blurb: "particles drift one way" },
  { rule: 54, label: "lattice", blurb: "nested, semi-periodic" },
  { rule: 150, label: "xor3", blurb: "additive, dense weave" },
];

/** Apply rule to a (left,self,right) neighbourhood. */
function applyRule(rule: number, left: number, self: number, right: number): number {
  const idx = (left << 2) | (self << 1) | right;
  return (rule >> idx) & 1;
}

/** Evolve one row into the next (wrap-around / toroidal edges). */
export function stepRow(prev: Row, rule: number): Row {
  const n = prev.length;
  const next = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = prev[(i - 1 + n) % n];
    const s = prev[i];
    const r = prev[(i + 1) % n];
    next[i] = applyRule(rule, l, s, r);
  }
  return next;
}

/** Single live cell in the centre — the canonical CA seed. */
export function makeSeedCentered(width: number): Row {
  const row = new Uint8Array(width);
  row[Math.floor(width / 2)] = 1;
  return row;
}

/** Random "soup" seed at a given live density (0..1). */
export function makeSeedSoup(width: number, density = 0.5): Row {
  const row = new Uint8Array(width);
  for (let i = 0; i < width; i++) row[i] = Math.random() < density ? 1 : 0;
  return row;
}

/** Count live cells. */
export function liveCount(row: Row): number {
  let c = 0;
  for (let i = 0; i < row.length; i++) c += row[i];
  return c;
}

/** True if two rows are identical. */
export function rowsEqual(a: Row, b: Row): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Long-form watchdog. Tracks recent rows and reports when the automaton has
 * gone dead (all cells 0), frozen (row unchanged), or locked into a short
 * cycle (period <= maxPeriod). Caller perturbs / re-seeds on a positive.
 */
export class StagnationDetector {
  private history: string[] = [];
  private readonly maxPeriod: number;
  private readonly memory: number;

  constructor(maxPeriod = 8, memory = 24) {
    this.maxPeriod = maxPeriod;
    this.memory = memory;
  }

  reset(): void {
    this.history = [];
  }

  /** Compact signature of a row for cheap equality / cycle checks. */
  private static sig(row: Row): string {
    // Pack bits into base-36 chunks — cheap, collision-safe for our widths.
    let s = "";
    let acc = 0;
    let bits = 0;
    for (let i = 0; i < row.length; i++) {
      acc = (acc << 1) | row[i];
      bits++;
      if (bits === 30) {
        s += acc.toString(36) + ".";
        acc = 0;
        bits = 0;
      }
    }
    if (bits) s += acc.toString(36);
    return s;
  }

  /** Push the newest row; returns a stagnation reason or null. */
  push(row: Row): "dead" | "frozen" | "cycle" | null {
    if (liveCount(row) === 0) return "dead";

    const sig = StagnationDetector.sig(row);
    const h = this.history;

    if (h.length && h[h.length - 1] === sig) return "frozen";

    // Look back for a repeat → period.
    for (let p = 2; p <= this.maxPeriod && p <= h.length; p++) {
      if (h[h.length - p] === sig) return "cycle";
    }

    h.push(sig);
    if (h.length > this.memory) h.shift();
    return null;
  }
}

/** Flip `count` random cells in place — a gentle perturbation kick. */
export function perturb(row: Row, count: number): void {
  for (let k = 0; k < count; k++) {
    const i = Math.floor(Math.random() * row.length);
    row[i] ^= 1;
  }
}
