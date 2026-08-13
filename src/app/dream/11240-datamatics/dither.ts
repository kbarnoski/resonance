// ─────────────────────────────────────────────────────────────────────────────
// dither.ts — the 1-bit ordered-dither rasterizer for 11240-datamatics.
//
// Ordered (Bayer) dithering quantizes a continuous magnitude field to a strict
// black/white (1-bit) image without any temporal noise: the threshold a pixel
// must clear is a fixed function of its SCREEN position (an 8×8 Bayer matrix).
// Because the threshold is stationary in screen space while the spectral content
// scrolls through it, the dither reads as a stable engraved data-texture — the
// Ikeda "datamatics" look — rather than shimmering.
//
// Everything here is pure and framework-free. No canvas, no React.
// ─────────────────────────────────────────────────────────────────────────────

// Classic recursive 8×8 Bayer matrix, values 0..63 (row-major, index = y*8 + x).
export const BAYER8: number[] = [
  0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11,
  59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23, 2, 50, 14, 62, 1, 49, 13, 61, 34,
  18, 46, 30, 33, 17, 45, 29, 10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41,
  25, 37, 21,
];

// Normalized thresholds in the open interval (0,1); (v + 0.5) / 64.
export const BAYER8_NORM: Float32Array = (() => {
  const out = new Float32Array(64);
  for (let i = 0; i < 64; i++) out[i] = (BAYER8[i] + 0.5) / 64;
  return out;
})();

/** Ordered-dither threshold for a screen pixel, stationary in screen space. */
export function bayerThreshold(x: number, y: number): number {
  return BAYER8_NORM[(y & 7) * 8 + (x & 7)];
}

/**
 * Paint the scrolling spectral tape into `img` as a strict 1-bit raster.
 *
 * `colMag` is a ring buffer of W columns × H rows of magnitudes in [0,1].
 * `head` is the ring slot holding the NEWEST column; the oldest sits at
 * (head+1)%W and is drawn at the left edge, so the tape scrolls right→left as
 * new columns are pushed. `redFlags[col]` marks index columns that get sparse
 * pure-red tick marks at the top and bottom margins (the only non-monochrome
 * ink in the piece).
 */
export function rasterizeTape(
  img: ImageData,
  W: number,
  H: number,
  colMag: Float32Array,
  redFlags: Uint8Array,
  head: number,
): void {
  const data = img.data;
  const start = (head + 1) % W; // oldest column → screen x = 0
  const tick = Math.max(2, Math.round(H * 0.022)); // red index-mark margin
  let p = 0;
  for (let y = 0; y < H; y++) {
    const inMargin = y < tick || y >= H - tick;
    const rowBayer = (y & 7) * 8;
    for (let x = 0; x < W; x++) {
      const bufCol = (start + x) % W;
      const m = colMag[bufCol * H + y];
      const white = m > BAYER8_NORM[rowBayer + (x & 7)];
      if (inMargin && redFlags[bufCol]) {
        // sparse red index mark — pure red, only in the thin margins
        data[p] = 255;
        data[p + 1] = 0;
        data[p + 2] = 0;
      } else if (white) {
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
      } else {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
      }
      data[p + 3] = 255;
      p += 4;
    }
  }
}

/**
 * Overwrite a horizontal band of the raster with a hard-edged test-pattern
 * barcode (Ikeda "test pattern"). `cells` is a length-W array of 0/1 giving the
 * black/white column state across the band. When `red` is true the ON cells are
 * drawn red instead of white (used sparingly, on the strongest onsets).
 */
export function drawTestBars(
  img: ImageData,
  W: number,
  y0: number,
  y1: number,
  cells: Uint8Array,
  red: boolean,
): void {
  const data = img.data;
  const yA = Math.max(0, y0);
  const yB = Math.min(img.height, y1);
  for (let y = yA; y < yB; y++) {
    let p = (y * W) * 4;
    for (let x = 0; x < W; x++) {
      const on = cells[x] === 1;
      if (on && red) {
        data[p] = 255;
        data[p + 1] = 0;
        data[p + 2] = 0;
      } else if (on) {
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
      } else {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
      }
      data[p + 3] = 255;
      p += 4;
    }
  }
}
