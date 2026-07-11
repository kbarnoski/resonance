// ─────────────────────────────────────────────────────────────────────────────
// growth.ts — the STATE MACHINE WITH MEMORY that grows the cathedral.
//
// A space-colonization algorithm (Runions et al., "Modeling and visualization of
// leaf venation patterns", 2005 — itself a descendant of Lindenmayer's L-systems):
// a cloud of ATTRACTION POINTS is shaped like a gothic cathedral (ribbed pillars
// flaring at the base, an arched vault, a tapering spire). A small set of ROOT
// nodes at the base then grows toward the nearest attractors, one strut at a time.
// Each attractor a branch reaches is CONSUMED and fires a growth EVENT (→ a bell).
//
// The node list only ever ACCUMULATES — this is genuine memory, not a loop. A
// sparse sapling at minute 1 is a towering cathedral of thousands of struts by
// minute 10, and the structure at minute 10 is topologically different from
// minute 1. Growth is paced against a wall-clock DURATION so it tracks the long
// arc regardless of the algorithm's internal dynamics.
//
// Deterministic: seeded mulberry32 only. No Math.random / Date anywhere.
// ─────────────────────────────────────────────────────────────────────────────

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

export interface GrowthEvent {
  x: number;
  y: number;
  z: number;
  /** normalized height 0 (base) .. 1 (spire tip) */
  h: number;
}

const TWO_PI = 6.283185307179586;

export class CathedralGrowth {
  readonly H = 9; // total height in world units
  readonly Rmax = 3.1; // base flare radius
  readonly MAX_NODES = 8000;

  private readonly D = 0.1; // step length per growth increment (fine struts)
  private readonly di = 1.55; // influence radius (attractor can pull a node)
  private readonly dk = 0.21; // kill radius (attractor consumed)
  private readonly cell = 1.55; // spatial-grid cell (== di)
  private readonly sectors = 8; // ribbed pillars → gothic / mandala symmetry

  // node arrays (parallel) — the accumulating memory of the structure
  nx: number[] = [];
  ny: number[] = [];
  nz: number[] = [];
  parent: number[] = [];

  // attractor cloud (the cathedral's target silhouette)
  private ax: number[] = [];
  private ay: number[] = [];
  private az: number[] = [];
  private aAlive: boolean[] = [];
  private aliveCount = 0;
  private totalAttr = 0;

  private grid = new Map<number, number[]>();
  private readonly seed: number;
  private rand: () => number;

  done = false;

  constructor(seed = 0x5eed0a11) {
    this.seed = seed >>> 0;
    this.rand = mulberry32(this.seed);
    this.reset();
  }

  get nodeCount(): number {
    return this.nx.length;
  }

  /** 0 (sapling) .. 1 (fully realized cathedral). */
  get progress(): number {
    return this.totalAttr > 0 ? 1 - this.aliveCount / this.totalAttr : 1;
  }

  // ── setup / reset ──────────────────────────────────────────────────────────
  reset(): void {
    this.rand = mulberry32(this.seed);
    this.nx = [];
    this.ny = [];
    this.nz = [];
    this.parent = [];
    this.ax = [];
    this.ay = [];
    this.az = [];
    this.aAlive = [];
    this.grid.clear();
    this.done = false;

    this.grow_attractors();

    // Root nodes: one at the foot of each pillar, plus a central one, so the
    // structure climbs as ribbed columns before branching into the vault.
    const rootR = this.Rmax * 0.7;
    for (let k = 0; k < this.sectors; k++) {
      const ang = (k / this.sectors) * TWO_PI;
      this.grow_pushNode(Math.cos(ang) * rootR, 0, Math.sin(ang) * rootR, -1);
    }
    this.grow_pushNode(0, 0, 0, -1);
  }

  private grow_attractors(): void {
    const N = 1950;
    for (let i = 0; i < N; i++) {
      // Height: bias slightly toward the lower body (denser nave, sparser spire).
      const u = this.rand();
      const t = Math.pow(u, 1.25);
      const y = t * this.H;

      // Gothic silhouette: wide flared base, gentle nave bulge, taper to a spire.
      let env = this.Rmax * Math.pow(1 - t, 0.72);
      env *= 1 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.05));
      if (env < 0.04) env = 0.04;

      // Ribbed pillars: quantize angle into sectors with jitter → columns + arches.
      const sector = Math.floor(this.rand() * this.sectors);
      const jitter = (this.rand() - 0.5) * (TWO_PI / this.sectors) * 0.85;
      const ang = (sector / this.sectors) * TWO_PI + jitter;

      // Shell-with-interior radius so pillars read but the vault fills in.
      const r = env * (0.5 + 0.5 * this.rand());

