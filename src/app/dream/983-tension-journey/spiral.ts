// spiral.ts — Elaine Chew's Spiral Array tonal-tension model.
//
// References:
//   Elaine Chew, "Mathematical and Computational Modeling of Tonality"
//     (Springer, 2014) — the Spiral Array.
//   Dorien Herremans & Elaine Chew, "Tension ribbons: Quantifying and
//     visualising tonal tension" (TENOR 2016) — cloud diameter, cloud
//     momentum, tensile strain.
//
// Geometry (documented constants):
//   Pitch classes live on a 3D helix ordered by perfect fifths. For a
//   position k along the line of fifths (C=0, G=1, D=2, A=3, E=4, ...),
//       P(k) = ( r*sin(k*PI/2), r*cos(k*PI/2), k*h )
//   with radius r = 1 and vertical rise per step h = 0.4.
//   Four steps of a fifth = one full turn (PI/2 each) and 4*h vertical
//   rise, which is what makes neighbours-by-fifth spatially close and
//   tritones far — the property the tension measures exploit.

export const SPIRAL_R = 1.0;
export const SPIRAL_H = 0.4;

export type Vec3 = readonly [number, number, number];

// Line-of-fifths index for each of the 12 pitch classes (pc 0 = C).
// Starting from C, ascending by fifths: C G D A E B F# C# G# D# A# F.
// We center the line of fifths on C so distances are symmetric-ish.
// pc -> line-of-fifths position (relative to C = 0).
const PC_TO_LOF: number[] = (() => {
  const map = new Array<number>(12).fill(0);
  // walk the circle of fifths from C
  let pc = 0;
  for (let k = 0; k < 12; k++) {
    map[pc] = k;
    pc = (pc + 7) % 12;
  }
  return map;
})();

// Position on the helix for a given line-of-fifths index k.
export function pointForLof(k: number): Vec3 {
  return [
    SPIRAL_R * Math.sin((k * Math.PI) / 2),
    SPIRAL_R * Math.cos((k * Math.PI) / 2),
    k * SPIRAL_H,
  ];
}

// Position on the helix for a pitch class (0..11). We use the centred
// line-of-fifths index in -? .. ? so that, e.g., F (lof 11) is treated
// as the close neighbour below C rather than far away. We map lof values
// >6 to their negative equivalent (lof - 12) so the helix is centred.
export function pointForPc(pc: number): Vec3 {
  let k = PC_TO_LOF[((pc % 12) + 12) % 12];
  if (k > 6) k -= 12; // centre line of fifths near C
  return pointForLof(k);
}

export function dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Center of effect: weighted average of pitch points. Equal weights by
// default (Chew uses heavier weight on root/fifth for chords; we keep it
// simple and documented).
export function centerOfEffect(pcs: number[], weights?: number[]): Vec3 {
  if (pcs.length === 0) return [0, 0, 0];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let wsum = 0;
  for (let i = 0; i < pcs.length; i++) {
    const w = weights ? weights[i] : 1;
    const p = pointForPc(pcs[i]);
    sx += p[0] * w;
    sy += p[1] * w;
    sz += p[2] * w;
    wsum += w;
  }
  return [sx / wsum, sy / wsum, sz / wsum];
}

// Cloud diameter: max pairwise distance among the chord's pitch points.
// Larger = more spread / dissonant.
export function cloudDiameter(pcs: number[]): number {
  if (pcs.length < 2) return 0;
  const pts = pcs.map(pointForPc);
  let max = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j]);
      if (d > max) max = d;
    }
  }
  return max;
}

// Cloud momentum: distance between current CE and previous CE.
export function cloudMomentum(curCE: Vec3, prevCE: Vec3 | null): number {
  if (!prevCE) return 0;
  return dist(curCE, prevCE);
}

// Tensile strain: distance between chord CE and the KEY's CE.
export function tensileStrain(curCE: Vec3, keyCE: Vec3): number {
  return dist(curCE, keyCE);
}

// Key center of effect: a major/minor key is itself a weighted centroid
// of tonic, dominant and (sub/median) chords on the spiral. We use the
// triad tonic/dominant/subdominant centroid, a faithful-enough proxy of
// Chew's key representation for a fixed-key tension reference.
export function keyCenterOfEffect(tonicPc: number, minor: boolean): Vec3 {
  const third = minor ? 3 : 4;
  const tonic = [tonicPc % 12, (tonicPc + third) % 12, (tonicPc + 7) % 12];
  const dom = [(tonicPc + 7) % 12, (tonicPc + 11) % 12, (tonicPc + 2) % 12];
  const sub = [(tonicPc + 5) % 12, (tonicPc + 9) % 12, (tonicPc) % 12];
  // Heavier weight on tonic, lighter on dominant/subdominant.
  const ce = (chord: number[], w: number): Vec3 => {
    const c = centerOfEffect(chord);
    return [c[0] * w, c[1] * w, c[2] * w];
  };
  const wt = 0.5;
  const wd = 0.3;
  const ws = 0.2;
  const t = ce(tonic, wt);
  const d = ce(dom, wd);
  const s = ce(sub, ws);
  return [t[0] + d[0] + s[0], t[1] + d[1] + s[1], t[2] + d[2] + s[2]];
}

// Normalisation constants (empirical, documented). Each raw measure is
// divided by an approximate observed maximum to land in ~[0,1].
export const NORM = {
  diameter: 3.2, // tritone-spanning clouds approach this
  momentum: 2.4, // large CE jumps on modulation
  strain: 2.6, // distant chromatic chords from home key
} as const;

// Default blend weights of the three normalised measures into one scalar
// tension value in ~[0,1]. Documented in README.
export const TENSION_WEIGHTS = {
  diameter: 0.34,
  momentum: 0.18,
  strain: 0.48,
} as const;

export interface TensionBreakdown {
  diameter: number; // normalised 0..1
  momentum: number; // normalised 0..1
  strain: number; // normalised 0..1
  tension: number; // weighted blend 0..1
  ce: Vec3;
}

// Compute the full tension breakdown for a chord (set of pitch classes)
// against a key CE and previous CE.
export function computeTension(
  pcs: number[],
  keyCE: Vec3,
  prevCE: Vec3 | null,
): TensionBreakdown {
  const ce = centerOfEffect(pcs);
  const diaRaw = cloudDiameter(pcs);
  const momRaw = cloudMomentum(ce, prevCE);
  const strRaw = tensileStrain(ce, keyCE);
  const diameter = Math.min(1, diaRaw / NORM.diameter);
  const momentum = Math.min(1, momRaw / NORM.momentum);
  const strain = Math.min(1, strRaw / NORM.strain);
  const tension =
    diameter * TENSION_WEIGHTS.diameter +
    momentum * TENSION_WEIGHTS.momentum +
    strain * TENSION_WEIGHTS.strain;
  return { diameter, momentum, strain, tension, ce };
}
