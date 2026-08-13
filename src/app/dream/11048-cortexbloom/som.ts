// som.ts — a faithful Kohonen self-organizing map (Kohonen 1982).
//
// A GxG sheet of neurons, each holding a weight vector w ∈ R^B. Fed input
// vectors one at a time, the sheet self-organises: the best-matching unit and
// its grid-neighbours are pulled toward the input, so over training the flat
// sheet becomes a topographic timbre-map — similar timbres end up adjacent.
//
// This module is pure logic (no DOM / no three.js): the page reads weights,
// the U-matrix, per-neuron spectral centroid and energy to render + sonify.

import { mulberry32 } from "./corpus";

export class Som {
  readonly G: number;
  readonly B: number;
  readonly T: number; // training horizon (steps) for the α/σ decay
  readonly weights: Float32Array; // G*G*B, row-major by neuron
  private readonly gx: Int16Array; // grid x per neuron
  private readonly gy: Int16Array; // grid y per neuron
  t = 0; // steps taken
  lastBmu = 0;

  // decay endpoints
  private readonly a0 = 0.5;
  private readonly a1 = 0.02;
  private readonly s1 = 0.8;
  private readonly s0: number; // ≈ G/2

  constructor(G = 22, B = 12, T = 6000, seed = 0x11048 ^ 0x53) {
    this.G = G;
    this.B = B;
    this.T = T;
    this.s0 = G / 2;
    const N = G * G;
    this.weights = new Float32Array(N * B);
    this.gx = new Int16Array(N);
    this.gy = new Int16Array(N);
    const rng = mulberry32(seed);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        this.gx[i] = x;
        this.gy[i] = y;
        for (let b = 0; b < B; b++) {
          // small seeded random init around 0.05
          this.weights[i * B + b] = 0.02 + rng() * 0.06;
        }
      }
    }
  }

  private progress(): number {
    return Math.min(1, this.t / this.T);
  }

  /** Learning rate α(t): 0.5 → 0.02 (exponential), floored for the live trickle. */
  alpha(): number {
    return this.a0 * Math.pow(this.a1 / this.a0, this.progress());
  }

  /** Neighbourhood radius σ(t): G/2 → 0.8 (exponential), floored for the trickle. */
  sigma(): number {
    return this.s0 * Math.pow(this.s1 / this.s0, this.progress());
  }

  /** Best matching unit for input x: index minimising ||x − w||². */
  bmu(x: Float32Array): number {
    const { weights, B } = this;
    const N = this.G * this.G;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const o = i * B;
      let d = 0;
      for (let b = 0; b < B; b++) {
        const diff = x[b] - weights[o + b];
        d += diff * diff;
      }
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** One Kohonen training step. Returns the BMU index (for sonification). */
  step(x: Float32Array): number {
    const { weights, B, gx, gy } = this;
    const N = this.G * this.G;
    const c = this.bmu(x);
    const cx = gx[c];
    const cy = gy[c];
    const a = this.alpha();
    const sig = this.sigma();
    const twoSig2 = 2 * sig * sig;

    for (let i = 0; i < N; i++) {
      const dx = gx[i] - cx;
      const dy = gy[i] - cy;
      const gd2 = dx * dx + dy * dy; // squared grid distance
      const h = Math.exp(-gd2 / twoSig2);
      if (h < 1e-3) continue; // negligible pull — skip for speed
      const scale = a * h;
      const o = i * B;
      for (let b = 0; b < B; b++) {
        weights[o + b] += scale * (x[b] - weights[o + b]);
      }
    }
    this.t++;
    this.lastBmu = c;
    return c;
  }

  /** Weight vector of a neuron (live view into the buffer). */
  neuron(i: number): Float32Array {
    return this.weights.subarray(i * this.B, i * this.B + this.B);
  }

  /**
   * U-matrix: for each neuron, the average L2 distance from its weight vector
   * to its (up to 4) grid neighbours. High = ridge between dissimilar regions,
   * low = smooth interior of a cluster.
   */
  uMatrix(out: Float32Array): void {
    const { G, B, weights } = this;
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        let sum = 0;
        let cnt = 0;
        const o = i * B;
        const nb = [
          x > 0 ? i - 1 : -1,
          x < G - 1 ? i + 1 : -1,
          y > 0 ? i - G : -1,
          y < G - 1 ? i + G : -1,
        ];
        for (const j of nb) {
          if (j < 0) continue;
          const oj = j * B;
          let d = 0;
          for (let b = 0; b < B; b++) {
            const diff = weights[o + b] - weights[oj + b];
            d += diff * diff;
          }
          sum += Math.sqrt(d);
          cnt++;
        }
        out[i] = cnt ? sum / cnt : 0;
      }
    }
  }

  /** Spectral centroid of a neuron's weight vector, normalised to 0..1. */
  centroid(i: number): number {
    const { B } = this;
    const o = i * this.B;
    let num = 0;
    let den = 0;
    for (let b = 0; b < B; b++) {
      const w = this.weights[o + b];
      num += w * b;
      den += w;
    }
    return den > 0 ? num / (den * (B - 1)) : 0;
  }

  /** Total energy (L2 norm) of a neuron's weight vector. */
  energy(i: number): number {
    const o = i * this.B;
    let s = 0;
    for (let b = 0; b < this.B; b++) s += this.weights[o + b] * this.weights[o + b];
    return Math.sqrt(s);
  }
}
