// ─────────────────────────────────────────────────────────────────────────────
// 1462-box-temple · mandelbox.ts — a CPU copy of the Mandelbox fold iteration.
//
//   This is the exact same distance-estimator the fragment shader raymarches
//   (Tom Lowe / "Tglad", 2010): a per-iteration BOX FOLD followed by a SPHERE
//   FOLD, then a linear scale + translate, accumulating the running derivative
//   so distance = |v| / |dr|. Running it on the CPU for the single point AT the
//   camera is cheap, and it is what lets the temple's own folding structure be
//   SONIFIED — the number of folds triggered and the per-iteration radii (the
//   local "temple dimensions") drive the resonant voices in audio.ts.
//
//   Determinism: pure arithmetic, no Math.random / Date. Identical every run.
// ─────────────────────────────────────────────────────────────────────────────

export interface MandelboxParams {
  /** Fold scale. Negative (~ -1.5 .. -2.5) gives the classic temple look. */
  scale: number;
  /** Iteration count (~10..14). */
  iterations: number;
  /** Sphere-fold inner radius squared. Classic 0.25. */
  minRadius2: number;
  /** Sphere-fold outer / fixed radius squared. Classic 1.0. */
  fixedRadius2: number;
}

export interface FoldSample {
  /** Distance estimate at the sampled point (proximity to nearest wall). */
  de: number;
  /** Total box-fold reflections triggered across all iterations. */
  boxFolds: number;
  /** Total sphere-fold rescalings triggered across all iterations. */
  sphereFolds: number;
  /** Per-iteration radius |v| — the local temple dimensions. length = iterations. */
  radii: number[];
  /** Whether any fold fired on that iteration. length = iterations. */
  folded: boolean[];
}

/**
 * Full sample used for sonification: fold counts + the per-iteration radius
 * sequence. Allocates two small arrays; called once per frame at the camera.
 */
export function sampleMandelbox(
  px: number,
  py: number,
  pz: number,
  p: MandelboxParams,
): FoldSample {
  const { scale, iterations, minRadius2, fixedRadius2 } = p;
  let vx = px;
  let vy = py;
  let vz = pz;
  const cx = px;
  const cy = py;
  const cz = pz;
  let dr = 1;
  let boxFolds = 0;
  let sphereFolds = 0;
  const radii: number[] = new Array(iterations);
  const folded: boolean[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let foldedThis = false;

    // ── box fold: reflect any component outside [-1, 1] ──
    if (vx > 1) {
      vx = 2 - vx;
      boxFolds++;
      foldedThis = true;
    } else if (vx < -1) {
      vx = -2 - vx;
      boxFolds++;
      foldedThis = true;
    }
    if (vy > 1) {
      vy = 2 - vy;
      boxFolds++;
      foldedThis = true;
    } else if (vy < -1) {
      vy = -2 - vy;
      boxFolds++;
      foldedThis = true;
    }
    if (vz > 1) {
      vz = 2 - vz;
      boxFolds++;
      foldedThis = true;
    } else if (vz < -1) {
      vz = -2 - vz;
      boxFolds++;
      foldedThis = true;
    }

    // ── sphere fold: rescale toward the fixed radius ──
    const r2 = vx * vx + vy * vy + vz * vz;
    if (r2 < minRadius2) {
      const t = fixedRadius2 / minRadius2;
      vx *= t;
      vy *= t;
      vz *= t;
      dr *= t;
      sphereFolds++;
      foldedThis = true;
    } else if (r2 < fixedRadius2) {
      const t = fixedRadius2 / r2;
      vx *= t;
      vy *= t;
      vz *= t;
      dr *= t;
      sphereFolds++;
      foldedThis = true;
    }

    // ── scale + translate, accumulate derivative ──
    vx = vx * scale + cx;
    vy = vy * scale + cy;
    vz = vz * scale + cz;
    dr = dr * Math.abs(scale) + 1;

    radii[i] = Math.sqrt(vx * vx + vy * vy + vz * vz);
    folded[i] = foldedThis;
  }

  const r = Math.sqrt(vx * vx + vy * vy + vz * vz);
  return {
    de: r / Math.abs(dr),
    boxFolds,
    sphereFolds,
    radii,
    folded,
  };
}

/**
 * Distance estimate only — no allocation. Used for cheap camera collision /
 * gradient probing where the fold detail is not needed.
 */
export function mandelboxDE(
  px: number,
  py: number,
  pz: number,
  p: MandelboxParams,
): number {
  const { scale, iterations, minRadius2, fixedRadius2 } = p;
  let vx = px;
  let vy = py;
  let vz = pz;
  const cx = px;
  const cy = py;
  const cz = pz;
  let dr = 1;

  for (let i = 0; i < iterations; i++) {
    if (vx > 1) vx = 2 - vx;
    else if (vx < -1) vx = -2 - vx;
    if (vy > 1) vy = 2 - vy;
    else if (vy < -1) vy = -2 - vy;
    if (vz > 1) vz = 2 - vz;
    else if (vz < -1) vz = -2 - vz;

    const r2 = vx * vx + vy * vy + vz * vz;
    if (r2 < minRadius2) {
      const t = fixedRadius2 / minRadius2;
      vx *= t;
      vy *= t;
      vz *= t;
      dr *= t;
    } else if (r2 < fixedRadius2) {
      const t = fixedRadius2 / r2;
      vx *= t;
      vy *= t;
      vz *= t;
      dr *= t;
    }

    vx = vx * scale + cx;
    vy = vy * scale + cy;
    vz = vz * scale + cz;
    dr = dr * Math.abs(scale) + 1;
  }

  return Math.sqrt(vx * vx + vy * vy + vz * vz) / Math.abs(dr);
}

/** Field gradient (unnormalised surface normal) via central differences. */
export function mandelboxNormal(
  px: number,
  py: number,
  pz: number,
  p: MandelboxParams,
  out: [number, number, number],
): void {
  const e = 0.0015;
  const dx = mandelboxDE(px + e, py, pz, p) - mandelboxDE(px - e, py, pz, p);
  const dy = mandelboxDE(px, py + e, pz, p) - mandelboxDE(px, py - e, pz, p);
  const dz = mandelboxDE(px, py, pz + e, p) - mandelboxDE(px, py, pz - e, p);
  const len = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / len;
  out[1] = dy / len;
  out[2] = dz / len;
}
