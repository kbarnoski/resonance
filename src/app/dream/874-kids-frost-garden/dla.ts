// dla.ts — Diffusion-Limited Aggregation on a coarse CPU lattice.
//
// Witten & Sander (1981): many "walker" particles random-walk across a field;
// when a walker steps adjacent to the frozen aggregate it STICKS irreversibly,
// becoming part of it. The result is a branched, scale-invariant dendritic /
// coral / frost structure. This is a genuine DLA sim, not a faked tree.
//
// Coordinates: the lattice is GRID x GRID cells. Aggregate cells are tracked in
// a Uint8Array occupancy map plus a list of frozen "tips" (stuck points) that
// carry an age and a normalized height so the renderer + audio can use them.

export const GRID = 256;

export interface StuckTip {
  gx: number; // grid x
  gy: number; // grid y
  nx: number; // normalized x in [0,1]
  ny: number; // normalized y in [0,1] (0 = bottom, 1 = top of field)
  age: number; // frames since it stuck (drives glow falloff)
  fresh: boolean; // true on the frame it stuck (drives chime + bright flash)
}

interface Walker {
  gx: number;
  gy: number;
  alive: boolean;
}

interface Seed {
  gx: number;
  gy: number;
  // pull bias: walkers near here drift toward it (child touched here)
  pullX: number;
  pullY: number;
  pullStrength: number; // decays over time
}

export interface DlaConfig {
  maxTips?: number;
  walkerCount?: number;
}

export class Dla {
  readonly grid = GRID;
  private occ: Uint8Array; // 0 empty, 1 aggregate
  tips: StuckTip[] = [];
  private walkers: Walker[] = [];
  private seeds: Seed[] = [];
  private maxTips: number;
  private walkerCount: number;
  // ring buffer of indices of tips that became fresh this step
  freshThisStep: number[] = [];

  constructor(cfg: DlaConfig = {}) {
    this.maxTips = cfg.maxTips ?? 6000;
    this.walkerCount = cfg.walkerCount ?? 420;
    this.occ = new Uint8Array(GRID * GRID);
  }

  private idx(gx: number, gy: number): number {
    return gy * GRID + gx;
  }

