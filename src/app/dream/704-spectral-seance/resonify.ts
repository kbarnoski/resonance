/* ──────────────────────────────────────────────────────────────────────────
   resonify.ts — THE RETURN TRIP (image → audio).

   The dreamed image is treated as a SPECTROGRAM / score in the lineage of the
   ANS synthesizer and Xenakis's UPIC:
     • each COLUMN  = a moment in time (the scan-line position)
     • each ROW     = a frequency bin (bottom row low pitch … top row high)
   Pixel brightness at (row r, column c) = amplitude of oscillator-bin r at
   time c. Sweeping c left→right plays the picture as sound.

   We downscale the source image into a tiny offscreen Canvas2D buffer
   (COLS × N_BINS) once per dream — the ONLY Canvas2D in the visual path, used
   purely for pixel sampling. Rows are FLIPPED so the visual top (high pitch)
   maps to the high oscillator and a slight per-column contrast curve keeps the
   bank from droning flat.
   ────────────────────────────────────────────────────────────────────────── */

import { N_BINS } from "./audio";

export const COLS = 128; // time steps across one image

export interface Spectrogram {
  cols: number;
  rows: number;
  // amps[c] is a Float32Array of length N_BINS, bottom→top = low→high pitch
  amps: Float32Array[];
}

// Sample a source canvas down into COLS × N_BINS amplitudes.
export function buildSpectrogram(src: HTMLCanvasElement): Spectrogram {
  const off = document.createElement("canvas");
  off.width = COLS;
  off.height = N_BINS;
  const ctx = off.getContext("2d", { willReadFrequently: true })!;
  // draw the full image scaled into the tiny buffer (box-ish downsample)
  ctx.drawImage(src, 0, 0, COLS, N_BINS);
  const data = ctx.getImageData(0, 0, COLS, N_BINS).data;

  const amps: Float32Array[] = [];
  for (let c = 0; c < COLS; c++) {
    const col = new Float32Array(N_BINS);
    for (let r = 0; r < N_BINS; r++) {
      // FLIP rows: image row 0 is visual TOP → maps to high pitch (bin N-1)
      const imgRow = N_BINS - 1 - r;
      const o = (imgRow * COLS + c) * 4;
      // perceptual luminance
      const lum =
        (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
      col[r] = lum;
    }
    // per-column contrast: subtract column floor, normalise gently so a flat
    // column doesn't drone every bin at once (keeps it a SCORE not a wash)
    let min = 1,
      max = 0;
    for (let r = 0; r < N_BINS; r++) {
      if (col[r] < min) min = col[r];
      if (col[r] > max) max = col[r];
    }
    const span = Math.max(1e-3, max - min);
    for (let r = 0; r < N_BINS; r++) {
      col[r] = Math.max(0, (col[r] - min) / span) * (0.4 + 0.6 * max);
    }
    amps.push(col);
  }
  return { cols: COLS, rows: N_BINS, amps };
}
