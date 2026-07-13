// ─────────────────────────────────────────────────────────────────────────────
// wave.ts — the shared physical model for the Wavefield Organ.
//
//   A real 2D damped wave equation on a square plate:
//
//       d²u/dt² = c² ∇²u        (discretised, damped)
//       u_next = ( 2·u_curr − u_prev + c² · laplacian(u_curr) ) · damping
//
//   The plate has FIXED (Dirichlet, u = 0) edges — a clamped membrane — so
//   energy stays on the plate and continuously-forced sinusoidal sources build
//   STANDING WAVES whose interference nodes are Ernst Chladni's cymatic figures.
//   (Contrast a "breathing-field / log-polar warp": that is a screen-space
//   remap of a texture and carries no physics. This is the genuine PDE — the
//   nodal lines emerge only from wave superposition on the grid.)
//
//   `advectParticles` then walks a cloud of points DOWN the gradient of the wave
//   energy (u²) — exactly what dry sand does on a Chladni plate: it flees the
//   antinodes and pools on the still nodal lines, drawing the figure.
//
//   Pure math, no DOM. The Canvas-2D fallback runs this file directly; the
//   WebGPU path (webgpu.ts) is a WGSL transliteration of the same equations on a
//   larger grid. A small CPU mirror of this always runs to drive the audio
//   envelope so the see = hear weld is identical on both backends.
// ─────────────────────────────────────────────────────────────────────────────

/** One just-intonation partial per steerable wave source (pure ratios). */
export const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3] as const;

/** Number of physical wave sources you steer across the plate. */
export const SOURCE_COUNT = JI_RATIOS.length;

/** Slow visual forcing rate per source (Hz). Kept well under 1 Hz so the
 *  brightness envelope (|u|, which pulses at 2×) never approaches the 3 Hz
 *  photosensitive floor — see the SAFETY note in the README. */
export const SOURCE_VIS_HZ = [0.55, 0.62, 0.5, 0.71, 0.58, 0.66] as const;

export interface SourceState {
  /** position on the plate, normalised 0..1 */
  x: number;
  y: number;
  /** signed instantaneous forcing amplitude this frame = A·sin(2π f t) */
  drive: number;
  /** which JI partial this source rings */
  ratioIdx: number;
}

export interface SimParams {
  /** c²·dt² coupling. Stability needs < 0.5; steered by tilt magnitude. */
  c2: number;
  /** per-step amplitude retention (<1 bleeds energy). */
  damping: number;
  /** how hard particles are pulled toward nodes (Chladni strength). */
  chladni: number;
  /** brownian jitter that keeps particles from freezing on a stale figure. */
  jitter: number;
}

/** A CPU wave plate: three ping-ponged height buffers, fixed edges. */
export class WaveField {
  readonly w: number;
  readonly h: number;
  prev: Float32Array;
  curr: Float32Array;
  private next: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.prev = new Float32Array(w * h);
    this.curr = new Float32Array(w * h);
    this.next = new Float32Array(w * h);
  }

  /** Add a gaussian-weighted forcing value at plate position (nx,ny in 0..1). */
  force(nx: number, ny: number, radiusCells: number, amp: number): void {
    if (amp === 0) return;
    const { w, h, curr } = this;
    const gx = nx * (w - 1);
    const gy = ny * (h - 1);
    const r2 = radiusCells * radiusCells;
    const x0 = Math.max(1, Math.floor(gx - radiusCells * 3));
    const x1 = Math.min(w - 2, Math.ceil(gx + radiusCells * 3));
    const y0 = Math.max(1, Math.floor(gy - radiusCells * 3));
    const y1 = Math.min(h - 2, Math.ceil(gy + radiusCells * 3));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        const dy = y - gy;
        curr[y * w + x] += amp * Math.exp(-(dx * dx + dy * dy) / r2);
      }
    }
  }

  /** Advance one wave-equation step. Edges are held at 0 (clamped plate). */
  step(p: SimParams): void {
    const { w, h, prev, curr, next } = this;
    const { c2, damping } = p;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap =
          curr[i - 1] + curr[i + 1] + curr[i - w] + curr[i + w] - 4 * curr[i];
        next[i] = (2 * curr[i] - prev[i] + c2 * lap) * damping;
      }
    }
    // Dirichlet boundary: the frame of the plate is pinned to zero.
    for (let x = 0; x < w; x++) {
      next[x] = 0;
      next[(h - 1) * w + x] = 0;
    }
    for (let y = 0; y < h; y++) {
      next[y * w] = 0;
      next[y * w + w - 1] = 0;
    }
    this.prev = curr;
    this.curr = next;
    this.next = prev;
  }

  /** Signed height at a normalised point (bilinear). */
  sample(nx: number, ny: number): number {
    const { w, h, curr } = this;
    const fx = Math.min(w - 1.001, Math.max(0, nx * (w - 1)));
    const fy = Math.min(h - 1.001, Math.max(0, ny * (h - 1)));
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const tx = fx - x;
    const ty = fy - y;
    const i = y * w + x;
    const a = curr[i] * (1 - tx) + curr[i + 1] * tx;
    const b = curr[i + w] * (1 - tx) + curr[i + w + 1] * tx;
    return a * (1 - ty) + b * ty;
  }

  /** RMS energy in a small window around a normalised point (audio probe). */
  energyAt(nx: number, ny: number, sample = 2): number {
    const { w, h, curr } = this;
    const cx = Math.round(nx * (w - 1));
    const cy = Math.round(ny * (h - 1));
    let acc = 0;
    let n = 0;
    for (let dy = -sample; dy <= sample; dy++) {
      const y = cy + dy;
      if (y < 1 || y >= h - 1) continue;
      for (let dx = -sample; dx <= sample; dx++) {
        const x = cx + dx;
        if (x < 1 || x >= w - 1) continue;
        const v = curr[y * w + x];
        acc += v * v;
        n++;
      }
    }
    return n ? Math.sqrt(acc / n) : 0;
  }
}

