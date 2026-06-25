// depth.ts — depth field acquisition + feature extraction
//
// Two sources feed the SAME small depth grid:
//   1. Live monocular depth from Depth Anything V2 (via Transformers.js / WebGPU).
//   2. A synthetic procedural z-field (fallback) so the room is never blank/silent.
//
// All values are normalized 0..1 where 1 = NEAR (close to camera) and 0 = FAR.
// (Depth Anything outputs larger = closer for its visualized depth; we keep that
// convention so "lean in" => more near-energy.)

export const GRID_W = 16;
export const GRID_H = 12;
export const PROC_W = 256;
export const PROC_H = 192;

export interface DepthFeatures {
  nearEnergy: number; // 0..1 — fraction/intensity of frame that is CLOSE
  spread: number; // 0..1 — histogram spread (how stratified the room is)
  centroidX: number; // 0..1 — x of the nearest region (0 = left)
  centroidY: number; // 0..1 — y of the nearest region (0 = top)
  motion: number; // 0..1 — frame-to-frame depth change (motion-in-depth)
}

// Average a full-resolution depth map (Float, 0..1, near=1) into the small grid.
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

// Synthetic z-field: a slow-drifting radial "presence" blob with breathing,
// rendered straight into the grid. near=1 at the blob center.
export function runSyntheticField(out: Float32Array, t: number): void {
  // blob center drifts on a slow Lissajous path
  const cx = 0.5 + 0.28 * Math.sin(t * 0.21) * Math.cos(t * 0.07);
  const cy = 0.5 + 0.22 * Math.sin(t * 0.17 + 1.3);
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.55); // 0..1
  const radius = 0.22 + 0.16 * breathe;
  const inv2r2 = 1 / (2 * radius * radius);
  for (let gy = 0; gy < GRID_H; gy++) {
    const ny = gy / (GRID_H - 1);
    for (let gx = 0; gx < GRID_W; gx++) {
      const nx = gx / (GRID_W - 1);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      // gaussian near-blob + faint secondary ripple for texture
      let v = Math.exp(-d2 * inv2r2);
      v += 0.08 * Math.sin(nx * 9 + t * 0.9) * Math.sin(ny * 7 - t * 0.6);
      // gentle far floor so the drone bed always has presence
      v = 0.12 + 0.85 * v;
      out[gy * GRID_W + gx] = Math.max(0, Math.min(1, v));
    }
  }
}

// Extract musical features from the grid + the previous grid (for motion).
export function applyFeatures(
  grid: Float32Array,
  prev: Float32Array,
  nearThresh = 0.62,
): DepthFeatures {
  let nearSum = 0;
  let nearWX = 0;
  let nearWY = 0;
  let nearW = 0;
  let motion = 0;
  let min = 1;
  let max = 0;

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gy * GRID_W + gx;
      const v = grid[i];
      if (v < min) min = v;
      if (v > max) max = v;
      // near energy: emphasize values above threshold
      const nearness = v > nearThresh ? (v - nearThresh) / (1 - nearThresh) : 0;
      nearSum += nearness;
      // weight centroid by nearness so it tracks the closest region
      const w = nearness * nearness;
      nearWX += (gx / (GRID_W - 1)) * w;
      nearWY += (gy / (GRID_H - 1)) * w;
      nearW += w;
      motion += Math.abs(v - prev[i]);
    }
  }

  const cells = GRID_W * GRID_H;
  const nearEnergy = Math.min(1, (nearSum / cells) * 2.4);
  const spread = Math.max(0, Math.min(1, max - min));
  const centroidX = nearW > 1e-4 ? nearWX / nearW : 0.5;
  const centroidY = nearW > 1e-4 ? nearWY / nearW : 0.5;
  const motionN = Math.min(1, (motion / cells) * 9);

  return {
    nearEnergy,
    spread,
    centroidX,
    centroidY,
    motion: motionN,
  };
}
