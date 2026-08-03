// canvas2d.ts — graceful fallback for the tension landscape when WebGL2 is
// unavailable. Draws at least the timeline: target curve, live curve, act
// dividers, inciting-incident marker and the playhead. Audio is unaffected.

import { INCITING_INCIDENT } from "./arc";
import type { BakedJourney } from "./demo";

const ACT_BOUNDS_FALLBACK = [0.13, 0.66, 0.76, 0.9];

export interface Canvas2DState {
  pos01: number;
  live: number;
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private baked: BakedJourney | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  setCurve(baked: BakedJourney): void {
    this.baked = baked;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const c = this.ctx.canvas;
    c.width = Math.max(1, Math.floor(w * dpr));
    c.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private colorFor(t: number): string {
    // cool violet -> warm gold
    const r = Math.round((0.34 + (1.0 - 0.34) * t) * 255);
    const g = Math.round((0.3 + (0.72 - 0.3) * t) * 255);
    const b = Math.round((0.82 + (0.42 - 0.82) * t) * 255);
    return `rgb(${r},${g},${b})`;
  }

  draw(state: Canvas2DState): void {
    const ctx = this.ctx;
    const { w, h, baked } = this;
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);
    if (!baked) return;

    const yb = h * 0.86; // baseline (screen y grows down)
    const yt = h * 0.2; // top of the graph band
    const n = baked.target.length;
    const xAt = (i: number) => (i / (n - 1)) * w;
    const yAt = (v: number) => yb + v * (yt - yb);

    // act dividers
    ctx.lineWidth = 1;
    for (const b of ACT_BOUNDS_FALLBACK) {
      ctx.strokeStyle = "rgba(140,143,180,0.25)";
      ctx.beginPath();
      ctx.moveTo(b * w, yt);
      ctx.lineTo(b * w, yb);
      ctx.stroke();
    }
    // inciting incident
    ctx.strokeStyle = "rgba(255,174,102,0.55)";
    ctx.beginPath();
    ctx.moveTo(INCITING_INCIDENT * w, yAt(baked.target[Math.floor(INCITING_INCIDENT * (n - 1))]));
    ctx.lineTo(INCITING_INCIDENT * w, yb);
    ctx.stroke();

    // target fill
    ctx.beginPath();
    ctx.moveTo(0, yb);
    for (let i = 0; i < n; i++) ctx.lineTo(xAt(i), yAt(baked.target[i]));
    ctx.lineTo(w, yb);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, yt, 0, yb);
    grad.addColorStop(0, "rgba(120,110,220,0.30)");
    grad.addColorStop(1, "rgba(120,110,220,0.04)");
    ctx.fillStyle = grad;
    ctx.fill();

    // target line
    ctx.strokeStyle = "rgba(150,152,190,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(baked.target[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // live line
    ctx.strokeStyle = this.colorFor(state.live);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const y = yAt(baked.live[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // playhead
    const px = state.pos01 * w;
    ctx.strokeStyle = "rgba(240,238,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, yt - 6);
    ctx.lineTo(px, yb);
    ctx.stroke();

    // bead where the playhead meets the live curve
    ctx.fillStyle = this.colorFor(state.live);
    ctx.beginPath();
    ctx.arc(px, yAt(state.live), 6, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose(): void {
    /* nothing to release */
  }
}