/** A CPU point cloud that drifts toward the wave's nodal lines (Chladni sand). */
export class ParticleCloudCPU {
  readonly count: number;
  /** x,y in 0..1 */
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** local |u| under each particle, for brightness (antinode → bright). */
  readonly lum: Float32Array;
  private seed = 0x1234abcd;

  constructor(count: number) {
    this.count = count;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.lum = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.px[i] = 0.06 + 0.88 * this.rnd();
      this.py[i] = 0.06 + 0.88 * this.rnd();
    }
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }

  step(field: WaveField, p: SimParams, dt: number): void {
    const { w, h } = field;
    const u = field.curr;
    const k = p.chladni;
    const jit = p.jitter;
    const damp = 0.82;
    for (let i = 0; i < this.count; i++) {
      const nx = this.px[i];
      const ny = this.py[i];
      const fx = Math.min(w - 2, Math.max(1, nx * (w - 1)));
      const fy = Math.min(h - 2, Math.max(1, ny * (h - 1)));
      const cx = fx | 0;
      const cy = fy | 0;
      const idx = cy * w + cx;
      const uc = u[idx];
      // ∇u by central difference → force = −k·∇(u²) = −2k·u·∇u  (toward nodes)
      const gx = (u[idx + 1] - u[idx - 1]) * 0.5;
      const gy = (u[idx + w] - u[idx - w]) * 0.5;
      let vX = this.vx[i] - 2 * k * uc * gx + (this.rnd() - 0.5) * jit;
      let vY = this.vy[i] - 2 * k * uc * gy + (this.rnd() - 0.5) * jit;
      vX *= damp;
      vY *= damp;
      let x = nx + vX * dt;
      let y = ny + vY * dt;
      // reflect at the rim
      if (x < 0.02) {
        x = 0.02;
        vX = -vX * 0.4;
      } else if (x > 0.98) {
        x = 0.98;
        vX = -vX * 0.4;
      }
      if (y < 0.02) {
        y = 0.02;
        vY = -vY * 0.4;
      } else if (y > 0.98) {
        y = 0.98;
        vY = -vY * 0.4;
      }
      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = vX;
      this.vy[i] = vY;
      this.lum[i] = Math.abs(uc);
    }
  }
}

/** Deterministic initial spread of the steerable sources across the plate. */
export function makeSources(): SourceState[] {
  const out: SourceState[] = [];
  const golden = 2.399963229728653;
  for (let i = 0; i < SOURCE_COUNT; i++) {
    const t = (i + 0.5) / SOURCE_COUNT;
    const r = 0.16 + 0.26 * Math.sqrt(t);
    const a = i * golden;
    out.push({
      x: 0.5 + r * Math.cos(a),
      y: 0.5 + r * Math.sin(a),
      drive: 0,
      ratioIdx: i,
    });
  }
  return out;
}

/** Clamp helper. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
