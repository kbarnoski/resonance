/**
 * Diffusion-Limited Aggregation engine for the Frost Lattice.
 *
 * On-lattice DLA (Witten & Sander, 1981): random walkers launch from a
 * bounding circle just outside the current crystal, wander (with a light
 * inward bias for speed), and FREEZE the instant they touch the aggregate.
 * Each frozen particle records its parent so a branch segment can be drawn,
 * plus its radius from the nearest nucleation seed and its generation.
 *
 * Neighbour lookup is O(1): the occupancy Map itself is the spatial hash,
 * keyed by lattice cell. Everything is driven by a seeded PRNG (constant
 * 0x2028) advanced off the animation clock — no Math.random / Date.now — so
 * the crystal grows deterministically and identically on every headless load.
 */

export interface FrozenPoint {
  /** Lattice coordinates, origin at field centre. */
  x: number;
  y: number;
  /** Parent (the aggregate cell this particle stuck to). Seeds parent = self. */
  px: number;
  py: number;
  /** Distance from the nearest seed, in lattice units. */
  radius: number;
  /** Branch generation (seed = 0). */
  gen: number;
}

// mulberry32 — small, fast, deterministic.
function makePrng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Von Neumann 4-neighbourhood: open, fern-like dendrites (not blobby).
const NEI: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const KEY_OFFSET = 512;
const KEY_SPAN = 1024;

function cellKey(x: number, y: number): number {
  return (x + KEY_OFFSET) * KEY_SPAN + (y + KEY_OFFSET);
}

interface Walker {
  x: number;
  y: number;
}

export interface DlaOptions {
  /** Field radius in lattice units (crystals cannot grow past this). */
  boundR?: number;
  /** Maximum frozen particles before growth halts. */
  cap?: number;
  /** Live random walkers (also the on-screen dot count). Keep <= 24. */
  walkers?: number;
  /** PRNG seed. */
  seed?: number;
}

export class Dla {
  readonly frozen = new Map<number, FrozenPoint>();
  readonly cap: number;
  readonly boundR: number;
  maxRadius = 1;

  private rnd: () => number;
  private seeds: Array<{ x: number; y: number }> = [];
  private walkers: Walker[] = [];
  private spawnR = 6;
  private killR = 30;

  constructor(opts: DlaOptions = {}) {
    this.boundR = opts.boundR ?? 205;
    this.cap = opts.cap ?? 3000;
    this.rnd = makePrng(opts.seed ?? 0x2028);
    const n = Math.min(24, Math.max(1, opts.walkers ?? 18));
    for (let i = 0; i < n; i++) this.walkers.push({ x: 0, y: 0 });
  }

  /** Read-only view for rendering the live walker dots. */
  get walkerPoints(): ReadonlyArray<{ x: number; y: number }> {
    return this.walkers;
  }

  get frozenCount(): number {
    return this.frozen.size;
  }

  get done(): boolean {
    return this.frozen.size >= this.cap;
  }

  /** Drop a nucleation seed at a lattice cell. Returns the frozen seed. */
  addSeed(x: number, y: number): FrozenPoint | null {
    const gx = Math.round(x);
    const gy = Math.round(y);
    if (gx * gx + gy * gy > this.boundR * this.boundR) return null;
    const k = cellKey(gx, gy);
    if (this.frozen.has(k)) return null;
    const pt: FrozenPoint = { x: gx, y: gy, px: gx, py: gy, radius: 0, gen: 0 };
    this.frozen.set(k, pt);
    this.seeds.push({ x: gx, y: gy });
    this.updateBounds(0);
    // Re-fling every walker so they orbit the (possibly larger) frontier.
    for (const w of this.walkers) this.respawn(w);
    return pt;
  }

  /**
   * Advance the simulation. Runs `microSteps` random-walk ticks across every
   * walker and returns the particles frozen during this call (in freeze order).
   */
  step(microSteps: number): FrozenPoint[] {
    const out: FrozenPoint[] = [];
    if (this.done || this.seeds.length === 0) return out;
    for (let s = 0; s < microSteps; s++) {
      for (let w = 0; w < this.walkers.length; w++) {
        const f = this.advance(this.walkers[w]);
        if (f) {
          out.push(f);
          this.respawn(this.walkers[w]);
          if (this.done) return out;
        }
      }
    }
    return out;
  }

  private advance(w: Walker): FrozenPoint | null {
    // Contact test against the aggregate (4-neighbourhood).
    for (let i = 0; i < NEI.length; i++) {
      const nx = w.x + NEI[i][0];
      const ny = w.y + NEI[i][1];
      if (this.frozen.has(cellKey(nx, ny))) {
        return this.freezeAt(w.x, w.y, nx, ny);
      }
    }

    // Move. Light inward bias speeds up encounters with the frontier.
    let dir: readonly [number, number];
    if (this.rnd() < 0.18) {
      // Step toward centre along the dominant axis.
      if (Math.abs(w.x) >= Math.abs(w.y)) {
        dir = w.x > 0 ? NEI[1] : NEI[0];
      } else {
        dir = w.y > 0 ? NEI[3] : NEI[2];
      }
    } else {
      dir = NEI[(this.rnd() * 4) | 0];
    }
    w.x += dir[0];
    w.y += dir[1];

    if (w.x * w.x + w.y * w.y > this.killR * this.killR) this.respawn(w);
    return null;
  }

  private freezeAt(x: number, y: number, px: number, py: number): FrozenPoint {
    let best = Infinity;
    for (let i = 0; i < this.seeds.length; i++) {
      const dx = x - this.seeds[i].x;
      const dy = y - this.seeds[i].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    const parent = this.frozen.get(cellKey(px, py));
    const pt: FrozenPoint = {
      x,
      y,
      px,
      py,
      radius: best,
      gen: (parent ? parent.gen : 0) + 1,
    };
    this.frozen.set(cellKey(x, y), pt);
    this.updateBounds(best);
    return pt;
  }

  private updateBounds(radius: number): void {
    if (radius > this.maxRadius) this.maxRadius = radius;
    // Launch walkers just outside the frontier; recapture strays a bit past.
    this.spawnR = Math.min(this.boundR, this.maxRadius + 10);
    this.killR = Math.min(this.boundR + 24, this.spawnR + 26);
  }

  private respawn(w: Walker): void {
    const a = this.rnd() * Math.PI * 2;
    w.x = Math.round(Math.cos(a) * this.spawnR);
    w.y = Math.round(Math.sin(a) * this.spawnR);
  }
}
