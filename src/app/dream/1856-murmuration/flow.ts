// Optical-flow / frame-difference motion field.
//
// Model-free, pure Canvas pixel ops (NO MediaPipe, NO external model).
// A small offscreen canvas holds each downscaled camera frame; comparing a
// frame to the previous one yields a per-cell motion magnitude, from which we
// derive three global signals: total motion energy, the motion centroid, and a
// coarse dominant direction. The video is sampled mirrored so it reads like a
// looking glass.

export interface FlowSignals {
  /** Total motion energy, 0..1 (how much the body is moving). */
  energy: number;
  /** Motion centroid x, 0..1 (mirrored so it tracks like a mirror). */
  cx: number;
  /** Motion centroid y, 0..1 (0 = top of frame). */
  cy: number;
  /** Dominant horizontal motion direction, -1..1. */
  dirX: number;
  /** Dominant vertical motion direction, -1..1. */
  dirY: number;
}

export function makeFlowSignals(): FlowSignals {
  return { energy: 0, cx: 0.5, cy: 0.5, dirX: 0, dirY: 0 };
}

/**
 * Deterministic synthetic conductor. Drives the motion centroid along a smooth
 * Lissajous path with a slow breathing energy sine, so the flock is alive and
 * sounding before any camera permission is requested. Uses only the supplied
 * time (seconds) — no Math.random, no Date.now.
 */
export function computeSyntheticSignals(t: number, out: FlowSignals): void {
  const cx = 0.5 + 0.34 * Math.sin(t * 0.55);
  const cy = 0.5 + 0.3 * Math.sin(t * 0.83 + 1.3);
  // Velocity of the path gives a plausible dominant direction.
  const vx = 0.34 * 0.55 * Math.cos(t * 0.55);
  const vy = 0.3 * 0.83 * Math.cos(t * 0.83 + 1.3);
  const speed = Math.hypot(vx, vy);
  // Breathing energy: mostly gentle with occasional swells.
  const swell = 0.5 + 0.5 * Math.sin(t * 0.27);
  out.energy = clamp01(0.28 + 0.55 * swell * (0.4 + 1.6 * speed));
  out.cx = clamp01(cx);
  out.cy = clamp01(cy);
  const inv = speed > 1e-4 ? 1 / speed : 0;
  out.dirX = vx * inv;
  out.dirY = vy * inv;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Computes flow signals from a live <video> element via frame differencing. */
export class OpticalFlow {
  private w: number;
  private h: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array;
  private hasPrev = false;

  constructor(w = 64, h = 48) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.prev = new Float32Array(w * h);
  }

  /** Returns true if a usable frame was read and `out` was updated. */
  compute(video: HTMLVideoElement, out: FlowSignals): boolean {
    const ctx = this.ctx;
    if (!ctx || video.readyState < 2 || video.videoWidth === 0) return false;

    const { w, h } = this;
    // Mirror horizontally so movement reads like a reflection.
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    const img = ctx.getImageData(0, 0, w, h).data;
    const prev = this.prev;

    let sumMag = 0;
    let sumX = 0;
    let sumY = 0;
    let sumDX = 0;
    let sumDY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Perceptual luma.
        const lum =
          (img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114) / 255;
        const idx = y * w + x;
        const d = lum - prev[idx];
        const mag = Math.abs(d);
        prev[idx] = lum;
        if (mag > 0.06) {
          sumMag += mag;
          sumX += x * mag;
          sumY += y * mag;
          // Coarse direction: brightening moving into a cell vs. leaving it,
          // biased by the cell's offset from frame centre.
          sumDX += (x / w - 0.5) * mag * Math.sign(d);
          sumDY += (y / h - 0.5) * mag * Math.sign(d);
        }
      }
    }

    if (!this.hasPrev) {
      this.hasPrev = true;
      return false; // first frame only seeds `prev`.
    }

    if (sumMag > 1e-4) {
      out.cx = clamp01(sumX / sumMag / w);
      out.cy = clamp01(sumY / sumMag / h);
      const dl = Math.hypot(sumDX, sumDY);
      out.dirX = dl > 1e-4 ? sumDX / dl : 0;
      out.dirY = dl > 1e-4 ? sumDY / dl : 0;
    }
    // Normalise energy against the cell count; a brisk gesture saturates.
    const raw = sumMag / (w * h);
    out.energy = clamp01(raw * 9);
    return true;
  }
}
