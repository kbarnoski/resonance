// ─────────────────────────────────────────────────────────────────────────────
// engram.ts — the ring-buffer recorder + Markov/recombination replay engine for
// "Dream Replay". Pure TypeScript, no DOM, so the record→dream→dissolve logic is
// hand-verifiable and unit-testable in isolation.
//
// Concept (see README): the awake instrument RECORDS every onset into a bounded
// ring buffer of engrams. In the dream, a top-down "read-head" walks those
// engrams in a RECOMBINED order — a stochastic walk over the recorded SEQUENCE
// transitions whose sampling temperature IS the oneirogen parameter `alpha`
// (Bredenberg et al., eLife 2026). Low alpha ⇒ the walk mostly retraces the real
// phrases you played; high alpha ⇒ it jumps freely and recombines fragments into
// sequences you never played. Positions also DRIFT (a slow warp) as alpha rises,
// so the dream diverges from the literal record spatially as well as temporally.
// ─────────────────────────────────────────────────────────────────────────────

/** One recorded onset — a note the player actually made while awake. */
export interface Engram {
  /** Canvas position in 0..1 normalised coordinates (resolution-independent). */
  x: number;
  y: number;
  /** Index into the fixed diatonic scale (0 = lowest). */
  pitchIndex: number;
  /** Onset strength 0..1 (drag speed / tap force proxy). */
  velocity: number;
  /** ms timestamp (performance.now-style) when it was recorded. */
  t: number;
}

/** A tiny deterministic PRNG (mulberry32) so the dream is reproducible per seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bounded ring buffer of engrams. When full, new onsets overwrite the oldest —
 * so the dream is always drawn from the RECENTLY-learned world (a core claim of
 * the replay model: psychedelic replay favours recent experience).
 */
export class EngramField {
  private readonly buf: Engram[] = [];
  private readonly capacity: number;
  /** Insertion order preserved for sequence transitions (real chronology). */
  private readonly order: number[] = [];

  constructor(capacity = 160) {
    this.capacity = Math.max(4, capacity);
  }

  get size(): number {
    return this.buf.length;
  }

  /** All engrams in insertion (chronological) order. Read-only view. */
  all(): readonly Engram[] {
    return this.buf;
  }

  /** Record one onset. Returns its stable index in the buffer. */
  record(e: Engram): number {
    if (this.buf.length < this.capacity) {
      const idx = this.buf.length;
      this.buf.push(e);
      this.order.push(idx);
      return idx;
    }
    // Full: overwrite the chronologically-oldest slot in place, keeping indices
    // stable so the transition table (built lazily) stays coherent.
    const oldest = this.order.shift();
    const idx = oldest ?? 0;
    this.buf[idx] = e;
    this.order.push(idx);
    return idx;
  }

  /**
   * For each engram index, the set of indices that FOLLOWED it chronologically
   * (with repeats, so common transitions weigh more). This is the "learned
   * world" the dream replays. Built fresh from current `order`.
   */
  transitions(): Map<number, number[]> {
    const m = new Map<number, number[]>();
    for (let i = 0; i < this.order.length - 1; i++) {
      const from = this.order[i];
      const to = this.order[i + 1];
      const list = m.get(from);
      if (list) list.push(to);
      else m.set(from, [to]);
    }
    return m;
  }
}

/**
 * The top-down read-head: a stochastic walk over recorded engrams. `alpha`
 * (0..1) is the sampling temperature — the oneirogen parameter.
 *
 *   alpha ≈ 0.0  → deterministic: always take the most-recorded real transition
 *                  (faithful retrace of your actual phrases).
 *   alpha ≈ 0.5  → soft-sample the recorded transitions (mostly your phrases,
 *                  occasional variation).
 *   alpha ≈ 1.0  → the transition prior is nearly ignored; the head jumps to any
 *                  engram, recombining fragments into sequences never played.
 *
 * The walk is pure: given the same field, seed and alpha sequence it is
 * reproducible, which is what makes the mechanic hand-verifiable.
 */
export class ReadHead {
  private readonly field: EngramField;
  private readonly rng: () => number;
  private current: number;
  private trans: Map<number, number[]>;

  constructor(field: EngramField, seed = 0x1078) {
    this.field = field;
    this.rng = makeRng(seed);
    this.current = 0;
    this.trans = field.transitions();
  }

  /** Refresh the transition table (call when new engrams were recorded). */
  refresh(): void {
    this.trans = this.field.transitions();
    if (this.current >= this.field.size) this.current = 0;
  }

  get index(): number {
    return this.current;
  }

  /**
   * Advance the head one step under temperature `alpha` and return the newly
   * visited engram (or null if the field is empty). Blends two behaviours:
   *
   *   (1) FOLLOW — sample from the recorded successors of the current engram,
   *       weighted by how often each really followed. This is the faithful,
   *       phrase-preserving path.
   *   (2) JUMP — pick any engram uniformly at random. This is the free,
   *       recombining path that invents unplayed sequences.
   *
   * The probability of (2) rises with alpha (jumpProb = alpha^1.6), and even
   * within FOLLOW the weighting is softened toward uniform as alpha rises. So the
   * transition from retrace → recombination is smooth, not a switch.
   */
  step(alpha: number): Engram | null {
    const n = this.field.size;
    if (n === 0) return null;
    const a = Math.min(1, Math.max(0, alpha));

    const successors = this.trans.get(this.current);
    const jumpProb = Math.pow(a, 1.6);

    let next: number;
    if (!successors || successors.length === 0 || this.rng() < jumpProb) {
      // JUMP — free recombination.
      next = Math.floor(this.rng() * n) % n;
    } else {
      // FOLLOW — but soften the empirical distribution toward uniform as alpha
      // grows, so mid-alpha already loosens the phrasing before it fully jumps.
      const uniqueCounts = new Map<number, number>();
      for (const s of successors) {
        uniqueCounts.set(s, (uniqueCounts.get(s) ?? 0) + 1);
      }
      const entries = [...uniqueCounts.entries()];
      // weight = count^(1 - a): a=0 keeps real frequencies; a→1 flattens to ~uniform.
      const exponent = 1 - a;
      let total = 0;
      const weights = entries.map(([, c]) => {
        const w = Math.pow(c, exponent);
        total += w;
        return w;
      });
      let r = this.rng() * total;
      next = entries[0][0];
      for (let i = 0; i < entries.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          next = entries[i][0];
          break;
        }
      }
    }

    this.current = next;
    return this.field.all()[next] ?? null;
  }
}

/**
 * The spatial "warp" the dream applies to an engram's stored position as alpha
 * rises — a slow, smooth field distortion so remembered notes drift away from
 * where they were truly played. Pure function of position, alpha and a phase
 * (time) so callers can animate it deterministically.
 *
 * Returns a new {x, y} in 0..1; at alpha 0 it is (near) identity.
 */
export function applyDrift(
  x: number,
  y: number,
  alpha: number,
  phase: number,
): { x: number; y: number } {
  const amt = alpha * alpha * 0.16; // quadratic: negligible awake, strong deep.
  const dx =
    Math.sin(y * 6.283 + phase * 0.7) * 0.5 +
    Math.sin(x * 3.1 + y * 4.2 - phase) * 0.5;
  const dy =
    Math.cos(x * 6.283 - phase * 0.6) * 0.5 +
    Math.cos(y * 3.7 - x * 2.9 + phase * 1.1) * 0.5;
  return {
    x: Math.min(1, Math.max(0, x + dx * amt)),
    y: Math.min(1, Math.max(0, y + dy * amt)),
  };
}
