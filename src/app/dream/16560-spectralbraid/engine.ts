// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — offline STFT analysis of Karel's two real takes + a streaming
// overlap-add cross-synthesis engine driven by a painted time×frequency mask.
//
//   analysis:  each take → Hann-windowed STFT frames (magnitude + phase per bin)
//   mask:      a [cols × rows] grid in [0,1] — 0 = take A, 1 = take B
//   resynth:   per bin, magnitude is linearly blended by the mask, phase is
//              taken from whichever take dominates that cell → IFFT → overlap-add
//
// No oscillators, no noise: every output sample is Karel's recordings, morphed.
// ─────────────────────────────────────────────────────────────────────────────

import { fftRadix2 } from "./fft";

export const FFT_SIZE = 2048;
export const HOP = 512; // 4× overlap
export const HALF = FFT_SIZE / 2 + 1; // usable bins 0..N/2 (Hermitian)

/** Result of analysing one take: per-frame magnitude + phase arrays. */
export interface StftData {
  mag: Float32Array[]; // [frame][HALF]
  phase: Float32Array[]; // [frame][HALF]
  frames: number;
}

/** Downmix an AudioBuffer to a single mono Float32Array. */
export function toMono(buf: AudioBuffer): Float32Array {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i];
  }
  if (ch > 1) {
    const inv = 1 / ch;
    for (let i = 0; i < n; i++) out[i] *= inv;
  }
  return out;
}

/** Precomputed periodic Hann window of length FFT_SIZE. */
function hannWindow(): Float32Array {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  }
  return w;
}

const WIN = hannWindow();

/**
 * Analyse one mono take into STFT frames, capped at `maxFrames`. Yields
 * cooperatively via the optional `onProgress` callback so the UI stays alive.
 */
export async function analyzeTake(
  mono: Float32Array,
  maxFrames: number,
  onProgress?: (done: number, total: number) => void,
): Promise<StftData> {
  const total = Math.min(
    maxFrames,
    Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP)),
  );
  const mag: Float32Array[] = new Array(total);
  const phase: Float32Array[] = new Array(total);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < total; f++) {
    const start = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[start + i] || 0) * WIN[i];
      im[i] = 0;
    }
    fftRadix2(re, im, false);

    const m = new Float32Array(HALF);
    const p = new Float32Array(HALF);
    for (let b = 0; b < HALF; b++) {
      const rr = re[b];
      const ii = im[b];
      m[b] = Math.hypot(rr, ii);
      p[b] = Math.atan2(ii, rr);
    }
    mag[f] = m;
    phase[f] = p;

    // Yield every 64 frames so the "analysing" UI can paint.
    if (onProgress && (f & 63) === 0) {
      onProgress(f, total);
      await Promise.resolve();
    }
  }
  onProgress?.(total, total);
  return { mag, phase, frames: total };
}

/** Map every FFT bin (0..HALF-1) to a log-spaced display row. */
export function buildBinToRow(rows: number): Int16Array {
  const map = new Int16Array(HALF);
  const lo = 1;
  const hi = HALF - 1;
  const logLo = Math.log(lo);
  const logHi = Math.log(hi);
  for (let b = 0; b < HALF; b++) {
    const bb = Math.max(lo, b);
    let r = Math.floor(((Math.log(bb) - logLo) / (logHi - logLo)) * rows);
    if (r < 0) r = 0;
    if (r >= rows) r = rows - 1;
    map[b] = r;
  }
  return map;
}

/**
 * Build a coarse [cols × rows] magnitude map (0..1, dB-normalised) from an
 * StftData for painting the spectrogram backdrop.
 */
export function buildMagGrid(
  data: StftData,
  cols: number,
  rows: number,
  binToRow: Int16Array,
): Float32Array {
  const grid = new Float32Array(cols * rows);
  const count = new Float32Array(cols * rows);
  const frames = data.frames;
  for (let f = 0; f < frames; f++) {
    const col = Math.min(cols - 1, Math.floor((f / frames) * cols));
    const m = data.mag[f];
    for (let b = 1; b < HALF; b++) {
      const idx = col * rows + binToRow[b];
      grid[idx] += m[b];
      count[idx] += 1;
    }
  }
  // Average, then to dB, then normalise 0..1.
  let max = 1e-9;
  for (let i = 0; i < grid.length; i++) {
    if (count[i] > 0) grid[i] /= count[i];
    const db = 20 * Math.log10(grid[i] + 1e-9);
    grid[i] = db;
    if (db > max) max = db;
  }
  const floor = max - 70; // 70 dB dynamic window
  for (let i = 0; i < grid.length; i++) {
    let v = (grid[i] - floor) / (max - floor);
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    grid[i] = v;
  }
  return grid;
}

