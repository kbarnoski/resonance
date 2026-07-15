/**
 * Canvas2D feedback-displacement datamosh for the Fracture prototype.
 *
 * NO WebGL / WebGPU / three.js — pure Canvas2D. A ping-pong pair of offscreen
 * buffers carries the feedback: each frame the previous buffer is redrawn onto
 * the next, displaced in horizontal slices (I-frame smear), then a fresh
 * audio-driven pattern is composited over it and the result is mirror-tiled
 * into a 2×2 kaleidoscope with a half-scale nested mirror for machine-elf
 * density. Ikeda-style near-monochrome violet ramp + ONE hot accent.
 *
 * Bass → displacement magnitude · Mid → flow direction · High → chromatic
 * split / fine detail. Luminance is clamped (constant feedback decay, no
 * full-frame flips) so nothing strobes.
 *
 * DETERMINISM: motion is driven by an integer frame counter + Math.sin +
 * a fixed-seed mulberry32. When the AnalyserNode is silent (suspended
 * context) the frame-counter base term keeps everything moving.
 */

import { clamp, mulberry32, type Bands } from "./dsp";

const VISUAL_SEED = 0x0f1cea;
const SLICES = 22;
const HOT = "#f0397a"; // the one hot accent (magenta-rose)
const VIOLET_RAMP = ["#0b0713", "#241147", "#5b2ec9", "#8b5cf6", "#c4b5fd"];

interface Buffer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function makeBuffer(w: number, h: number): Buffer {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx };
}

export class DatamoshRenderer {
  private view: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private bufA: Buffer;
  private bufB: Buffer;
  private read: Buffer;
  private write: Buffer;
  private rnd = mulberry32(VISUAL_SEED);
  private jitter: number[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.view = ctx;
    this.w = canvas.width;
    this.h = canvas.height;
    this.bufA = makeBuffer(this.w, this.h);
    this.bufB = makeBuffer(this.w, this.h);
    this.read = this.bufA;
    this.write = this.bufB;
    for (let i = 0; i < SLICES; i++) this.jitter.push(this.rnd());
    // seed both buffers dark so the first feedback pass has something to smear
    for (const b of [this.bufA, this.bufB]) {
      b.ctx.fillStyle = "#050208";
      b.ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const b of [this.bufA, this.bufB]) {
      b.canvas.width = w;
      b.canvas.height = h;
      b.ctx.fillStyle = "#050208";
      b.ctx.fillRect(0, 0, w, h);
    }
  }

