// waveCPU.ts — Canvas2D fallback drumhead for browsers without float-render
// WebGL2. The *same* finite-difference membrane equation as waveGPU.ts, on a
// smaller CPU grid, colour-mapped to an offscreen ImageData and scaled up. Same
// physics, same feel — just fewer cells and a softer image.

import type { Touch } from "./waveGPU";

const GRID = 108;
const DISCR = 0.985;
const C2 = 0.3;
const DAMP = 0.0009;
const EDGE = 0.9992;
const CLAMP = 3.0;

// Violet ramp mirroring dreamPalette() — deep -> indigo -> violet -> magenta -> light.
const STOPS: [number, number, number][] = [
  [11, 7, 19],
  [99, 102, 241],
  [139, 92, 246],
  [176, 67, 224],
  [196, 181, 252],
];
function ramp(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export class WaveCPU {
  readonly grid = GRID;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private cur: Float32Array;
  private prev: Float32Array;
  private next: Float32Array;
  private mask: Uint8Array;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas2d unavailable");
    this.ctx = ctx;
    this.off = document.createElement("canvas");
    this.off.width = GRID;
    this.off.height = GRID;
    const offCtx = this.off.getContext("2d");
    if (!offCtx) throw new Error("canvas2d unavailable");
    this.offCtx = offCtx;
    this.img = offCtx.createImageData(GRID, GRID);

    const n = GRID * GRID;
    this.cur = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.next = new Float32Array(n);
    this.mask = new Uint8Array(n);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const px = (x + 0.5) / GRID * 2 - 1;
        const py = (y + 0.5) / GRID * 2 - 1;
        this.mask[y * GRID + x] = px * px + py * py <= DISCR * DISCR ? 1 : 0;
      }
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    const cv = this.ctx.canvas;
    cv.width = Math.max(1, Math.floor(cssW * dpr));
    cv.height = Math.max(1, Math.floor(cssH * dpr));
  }

  step(touches: Touch[]): void {
    const { cur, prev, next, mask } = this;
    for (let y = 1; y < GRID - 1; y++) {
      for (let x = 1; x < GRID - 1; x++) {
        const idx = y * GRID + x;
        if (!mask[idx]) {
          next[idx] = 0;
          continue;
        }
        const c = cur[idx];
        const n = mask[idx - GRID] ? cur[idx - GRID] : 0;
        const s = mask[idx + GRID] ? cur[idx + GRID] : 0;
        const e = mask[idx + 1] ? cur[idx + 1] : 0;
        const w = mask[idx - 1] ? cur[idx - 1] : 0;
        const lap = n + s + e + w - 4 * c;
        let nx = (2 * c - prev[idx] + C2 * lap - DAMP * (c - prev[idx])) * EDGE;
        if (nx > CLAMP) nx = CLAMP;
        else if (nx < -CLAMP) nx = -CLAMP;
        next[idx] = nx;
      }
    }
    // Inject touches.
    for (let t = 0; t < touches.length; t++) {
      const tc = touches[t];
      const cx = tc.x * GRID;
      const cy = tc.y * GRID;
      const sig = Math.max(tc.radius, 0.004) * GRID;
      const rad = Math.ceil(sig * 3);
      const x0 = Math.max(1, Math.floor(cx - rad));
      const x1 = Math.min(GRID - 2, Math.ceil(cx + rad));
      const y0 = Math.max(1, Math.floor(cy - rad));
      const y1 = Math.min(GRID - 2, Math.ceil(cy + rad));
      const inv = 1 / (sig * sig);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * GRID + x;
          if (!mask[idx]) continue;
          const dx = x - cx;
          const dy = y - cy;
          let v = next[idx] + tc.strength * Math.exp(-(dx * dx + dy * dy) * inv);
          if (v > CLAMP) v = CLAMP;
          else if (v < -CLAMP) v = -CLAMP;
          next[idx] = v;
        }
      }
    }
    // Rotate buffers.
    this.prev = cur;
    this.cur = next;
    this.next = prev;
  }

  render(glow: number): void {
    const { cur, prev, mask, img } = this;
    const data = img.data;
    for (let i = 0; i < GRID * GRID; i++) {
      const o = i * 4;
      if (!mask[i]) {
        data[o] = 5;
        data[o + 1] = 4;
        data[o + 2] = 10;
        data[o + 3] = 255;
        continue;
      }
      const h = cur[i];
      const vel = h - prev[i];
      const amp = Math.abs(h);
      const energy = Math.abs(vel);
      const [br, bg, bb] = ramp(0.42 + h * 0.85);
      const g = (amp * 1.2 + energy * 7.0) * glow;
      const [hr, hg, hb] = ramp(0.55 + energy * 3.5);
      data[o] = Math.min(255, br * 0.5 + hr * g * 0.6);
      data[o + 1] = Math.min(255, bg * 0.5 + hg * g * 0.6);
      data[o + 2] = Math.min(255, bb * 0.5 + hb * g * 0.6);
      data[o + 3] = 255;
    }
    this.offCtx.putImageData(img, 0, 0);

    const ctx = this.ctx;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    ctx.fillStyle = "#050308";
    ctx.fillRect(0, 0, cw, ch);
    const d = Math.min(cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.off, (cw - d) / 2, (ch - d) / 2, d, d);
  }

  readEnergy(): number {
    const { cur, prev } = this;
    const c = Math.floor(GRID / 2);
    let sum = 0;
    let n = 0;
    for (let y = c - 2; y <= c + 1; y++) {
      for (let x = c - 2; x <= c + 1; x++) {
        const idx = y * GRID + x;
        sum += Math.abs(cur[idx] - prev[idx]);
        n++;
      }
    }
    return Math.min(1, (sum / n) * 12);
  }

  dispose(): void {
    /* nothing persistent to release */
  }
}
