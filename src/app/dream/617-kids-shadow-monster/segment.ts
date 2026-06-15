// ─────────────────────────────────────────────────────────────────────────────
// segment.ts — full-body silhouette via MediaPipe ImageSegmenter (CDN, runtime).
//
// HONESTY NOTE: we use the segmentation MASK (a filled body silhouette), NOT
// pose / skeleton landmarks. This is deliberately distinct from prior
// pose-landmark pieces. We never read joints — only the filled body blob.
//
// @mediapipe/tasks-vision (ImageSegmenter) is imported dynamically from the
// jsDelivr CDN at runtime — NO npm dependency. The caller wraps the whole init
// in one try/catch so a denied camera / blocked CDN / WASM or model load error
// degrades gracefully to the no-camera fallback.
//
// Each frame we read the confidence/category mask, downsample it into a
// MASK_W*MASK_H occupancy grid (mirrored so it reads like a mirror), and hand
// that grid to MonsterTracker (see mask.ts) which derives the monster signals.
// ─────────────────────────────────────────────────────────────────────────────

import { MASK_W, MASK_H } from "./mask";

// ── CDN endpoints (ESM bundle + wasm fileset + selfie segmenter model) ────────
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
// Selfie (person vs background) segmenter — person confidence mask.
const SEG_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// ── Minimal typings for the CDN module (no `any`) ─────────────────────────────
interface MPMask {
  getAsFloat32Array(): Float32Array;
  width: number;
  height: number;
  close?: () => void;
}
interface SegResult {
  categoryMask?: MPMask;
  confidenceMasks?: MPMask[];
  close?: () => void;
}
interface ImageSegmenterInst {
  segmentForVideo(
    video: HTMLVideoElement,
    ts: number,
    cb: (result: SegResult) => void,
  ): void;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  ImageSegmenter: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        outputCategoryMask?: boolean;
        outputConfidenceMasks?: boolean;
      },
    ): Promise<ImageSegmenterInst>;
  };
}

export interface SilhouetteSegmenter {
  /**
   * Run segmentation for the current video frame and downsample the mask into
   * `out` (MASK_W*MASK_H, 1 = body). Returns true if a mask was produced.
   * Keeps the previous grid contents on a transient miss.
   */
  step: (video: HTMLVideoElement, nowMs: number, out: Float32Array) => boolean;
  close: () => void;
}

// Downsample a raw mask (mw*mh floats, ~1 = person) into the MASK_W*MASK_H grid.
// Mirrors X so the monster mirrors the kid (wave left → monster waves left).
function downsample(
  mask: Float32Array,
  mw: number,
  mh: number,
  out: Float32Array,
): void {
  for (let gy = 0; gy < MASK_H; gy++) {
    const sy = Math.min(mh - 1, Math.floor(((gy + 0.5) / MASK_H) * mh));
    for (let gx = 0; gx < MASK_W; gx++) {
      const sxN = 1 - (gx + 0.5) / MASK_W; // mirror
      const sx = Math.min(mw - 1, Math.floor(sxN * mw));
      out[gy * MASK_W + gx] = mask[sy * mw + sx] > 0.5 ? 1 : 0;
    }
  }
}

// Bring up the ImageSegmenter from the CDN. Throws on ANY failure; the caller
// wraps this in try/catch and shows the friendly no-camera fallback.
export async function createSilhouetteSegmenter(): Promise<SilhouetteSegmenter> {
  const vision = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_CDN
  )) as unknown as MediaPipeVision;
  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: SEG_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });

  let gotAny = false;

  function step(
    video: HTMLVideoElement,
    nowMs: number,
    out: Float32Array,
  ): boolean {
    if (video.readyState < 2) return gotAny;
    let produced = false;
    try {
      segmenter.segmentForVideo(video, nowMs, (result) => {
        const m = result.confidenceMasks?.[0] ?? result.categoryMask;
        if (m) {
          downsample(m.getAsFloat32Array(), m.width, m.height, out);
          produced = true;
          gotAny = true;
          try {
            m.close?.();
          } catch {
            /* mask already released */
          }
        }
        try {
          result.close?.();
        } catch {
          /* result already released */
        }
      });
    } catch {
      // transient segmenter hiccup — keep the previous grid.
    }
    return produced;
  }

  return {
    step,
    close: () => {
      try {
        segmenter.close();
      } catch {
        /* already closed */
      }
    },
  };
}
