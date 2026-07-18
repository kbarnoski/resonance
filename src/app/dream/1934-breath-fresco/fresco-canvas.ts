/**
 * Canvas2D / CPU fallback for the breath fresco — the SAME logic as the WebGPU
 * backend at a smaller field resolution, so a machine without `navigator.gpu`
 * still gets a persistent, oxidizing timeline of the session (never a blank
 * page). A vertical-fuse + additive-deposit update runs only on a window of
 * columns around the trowel (permanence), and a full paint tone-maps the field
 * over a deep-umber plaster ground with age-based oxidation and a trowel sheen.
 */

import type { Fresco, FrescoDeposit } from "./fresco";

const W = 512;
const H = 256;
const WINDOW = 10;
const OX = 0.9;

class CanvasFresco implements Fresco {
  readonly backend = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private field: Float32Array; // W*H*3 accumulated linear pigment
  private grain: Float32Array; // static plaster grain W*H
  private seed = 0x2f6d_1a3b;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.img = ctx.createImageData(W, H);
    this.field = new Float32Array(W * H * 3);
    this.grain = new Float32Array(W * H);
    // Deterministic static grain (no Math.random).
    let s = this.seed;
    for (let i = 0; i < this.grain.length; i++) {
      s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0;
      this.grain[i] = (((s >>> 0) / 4294967296) - 0.5) * 0.045;
    }
  }

  step(trowelX: number, deposit: FrescoDeposit | null): void {
    const tx = Math.max(0, Math.min(W - 1, trowelX * (W - 1)));
    const x0 = Math.max(1, Math.floor(tx - WINDOW));
    const x1 = Math.min(W - 1, Math.ceil(tx + WINDOW));
    const f = this.field;
    const vFuse = 0.12;
    for (let x = x0; x <= x1; x++) {
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 3;
        const iu = (Math.max(0, y - 1) * W + x) * 3;
        const id = (Math.min(H - 1, y + 1) * W + x) * 3;
        for (let k = 0; k < 3; k++) {
          const avg = (f[iu + k] + f[id + k]) * 0.5;
          f[i + k] = f[i + k] * (1 - vFuse) + avg * vFuse;
        }
      }
    }
    if (deposit && deposit.intensity > 0) {
      const cx = Math.round(tx);
      const half = 0.03 * H;
      const yc = deposit.y * H;
      const amt = deposit.intensity * 0.16;
      for (let x = Math.max(0, cx - 2); x <= Math.min(W - 1, cx + 2); x++) {
        for (let y = 0; y < H; y++) {
          const d = (y - yc) / half;
          const g = Math.exp(-d * d);
          if (g < 0.002) continue;
          const add = g * amt;
          const i = (y * W + x) * 3;
          f[i] += deposit.color[0] * add;
          f[i + 1] += deposit.color[1] * add;
          f[i + 2] += deposit.color[2] * add;
        }
      }
    }
  }

  render(trowelX: number): void {
    const tx = trowelX * (W - 1);
    const f = this.field;
    const g = this.grain;
    const data = this.img.data;
    const groundR = 0.085;
    const groundG = 0.058;
    const groundB = 0.038;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        const i = p * 3;
        // Tone-map.
        let pr = 1 - Math.exp(-f[i] * 1.3);
        let pg = 1 - Math.exp(-f[i + 1] * 1.3);
        let pb = 1 - Math.exp(-f[i + 2] * 1.3);
        // Oxidation by age (distance behind trowel).
        const ageX = Math.max(0, Math.min(1, (tx - x) / (W * 0.6))) * OX;
        pr = pr * (1 - ageX) + pr * 0.86 * ageX;
        pg = pg * (1 - ageX) + pg * 0.62 * ageX;
        pb = pb * (1 - ageX) + pb * 0.44 * ageX;
        // Trowel sheen.
        const dx = x - tx;
        const sheen = Math.exp(-(dx * dx) / (2 * 5 * 5)) * 0.16;
        const gr = g[p];
        let r = groundR + gr + pr + 0.9 * sheen;
        let gg = groundG + gr + pg + 0.84 * sheen;
        let b = groundB + gr + pb + 0.72 * sheen;
        r = r < 0 ? 0 : r > 1 ? 1 : r;
        gg = gg < 0 ? 0 : gg > 1 ? 1 : gg;
        b = b < 0 ? 0 : b > 1 ? 1 : b;
        const o = p * 4;
        data[o] = (r * 255) | 0;
        data[o + 1] = (gg * 255) | 0;
        data[o + 2] = (b * 255) | 0;
        data[o + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  reset(): void {
    this.field.fill(0);
  }

  dispose(): void {
    /* nothing to release */
  }
}

export function createCanvasFresco(canvas: HTMLCanvasElement): Fresco {
  return new CanvasFresco(canvas);
}
