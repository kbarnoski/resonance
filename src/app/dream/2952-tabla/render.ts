// 2952-tabla — render.ts
// Canvas2D height-map of the membrane's REAL displacement field: warm goatskin
// base, crests glow gold, troughs sink dark, and press-zones (where local c²
// is raised for the pitch bend) bloom violet. The field is drawn into a small
// G×G offscreen ImageData then scaled up with smoothing so waves read as soft
// contour ripples radiating from each strike. You SEE the wave you hear.

import type { MembraneMesh } from "./mesh";

export interface HeadBox {
  x: number;
  y: number;
  r: number;
}

export class MembraneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly off: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly size: number;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, meshSize: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.size = meshSize;

    const off = document.createElement("canvas");
    off.width = meshSize;
    off.height = meshSize;
    const offCtx = off.getContext("2d");
    if (!offCtx) throw new Error("Canvas2D unavailable");
    this.off = off;
    this.offCtx = offCtx;
    this.img = offCtx.createImageData(meshSize, meshSize);
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  headBox(): HeadBox {
    const r = 0.42 * Math.min(this.w, this.h);
    return { x: this.w / 2, y: this.h / 2, r };
  }

  /** disk coord [-1,1]² for a screen point, or null if outside the head. */
  screenToDisk(clientX: number, clientY: number): { x: number; y: number } | null {
    const b = this.headBox();
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left - b.x;
    const py = clientY - rect.top - b.y;
    const x = px / b.r;
    const y = py / b.r;
    if (x * x + y * y > 1.08) return null;
    return { x, y };
  }

  draw(mesh: MembraneMesh, pressCenters: { x: number; y: number }[]): void {
    const { ctx, w, h } = this;
    if (w === 0 || h === 0) return;

    // background: deep violet-charcoal vignette
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, "#141021");
    bg.addColorStop(1, "#080610");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // paint the displacement field into the offscreen ImageData
    const G = this.size;
    const field = mesh.getField();
    const c2 = mesh.c2;
    const mask = mesh.mask;
    const data = this.img.data;
    // Base c² = the minimum over the (locally pressed) head, so press-glow is
    // measured relative to the relaxed skin without the renderer knowing config.
    let baseC2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < c2.length; i++) if (mask[i] && c2[i] < baseC2) baseC2 = c2[i];
    if (!Number.isFinite(baseC2)) baseC2 = 0;

    for (let i = 0; i < G * G; i++) {
      const o = i * 4;
      if (!mask[i]) {
        data[o + 3] = 0;
        continue;
      }
      const d = field[i];
      let v = d * 5.5;
      if (v > 1) v = 1;
      else if (v < -1) v = -1;

      // warm goatskin base
      let r = 74;
      let g = 58;
      let b = 60;
      if (v >= 0) {
        // crest → warm gold / cream highlight
        r += v * 165;
        g += v * 130;
        b += v * 78;
      } else {
        // trough → sink toward dark plum
        const f = 1 + v * 0.75;
        r *= f;
        g *= f;
        b *= f;
      }

      // press glow → violet accent where tension is raised
      const t = (c2[i] - baseC2) / 0.3;
      if (t > 0.001) {
        r += t * 70;
        g += t * 30;
        b += t * 150;
      }

      data[o] = r > 255 ? 255 : r;
      data[o + 1] = g > 255 ? 255 : g;
      data[o + 2] = b > 255 ? 255 : b;
      data[o + 3] = 255;
    }
    this.offCtx.putImageData(this.img, 0, 0);

    // scale the small field up into the circular head, smoothed → ripples
    const box = this.headBox();
    ctx.save();
    ctx.beginPath();
    ctx.arc(box.x, box.y, box.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.off, box.x - box.r, box.y - box.r, box.r * 2, box.r * 2);
    ctx.restore();

    // syahi — the black tuning paste at the centre of a tabla head
    const syahi = ctx.createRadialGradient(box.x, box.y, 0, box.x, box.y, box.r * 0.34);
    syahi.addColorStop(0, "rgba(8,6,10,0.92)");
    syahi.addColorStop(0.7, "rgba(12,9,16,0.55)");
    syahi.addColorStop(1, "rgba(12,9,16,0)");
    ctx.fillStyle = syahi;
    ctx.beginPath();
    ctx.arc(box.x, box.y, box.r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // rim: a restrained violet chrome ring (the leather lacing edge)
    ctx.lineWidth = Math.max(2, box.r * 0.02);
    ctx.strokeStyle = "rgba(167,139,250,0.5)";
    ctx.beginPath();
    ctx.arc(box.x, box.y, box.r, 0, Math.PI * 2);
    ctx.stroke();

    // active press indicators
    for (const p of pressCenters) {
      const sx = box.x + p.x * box.r;
      const sy = box.y + p.y * box.r;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, box.r * 0.22);
      rg.addColorStop(0, "rgba(167,139,250,0.35)");
      rg.addColorStop(1, "rgba(167,139,250,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sx, sy, box.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
