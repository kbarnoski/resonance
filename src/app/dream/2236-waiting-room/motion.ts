// ─────────────────────────────────────────────────────────────────────────────
// motion.ts — the motion field.
//
// A cheap, ML-free frame-difference field. Each camera frame is drawn (mirrored,
// selfie) to a tiny offscreen canvas; per-cell luminance is diffed against the
// previous frame. Total thresholded motion → drives the immersion ladder; the
// motion centroid → drives where the vanishing point sits and where the presence
// looks. A decayed `accum` grid feeds the faint radial ripples of the early
// stages. The same field serves the pointer/touch fallback via `injectPoint`.
// ─────────────────────────────────────────────────────────────────────────────

export interface MotionSample {
  /** Instantaneous motion amount, ~0..1. */
  energy: number;
  /** Motion centroid X in [-1,1] (screen-space, already mirrored). */
  cx: number;
  /** Motion centroid Y in [-1,1]. */
  cy: number;
}

const ZERO: MotionSample = { energy: 0, cx: 0, cy: 0 };

export class MotionField {
  readonly cols: number;
  readonly rows: number;
  /** Decayed motion field, 0..1, for ripple rendering. */
  readonly accum: Float32Array;
  private prev: Float32Array | null = null;
  private cur: Float32Array;
  private lastCx = 0;
  private lastCy = 0;

  constructor(cols = 96, rows = 72) {
    this.cols = cols;
    this.rows = rows;
    this.accum = new Float32Array(cols * rows);
    this.cur = new Float32Array(cols * rows);
  }

  reset(): void {
    this.prev = null;
    this.accum.fill(0);
    this.lastCx = 0;
    this.lastCy = 0;
  }

  /** Feed one mirrored RGBA frame (length cols*rows*4). Returns the
   *  instantaneous motion sample and updates the ripple field. */
  pushFrame(rgba: Uint8ClampedArray): MotionSample {
    const n = this.cols * this.rows;
    const cur = this.cur;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      cur[i] = (rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114) / 255;
    }
    if (!this.prev) {
      this.prev = cur.slice();
      return ZERO;
    }
    const prev = this.prev;
    const THRESH = 0.06;
    let sum = 0;
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (let r = 0; r < this.rows; r++) {
      const rowBase = r * this.cols;
      for (let c = 0; c < this.cols; c++) {
        const i = rowBase + c;
        let d = Math.abs(cur[i] - prev[i]);
        d = d < THRESH ? 0 : d - THRESH;
        if (d > 0) {
          const boosted = Math.min(1, d * 3);
          if (boosted > this.accum[i]) this.accum[i] = boosted;
          sum += d;
          wx += c * d;
          wy += r * d;
          wsum += d;
        }
      }
    }
    prev.set(cur);
    const energy = Math.min(1, (sum / n) * 14);
    if (wsum > 1e-4) {
      this.lastCx = ((wx / wsum) / (this.cols - 1)) * 2 - 1;
      this.lastCy = ((wy / wsum) / (this.rows - 1)) * 2 - 1;
    }
    return { energy, cx: this.lastCx, cy: this.lastCy };
  }

  /** Pointer/touch fallback: splat a soft blob of motion at (nx,ny) in [0,1]
   *  with the given speed, and report it as a motion sample. */
  injectPoint(nx: number, ny: number, speed: number): MotionSample {
    const amt = Math.min(1, speed);
    const cc = Math.round(nx * (this.cols - 1));
    const cr = Math.round(ny * (this.rows - 1));
    const rad = 7;
    const sig2 = 2 * 3.2 * 3.2;
    for (let dr = -rad; dr <= rad; dr++) {
      const rr = cr + dr;
      if (rr < 0 || rr >= this.rows) continue;
      for (let dc = -rad; dc <= rad; dc++) {
        const ccx = cc + dc;
        if (ccx < 0 || ccx >= this.cols) continue;
        const g = Math.exp(-(dr * dr + dc * dc) / sig2) * amt;
        const i = rr * this.cols + ccx;
        if (g > this.accum[i]) this.accum[i] = g;
      }
    }
    this.lastCx = nx * 2 - 1;
    this.lastCy = ny * 2 - 1;
    return { energy: amt, cx: this.lastCx, cy: this.lastCy };
  }

  /** Decay the ripple field. Call once per frame; k ~ 0.85 retention. */
  decay(k: number): void {
    const a = this.accum;
    for (let i = 0; i < a.length; i++) a[i] *= k;
  }
}