      this.ax.push(Math.cos(ang) * r);
      this.ay.push(y);
      this.az.push(Math.sin(ang) * r);
      this.aAlive.push(true);
    }
    this.aliveCount = N;
    this.totalAttr = N;
  }

  // ── spatial grid ─────────────────────────────────────────────────────────
  private grow_key(x: number, y: number, z: number): number {
    const c = this.cell;
    const ix = Math.floor(x / c) + 512;
    const iy = Math.floor(y / c) + 512;
    const iz = Math.floor(z / c) + 512;
    return (ix * 1024 + iy) * 1024 + iz;
  }

  private grow_pushNode(x: number, y: number, z: number, par: number): number {
    const idx = this.nx.length;
    this.nx.push(x);
    this.ny.push(y);
    this.nz.push(z);
    this.parent.push(par);
    const key = this.grow_key(x, y, z);
    const bucket = this.grid.get(key);
    if (bucket) bucket.push(idx);
    else this.grid.set(key, [idx]);
    return idx;
  }

  private grow_nearest(x: number, y: number, z: number, radius: number): number {
    const c = this.cell;
    const R = Math.max(1, Math.ceil(radius / c));
    const bix = Math.floor(x / c) + 512;
    const biy = Math.floor(y / c) + 512;
    const biz = Math.floor(z / c) + 512;
    const r2 = radius * radius;
    let best = -1;
    let bestD = r2;
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dz = -R; dz <= R; dz++) {
          const key = ((bix + dx) * 1024 + (biy + dy)) * 1024 + (biz + dz);
          const bucket = this.grid.get(key);
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const j = bucket[b];
            const ex = this.nx[j] - x;
            const ey = this.ny[j] - y;
            const ez = this.nz[j] - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < bestD) {
              bestD = d;
              best = j;
            }
          }
        }
      }
    }
    return best;
  }

  // ── one growth increment ───────────────────────────────────────────────────
  stepOnce(): GrowthEvent[] {
    const events: GrowthEvent[] = [];
    if (this.done) return events;

    // 1. Associate each live attractor with its nearest node (within influence).
    const assoc = new Map<number, number[]>(); // node → [dx,dy,dz,count]
    for (let a = 0; a < this.aAlive.length; a++) {
      if (!this.aAlive[a]) continue;
      const j = this.grow_nearest(this.ax[a], this.ay[a], this.az[a], this.di);
      if (j < 0) continue;
      let dx = this.ax[a] - this.nx[j];
      let dy = this.ay[a] - this.ny[j];
      let dz = this.az[a] - this.nz[j];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const e = assoc.get(j);
      if (e) {
        e[0] += dx;
        e[1] += dy;
        e[2] += dz;
        e[3] += 1;
      } else {
        assoc.set(j, [dx, dy, dz, 1]);
      }
    }

    if (assoc.size === 0) {
      // No node can reach any attractor — the structure has stalled: it is done.
      this.done = true;
      return events;
    }

    // 2. Each influenced node extends one strut toward the averaged direction.
    let grew = 0;
    assoc.forEach((e, j) => {
      if (this.nx.length >= this.MAX_NODES) return;
      let dx = e[0];
      let dy = e[1];
      let dz = e[2];
      let len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) {
        dx = this.rand() - 0.5;
        dy = this.rand();
        dz = this.rand() - 0.5;
        len = Math.hypot(dx, dy, dz) || 1;
      }
      dy += 0.14 * len; // gentle upward bias — the cathedral ASCENDS
      len = Math.hypot(dx, dy, dz) || 1;
      const jit = (this.rand() - 0.5) * this.D * 0.12;
      const nxp = this.nx[j] + (dx / len) * this.D + jit;
      const nyp = this.ny[j] + (dy / len) * this.D + (this.rand() - 0.5) * this.D * 0.06;
      const nzp = this.nz[j] + (dz / len) * this.D + (this.rand() - 0.5) * this.D * 0.12;
      this.grow_pushNode(nxp, nyp, nzp, j);
      grew++;
    });

    if (grew === 0) {
      this.done = true;
      return events;
    }

    // 3. Consume attractors now within kill radius of the freshly grown nodes.
    for (let a = 0; a < this.aAlive.length; a++) {
      if (!this.aAlive[a]) continue;
      const j = this.grow_nearest(this.ax[a], this.ay[a], this.az[a], this.dk);
      if (j >= 0) {
        this.aAlive[a] = false;
        this.aliveCount--;
        events.push({ x: this.ax[a], y: this.ay[a], z: this.az[a], h: this.ay[a] / this.H });
      }
    }

    if (this.aliveCount <= 0 || this.nx.length >= this.MAX_NODES) this.done = true;
    return events;
  }

  /** Advance growth until `progress` reaches `target` (0..1), bounded by
   *  `maxIters` increments this call so a fast-forward frame can't hitch. */
  catchUp(target: number, maxIters = 6): GrowthEvent[] {
    const out: GrowthEvent[] = [];
    let iters = 0;
    while (!this.done && this.progress < target && iters < maxIters) {
      const evs = this.stepOnce();
      for (let i = 0; i < evs.length; i++) out.push(evs[i]);
      iters++;
    }
    return out;
  }
}
