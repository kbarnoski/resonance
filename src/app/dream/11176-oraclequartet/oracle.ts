// ════════════════════════════════════════════════════════════════════════════
// oracle.ts — a faithful Factor Oracle (the OMax machine-improvisation engine).
//
// The Factor Oracle is an online-built finite automaton over a stream of symbols
// (here: quantized musical events — scale-degree buckets, one per note). It is
// the engine behind IRCAM's OMax / Somax2 style machine improvisers.
//
//   Assayag & Dubnov, "Using Factor Oracles for Machine Improvisation" (2004).
//   Construction: Allauzen, Crochemore & Raffinot, "Factor oracle: a new
//   structure for pattern matching" (1999).
//
// The automaton has, for each state i:
//   • trans[i]  — forward + factor transitions, symbol → destination state
//   • sfx[i]    — the suffix link (sfx[0] = -1)
//   • lrs[i]    — length of the longest repeated suffix ending at i
//   • symbol[i] — the input symbol read to arrive at state i (i ≥ 1)
//
// Improvisation is a walk over this graph: continue forward to replay the input,
// or follow a suffix link to *recombine* — jump to another point in the material
// that shares the same recent context, then continue. That is how the soloist
// says something new out of what it has only ever heard.
// ════════════════════════════════════════════════════════════════════════════

export class FactorOracle {
  /** symbol[i] — the letter read to reach state i (symbol[0] is a placeholder). */
  readonly symbol: number[] = [0];
  /** sfx[i] — suffix link. sfx[0] = -1. */
  readonly sfx: number[] = [-1];
  /** lrs[i] — longest-repeated-suffix length at state i. */
  readonly lrs: number[] = [0];
  /** trans[i] — map from symbol to destination state (forward + factor links). */
  readonly trans: Array<Map<number, number>> = [new Map()];
  /** index of the last state added. */
  last = 0;

  /** Number of symbols consumed so far (== last). */
  get length(): number {
    return this.last;
  }

  /**
   * add_letter(σ) — the online Factor Oracle construction (ACR 1999).
   * Extends the automaton by one symbol, wiring the new forward transition,
   * back-filling factor transitions along the suffix chain, then computing the
   * new suffix link and lrs.
   */
  addLetter(sigma: number): void {
    const i = ++this.last;
    this.symbol[i] = sigma;
    this.trans[i] = new Map();

    // Forward transition from the previous state to the new one.
    this.trans[i - 1].set(sigma, i);

    // Walk the suffix chain of i-1, adding factor transitions on σ until we hit
    // a state that already has one.
    let k = this.sfx[i - 1];
    while (k > -1 && !this.trans[k].has(sigma)) {
      this.trans[k].set(sigma, i);
      k = this.sfx[k];
    }

    // The new suffix link.
    const s = k === -1 ? 0 : (this.trans[k].get(sigma) as number);
    this.sfx[i] = s;

    // lrs: agreeing-symbol count between the suffix at i-1 and the one at s-1,
    // plus one. Bounded so a long unison passage can't blow up the walk.
    this.lrs[i] = s === 0 ? 0 : this.commonSuffixLen(i - 1, s - 1) + 1;
  }

  /** Feed a whole sequence of symbols in order. */
  feed(symbols: Iterable<number>): void {
    for (const s of symbols) this.addLetter(s);
  }

  /** Count agreeing symbols walking backward from a and b (bounded ~24). */
  private commonSuffixLen(a: number, b: number): number {
    let n = 0;
    while (a > 0 && b > 0 && this.symbol[a] === this.symbol[b] && n < 24) {
      a--;
      b--;
      n++;
    }
    return n;
  }
}

/** Mutable read-head for an improvisation walk over an oracle. */
export interface WalkHead {
  /** current state (≥ 1 once walking). */
  p: number;
}

export interface WalkResult {
  /** the emitted symbol (decode this into a note). */
  symbol: number;
  /** true if this step recombined via a suffix link (for visuals). */
  jumped: boolean;
  /** the state landed on. */
  state: number;
}

/**
 * One step of the OMax generation walk.
 *
 *   with probability pRecombine, AND a usable suffix link exists (sfx[p] > 0),
 *   AND the shared context is long enough (lrs[p] ≥ minLrs):
 *        JUMP     p ← sfx[p]        (recombine into another matching context)
 *   else CONTINUE p ← p + 1         (replay the heard material forward)
 *
 * Past the end of the material we wrap: prefer sfx[last] (a musically related
 * state), otherwise fall back to a random low state.
 */
export function oracleStep(
  fo: FactorOracle,
  head: WalkHead,
  pRecombine: number,
  minLrs: number,
  rng: () => number,
): WalkResult {
  let p = head.p;
  let jumped = false;

  if (p < 1) p = 1;

  const canJump = fo.sfx[p] > 0 && fo.lrs[p] >= minLrs;
  if (canJump && rng() < pRecombine) {
    p = fo.sfx[p];
    jumped = true;
  } else {
    p = p + 1;
    if (p > fo.last) {
      const w = fo.sfx[fo.last];
      p = w > 0 ? w : 1 + Math.floor(rng() * Math.max(1, fo.last));
    }
  }
  if (p < 1) p = 1;

  head.p = p;
  return { symbol: fo.symbol[p], jumped, state: p };
}

// ── Deterministic PRNG (mulberry32) — the only source of "randomness" ─────────
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
