// tuning.ts — the adaptive-just-intonation retuner for 1930-harmonices (cycle 3).
//
// THESIS (the comma pump, made playable): a just-intonation lattice is not
// closed. If you build a chord by chaining PURE intervals from a moving pivot —
// exactly what capturing one resonance after another does — the chord's tonal
// centre slowly walks off the star's fixed pitch. Four pure fifths up minus two
// octaves overshoot a pure major third by a *syntonic comma* (81/80 ≈ 21.5¢);
// I–vi–ii–V–I in strict JI sinks a whole comma per turn. This is the 300-year-old
// tension Kepler's pure ratios could never escape, and it is usually hidden.
//
// This module exposes it as a live toggle:
//   • STRICT (honest physics): each crystal keeps the exact pure ratio its
//     capture gave it. The chord is locally pure but its centre DRIFTS against
//     the star drone (fixed at ROOT) — you hear the beating grow, cents readout
//     climbs. This is what pure intonation actually does.
//   • ADAPTIVE (spread the comma): a real-time relaxation — the browser analogue
//     of the linear-least-squares scheme in Stange & Wick, "Playing Music in Just
//     Intonation" (arXiv:1706.04338), and Nemire's Pivotuner (arXiv:2306.03873) —
//     nudges every sounding tone a fraction of a comma so the centre LOCKS back
//     to the star. The beating dies; the cost is a few cents of temper, reported
//     honestly. Flip the toggle live and the whole chord glides in or out of lock.
//
// Adaptive JI's own definition (tonalsoft): reduce the comma-sized retuning of a
// strict-JI rendition to *fractions* of a comma by spreading the motion across
// every voice. That spread is what the relaxation does.

export const ROOT_HZ = 65.41; // C2 — MUST match ROOT in audio.ts (the star drone)

/** Pure JI degrees within one octave, in cents above the octave base.
 *  1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8 — same set the
 *  voice engine snaps to, so the lattice the drone sits on is genuinely pure. */
const LATTICE_CENTS = [
  0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36,
  1017.6, 1088.27,
];

export function centsOf(freqHz: number): number {
  return 1200 * Math.log2(freqHz / ROOT_HZ);
}
export function freqOf(cents: number): number {
  return ROOT_HZ * Math.pow(2, cents / 1200);
}
export function pureIntervalCents(p: number, q: number): number {
  return 1200 * Math.log2(p / q);
}

/** Nearest pure lattice value (any octave) to an arbitrary cents value.
 *  Doubles as "snap this raw interval to the nearest pure interval". */
export function snapToLatticeCents(c: number): number {
  let best = 0;
  let bestErr = Infinity;
  for (let oct = -3; oct <= 6; oct++) {
    const off = 1200 * oct;
    for (const l of LATTICE_CENTS) {
      const v = l + off;
      const e = Math.abs(v - c);
      if (e < bestErr) {
        bestErr = e;
        best = v;
      }
    }
  }
  return best;
}

/** One tuned crystal: a dyad, low tone at `lo` cents, pure interval `iv` cents. */
export interface TunedCrystal {
  id: string;
  lo: number; // current low-tone tuning, cents above ROOT
  iv: number; // the crystal's OWN interval (kept pure — it's what you captured)
  born: number; // the pure-chain low tone at birth (the strict/honest target)
}

/** Place a newly captured crystal on the tuning lattice.
 *  First crystal snaps to the star's grid (drift 0). Every later one is chained
 *  PURELY from the nearest existing tone — this is where the comma enters. */
export function placeCrystal(
  existing: TunedCrystal[],
  physicsBaseHz: number,
  p: number,
  q: number,
): TunedCrystal {
  const id = `${p}:${q}`;
  const iv = pureIntervalCents(p, q);
  const baseC = centsOf(physicsBaseHz);
  if (existing.length === 0) {
    const lo = snapToLatticeCents(baseC);
    return { id, lo, iv, born: lo };
  }
  // pivot on the nearest sounding low tone, then chain a PURE interval to it
  let pivot = existing[0].lo;
  let bestD = Infinity;
  for (const c of existing) {
    const d = Math.abs(c.lo - baseC);
    if (d < bestD) {
      bestD = d;
      pivot = c.lo;
    }
  }
  const rawInterval = baseC - pivot;
  const lo = pivot + snapToLatticeCents(rawInterval);
  return { id, lo, iv, born: lo };
}

/** Signed tonal-centre drift of the whole chord vs the star's pure lattice, ¢.
 *  0 = locked to the drone; ±N = the chord centre has walked N cents off. */
export function chordDriftCents(crystals: TunedCrystal[]): number {
  if (crystals.length === 0) return 0;
  let sum = 0;
  for (const c of crystals) sum += c.lo - snapToLatticeCents(c.lo);
  return sum / crystals.length;
}

/** Largest amount any single voice was nudged off its honest pure-chain position
 *  to achieve the lock, ¢. This is the price of adaptive intonation, made honest:
 *  STRICT keeps every voice on its pure chain → 0 (nothing retuned); ADAPTIVE
 *  spreads the accumulated comma across the voices → nonzero. */
export function maxTemperCents(crystals: TunedCrystal[]): number {
  let worst = 0;
  for (const c of crystals) {
    const t = Math.abs(c.lo - c.born);
    if (t > worst) worst = t;
  }
  return worst;
}

/** Advance the tuning one frame toward the target of the current mode.
 *  Mutates each crystal's `lo` in place; the dyad interval `iv` stays pure.
 *   • strict   → relax toward the frozen pure-chain birth value (`born`).
 *   • adaptive → relax toward the nearest star-lattice degree, spreading the
 *     accumulated comma across every voice a fraction at a time (Stange–Wick).
 *  `rate` is a per-frame smoothing 0..1 (dt-scaled) so the lock GLIDES audibly. */
export function relaxTuning(
  crystals: TunedCrystal[],
  mode: "strict" | "adaptive",
  rate: number,
): void {
  const k = Math.max(0, Math.min(1, rate));
  for (const c of crystals) {
    const target = mode === "strict" ? c.born : snapToLatticeCents(c.lo);
    c.lo += (target - c.lo) * k;
  }
}
