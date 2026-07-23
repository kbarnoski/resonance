// Shared simulation core for the 2402-sandfall granular instrument.
//
// A grain field lives in a fixed logical world box (WORLD_W x WORLD_H,
// aspect 3:2). Grains fall under gravity, collide, and pile up via a
// Position-Based-Dynamics (PBD) granular solver: predict positions, then
// relax overlaps by pushing neighbouring grains apart. PBD is chosen for
// stability — corrections are bounded, so the field never explodes even
// with big time steps or a hard avalanche.
//
// The CPU implementation here IS the graceful-degradation fallback (used
// when WebGPU is unavailable) and also defines the constants + PRNG shared
// with the WebGPU compute path (see gpu.ts / shaders.ts).
//
// Determinism: every stochastic choice (pour spread, shake jitter) draws
// from a seeded mulberry32 PRNG. No Math.random / Date anywhere — the
// silent auto-demo must replay identically on every load.

export const SEED = 0x2402;

export const WORLD_W = 1.5;
export const WORLD_H = 1.0;

// Fixed simulation step (seconds). We advance the field frame-by-frame at a
// constant dt regardless of wall-clock fps, so the sim (and the auto-demo)
// is fully deterministic.
export const DT = 1 / 60;

export const GRAVITY = 2.2; // world units / s^2, +y is down (screen-style)

/** Seeded PRNG. Deterministic across reloads — the backbone of the
 *  reproducible silent demo. Never swap this for Math.random. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Grain radius sized so N grains fill a satisfying fraction of the bin. */
export function radiusForCount(n: number) {
  const fill = 0.62; // target packed area fraction
  return Math.sqrt((fill * WORLD_W * WORLD_H) / (n * Math.PI));
}

/** Per-frame aggregate the audio engine listens to. All values are
 *  normalised-ish so audio.ts can map them to sound directly. */
export interface SimStats {
  count: number; // active grains
  energy: number; // mean grain speed (motion)
  flow: number; // fraction of grains actively moving (0..1)
  fall: number; // mean downward speed (drives falling pitch)
  contact: number; // total collision correction this step (impact/trickle)
}

export interface SandSim {
  readonly kind: "gpu" | "cpu";
  readonly max: number;
  count: number;
  stats: SimStats;
  /** Emit up to `n` grains from world point (x,y) with stream velocity. */
  pour(x: number, y: number, vx: number, vy: number, n: number): void;
  /** Impulse the whole field so the pile avalanches. dir = -1 left, +1 right. */
  shake(dir: number): void;
  reset(): void;
  step(): void;
  /** Draw current state. GPU path renders itself; CPU path uses ctx. */
  render(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// CPU fallback: Canvas2D granular PBD. Fewer grains, same pour/avalanche/
// audio loop as the GPU path — a genuine instrument, not a stub.
// ---------------------------------------------------------------------------

export class CpuSim implements SandSim {
  readonly kind = "cpu" as const;
  readonly max: number;
  count = 0;
  stats: SimStats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };

  private r: number;
  private cell: number;
  private gx: number;
  private gy: number;
  private px: Float32Array;
  private py: Float32Array;
  private prevx: Float32Array;
  private prevy: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private head: Int32Array;
  private nxt: Int32Array;
  private rnd = mulberry32(SEED);
  private impX = 0;
  private impY = 0;
  private impLeft = 0;

  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, max: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.max = max;
    this.r = radiusForCount(max);
    this.cell = this.r * 2;
    this.gx = Math.ceil(WORLD_W / this.cell) + 1;
    this.gy = Math.ceil(WORLD_H / this.cell) + 1;
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.prevx = new Float32Array(max);
    this.prevy = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.head = new Int32Array(this.gx * this.gy);
    this.nxt = new Int32Array(max);
  }