  private inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < GRID && gy >= 0 && gy < GRID;
  }

  // Plant an aggregate seed at a normalized point. Becomes a sticking site and
  // biases nearby walkers to drift toward it.
  plantSeed(nx: number, ny: number): void {
    const gx = Math.max(1, Math.min(GRID - 2, Math.round(nx * (GRID - 1))));
    const gy = Math.max(1, Math.min(GRID - 2, Math.round(ny * (GRID - 1))));
    if (this.occ[this.idx(gx, gy)] === 0) {
      this.occ[this.idx(gx, gy)] = 1;
      this.pushTip(gx, gy, true);
    }
    this.seeds.push({ gx, gy, pullX: gx, pullY: gy, pullStrength: 1 });
    // Spawn a fresh burst of walkers near this seed so it grows promptly.
    for (let i = 0; i < 60; i++) {
      this.spawnWalkerNear(gx, gy);
    }
  }

  // Re-bias existing seeds' pull toward a moving finger without planting.
  biasToward(nx: number, ny: number): void {
    const gx = nx * (GRID - 1);
    const gy = ny * (GRID - 1);
    for (const s of this.seeds) {
      s.pullX = gx;
      s.pullY = gy;
      s.pullStrength = Math.min(1, s.pullStrength + 0.25);
    }
  }

  private pushTip(gx: number, gy: number, fresh: boolean): void {
    this.tips.push({
      gx,
      gy,
      nx: gx / (GRID - 1),
      ny: gy / (GRID - 1),
      age: 0,
      fresh,
    });
    if (fresh) this.freshThisStep.push(this.tips.length - 1);
    // Auto-thin oldest tips so we never stall. Keep occupancy of thinned cells
    // (structure persists visually as faint base) but drop them from the active
    // glow/render list.
    if (this.tips.length > this.maxTips) {
      this.tips.splice(0, this.tips.length - this.maxTips);
    }
  }

  private spawnWalkerNear(gx: number, gy: number): Walker {
    const r = 8 + Math.random() * 22;
    const a = Math.random() * Math.PI * 2;
    let wx = Math.round(gx + Math.cos(a) * r);
    let wy = Math.round(gy + Math.sin(a) * r);
    wx = Math.max(0, Math.min(GRID - 1, wx));
    wy = Math.max(0, Math.min(GRID - 1, wy));
    const w: Walker = { gx: wx, gy: wy, alive: true };
    this.walkers.push(w);
    return w;
  }

  private spawnWalkerEdge(): Walker {
    // Spawn on a random edge of the lattice.
    let wx = 0;
    let wy = 0;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      wx = Math.floor(Math.random() * GRID);
      wy = 0;
    } else if (side === 1) {
      wx = Math.floor(Math.random() * GRID);
      wy = GRID - 1;
    } else if (side === 2) {
      wx = 0;
      wy = Math.floor(Math.random() * GRID);
    } else {
      wx = GRID - 1;
      wy = Math.floor(Math.random() * GRID);
    }
    const w: Walker = { gx: wx, gy: wy, alive: true };
    this.walkers.push(w);
    return w;
  }

  // Slow idle auto-seeding so the garden keeps changing during inactivity.
  idleDrip(): void {
    if (this.seeds.length === 0) return;
    const target = this.walkerCount;
    if (this.walkers.length < target) {
      this.spawnWalkerEdge();
    }
  }

  // Returns true if any of the 4-neighbours (and diagonals) is aggregate.
  private touchesAggregate(gx: number, gy: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (this.inBounds(x, y) && this.occ[this.idx(x, y)] === 1) {
          return true;
        }
      }
    }
    return false;
  }

  // Advance the whole simulation by one frame. `stepsPerWalker` random moves
  // are taken per walker per frame (a few helps coverage at 60fps).
  step(stepsPerWalker = 2): void {
    this.freshThisStep.length = 0;

    // Age existing tips and clear last frame's fresh flags.
    for (const t of this.tips) {
      t.age++;
      t.fresh = false;
    }

    // Decay seed pull over time.
    for (const s of this.seeds) {
      s.pullStrength *= 0.985;
    }

    // Top up walker pool toward target.
    while (this.walkers.length < this.walkerCount) {
      if (this.seeds.length > 0 && Math.random() < 0.5) {
        const s = this.seeds[Math.floor(Math.random() * this.seeds.length)];
        this.spawnWalkerNear(s.gx, s.gy);
      } else {
        this.spawnWalkerEdge();
      }
    }

    for (let s = 0; s < stepsPerWalker; s++) {
      for (let i = 0; i < this.walkers.length; i++) {
        const w = this.walkers[i];
        if (!w.alive) continue;

        // Stick if adjacent to aggregate.
        if (this.touchesAggregate(w.gx, w.gy)) {
          if (this.occ[this.idx(w.gx, w.gy)] === 0) {
            this.occ[this.idx(w.gx, w.gy)] = 1;
            this.pushTip(w.gx, w.gy, true);
          }
          w.alive = false;
          continue;
        }

        // Random move, optionally biased toward the nearest pulling seed.
        let dx = 0;
        let dy = 0;
        let biased = false;
        if (this.seeds.length > 0) {
          // Find strongest nearby pull.
          let best: Seed | null = null;
          let bestD = Infinity;
          for (const seed of this.seeds) {
            if (seed.pullStrength < 0.05) continue;
            const ddx = seed.pullX - w.gx;
            const ddy = seed.pullY - w.gy;
            const d = ddx * ddx + ddy * ddy;
            if (d < bestD) {
              bestD = d;
              best = seed;
            }
          }
          if (best && Math.random() < 0.32 * best.pullStrength) {
            dx = Math.sign(best.pullX - w.gx) || (Math.random() < 0.5 ? -1 : 1);
            dy = Math.sign(best.pullY - w.gy) || (Math.random() < 0.5 ? -1 : 1);
            biased = true;
          }
        }
        if (!biased) {
          const dir = Math.floor(Math.random() * 4);
          if (dir === 0) dx = 1;
          else if (dir === 1) dx = -1;
          else if (dir === 2) dy = 1;
          else dy = -1;
        }

        let nx = w.gx + dx;
        let ny = w.gy + dy;

        // Reflect off walls so walkers don't all leak out.
        if (nx < 0 || nx >= GRID) nx = w.gx - dx;
        if (ny < 0 || ny >= GRID) ny = w.gy - dy;
        w.gx = nx;
        w.gy = ny;

        // Stick check again after moving.
        if (this.touchesAggregate(w.gx, w.gy)) {
          if (this.occ[this.idx(w.gx, w.gy)] === 0) {
            this.occ[this.idx(w.gx, w.gy)] = 1;
            this.pushTip(w.gx, w.gy, true);
          }
          w.alive = false;
        }
      }
    }

    // Recycle dead walkers.
    const live: Walker[] = [];
    for (const w of this.walkers) {
      if (w.alive) live.push(w);
    }
    this.walkers = live;
  }

  // Expose free walkers for rendering (drifting glow points).
  getWalkers(): Walker[] {
    return this.walkers;
  }

  get tipCount(): number {
    return this.tips.length;
  }

  get seedCount(): number {
    return this.seeds.length;
  }

  reset(): void {
    this.occ.fill(0);
    this.tips.length = 0;
    this.walkers.length = 0;
    this.seeds.length = 0;
    this.freshThisStep.length = 0;
  }
}
