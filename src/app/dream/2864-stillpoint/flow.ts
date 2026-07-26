// ════════════════════════════════════════════════════════════════════════════
// flow.ts — optical-flow-lite: global motion energy from frame differencing.
//
// We downscale the camera into a tiny offscreen buffer (64×48), convert to
// luminance, and sum the per-pixel absolute difference against the previous
// frame. That single scalar is the sensory "precision" signal that drives the
// reducing valve: high motion → valve closed, sustained stillness → valve open.
// Cheap, robust, and independent of lighting drift after normalization.
// ════════════════════════════════════════════════════════════════════════════

const FW = 64;
const FH = 48;

export class MotionMeter {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = FW;
    this.canvas.height = FH;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  /** Feed a video frame; returns raw motion energy in ~[0,1] (0 = perfectly
   *  still). Returns 0 on the first frame or if drawing fails. */
  sample(video: HTMLVideoElement): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    try {
      ctx.drawImage(video, 0, 0, FW, FH);
    } catch {
      return 0;
    }
    let img: ImageData;
    try {
      img = ctx.getImageData(0, 0, FW, FH);
    } catch {
      return 0;
    }
    const data = img.data;
    const n = FW * FH;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i << 2;
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
    }
    const prev = this.prev;
    this.prev = gray;
    if (!prev) return 0;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = gray[i] - prev[i];
      sum += d < 0 ? -d : d;
    }
    // mean abs diff is tiny; scale so ordinary hand-waving lands near 1.
    return Math.min(1, (sum / n) * 12);
  }

  reset(): void {
    this.prev = null;
  }
}

/** Synthetic self-play motion for the no-camera fallback: long stretches of
 *  stillness (valve opens fully) punctuated by a movement burst at the start of
 *  each cycle (the "snap back to reality"). tSec is elapsed seconds. */
export function syntheticMotion(tSec: number): number {
  const period = 18;
  const phase = (tSec % period) / period;
  let m = 0.015 + 0.01 * Math.sin(tSec * 0.7); // faint idle shimmer
  if (phase < 0.1) {
    // a decaying burst of "movement"
    const b = 1 - phase / 0.1;
    m += 0.7 * b * b;
  }
  return Math.min(1, m);
}
