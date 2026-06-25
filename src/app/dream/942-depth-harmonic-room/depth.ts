// depth.ts — depth field acquisition + feature extraction → Tonnetz coordinates.
//
// One small depth grid (16×12) is fed from one of three sources, in order of
// preference, but ALL produce the same DepthFeatures so the rest of the app is
// source-agnostic:
//   1. Live monocular depth — Depth Anything V2 (small) via Transformers.js on
//      WebGPU. Larger value = NEARER.
//   2. Pointer position over the canvas (laptop, no camera).
//   3. Synthetic procedural "presence" blob on a slow Lissajous path (auto-demo).
//
// From the grid we read: nearEnergy (proximity), centroidX (lateral),
// depthBand (near-zone depth → the other Tonnetz axis), and motion.

import { LAT_COLS, LAT_ROWS } from "./harmony";

export const GRID_W = 16;
export const GRID_H = 12;
export const PROC_W = 256;
export const PROC_H = 192;

export interface DepthFeatures {
  nearEnergy: number; // 0..1 how close the subject is (brightness/openness)
  centroidX: number; // 0..1 lateral position of nearest region (→ lattice col)
  depthBand: number; // 0..1 near-zone depth band (→ lattice row)
  motion: number; // 0..1 frame-to-frame change (shimmer/attack)
  /** lattice cell derived from centroidX (col) and depthBand (row) */
  col: number; // 0..LAT_COLS-1 (continuous, callers round)
  row: number; // 0..LAT_ROWS-1
}

export function blankFeatures(): DepthFeatures {
  return {
    nearEnergy: 0,
    centroidX: 0.5,
    depthBand: 0.5,
    motion: 0,
    col: (LAT_COLS - 1) / 2,
    row: (LAT_ROWS - 1) / 2,
  };
}

// Average a full-res depth map into the small grid.
export function downsampleToGrid(
  src: Float32Array | Uint8Array,
  srcW: number,
  srcH: number,
  out: Float32Array,
  normalize255: boolean,
): void {
  const cw = srcW / GRID_W;
  const ch = srcH / GRID_H;
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor(gx * cw);
      const y0 = Math.floor(gy * ch);
      const x1 = Math.min(Math.floor((gx + 1) * cw), srcW);
      const y1 = Math.min(Math.floor((gy + 1) * ch), srcH);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * srcW;
        for (let x = x0; x < x1; x++) {
          sum += src[row + x];
          n++;
        }
      }
      let v = n > 0 ? sum / n : 0;
      if (normalize255) v /= 255;
      out[gy * GRID_W + gx] = v;
    }
  }
}

// Synthetic depth: a slow-drifting radial presence blob (Lissajous path) so the
// room is never blank and harmony keeps walking on its own (hands-off demo).
export function runSyntheticField(out: Float32Array, t: number): void {
  const cx = 0.5 + 0.34 * Math.sin(t * 0.19) * Math.cos(t * 0.063);
  const cy = 0.5 + 0.3 * Math.sin(t * 0.13 + 1.1);
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.42);
  const radius = 0.2 + 0.16 * breathe;
  const inv2r2 = 1 / (2 * radius * radius);
  for (let gy = 0; gy < GRID_H; gy++) {
    const ny = gy / (GRID_H - 1);
    for (let gx = 0; gx < GRID_W; gx++) {
      const nx = gx / (GRID_W - 1);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      let v = Math.exp(-d2 * inv2r2);
      v += 0.06 * Math.sin(nx * 8 + t * 0.7) * Math.sin(ny * 6 - t * 0.5);
      v = 0.12 + 0.85 * v;
      out[gy * GRID_W + gx] = Math.max(0, Math.min(1, v));
    }
  }
}

// Pointer-driven depth: paint a soft blob at the pointer (px,py in 0..1), with
// proximity = inverse of vertical position (top = far, bottom = near) so the
// laptop user controls both Tonnetz axes by moving the mouse.
export function runPointerField(
  out: Float32Array,
  px: number,
  py: number,
  t: number,
): void {
  const cx = px;
  const cy = py;
  const radius = 0.24;
  const inv2r2 = 1 / (2 * radius * radius);
  for (let gy = 0; gy < GRID_H; gy++) {
    const ny = gy / (GRID_H - 1);
    for (let gx = 0; gx < GRID_W; gx++) {
      const nx = gx / (GRID_W - 1);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      let v = Math.exp(-d2 * inv2r2);
      v += 0.04 * Math.sin(nx * 7 + t * 0.6);
      v = 0.12 + 0.85 * v;
      out[gy * GRID_W + gx] = Math.max(0, Math.min(1, v));
    }
  }
}

// Extract features + map to a Tonnetz cell.
export function applyFeatures(
  grid: Float32Array,
  prev: Float32Array,
  nearThresh = 0.6,
): DepthFeatures {
  let nearSum = 0;
  let nearWX = 0;
  let nearWY = 0;
  let nearW = 0;
  let motion = 0;

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gy * GRID_W + gx;
      const v = grid[i];
      const nearness = v > nearThresh ? (v - nearThresh) / (1 - nearThresh) : 0;
      nearSum += nearness;
      const w = nearness * nearness;
      nearWX += (gx / (GRID_W - 1)) * w;
      nearWY += (gy / (GRID_H - 1)) * w;
      nearW += w;
      motion += Math.abs(v - prev[i]);
    }
  }

  const cells = GRID_W * GRID_H;
  const nearEnergy = Math.min(1, (nearSum / cells) * 2.4);
  const centroidX = nearW > 1e-4 ? nearWX / nearW : 0.5;
  const centroidY = nearW > 1e-4 ? nearWY / nearW : 0.5;
  const motionN = Math.min(1, (motion / cells) * 9);

  // depthBand: combine raw proximity (nearEnergy) with vertical centroid so
  // "lean in" (more near) AND "lower in frame" both push toward the bright band.
  const depthBand = Math.max(0, Math.min(1, 0.6 * nearEnergy + 0.4 * (1 - centroidY)));

  // map to lattice: col across the full width; row inverted so near = row 0
  // (bright/major band), far = last row (dark/minor band).
  const col = centroidX * (LAT_COLS - 1);
  const row = (1 - depthBand) * (LAT_ROWS - 1);

  return { nearEnergy, centroidX, depthBand, motion: motionN, col, row };
}
