/* ── 5272-rebus · Canvas2D renderer ──────────────────────────────────────
 *
 *  Paints the precision-weighted display field into a small ImageData buffer
 *  (FIELD_W×FIELD_H), then scales it up with smoothing so the reaction-
 *  diffusion blobs read as soft, breathing imagery rather than hard pixels.
 *  Colour crosses from a cool, low-contrast "sober" grain to a rich violet →
 *  magenta → warm-gold organic palette as the bloom (1−g) rises.
 *
 *  SAFETY: no strobing. The only global brightness motion is a very slow
 *  luminance drift (~0.12 Hz, well under 3 Hz) plus smooth crossfades — never
 *  a hard flicker. Raw hex-ish RGB numbers live only inside the canvas art.
 */

import { FIELD_W, FIELD_H } from "./field";

export interface Renderer {
  img: ImageData;
  small: HTMLCanvasElement;
  smallCtx: CanvasRenderingContext2D;
}

export function createRenderer(): Renderer | null {
  const small =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!small) return null;
  small.width = FIELD_W;
  small.height = FIELD_H;
  const smallCtx = small.getContext("2d");
  if (!smallCtx) return null;
  const img = smallCtx.createImageData(FIELD_W, FIELD_H);
  // opaque alpha
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  return { img, small, smallCtx };
}

function smoothstep(a: number): number {
  const t = a < 0 ? 0 : a > 1 ? 1 : a;
  return t * t * (3 - 2 * t);
}

// Bloom palette stops (deep indigo → violet → magenta → warm gold).
const STOPS: Array<[number, number, number, number]> = [
  [0.0, 18, 10, 46],
  [0.4, 110, 48, 200],
  [0.7, 226, 84, 176],
  [1.0, 255, 208, 120],
];

function bloomColor(v: number, rgb: [number, number, number]): void {
  let i = 0;
  while (i < STOPS.length - 1 && v > STOPS[i + 1][0]) i++;
  const a = STOPS[i];
  const b = STOPS[Math.min(STOPS.length - 1, i + 1)];
  const span = b[0] - a[0] || 1;
  const t = (v - a[0]) / span;
  rgb[0] = a[1] + (b[1] - a[1]) * t;
  rgb[1] = a[2] + (b[2] - a[2]) * t;
  rgb[2] = a[3] + (b[3] - a[3]) * t;
}

const tmp: [number, number, number] = [0, 0, 0];

/**
 * Draw one frame.
 * @param disp   display field, 0..1 per cell (from stepField)
 * @param g      gating 1..0 (drives the sober→bloom colour crossfade)
 * @param nowMs  performance.now() timestamp for the slow luminance drift
 */
export function drawField(
  rd: Renderer,
  ctx: CanvasRenderingContext2D,
  disp: Float32Array,
  g: number,
  nowMs: number,
): void {
  const bloom = smoothstep(1 - g);
  const data = rd.img.data;
  // Slow, gentle luminance breathing — 0.12 Hz. Deliberately far below the
  // 3 Hz photosensitive limit. Amplitude shrinks toward sober so nothing
  // pulses when the field is meant to be faithful.
  const lum = 1 + Math.sin(nowMs * 0.00075) * 0.06 * (0.3 + 0.7 * bloom);

  for (let i = 0; i < disp.length; i++) {
    const v = disp[i];
    // Sober look: cool, low-contrast blue grain.
    const sr = 26 + v * 66;
    const sg = 34 + v * 82;
    const sb = 66 + v * 150;
    // Bloom look: rich organic palette, gamma-lifted for contrast.
    bloomColor(Math.pow(v, 0.8), tmp);

    const r = (sr + (tmp[0] - sr) * bloom) * lum;
    const gg = (sg + (tmp[1] - sg) * bloom) * lum;
    const b = (sb + (tmp[2] - sb) * bloom) * lum;

    const o = i << 2;
    data[o] = r > 255 ? 255 : r;
    data[o + 1] = gg > 255 ? 255 : gg;
    data[o + 2] = b > 255 ? 255 : b;
  }

  rd.smallCtx.putImageData(rd.img, 0, 0);

  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(rd.small, 0, 0, cw, ch);

  // A soft vignette keeps the eye centred and hides the toroidal seam.
  const grad = ctx.createRadialGradient(
    cw / 2,
    ch / 2,
    Math.min(cw, ch) * 0.28,
    cw / 2,
    ch / 2,
    Math.max(cw, ch) * 0.72,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);
}
