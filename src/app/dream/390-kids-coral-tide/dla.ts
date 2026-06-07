// CoralSim — Diffusion-Limited Aggregation (Witten & Sander, Phys. Rev. Lett. 47, 1981)
// with a downward settling bias so the aggregate grows UPWARD from a seabed.
//
// Walkers spawn at the top, drift down with Brownian jitter, and freeze when they
// come within stick-radius of an already-stuck particle. A spatial-hash grid keeps
// neighbour checks O(1). Each frozen particle records the horizontal DEPTH BAND it
// locked in — that band index drives the harmonic chord-stacking in audio.ts.

export interface Locked {
  x: number;        // pixel-space (0..1 normalised within sim width)
  y: number;
  band: number;     // 0 = lowest band near seabed, BANDS-1 = top
}

export interface CoralStep {
  locked: Locked[];        // particles that froze this step (ring a bell each)
  activeBands: boolean[];  // which bands currently contain ANY coral
  height01: number;        // 0..1 tallest reach of the reef (0 = seabed)
}

interface Stuck {
  x: number;
  y: number;
  band: number;
}

interface Walker {
  x: number;
  y: number;
}

export const BANDS = 6; // D-Dorian voices stacked bottom→top

export class CoralSim {
  readonly w: number;
  readonly h: number;
  readonly seabedY: number;     // pixel row of the seabed (near bottom)
  readonly bandTop: number;     // pixel row where bands begin (near top)
  readonly stickR: number;      // stick radius (px)
  readonly cell: number;        // spatial-hash cell size (px)

  private cols: number;
  private rows: number;
  private buckets: Map<number, Stuck[]> = new Map();
  stuck: Stuck[] = [];
  private walkers: Walker[] = [];
  private maxWalkers: number;

  activeBands: boolean[];
  private topReach: number;     // highest (smallest-y) stuck particle

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.seabedY = h * 0.9;
    this.bandTop = h * 0.12;
    this.stickR = Math.max(5, Math.min(w, h) * 0.011);
    this.cell = this.stickR * 2.2;
    this.cols = Math.ceil(w / this.cell) + 2;
    this.rows = Math.ceil(h / this.cell) + 2;
    this.maxWalkers = 90;
    this.activeBands = new Array(BANDS).fill(false);
    this.topReach = this.seabedY;

    // Seed the seabed with a scatter of stuck particles (band 0).
    const n = Math.max(8, Math.floor(w / (this.stickR * 4)));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (w / n) + (Math.random() - 0.5) * this.stickR;
      this.addStuck(x, this.seabedY, 0);
    }
    this.activeBands[0] = true;
  }

  private hashKey(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private cellOf(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cell), Math.floor(y / this.cell)];
  }

  private bandOf(y: number): number {
    // y near seabed → band 0; y near bandTop → top band.
    const span = this.seabedY - this.bandTop;
    if (span <= 0) return 0;
    const t = (this.seabedY - y) / span; // 0 at seabed, 1 at top
    const b = Math.floor(t * BANDS);
    return Math.max(0, Math.min(BANDS - 1, b));
  }

  private addStuck(x: number, y: number, band: number) {
    const s: Stuck = { x, y, band };
    this.stuck.push(s);
    const [cx, cy] = this.cellOf(x, y);
    const k = this.hashKey(cx, cy);
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    arr.push(s);
    if (y < this.topReach) this.topReach = y;
  }

  // Is point near any stuck particle? (3x3 spatial-hash neighbourhood)
  private nearStuck(x: number, y: number): boolean {
    const [cx, cy] = this.cellOf(x, y);
    const r2 = this.stickR * this.stickR;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.buckets.get(this.hashKey(cx + dx, cy + dy));
        if (!arr) continue;
        for (const s of arr) {
          const ddx = s.x - x;
          const ddy = s.y - y;
          if (ddx * ddx + ddy * ddy <= r2) return true;
        }
      }
    }
    return false;
  }

  private spawnWalker(): Walker {
    return {
      x: Math.random() * this.w,
      y: this.bandTop * (0.3 + Math.random() * 0.4),
    };
  }

  // step(intensity): intensity 0..1 = stir strength (shake / swish / idle current).
  // Higher intensity → more walkers and bigger steps → faster accretion.
  step(intensity: number): CoralStep {
    const I = Math.max(0, Math.min(1, intensity));
    const locked: Locked[] = [];

    // Maintain a walker population scaled by intensity.
    const want = Math.floor(8 + I * (this.maxWalkers - 8));
    while (this.walkers.length < want) this.walkers.push(this.spawnWalker());
    if (this.walkers.length > want) this.walkers.length = want;

    const drift = 0.5 + I * 1.6;     // downward settling bias
    const jitter = 1.0 + I * 1.4;    // Brownian jitter magnitude
    const stepsPerFrame = 1 + Math.floor(I * 3);

    for (let pass = 0; pass < stepsPerFrame; pass++) {
      for (let i = 0; i < this.walkers.length; i++) {
        const wk = this.walkers[i];
        // Brownian step + downward settling drift.
        wk.x += (Math.random() - 0.5) * 2 * jitter;
        wk.y += (Math.random() - 0.5) * 2 * jitter + drift;

        // Wrap horizontally, recycle if it drifts off the bottom.
        if (wk.x < 0) wk.x += this.w;
        else if (wk.x >= this.w) wk.x -= this.w;
        if (wk.y > this.seabedY + this.stickR) {
          this.walkers[i] = this.spawnWalker();
          continue;
        }

        // Freeze on adjacency to seabed or stuck set.
        if (wk.y >= this.seabedY - this.stickR || this.nearStuck(wk.x, wk.y)) {
          const y = Math.min(wk.y, this.seabedY);
          const band = this.bandOf(y);
          this.addStuck(wk.x, y, band);
          locked.push({ x: wk.x / this.w, y: y / this.h, band });
          if (!this.activeBands[band]) this.activeBands[band] = true;
          this.walkers[i] = this.spawnWalker();
        }
      }
    }

    const span = this.seabedY - this.bandTop;
    const height01 = span > 0 ? Math.max(0, Math.min(1, (this.seabedY - this.topReach) / span)) : 0;

    return { locked, activeBands: this.activeBands.slice(), height01 };
  }

  // Expose live walkers (drifting plankton) for rendering.
  forEachWalker(cb: (x: number, y: number) => void) {
    for (const wk of this.walkers) cb(wk.x, wk.y);
  }

  reset() {
    this.buckets.clear();
    this.stuck.length = 0;
    this.walkers.length = 0;
    this.activeBands.fill(false);
    this.topReach = this.seabedY;
    const n = Math.max(8, Math.floor(this.w / (this.stickR * 4)));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (this.w / n) + (Math.random() - 0.5) * this.stickR;
      this.addStuck(x, this.seabedY, 0);
    }
    this.activeBands[0] = true;
  }
}