  /** One frame. `grit` (0..1) intensifies smear + chromatic split. */
  draw(frame: number, bands: Bands, grit: number, reduced: boolean): void {
    const { w, h } = this;
    const wc = this.write.ctx;
    const rc = this.read;

    const motion = reduced ? 0.35 : 1;
    // frame-counter base term guarantees motion even with a silent analyser
    const baseBass = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(frame * 0.021));
    const baseMid = 0.5 + 0.5 * Math.sin(frame * 0.013 + 1.7);
    const baseHigh = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(frame * 0.047));
    const bass = clamp(0.55 * bands.bass + baseBass, 0, 1);
    const mid = clamp(0.6 * bands.mid + 0.5 * baseMid, 0, 1);
    const high = clamp(0.6 * bands.high + baseHigh, 0, 1);

    // ── feedback pass: redraw previous buffer displaced in horizontal slices
    wc.fillStyle = "rgba(5,2,8,0.14)"; // constant decay → luminance clamp
    wc.fillRect(0, 0, w, h);

    const sliceH = h / SLICES;
    const dir = mid < 0.5 ? -1 : 1; // mid → flow direction
    const maxShift = (14 + bass * 90 * (1 + grit)) * motion;
    for (let i = 0; i < SLICES; i++) {
      const y = i * sliceH;
      const phase = frame * 0.03 * motion + i * 0.5 + this.jitter[i] * 6.28;
      const dx = dir * Math.sin(phase) * maxShift * (0.4 + this.jitter[i]);
      const dy = Math.cos(phase * 0.7) * bass * 6 * motion;
      wc.globalAlpha = 0.92;
      wc.drawImage(
        rc.canvas,
        0,
        y,
        w,
        sliceH + 1,
        dx,
        y + dy,
        w,
        sliceH + 1,
      );
    }
    wc.globalAlpha = 1;

    // ── chromatic split on HIGH band: offset tinted copies with 'lighter'
    if (high > 0.05) {
      const split = high * (10 + grit * 26) * motion;
      wc.globalCompositeOperation = "lighter";
      wc.globalAlpha = 0.16 + 0.2 * high;
      wc.drawImage(rc.canvas, split, 0);
      wc.globalAlpha = 0.12 + 0.16 * high;
      wc.drawImage(rc.canvas, -split, 0);
      wc.globalCompositeOperation = "source-over";
      wc.globalAlpha = 1;
    }

    // ── fresh audio-driven pattern composited on top
    this.drawPattern(wc, frame, bass, mid, high, grit, motion);

    // ── present: mirror-tile the write buffer into a 2×2 kaleidoscope
    this.present(frame, high, motion);

    // swap
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }

  private drawPattern(
    ctx: CanvasRenderingContext2D,
    frame: number,
    bass: number,
    mid: number,
    high: number,
    grit: number,
    motion: number,
  ): void {
    const { w, h } = this;
    // Ikeda-style vertical data-columns keyed to the spectrum
    const cols = 20;
    const cw = w / cols;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < cols; i++) {
      const n = Math.sin(frame * 0.05 + i * 1.3) * 0.5 + 0.5;
      const on = n > 0.62 - mid * 0.3;
      if (!on) continue;
      const ramp = VIOLET_RAMP[(i + (frame >> 4)) % VIOLET_RAMP.length];
      ctx.fillStyle = ramp;
      const bh = (0.04 + 0.5 * n * (0.4 + bass)) * h;
      const y = (Math.sin(frame * 0.02 + i) * 0.5 + 0.5) * (h - bh);
      ctx.globalAlpha = 0.1 + 0.22 * n;
      ctx.fillRect(i * cw, y, cw * 0.7, bh);
    }

    // scanning hot-accent tick — the single non-violet flourish
    const tickX = ((frame * (1.5 + high * 6) * motion) % w + w) % w;
    ctx.fillStyle = HOT;
    ctx.globalAlpha = 0.5 + 0.4 * high;
    ctx.fillRect(tickX, 0, 2 + grit * 3, h);

    // sparse quantization dots (mulberry-seeded, but positioned by frame sin)
    ctx.fillStyle = VIOLET_RAMP[4];
    for (let i = 0; i < 40; i++) {
      const jx = (Math.sin(frame * 0.011 + i * 12.9898) * 0.5 + 0.5) * w;
      const jy = (Math.cos(frame * 0.017 + i * 4.1414) * 0.5 + 0.5) * h;
      ctx.globalAlpha = 0.08 + 0.14 * high;
      ctx.fillRect(jx, jy, 1 + grit * 2, 1 + grit * 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private present(frame: number, high: number, motion: number): void {
    const { w, h, view } = this;
    const src = this.write.canvas;
    const hw = w / 2;
    const hh = h / 2;

    view.fillStyle = "#050208";
    view.fillRect(0, 0, w, h);

    // 2×2 mirror-tile kaleidoscope from the top-left quadrant of the buffer
    for (let qy = 0; qy < 2; qy++) {
      for (let qx = 0; qx < 2; qx++) {
        view.save();
        view.translate(qx === 0 ? 0 : w, qy === 0 ? 0 : h);
        view.scale(qx === 0 ? 1 : -1, qy === 0 ? 1 : -1);
        view.drawImage(src, 0, 0, hw, hh, 0, 0, hw, hh);
        view.restore();
      }
    }

    // half-scale nested mirror in the center → over-detailed density
    const nestScale = 0.5 + 0.06 * Math.sin(frame * 0.02 * motion);
    const nw = w * nestScale;
    const nh = h * nestScale;
    view.save();
    view.globalAlpha = 0.55;
    view.globalCompositeOperation = "lighter";
    view.translate(w / 2 + nw / 2, h / 2 - nh / 2);
    view.scale(-1, 1);
    view.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    view.restore();

    // faint high-band vignette pulse (clamped, no full-frame flip)
    const vg = view.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(5,2,8,${0.35 + 0.15 * high})`);
    view.fillStyle = vg;
    view.globalCompositeOperation = "source-over";
    view.globalAlpha = 1;
    view.fillRect(0, 0, w, h);
  }
}
