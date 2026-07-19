// depth.ts — depth-field acquisition + feature extraction.
//
// The grid is filled from one of three sources (a graceful ladder), but they all
// produce the SAME DepthFeatures so the rest of the app is source-agnostic:
//   1. LIVE monocular depth — Depth-Anything-V2 (small) via Transformers.js on
//      WebGPU (wasm fallback), loaded at RUNTIME from a CDN. Larger = NEARER.
//   2. CAMERA PROXY — if the model won't load, derive a crude pseudo-depth from
//      the webcam (brightness + frame-difference presence) so live input works.
//   3. GHOST — a synthetic wandering presence (see ghost.ts) so the piece is
//      always alive without any sensor.
//
// The CDN import uses `/* webpackIgnore: true */` so webpack never resolves the
// URL at build time and nothing is added to package.json (mirrors the repo's
// hand-loom / depth-room loaders).

const CDN_TRANSFORMERS =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

export type DepthPipe = (input: unknown) => Promise<unknown>;

export interface DepthFeatures {
  centroidX: number; // 0..1 horizontal centre of the near region
  centroidY: number; // 0..1 vertical centre of the near region
  meanDepth: number; // 0..1 average depth of the near region (→ band)
  nearEnergy: number; // 0..1 how present/near the subject is
  motion: number; // 0..1 frame-to-frame change
}

/** Load Depth-Anything-V2-small as a depth-estimation pipeline. Throws on
 *  failure so the caller can degrade to the camera proxy / ghost. */
export async function loadDepthModel(): Promise<DepthPipe> {
  const mod = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ CDN_TRANSFORMERS as string
  ).catch(() => null);
  if (!mod) throw new Error("transformers cdn import failed");
  const { pipeline, env } = mod as {
    pipeline: (task: string, model: string, opts: unknown) => Promise<unknown>;
    env: { allowLocalModels: boolean };
  };
  env.allowLocalModels = false;
  const model = "onnx-community/depth-anything-v2-small";
  const pipe = await pipeline("depth-estimation", model, {
    device: "webgpu",
  }).catch(() => pipeline("depth-estimation", model, { device: "wasm" }));
  return pipe as DepthPipe;
}

/** Average a full-res depth map into the small analysis grid. */
export function downsampleToGrid(
  src: Float32Array | Uint8Array,
  srcW: number,
  srcH: number,
  out: Float32Array,
  gw: number,
  gh: number,
  normalize255: boolean,
): void {
  const cw = srcW / gw;
  const ch = srcH / gh;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
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
      // mirror horizontally so it reads like a mirror
      out[gy * gw + (gw - 1 - gx)] = v;
    }
  }
}

/** Crude pseudo-depth from a webcam frame already drawn onto `pixels` (gw×gh
 *  RGBA). Brightness → base depth; frame-difference → presence boost. `prevLum`
 *  holds last frame's luminance and is updated in place. */
export function applyCameraProxy(
  pixels: Uint8ClampedArray,
  out: Float32Array,
  prevLum: Float32Array,
  gw: number,
  gh: number,
): void {
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      const p = i * 4;
      const lum =
        (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) /
        255;
      const diff = Math.abs(lum - prevLum[i]);
      prevLum[i] = lum;
      let v = 0.12 + 0.5 * lum + 2.4 * diff;
      v = Math.max(0, Math.min(1, v));
      // mirror horizontally (selfie view)
      out[gy * gw + (gw - 1 - gx)] = v;
    }
  }
}

/** Extract the near-region centroid + presence + motion from the grid. */
export function applyFeatures(
  grid: Float32Array,
  prev: Float32Array,
  gw: number,
  gh: number,
  nearThresh = 0.55,
): DepthFeatures {
  let nearSum = 0;
  let wx = 0;
  let wy = 0;
  let wSum = 0;
  let depthSum = 0;
  let motion = 0;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      const v = grid[i];
      const nearness = v > nearThresh ? (v - nearThresh) / (1 - nearThresh) : 0;
      nearSum += nearness;
      const w = nearness * nearness;
      wx += (gx / (gw - 1)) * w;
      wy += (gy / (gh - 1)) * w;
      depthSum += v * w;
      wSum += w;
      motion += Math.abs(v - prev[i]);
    }
  }
  const cells = gw * gh;
  const nearEnergy = Math.min(1, (nearSum / cells) * 2.6);
  const centroidX = wSum > 1e-4 ? wx / wSum : 0.5;
  const centroidY = wSum > 1e-4 ? wy / wSum : 0.5;
  const meanDepth = wSum > 1e-4 ? depthSum / wSum : 0.5;
  const motionN = Math.min(1, (motion / cells) * 9);
  return { centroidX, centroidY, meanDepth, nearEnergy, motion: motionN };
}
