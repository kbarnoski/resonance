// es.ts — a separable CMA-ES ("CMA-ES-lite") that hunts the synth patch.
//
// The FM patch's timbre space is non-convex and its gradients are nasty
// (ratio in particular is wildly multimodal), so instead of differentiating
// the graph we use a population search: sample a cloud of candidates from a
// Gaussian, keep the best, and adapt the Gaussian's mean, per-axis variance
// and global step-size toward the winners. This is the diagonal ("separable")
// variant of Hansen's CMA-ES (Hansen 2006; Ros & Hansen 2008), driven purely
// by the seeded RNG so the whole run is reproducible.

import { gaussian } from "./rng";

/** Result of scoring one candidate: its loss plus where it lands in the
 *  2-D timbre plane (for the point-cloud visual). */
export interface Eval {
  fitness: number; // lower is better (spectral loss)
  x: number;
  y: number;
}

export interface Candidate extends Eval {
  vec: number[]; // normalized parameters in [0,1]^dim
}

export interface Generation {
  gen: number;
  candidates: Candidate[];
  best: Candidate; // best in THIS generation
  meanX: number;
  meanY: number;
}

export interface ESOptions {
  dim: number;
  lambda: number;
  rand: () => number; // seeded uniform source
  initSigma?: number;
  initMean?: number[];
  evaluate: (vec: number[]) => Eval;
}

export interface ES {
  step(): Generation;
  readonly generation: number;
}

/** Build a separable CMA-ES instance. */
export function createES(opts: ESOptions): ES {
  const { dim, lambda, rand, evaluate } = opts;
  const mu = Math.max(1, Math.floor(lambda / 2));

  // Recombination weights (log-decreasing), normalized to sum 1.
  const w = new Array<number>(mu);
  let wsum = 0;
  for (let i = 0; i < mu; i++) {
    w[i] = Math.log(mu + 0.5) - Math.log(i + 1);
    wsum += w[i];
  }
  for (let i = 0; i < mu; i++) w[i] /= wsum;
  let mueffInv = 0;
  for (let i = 0; i < mu; i++) mueffInv += w[i] * w[i];
  const mueff = 1 / mueffInv;

  // Adaptation constants (standard CMA-ES defaults).
  const cc = (4 + mueff / dim) / (dim + 4 + (2 * mueff) / dim);
  const cs = (mueff + 2) / (dim + mueff + 5);
  const c1 = 2 / ((dim + 1.3) * (dim + 1.3) + mueff);
  const cmu = Math.min(
    1 - c1,
    (2 * (mueff - 2 + 1 / mueff)) / ((dim + 2) * (dim + 2) + mueff),
  );
  const damps =
    1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (dim + 1)) - 1) + cs;
  const chiN =
    Math.sqrt(dim) * (1 - 1 / (4 * dim) + 1 / (21 * dim * dim));

  const mean = (opts.initMean ?? new Array<number>(dim).fill(0.5)).slice();
  let sigma = opts.initSigma ?? 0.35;
  const C = new Array<number>(dim).fill(1); // diagonal covariance
  const D = new Array<number>(dim).fill(1); // per-axis std = sqrt(C)
  const pc = new Array<number>(dim).fill(0);
  const ps = new Array<number>(dim).fill(0);
  let gen = 0;

  function step(): Generation {
    gen += 1;
    // Sample the population from the seeded Gaussian.
    const zs: number[][] = [];
    const ys: number[][] = [];
    const cands: Candidate[] = [];
    for (let k = 0; k < lambda; k++) {
      const z = new Array<number>(dim);
      const y = new Array<number>(dim);
      const vec = new Array<number>(dim);
      for (let j = 0; j < dim; j++) {
        z[j] = gaussian(rand);
        y[j] = D[j] * z[j];
        let v = mean[j] + sigma * y[j];
        if (v < 0) v = 0;
        else if (v > 1) v = 1;
        vec[j] = v;
      }
      const e = evaluate(vec);
      zs.push(z);
      ys.push(y);
      cands.push({ vec, fitness: e.fitness, x: e.x, y: e.y });
    }

    // Rank by fitness (ascending: best = lowest loss).
    const order = cands
      .map((_, i) => i)
      .sort((a, b) => cands[a].fitness - cands[b].fitness);

    // Weighted recombination over the mu best.
    const yw = new Array<number>(dim).fill(0);
    const zw = new Array<number>(dim).fill(0);
    for (let i = 0; i < mu; i++) {
      const idx = order[i];
      for (let j = 0; j < dim; j++) {
        yw[j] += w[i] * ys[idx][j];
        zw[j] += w[i] * zs[idx][j];
      }
    }

    // Move the mean.
    for (let j = 0; j < dim; j++) {
      let m = mean[j] + sigma * yw[j];
      if (m < 0) m = 0;
      else if (m > 1) m = 1;
      mean[j] = m;
    }

    // Step-size control (cumulative path length; separable ⇒ ps uses z).
    const csFac = Math.sqrt(cs * (2 - cs) * mueff);
    let psNorm2 = 0;
    for (let j = 0; j < dim; j++) {
      ps[j] = (1 - cs) * ps[j] + csFac * zw[j];
      psNorm2 += ps[j] * ps[j];
    }
    const psNorm = Math.sqrt(psNorm2);
    const hsig =
      psNorm / Math.sqrt(1 - Math.pow(1 - cs, 2 * gen)) / chiN <
      1.4 + 2 / (dim + 1)
        ? 1
        : 0;

    // Covariance adaptation (rank-one + rank-mu on the diagonal).
    const ccFac = Math.sqrt(cc * (2 - cc) * mueff);
    for (let j = 0; j < dim; j++) {
      pc[j] = (1 - cc) * pc[j] + hsig * ccFac * yw[j];
      let rankMu = 0;
      for (let i = 0; i < mu; i++) {
        const yj = ys[order[i]][j];
        rankMu += w[i] * yj * yj;
      }
      C[j] =
        (1 - c1 - cmu) * C[j] +
        c1 * (pc[j] * pc[j] + (1 - hsig) * cc * (2 - cc) * C[j]) +
        cmu * rankMu;
      D[j] = Math.sqrt(Math.max(C[j], 1e-8));
    }

    sigma *= Math.exp((cs / damps) * (psNorm / chiN - 1));
    if (sigma > 1) sigma = 1;
    if (sigma < 1e-4) sigma = 1e-4;

    // Timbre-plane mean position (average of the population).
    let mx = 0;
    let my = 0;
    for (const c of cands) {
      mx += c.x;
      my += c.y;
    }
    mx /= lambda;
    my /= lambda;

    return {
      gen,
      candidates: cands,
      best: cands[order[0]],
      meanX: mx,
      meanY: my,
    };
  }

  return {
    step,
    get generation() {
      return gen;
    },
  };
}
