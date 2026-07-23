// Webcam optical-flow / frame-difference → motion centroid + energy.
// No MediaPipe, no npm deps: draw the video into a tiny offscreen canvas,
// grayscale each frame, threshold the per-pixel difference against the
// previous frame, and take the motion-weighted centroid.

export interface FlowSample {
  /** motion centroid X, normalized [-1, 1] (mirrored, selfie-style). */
  cx: number;
  /** motion centroid Y, normalized [-1, 1] (0 = top of frame → -1). */
  cy: number;
  /** overall motion energy, roughly [0, 1]. */
  energy: number;
}

export class OpticalFlow {
  private readonly w = 160;
  private readonly h = 120;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: HTMLVideoElement;
  private prev: Float32Array | null = null;
  private lastCx = 0;
  private lastCy = 0;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    const c = document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  compute(): FlowSample {
    const { w, h, ctx, video } = this;
    if (video.readyState < 2) {
      return { cx: this.lastCx, cy: this.lastCy, energy: 0 };
    }

    // Mirror horizontally so the figure moves with the viewer.
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    const frame = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = frame[p] * 0.3 + frame[p + 1] * 0.59 + frame[p + 2] * 0.11;
    }

    if (!this.prev) {
      this.prev = gray;
      return { cx: this.lastCx, cy: this.lastCy, energy: 0 };
    }

    const thresh = 16;
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;
    let motion = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        const d = Math.abs(gray[idx] - this.prev[idx]);
        if (d > thresh) {
          sumX += x * d;
          sumY += y * d;
          sumW += d;
          motion += d;
        }
      }
    }
    this.prev = gray;

    let cx = this.lastCx;
    let cy = this.lastCy;
    if (sumW > 0) {
      cx = (sumX / sumW / w) * 2 - 1;
      cy = (sumY / sumW / h) * 2 - 1;
    }
    // Smooth to kill sensor jitter.
    cx = this.lastCx + (cx - this.lastCx) * 0.35;
    cy = this.lastCy + (cy - this.lastCy) * 0.35;
    this.lastCx = cx;
    this.lastCy = cy;

    const energy = Math.min(1, motion / (w * h * 40));
    return { cx, cy, energy };
  }
}
