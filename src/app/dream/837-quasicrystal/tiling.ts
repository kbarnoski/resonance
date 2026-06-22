/**
 * tiling.ts — de Bruijn pentagrid → Penrose P3 rhomb tiling
 *
 * Algorithm:
 *   N.G. de Bruijn, "Algebraic theory of Penrose's non-periodic tilings
 *   of the plane, I & II", Indagationes Mathematicae, 1981.
 *
 * The pentagrid consists of 5 families of parallel lines.
 * Family k has lines perpendicular to direction θ_k = k·π/5, spaced 1 unit apart,
 * offset by γ_k (the "offsets" or "shifts" that parametrize which crystal we're in).
 *
 * Each intersection of lines from families j and k (j≠k) maps to one rhomb.
 * The rhomb type (fat=72°, thin=36°) depends on |j−k| mod 5.
 * The rhomb vertices are computed from the dual mapping.
 *
 * Penrose vertex configurations (from the local topology) are:
 *   sun, star, ace, deuce, jack, queen, king
 *
 * We generate all rhombs within a viewport radius and sort them by distance
 * for traversal sequencing.
 */

export type RhombType = "fat" | "thin";

// Penrose vertex configurations — determined by local vertex coordination
export type VertexConfig = "sun" | "star" | "ace" | "deuce" | "jack" | "queen" | "king";

export interface Rhomb {
  cx: number;          // center x (world coords)
  cy: number;          // center y (world coords)
  vertices: [number, number][];  // 4 corners
  type: RhombType;
  familyA: number;     // pentagrid family 0..4
  familyB: number;     // pentagrid family 0..4
  indexA: number;      // line index in family A
  indexB: number;      // line index in family B
  distFromCenter: number;
  angle: number;       // orientation angle (radians)
  vertexConfig: VertexConfig;
  id: string;
}

export interface TilingParams {
  /** Pentagrid offset γ_k for each of the 5 families. Values in [0,1) */
  offsets: [number, number, number, number, number];
  /** How many rings of tiles to generate */
  radius: number;
  /** World scale: pixels per pentagrid unit */
  scale: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;  // golden ratio ≈ 1.618

/** Pentagrid line directions */
const THETAS: number[] = [0, 1, 2, 3, 4].map(k => (k * Math.PI) / 5);
const COS_T: number[] = THETAS.map(Math.cos);
const SIN_T: number[] = THETAS.map(Math.sin);

/**
 * Map a pentagrid intersection (families j,k; line indices nj,nk) to
 * world coordinates via the de Bruijn dual transform.
 *
 * The dual vertex z^* satisfies:
 *   z^* · e_m = n_m + γ_m   for m = j, k
 *   z^* · e_m = K_m(z^*)    for m ≠ j, k  (consistent assignment)
 *
 * Standard formula from de Bruijn:
 *   z^* = Σ_{m} n_m * ω^m   where ω = exp(2πi/5)
 *
 * But we need the rhomb center. The rhomb for intersection (j,k;nj,nk)
 * has its "key vertex" at:
 *   P = Σ_{m≠j,m≠k} K_m · e_m  (sum over the other 3 families)
 * plus contributions from families j,k.
 *
 * Simpler direct formula used here (from Socolar & Steinhardt convention):
 */
function dualVertex(
  j: number, k: number,
  nj: number, nk: number,
  gammas: [number, number, number, number, number]
): [number, number] {
  // Solve 2x2 system:  COS_T[j]*x + SIN_T[j]*y = nj + gammas[j]
  //                    COS_T[k]*x + SIN_T[k]*y = nk + gammas[k]
  const a = COS_T[j], b = SIN_T[j], c = nj + gammas[j];
  const d = COS_T[k], e = SIN_T[k], f = nk + gammas[k];
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-10) return [0, 0];
  const x = (c * e - b * f) / det;
  const y = (a * f - c * d) / det;
  return [x, y];
}

/**
 * Generate all Penrose rhombs within a given radius.
 */