/**
 * Streaming overlap-add resynthesis. Reads the live mask each frame so painting
 * changes the sound in real time. Produces mono samples at the context rate.
 */
export class ResynthEngine {
  private takeA: StftData;
  private takeB: StftData;
  private frames: number;
  private cols: number;
  private rows: number;
  private mask: Float32Array; // live-updated by the UI (cols*rows)
  private binToRow: Int16Array;

  private tail = new Float32Array(FFT_SIZE);
  private spill = new Float32Array(HOP);
  private spillLen = 0;
  private framePos = 0;
  private norm: number;

  // scratch
  private re = new Float32Array(FFT_SIZE);
  private im = new Float32Array(FFT_SIZE);

  /** Current playback frame (for the playhead). */
  get currentFrame(): number {
    return this.framePos;
  }
  get totalFrames(): number {
    return this.frames;
  }

  constructor(
    takeA: StftData,
    takeB: StftData,
    mask: Float32Array,
    cols: number,
    rows: number,
    binToRow: Int16Array,
  ) {
    this.takeA = takeA;
    this.takeB = takeB;
    this.frames = Math.min(takeA.frames, takeB.frames);
    this.mask = mask;
    this.cols = cols;
    this.rows = rows;
    this.binToRow = binToRow;
    // Hann analysis+synthesis at 4× overlap sums window^2 to ~1.5.
    this.norm = 1 / 1.5;
  }

  /** Synthesize one FFT frame into this.tail (overlap-add), advance framePos. */
  private synthFrame(): void {
    const f = this.framePos % this.frames;
    const col = Math.min(this.cols - 1, Math.floor((f / this.frames) * this.cols));
    const magA = this.takeA.mag[f];
    const phA = this.takeA.phase[f];
    const magB = this.takeB.mag[f];
    const phB = this.takeB.phase[f];
    const re = this.re;
    const im = this.im;

    for (let b = 0; b < HALF; b++) {
      const m = this.mask[col * this.rows + this.binToRow[b]];
      const mag = (1 - m) * magA[b] + m * magB[b];
      const ph = m < 0.5 ? phA[b] : phB[b]; // dominant take's phase
      re[b] = mag * Math.cos(ph);
      im[b] = mag * Math.sin(ph);
    }
    // Hermitian mirror for the negative frequencies.
    for (let b = 1; b < HALF - 1; b++) {
      re[FFT_SIZE - b] = re[b];
      im[FFT_SIZE - b] = -im[b];
    }

    fftRadix2(re, im, true); // inverse (÷N applied inside)

    const n = this.norm;
    for (let i = 0; i < FFT_SIZE; i++) {
      this.tail[i] += re[i] * WIN[i] * n;
    }
    this.framePos = (this.framePos + 1) % this.frames;
  }

  /** Fill `out` with HOP-aligned resynthesised samples. */
  pull(out: Float32Array): void {
    let w = 0;
    // Drain any leftover from the previous block first.
    while (w < out.length && this.spillLen > 0) {
      out[w++] = this.spill[HOP - this.spillLen];
      this.spillLen--;
    }
    while (w < out.length) {
      this.synthFrame();
      // The first HOP samples of tail are now final.
      let k = 0;
      for (; k < HOP && w < out.length; k++) {
        out[w++] = this.tail[k];
      }
      // Stash any remainder of this hop for the next block.
      if (k < HOP) {
        for (let j = k; j < HOP; j++) this.spill[j] = this.tail[j];
        this.spillLen = HOP - k;
      }
      // Shift tail left by HOP.
      this.tail.copyWithin(0, HOP);
      this.tail.fill(0, FFT_SIZE - HOP);
    }
  }
}
