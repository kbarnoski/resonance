// render.ts — Spectral Loom visuals + frozen-image edit operations.
//
// The spectrogram is a magnitude matrix buffer[col][row], col = time,
// row = perceptual frequency (0 = bottom = low). Rendered to Canvas2D with a
// clinical Ikeda palette: near-black → cool cyan/violet ramp.

import { ROWS, TIME_COLS } from "./audio";

// ── Ikeda-ish magnitude → RGB ramp (cool monochrome → cyan → violet → white)
export function magRgb(m: number): [number, number, number] {
  if (m < 0.004) return [4, 5, 8];
  const a = Math.pow(Math.min(1, m), 0.8);
  // low: deep blue/violet, mid: cyan, high: near white
  const r = Math.round(255 * (0.10 + 0.85 * a * a));
  const g = Math.round(255 * (0.35 * a + 0.6 * a * a));
  const b = Math.round(255 * (0.45 * a + 0.5 * Math.sqrt(a)));
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

/** Allocate an empty editable matrix [TIME_COLS][ROWS]. */
export function makeBuffer(): Float32Array[] {
  const b: Float32Array[] = [];
  for (let c = 0; c < TIME_COLS; c++) b.push(new Float32Array(ROWS));
  return b;
}

/** Copy src matrix into dst (freeze snapshot). */
export function copyBuffer(src: Float32Array[], dst: Float32Array[]): void {
  for (let c = 0; c < TIME_COLS; c++) dst[c].set(src[c]);
}

/** Shift rolling buffer left by one and append new column at the right edge. */
export function rollIn(buf: Float32Array[], col: Float32Array): void {
  for (let c = 0; c < TIME_COLS - 1; c++) buf[c].set(buf[c + 1]);
  buf[TIME_COLS - 1].set(col);
}

/**
 * Render a magnitude matrix to a canvas via an offscreen ImageData scaled to
 * fit. Draws crisp grid + scrub head + optional brush ring.
 */
export function drawSpectrogram(
  ctx: CanvasRenderingContext2D,
  buf: Float32Array[],
  w: number,
  h: number,
  opts: {
    scrubCol: number; // -1 to hide
    frozen: boolean;
    brush?: { x: number; y: number; r: number } | null;
    loop: boolean;
  }
): void {
  // background
  ctx.fillStyle = "#04050a";
  ctx.fillRect(0, 0, w, h);

  const img = ctx.createImageData(TIME_COLS, ROWS);
  const d = img.data;
  for (let c = 0; c < TIME_COLS; c++) {
    const colArr = buf[c];
    for (let r = 0; r < ROWS; r++) {
      // row 0 = low freq → draw at bottom (flip y)
      const y = ROWS - 1 - r;
      const [rr, gg, bb] = magRgb(colArr[r]);
      const o = (y * TIME_COLS + c) * 4;
      d[o] = rr;
      d[o + 1] = gg;
      d[o + 2] = bb;
      d[o + 3] = 255;
    }
  }
  // scale the small ImageData up onto the canvas
  // (draw into a temp canvas, then drawImage scaled, with smoothing off)
  const tmp = getScratchCanvas(TIME_COLS, ROWS);
  const tctx = tmp.getContext("2d");
  if (tctx) {
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w, h);
  }

  // grid (crisp, dim)
  ctx.strokeStyle = "rgba(120,180,220,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const x = Math.round((i / 8) * w) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < 5; i++) {
    const y = Math.round((i / 5) * h) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // frozen frame border
  if (opts.frozen) {
    ctx.strokeStyle = "rgba(167,139,250,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
  }

  // scrub head
  if (opts.scrubCol >= 0) {
    const x = (opts.scrubCol / (TIME_COLS - 1)) * w;
    ctx.strokeStyle = opts.loop
      ? "rgba(110,231,183,0.95)"
      : "rgba(180,240,255,0.95)";
    ctx.lineWidth = 2;
    ctx.shadowColor = opts.loop
      ? "rgba(110,231,183,0.9)"
      : "rgba(180,240,255,0.9)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // brush ring
  if (opts.brush) {
    const px = (opts.brush.x / (TIME_COLS - 1)) * w;
    const py = (1 - opts.brush.y / (ROWS - 1)) * h;
    const pr = (opts.brush.r / ROWS) * h;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.stroke();
  }
}

let _scratch: HTMLCanvasElement | null = null;
function getScratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!_scratch) _scratch = document.createElement("canvas");
  if (_scratch.width !== w) _scratch.width = w;
  if (_scratch.height !== h) _scratch.height = h;
  return _scratch;
}

