// Boids flock — the orchestra.
//
// Classic Reynolds (1987) rules (separation / alignment / cohesion) over typed
// arrays, in a normalised [0,1]x[0,1] domain. The motion centroid becomes a
// moving attractor the flock is herded toward; motion energy scales the flock's
// speed and agitation. The flock is partitioned into x-position bands — each
// band is a cluster that later drives one voice.

import type { FlowSignals } from "./flow";

/** Deterministic PRNG (Bo Cook / mulberry32). No Math.random anywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClusterStat {
  /** Mean y of the cluster, 0..1 (0 = top). */
  meanY: number;
  /** Mean x of the cluster, 0..1. */
  meanX: number;
  /** Alignment 0..1 — how coherently the cluster flies (tightness proxy). */
  tightness: number;
  /** Fraction of the flock in this cluster, 0..1. */
  weight: number;
}

export class Flock {
  readonly n: number;
  readonly clusterCount: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly speed: Float32Array;
  readonly cluster: Uint8Array;

  constructor(n: number, clusterCount: number, seed: number) {
    this.n = n;
    this.clusterCount = clusterCount;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.cluster = new Uint8Array(n);

    const rnd = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      this.px[i] = rnd();
      this.py[i] = rnd();
      const ang = rnd() * Math.PI * 2;
      const sp = 0.04 + rnd() * 0.04;
      this.vx[i] = Math.cos(ang) * sp;
      this.vy[i] = Math.sin(ang) * sp;
    }
  }

  step(sig: FlowSignals, dt: number): void {
    const n = this.n;
    const { px, py, vx, vy, speed } = this;

    // Energy drives agitation: faster max speed and a stronger pull to the hand.
    const maxSpeed = 0.14 + sig.energy * 0.5;
    const attract = 0.9 + sig.energy * 3.2;
    const sepR = 0.045;
    const neiR = 0.11;
    const sepR2 = sepR * sepR;
    const neiR2 = neiR * neiR;

    for (let i = 0; i < n; i++) {
      let sepX = 0;
      let sepY = 0;
      let aliX = 0;
      let aliY = 0;
      let cohX = 0;
      let cohY = 0;
      let count = 0;

      const xi = px[i];
      const yi = py[i];

      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = px[j] - xi;
        const dy = py[j] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > neiR2 || d2 < 1e-9) continue;
        if (d2 < sepR2) {
          const inv = 1 / Math.sqrt(d2);
          sepX -= dx * inv;
          sepY -= dy * inv;
        }
        aliX += vx[j];
        aliY += vy[j];
        cohX += px[j];
        cohY += py[j];
        count++;
      }

      let ax = 0;
      let ay = 0;
      if (count > 0) {
        // Alignment.
        ax += (aliX / count - vx[i]) * 0.9;
        ay += (aliY / count - vy[i]) * 0.9;
        // Cohesion.
        ax += (cohX / count - xi) * 1.1;
        ay += (cohY / count - yi) * 1.1;
      }
      // Separation.
      ax += sepX * 0.02;
      ay += sepY * 0.02;

      // The conductor: herd toward the motion centroid.
      let hx = sig.cx - xi;
      let hy = sig.cy - yi;
      const hl = Math.hypot(hx, hy);
      if (hl > 1e-4) {
        hx /= hl;
        hy /= hl;
        // Draw in from afar; swirl (perpendicular) when very close so the flock
        // wheels around the hand rather than collapsing onto it.
        const swirl = Math.max(0, 0.25 - hl) * 6;
        ax += (hx + -hy * swirl) * attract * 0.12;
        ay += (hy + hx * swirl) * attract * 0.12;
      }
      // A nudge along the dominant motion direction (temporal push).
      ax += sig.dirX * sig.energy * 0.15;
      ay += sig.dirY * sig.energy * 0.15;

      let nvx = vx[i] + ax * dt;
      let nvy = vy[i] + ay * dt;

      // Speed clamp.
      const sp = Math.hypot(nvx, nvy);
      const minSpeed = 0.06;
      if (sp > maxSpeed) {
        nvx = (nvx / sp) * maxSpeed;
        nvy = (nvy / sp) * maxSpeed;
      } else if (sp < minSpeed && sp > 1e-5) {
        nvx = (nvx / sp) * minSpeed;
        nvy = (nvy / sp) * minSpeed;
      }
      vx[i] = nvx;
      vy[i] = nvy;
      speed[i] = Math.hypot(nvx, nvy);
    }

    // Integrate + wrap the toroidal domain.
    for (let i = 0; i < n; i++) {
      let x = px[i] + vx[i] * dt;
      let y = py[i] + vy[i] * dt;
      if (x < 0) x += 1;
      else if (x >= 1) x -= 1;
      if (y < 0) y += 1;
      else if (y >= 1) y -= 1;
      px[i] = x;
      py[i] = y;
    }

    // Assign clusters by x-band.
    const cc = this.clusterCount;
    for (let i = 0; i < n; i++) {
      let c = (px[i] * cc) | 0;
      if (c >= cc) c = cc - 1;
      this.cluster[i] = c;
    }
  }

  /** Aggregates per-cluster statistics for the audio mapping. */
  computeStats(out: ClusterStat[]): void {
    const cc = this.clusterCount;
    const n = this.n;
    const sumY = new Float32Array(cc);
    const sumX = new Float32Array(cc);
    const sumVX = new Float32Array(cc);
    const sumVY = new Float32Array(cc);
    const sumSp = new Float32Array(cc);
    const cnt = new Int32Array(cc);

    for (let i = 0; i < n; i++) {
      const c = this.cluster[i];
      sumX[c] += this.px[i];
      sumY[c] += this.py[i];
      sumVX[c] += this.vx[i];
      sumVY[c] += this.vy[i];
      sumSp[c] += this.speed[i];
      cnt[c]++;
    }

    for (let c = 0; c < cc; c++) {
      const k = cnt[c];
      if (k === 0) {
        out[c].meanX = (c + 0.5) / cc;
        out[c].meanY = 0.5;
        out[c].tightness = 0;
        out[c].weight = 0;
        continue;
      }
      out[c].meanX = sumX[c] / k;
      out[c].meanY = sumY[c] / k;
      // Alignment = |mean velocity| / mean speed  (1 = flying as one).
      const meanSp = sumSp[c] / k;
      const vlen = Math.hypot(sumVX[c] / k, sumVY[c] / k);
      out[c].tightness = meanSp > 1e-5 ? Math.min(1, vlen / meanSp) : 0;
      out[c].weight = k / n;
    }
  }
}

export function makeClusterStats(count: number): ClusterStat[] {
  const arr: ClusterStat[] = [];
  for (let c = 0; c < count; c++) {
    arr.push({ meanX: (c + 0.5) / count, meanY: 0.5, tightness: 0, weight: 0 });
  }
  return arr;
}