export function generateTiling(params: TilingParams): Rhomb[] {
  const { offsets, radius } = params;
  const rhombs: Rhomb[] = [];
  const seen = new Set<string>();

  // For each pair of families (j, k) with j < k
  for (let j = 0; j < 5; j++) {
    for (let k = j + 1; k < 5; k++) {
      // Determine rhomb type: |j-k| mod 5 → if diff=1 or diff=4 → fat (72°), else thin (36°)
      const diff = Math.abs(j - k);
      const type: RhombType = (diff === 1 || diff === 4) ? "fat" : "thin";

      // Iterate over line indices in both families
      const R = Math.ceil(radius / 0.5) + 3;
      for (let nj = -R; nj <= R; nj++) {
        for (let nk = -R; nk <= R; nk++) {
          // The intersection of line nj in family j and line nk in family k
          // gives one vertex of the rhomb.
          const [vx, vy] = dualVertex(j, k, nj, nk, offsets);

          // Quick distance cull
          if (Math.sqrt(vx * vx + vy * vy) > radius + 2) continue;

          // The rhomb has 4 vertices: (nj,nk), (nj+1,nk), (nj,nk+1), (nj+1,nk+1)
          // in the (j,k) sub-grid, each mapping to a world point.
          const v00 = dualVertex(j, k, nj, nk, offsets);
          const v10 = dualVertex(j, k, nj + 1, nk, offsets);
          const v01 = dualVertex(j, k, nj, nk + 1, offsets);
          const v11 = dualVertex(j, k, nj + 1, nk + 1, offsets);

          // Center
          const cx = (v00[0] + v11[0]) / 2;
          const cy = (v00[1] + v11[1]) / 2;
          const dist = Math.sqrt(cx * cx + cy * cy);
          if (dist > radius + 1) continue;

          // Deduplicate by rounding center
          const key = `${j},${k},${nj},${nk}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Compute orientation angle (direction of the long diagonal)
          const dx = v11[0] - v00[0];
          const dy = v11[1] - v00[1];
          const angle = Math.atan2(dy, dx);

          // Assign vertex config based on local topology
          const vertexConfig = assignVertexConfig(j, k, diff, nj, nk, offsets);

          rhombs.push({
            cx, cy,
            vertices: [v00, v10, v11, v01],
            type,
            familyA: j,
            familyB: k,
            indexA: nj,
            indexB: nk,
            distFromCenter: dist,
            angle,
            vertexConfig,
            id: key,
          });
        }
      }
    }
  }

  return rhombs;
}

/**
 * Assign a Penrose vertex configuration based on the local combinatorics.
 * Real Penrose vertex configs depend on matching rules — here we use a
 * heuristic based on family pairing and indices that captures the 7 types.
 */
function assignVertexConfig(
  j: number, k: number, diff: number,
  nj: number, nk: number,
  offsets: [number, number, number, number, number]
): VertexConfig {
  // Use a hash of the local neighborhood to pick from the 7 types
  // In a true P3 tiling these map to actual vertex configurations,
  // but for musical mapping purposes this gives a stable 7-way partition.
  const hash = ((j * 7 + k * 13 + nj * 3 + nk * 5) & 0x7fffffff) % 7;

  // Weight by fat/thin and diff for more interesting musical distribution
  if (diff === 1 || diff === 4) {
    // Fat rhombs: more likely sun/queen/king (stable, consonant)
    const fatHash = ((hash + nj + nk + j * offsets[j] * 10) | 0) % 4;
    return (["sun", "queen", "king", "jack"] as VertexConfig[])[Math.abs(fatHash) % 4];
  } else {
    // Thin rhombs: more likely star/ace/deuce (tense, complex)
    const thinHash = ((hash + nk + k * offsets[k] * 10) | 0) % 3;
    return (["star", "ace", "deuce"] as VertexConfig[])[Math.abs(thinHash) % 3];
  }
}

/**
 * Sort rhombs for traversal modes:
 *   - "spiral": outward spiral from center
 *   - "sweep": left-to-right sweep line
 *   - "growth": concentric rings (Penrose growth front)
 */
export type TraversalMode = "spiral" | "sweep" | "growth";

export function sortRhombsForTraversal(rhombs: Rhomb[], mode: TraversalMode): Rhomb[] {
  const sorted = [...rhombs];
  switch (mode) {
    case "spiral":
      sorted.sort((a, b) => {
        // Sort by (ring, angle) — creates an outward spiral
        const ringA = Math.round(a.distFromCenter * 2);
        const ringB = Math.round(b.distFromCenter * 2);
        if (ringA !== ringB) return ringA - ringB;
        return a.angle - b.angle;
      });
      break;
    case "sweep":
      // Sort by x then y
      sorted.sort((a, b) => {
        const ax = Math.round(a.cx * 4) / 4;
        const bx = Math.round(b.cx * 4) / 4;
        if (Math.abs(ax - bx) > 0.25) return ax - bx;
        return a.cy - b.cy;
      });
      break;
    case "growth":
      // Sort by concentric distance rings
      sorted.sort((a, b) => {
        const ringA = Math.floor(a.distFromCenter);
        const ringB = Math.floor(b.distFromCenter);
        if (ringA !== ringB) return ringA - ringB;
        // Within ring, sort by angle
        const angA = (a.angle + Math.PI * 2) % (Math.PI * 2);
        const angB = (b.angle + Math.PI * 2) % (Math.PI * 2);
        return angA - angB;
      });
      break;
  }
  return sorted;
}

/**
 * Compute Penrose inflation: scale the tiling by φ, generating
 * a self-similar version at a larger scale. This is used for the
 * zoom/inflation UI control.
 */
export function getInflationScale(inflationLevel: number): number {
  return Math.pow(PHI, inflationLevel);
}

export { PHI };
