// ════════════════════════════════════════════════════════════════════════════
// BIFURCATION DIAGRAM AS SCORE (2728-bifurcation)
//
// Canvas2D — deliberately, not WebGL. The classic bifurcation diagram draws
// ITSELF as the score: x-axis = r (2.8 → 4.0), y-axis = attractor value x
// (0 → 1). As the autopilot sweeps r, each column's settled orbit is stamped
// into an accumulation layer, so the pitchfork cascade, the chaotic bands and
// the clean periodic windows fill in over time. A vertical playhead marks the
// current r; the current attractor points pulse as they sound. A small inset
// shows the live orbit time-series ("what's sounding now").
//
// Clinical near-black ground, violet ramp for the art.
// ════════════════════════════════════════════════════════════════════════════

import { R_MIN, R_MAX, sampleOrbit } from "./logistic";

const NEAR_BLACK = "#07050d";
const PLOT_VIOLET = "rgba(167, 139, 250, 0.16)"; // accumulated points
const PLAYHEAD = "rgba(196, 181, 253, 0.85)";
const HILITE = "#ede9fe";
const AXIS = "rgba(196, 181, 253, 0.22)";
const INSET_LINE = "#c4b5fd";

export class BifurcationRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private accum: HTMLCanvasElement; // persistent diagram layer
  private actx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.accum = document.createElement("canvas");
    const ac = this.accum.getContext("2d");
    if (!ac) throw new Error("2d context unavailable");
    this.actx = ac;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    // preserve the accumulated diagram across a resize
    const prev = this.accum.width > 0 ? this.accum : null;
    const snap =
      prev && prev.width > 0
        ? this.actx.getImageData(0, 0, prev.width, prev.height)
        : null;
    this.canvas.width = w;
    this.canvas.height = h;
    this.accum.width = w;
    this.accum.height = h;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.actx.fillStyle = NEAR_BLACK;
    this.actx.fillRect(0, 0, w, h);
    if (snap) this.actx.putImageData(snap, 0, 0);
  }

  private rToPx(r: number): number {
    return ((r - R_MIN) / (R_MAX - R_MIN)) * this.w;
  }

  private xToPy(x: number): number {
    // x ∈ [0,1] → bottom(0) .. top(1), with a little vertical padding
    const pad = 0.06 * this.h;
    return this.h - pad - x * (this.h - 2 * pad);
  }

  /** stamp one column of the bifurcation diagram at r into the accumulation layer */
  private stampColumn(r: number): void {
    const orbit = sampleOrbit(r);
    const px = this.rToPx(r);
    this.actx.fillStyle = PLOT_VIOLET;
    for (let i = 0; i < orbit.length; i++) {
      const py = this.xToPy(orbit[i]);
      this.actx.fillRect(px, py, this.dpr, this.dpr);
    }
  }

  /** draw the full frame: accumulated diagram + playhead + live highlight + inset */
  render(
    r: number,
    attractorPoints: number[],
    currentX: number,
    history: number[],
    pulse: number,
  ): void {
    this.stampColumn(r);

    const ctx = this.ctx;
    ctx.drawImage(this.accum, 0, 0);

    // faint frame + axis ticks along the r axis (integer-ish landmarks)
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = this.dpr;
    const landmarks = [3.0, 3.2, 3.4, 3.5699, 3.83, 4.0];
    ctx.font = `${11 * this.dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = AXIS;
    for (const lr of landmarks) {
      const px = this.rToPx(lr);
      ctx.beginPath();
      ctx.moveTo(px, this.h);
      ctx.lineTo(px, this.h - 10 * this.dpr);
      ctx.stroke();
      ctx.fillText(lr.toFixed(2), px + 3 * this.dpr, this.h - 4 * this.dpr);
    }

    // playhead
    const hx = this.rToPx(r);
    ctx.strokeStyle = PLAYHEAD;
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, this.h);
    ctx.stroke();

    // current attractor points, pulsing
    const rad = (1.6 + 1.4 * pulse) * this.dpr;
    ctx.fillStyle = HILITE;
    ctx.shadowColor = INSET_LINE;
    ctx.shadowBlur = 8 * this.dpr * pulse;
    for (const x of attractorPoints) {
      const py = this.xToPy(x);
      ctx.beginPath();
      ctx.arc(hx, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // marker at the exact current sounding x
    ctx.fillStyle = INSET_LINE;
    ctx.beginPath();
    ctx.arc(hx, this.xToPy(currentX), 2.4 * this.dpr, 0, Math.PI * 2);
    ctx.fill();

    this.drawInset(history);
  }

  /** small inset: the live orbit time-series — flat line = fixed point,
   *  zig-zag = a p-cycle, noise = chaos */
  private drawInset(history: number[]): void {
    const ctx = this.ctx;
    const iw = Math.min(240 * this.dpr, this.w * 0.34);
    const ih = 70 * this.dpr;
    const ix = this.w - iw - 16 * this.dpr;
    const iy = 16 * this.dpr;

    ctx.fillStyle = "rgba(7,5,13,0.72)";
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = this.dpr;
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.fill();
    ctx.stroke();

    if (history.length > 1) {
      ctx.strokeStyle = INSET_LINE;
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.beginPath();
      const n = history.length;
      for (let i = 0; i < n; i++) {
        const px = ix + (i / (n - 1)) * iw;
        const py = iy + ih - history[i] * ih;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}
