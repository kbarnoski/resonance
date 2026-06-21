// ── Waveguide Mesh · displacement-field renderer (Canvas2D) ────────────────
// Paints the membrane's displacement as a warm metallic / coppery-violet
// heatmap. Brightness & hue track signed displacement amplitude, so you SEE the
// wavefronts spread and reflect off the rim in sync with the sound.

import { NX, NY } from "./mesh";

// Resolution we render the field at (upscaled from the NX*NY sim via bilinear
// sampling). Higher = smoother wavefronts.
const RES = 180;

export class MeshRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint8ClampedArray;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;

  private field: Float32Array<ArrayBufferLike> = new Float32Array(NX * NY);
  private nx = NX;
  private ny = NY;
  private level = 0;
  private gain = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    // Offscreen low-res buffer we upscale onto the visible canvas.
    const off = document.createElement("canvas");
    off.width = RES;
    off.height = RES;
    const oc = off.getContext("2d");
    if (!oc) throw new Error("no offscreen 2d context");
    this.off = off;
    this.offCtx = oc;
    this.img = oc.createImageData(RES, RES);
    this.buf = this.img.data;
  }

  setField(field: Float32Array<ArrayBufferLike>, nx: number, ny: number, level: number) {
    this.field = field;
    this.nx = nx;
    this.ny = ny;
    this.level = level;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  // Bilinear sample of the sim field at fractional grid coords.
  private sample(fx: number, fy: number): number {
    const nx = this.nx,
      ny = this.ny;
    const x = fx * (nx - 1);
    const y = fy * (ny - 1);
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, nx - 1),
      y1 = Math.min(y0 + 1, ny - 1);
    const tx = x - x0,
      ty = y - y0;
    const f = this.field;
    const a = f[y0 * nx + x0],
      b = f[y0 * nx + x1];
    const c = f[y1 * nx + x0],
      d = f[y1 * nx + x1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }

  draw() {
    // Auto-gain so quiet idle ripples and loud strikes both read well.
    // Estimate peak from the level the engine reports.
    const targetGain = clamp(1.4 / (this.level * 8 + 0.12), 0.6, 22);
    this.gain += (targetGain - this.gain) * 0.06;
    const g = this.gain;

    const buf = this.buf;
    for (let py = 0; py < RES; py++) {
      const fy = py / (RES - 1);
      for (let px = 0; px < RES; px++) {
        const fx = px / (RES - 1);
        const u = this.sample(fx, fy) * g;
        // Signed displacement → color.
        // Positive (toward you): coppery amber. Negative (away): violet.
        // Magnitude → brightness.
        const a = clamp(Math.abs(u), 0, 1);
        const bright = Math.pow(a, 0.7);
        let r: number, gg: number, bb: number;
        if (u >= 0) {
          // copper / amber crest
          r = 40 + bright * 215;
          gg = 18 + bright * 150;
          bb = 30 + bright * 70;
        } else {
          // violet trough
          r = 50 + bright * 150;
          gg = 12 + bright * 60;
          bb = 60 + bright * 195;
        }
        // Base dark metallic floor with a faint coppery tint.
        const i = (py * RES + px) * 4;
        buf[i] = r;
        buf[i + 1] = gg;
        buf[i + 2] = bb;
        buf[i + 3] = 255;
      }
    }
    this.offCtx.putImageData(this.img, 0, 0);

    // Upscale (smooth) onto the visible canvas, with a soft circular vignette
    // so the square mesh reads as a drumhead.
    const W = this.canvas.width,
      H = this.canvas.height;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.off, 0, 0, W, H);

    // Rim highlight + vignette.
    const cx = W / 2,
      cy = H / 2;
    const rad = Math.min(W, H) * 0.62;
    const vig = ctx.createRadialGradient(cx, cy, rad * 0.55, cx, cy, rad);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(8,4,12,0.85)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Subtle metallic rim ring.
    ctx.strokeStyle = "rgba(214,164,120,0.28)";
    ctx.lineWidth = Math.max(1, W * 0.004);
    ctx.strokeRect(W * 0.04, H * 0.04, W * 0.92, H * 0.92);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