  reset() {
    this.count = 0;
    this.stats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };
  }

  pour(x: number, y: number, vx: number, vy: number, n: number) {
    const r = this.r;
    for (let k = 0; k < n && this.count < this.max; k++) {
      const i = this.count++;
      const sx = (this.rnd() - 0.5) * r * 6;
      this.px[i] = clamp(x + sx, r, WORLD_W - r);
      this.py[i] = clamp(y + (this.rnd() - 0.5) * r * 2, r, WORLD_H - r);
      this.vx[i] = vx + (this.rnd() - 0.5) * 0.15;
      this.vy[i] = vy + 0.35 + this.rnd() * 0.15;
    }
  }

  shake(dir: number) {
    this.impX = dir * 1.35;
    this.impY = -0.25; // slight lift to unstick the pile
    this.impLeft = 3; // apply over a few frames for a swell, not a pop
  }

  step() {
    const n = this.count;
    if (n === 0) {
      this.stats = { count: 0, energy: 0, flow: 0, fall: 0, contact: 0 };
      return;
    }
    const r = this.r;
    const d = r * 2;
    const dt = DT;
    let impX = 0;
    let impY = 0;
    if (this.impLeft > 0) {
      impX = this.impX;
      impY = this.impY;
      this.impLeft--;
    }

    // Predict.
    for (let i = 0; i < n; i++) {
      this.prevx[i] = this.px[i];
      this.prevy[i] = this.py[i];
      this.vy[i] += GRAVITY * dt;
      if (impX !== 0 || impY !== 0) {
        this.vx[i] += impX + (this.rnd() - 0.5) * 0.1;
        this.vy[i] += impY;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.px[i] = clamp(this.px[i], r, WORLD_W - r);
      this.py[i] = clamp(this.py[i], r, WORLD_H - r);
    }

    // Relax overlaps (Gauss-Seidel, deterministic by index order).
    let contact = 0;
    for (let iter = 0; iter < 3; iter++) {
      this.buildGrid(n);
      for (let i = 0; i < n; i++) {
        const cx = Math.floor(this.px[i] / this.cell);
        const cy = Math.floor(this.py[i] / this.cell);
        for (let oy = -1; oy <= 1; oy++) {
          const gyv = cy + oy;
          if (gyv < 0 || gyv >= this.gy) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const gxv = cx + ox;
            if (gxv < 0 || gxv >= this.gx) continue;
            let j = this.head[gyv * this.gx + gxv];
            while (j !== -1) {
              if (j > i) {
                let dx = this.px[j] - this.px[i];
                let dy = this.py[j] - this.py[i];
                const dist = Math.hypot(dx, dy);
                if (dist < d && dist > 1e-6) {
                  const overlap = (d - dist) * 0.5;
                  dx /= dist;
                  dy /= dist;
                  this.px[i] -= dx * overlap;
                  this.py[i] -= dy * overlap;
                  this.px[j] += dx * overlap;
                  this.py[j] += dy * overlap;
                  if (iter === 2) contact += overlap;
                } else if (dist <= 1e-6) {
                  // Perfectly coincident — nudge deterministically.
                  this.px[j] += d * 0.5;
                }
                j = this.nxt[j];
              } else {
                j = this.nxt[j];
              }
            }
          }
        }
        this.px[i] = clamp(this.px[i], r, WORLD_W - r);
        this.py[i] = clamp(this.py[i], r, WORLD_H - r);
      }
    }

    // Derive velocity from displacement, damp, and gather stats.
    let speedSum = 0;
    let fallSum = 0;
    let moving = 0;
    for (let i = 0; i < n; i++) {
      let nvx = (this.px[i] - this.prevx[i]) / dt;
      let nvy = (this.py[i] - this.prevy[i]) / dt;
      nvx *= 0.985;
      nvy *= 0.985;
      this.vx[i] = nvx;
      this.vy[i] = nvy;
      const sp = Math.hypot(nvx, nvy);
      speedSum += sp;
      if (nvy > 0) fallSum += nvy;
      if (sp > 0.03) moving++;
    }
    this.stats = {
      count: n,
      energy: speedSum / n,
      flow: moving / n,
      fall: fallSum / n,
      contact: (contact / n) * 60,
    };
  }

  private buildGrid(n: number) {
    this.head.fill(-1);
    for (let i = 0; i < n; i++) {
      const cx = clamp(Math.floor(this.px[i] / this.cell), 0, this.gx - 1);
      const cy = clamp(Math.floor(this.py[i] / this.cell), 0, this.gy - 1);
      const c = cy * this.gx + cx;
      this.nxt[i] = this.head[c];
      this.head[c] = i;
    }
  }

  render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = cw / WORLD_W;
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, cw, ch);

    // Bin walls.
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = Math.max(1, cw * 0.002);
    ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

    const rpx = Math.max(1, this.r * scale * 1.1);
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      // Settled grains: deep violet. Moving grains: brighten toward white.
      const t = clamp(sp / 1.2, 0, 1);
      const l = 30 + t * 60;
      const s = 70 - t * 45;
      ctx.fillStyle = `hsl(${268 - t * 20}, ${s}%, ${l}%)`;
      const x = this.px[i] * scale;
      const y = this.py[i] * scale;
      ctx.fillRect(x - rpx, y - rpx, rpx * 2, rpx * 2);
    }
  }

  destroy() {
    // No GPU resources to release for the CPU path.
  }
}
