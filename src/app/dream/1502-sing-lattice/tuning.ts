// ─────────────────────────────────────────────────────────────────────────────
// tuning.ts — the xenharmonic engine for the Sing Lattice.
//
//   THE TUNING: Bohlen–Pierce. Heinz Bohlen (1972) and, independently, John
//   Pierce noticed that a scale need not repeat at the 2:1 octave at all. BP
//   repeats at the *tritave* — the 3:1 — and divides it into 13 steps. Because
//   the period is an odd number (3, not 2), BP consonance is built on ODD
//   harmonics: the signature chord is 3:5:7, and the scale's just ratios factor
//   into powers of 3, 5 and 7 only. No 2s anywhere. To an ear raised on the
//   piano it sounds *wrong in a gorgeous way* — which is the whole instrument.
//
//   We use the classic just-intonation "Lambda" BP scale (13 ratios inside the
//   tritave). Every ratio = 3^c · 5^a · 7^b. Quotient out the period (the 3^c)
//   and each pitch has a coordinate on a 2-D **harmonic lattice** whose axes are
//   the prime 5 (horizontal) and the prime 7 (vertical) — an Erv-Wilson-style
//   tuning lattice, not a keyboard row. Neighbours on that lattice differ by a
//   single factor of 5 or 7, i.e. they are each other's nearest consonances, so
//   the lattice geometry *is* the sympathetic-resonance map.
//
//   Refs: Heinz Bohlen & John R. Pierce, the Bohlen–Pierce scale (1970s–80s);
//   Erv Wilson's tuning lattices; Sevish's Scale Workshop (browser xen tooling).
//   Extends this lab's own 1408-wolf-ring — there one "wrong" fifth was a
//   playable landmark; here the entire scale is a place you get to be wrong in.
// ─────────────────────────────────────────────────────────────────────────────

/** Cents of the tritave, the BP period. 1200·log2(3) = 1901.955¢. */
export const TRITAVE_CENTS = 1200 * Math.log2(3);

/** One step of 13-EDT (equal divisions of the tritave), for the reference
 *  table only: 1901.955 / 13 = 146.304¢. The playable lattice is just, not EDT. */
export const BP_ET_STEP_CENTS = TRITAVE_CENTS / 13;

/** Anchor: the 1/1 of the lattice, chosen so the whole tritave (×3) sits in a
 *  comfortable hum/sing register (~185 Hz up to ~555 Hz). */
export const BASE_HZ = 185.0; // ~F#3

interface RawNode {
  num: number;
  den: number;
  /** exponent of prime 5 — the horizontal lattice axis. */
  a: number;
  /** exponent of prime 7 — the vertical lattice axis. */
  b: number;
  label: string;
}

// The 13 just ("Lambda") Bohlen–Pierce degrees, in ascending pitch order.
// Each ratio factors as 3^c · 5^a · 7^b; (a,b) is its lattice coordinate.
const RAW: RawNode[] = [
  { num: 1, den: 1, a: 0, b: 0, label: "C" }, //   0.00¢  1/1
  { num: 27, den: 25, a: -2, b: 0, label: "D♭" }, // 133.24¢ 3^3/5^2
  { num: 25, den: 21, a: 2, b: -1, label: "D" }, // 301.85¢ 5^2/(3·7)
  { num: 9, den: 7, a: 0, b: -1, label: "E" }, // 435.08¢ 3^2/7
  { num: 7, den: 5, a: -1, b: 1, label: "F" }, // 582.51¢ 7/5
  { num: 75, den: 49, a: 2, b: -2, label: "G♭" }, // 736.93¢ 3·5^2/7^2
  { num: 5, den: 3, a: 1, b: 0, label: "G" }, // 884.36¢ 5/3
  { num: 9, den: 5, a: -1, b: 0, label: "H" }, // 1017.60¢ 3^2/5
  { num: 49, den: 25, a: -2, b: 2, label: "J♭" }, // 1165.02¢ 7^2/5^2
  { num: 15, den: 7, a: 1, b: -1, label: "J" }, // 1319.44¢ 3·5/7
  { num: 7, den: 3, a: 0, b: 1, label: "A" }, // 1466.87¢ 7/3
  { num: 63, den: 25, a: -2, b: 1, label: "B♭" }, // 1600.11¢ 3^2·7/5^2
  { num: 25, den: 9, a: 2, b: 0, label: "B" }, // 1768.72¢ 5^2/3^2
];