// ── Edit operations on the frozen matrix ────────────────────────────────────

/** Soft Gaussian falloff weight. */
function kernel(dist2: number, r: number): number {
  const s = r * 0.6;
  return Math.exp(-dist2 / (2 * s * s));
}

/**
 * Brush: add (raise) or subtract (lower) magnitude with a soft radial kernel.
 * cx in cols, cy in rows. delta sign sets raise vs lower.
 */
export function applyBrush(
  buf: Float32Array[],
  cx: number,
  cy: number,
  radius: number,
  delta: number
): void {
  const r = Math.max(1, radius);
  const c0 = Math.max(0, Math.floor(cx - r));
  const c1 = Math.min(TIME_COLS - 1, Math.ceil(cx + r));
  const r0 = Math.max(0, Math.floor(cy - r));
  const r1 = Math.min(ROWS - 1, Math.ceil(cy + r));
  for (let c = c0; c <= c1; c++) {
    for (let row = r0; row <= r1; row++) {
      const dx = c - cx;
      const dy = row - cy;
      const w = kernel(dx * dx + dy * dy, r);
      const v = buf[c][row] + delta * w;
      buf[c][row] = Math.max(0, Math.min(1, v));
    }
  }
}

/**
 * Smear: drag spectral energy sideways in time. Moves a soft window of columns
 * toward the drag direction (freeze-stretch feel).
 */
export function applySmear(
  buf: Float32Array[],
  cx: number,
  cy: number,
  radius: number,
  dirCols: number
): void {
  const r = Math.max(2, radius);
  const r0 = Math.max(0, Math.floor(cy - r));
  const r1 = Math.min(ROWS - 1, Math.ceil(cy + r));
  const step = dirCols > 0 ? 1 : -1;
  const c0 = Math.max(1, Math.floor(cx - r));
  const c1 = Math.min(TIME_COLS - 2, Math.ceil(cx + r));
  // blend each affected column toward its neighbor in the drag direction
  const blend = Math.min(0.6, Math.abs(dirCols) * 0.25);
  if (step > 0) {
    for (let c = c1; c >= c0; c--) {
      for (let row = r0; row <= r1; row++) {
        const dy = row - cy;
        const dx = c - cx;
        const w = kernel(dx * dx + dy * dy, r) * blend;
        buf[c][row] = buf[c][row] * (1 - w) + buf[c - 1][row] * w;
      }
    }
  } else {
    for (let c = c0; c <= c1; c++) {
      for (let row = r0; row <= r1; row++) {
        const dy = row - cy;
        const dx = c - cx;
        const w = kernel(dx * dx + dy * dy, r) * blend;
        buf[c][row] = buf[c][row] * (1 - w) + buf[c + 1][row] * w;
      }
    }
  }
}

/**
 * Freeze-stretch: per-frame IIR time-blur across columns. amount 0..1 sets how
 * much each column leaks into the next, smearing transients into drones.
 */
export function applyTimeBlur(buf: Float32Array[], amount: number): void {
  if (amount <= 0) return;
  const a = amount * 0.35; // keep stable
  for (let c = 1; c < TIME_COLS; c++) {
    const prev = buf[c - 1];
    const cur = buf[c];
    for (let row = 0; row < ROWS; row++) {
      cur[row] = cur[row] * (1 - a) + prev[row] * a;
    }
  }
}