export interface LatticeNode {
  step: number;
  label: string;
  num: number;
  den: number;
  ratio: number;
  /** cents above the 1/1, inside the tritave [0, 1901.955). */
  cents: number;
  /** frequency of this degree in the base tritave (Hz). */
  baseFreq: number;
  /** harmonic-lattice coordinate: a = power of 5, b = power of 7. */
  a: number;
  b: number;
  /** indices of the lattice-adjacent nodes (differ by one factor of 5 or 7). */
  neighbours: number[];
}

export const NODES: LatticeNode[] = RAW.map((r, step) => {
  const ratio = r.num / r.den;
  return {
    step,
    label: r.label,
    num: r.num,
    den: r.den,
    ratio,
    cents: 1200 * Math.log2(ratio),
    baseFreq: BASE_HZ * ratio,
    a: r.a,
    b: r.b,
    neighbours: [] as number[],
  };
});

// Fill neighbours + build the bond list (unique undirected lattice edges).
export interface Bond {
  i: number;
  j: number;
  /** "five" (horizontal, ±5) or "seven" (vertical, ±7). */
  axis: "five" | "seven";
}
export const BONDS: Bond[] = [];
for (let i = 0; i < NODES.length; i++) {
  for (let j = 0; j < NODES.length; j++) {
    if (i === j) continue;
    const da = NODES[j].a - NODES[i].a;
    const db = NODES[j].b - NODES[i].b;
    const adjacent =
      (Math.abs(da) === 1 && db === 0) || (da === 0 && Math.abs(db) === 1);
    if (adjacent) {
      NODES[i].neighbours.push(j);
      if (i < j) BONDS.push({ i, j, axis: db === 0 ? "five" : "seven" });
    }
  }
}

/** Reduce an arbitrary frequency into the base tritave and return its position
 *  in cents within [0, TRITAVE_CENTS), plus how many tritaves up/down it was. */
export function reduceToTritave(freq: number): {
  cents: number;
  tritaveShift: number;
} {
  if (freq <= 0) return { cents: 0, tritaveShift: 0 };
  let ratio = freq / BASE_HZ;
  let shift = 0;
  while (ratio >= 3) {
    ratio /= 3;
    shift += 1;
  }
  while (ratio < 1) {
    ratio *= 3;
    shift -= 1;
  }
  return { cents: 1200 * Math.log2(ratio), tritaveShift: shift };
}

export interface Snap {
  /** index of the nearest lattice node. */
  index: number;
  /** signed cents deviation of the voice from that node (− = flat, + = sharp). */
  deviation: number;
}

/** Nearest lattice node to a cents position inside the tritave (wraps at the
 *  tritave boundary, so a voice just under the 1/1 still snaps up to C). */
export function nearestNode(centsInTritave: number): Snap {
  let best = 0;
  let bestDev = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    let d = centsInTritave - NODES[i].cents;
    // wrap into (−tritave/2, +tritave/2]
    if (d > TRITAVE_CENTS / 2) d -= TRITAVE_CENTS;
    if (d < -TRITAVE_CENTS / 2) d += TRITAVE_CENTS;
    if (Math.abs(d) < Math.abs(bestDev)) {
      bestDev = d;
      best = i;
    }
  }
  return { index: best, deviation: bestDev };
}

/** Frequency to actually sound a node at, transposed into whichever tritave
 *  register sits closest to the singer's detected pitch (so the snapped tone
 *  rings right next to the voice, not an octave/tritave away). */
export function playFreqNear(nodeIndex: number, targetHz: number): number {
  const base = NODES[nodeIndex].baseFreq;
  if (targetHz <= 0) return base;
  let f = base;
  while (f * 3 <= targetHz * 1.7320508) f *= 3; // √3 = geometric midpoint
  while (f / 3 >= targetHz / 1.7320508) f /= 3;
  return f;
}

/** 13-EDT reference cents, for the README table / didactic overlay. */
export function bpEqualTemperedCents(): number[] {
  return Array.from({ length: 13 }, (_, i) => i * BP_ET_STEP_CENTS);
}
