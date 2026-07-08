// handLoader.ts — MediaPipe Tasks-Vision HandLandmarker, loaded at RUNTIME from
// a CDN. The import URL is external, so webpack must NOT try to resolve it during
// `next build`: the `/* webpackIgnore: true */` magic comment keeps the bundle
// clean and the dep out of package.json. We declare only the shapes we use and
// narrow the CDN module from `unknown` — no `any`, so the strict build stays
// green. Tries the GPU delegate first, then retries on CPU.

const CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandResult {
  landmarks: HandLandmark[][];
}

export interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandResult;
  close(): void;
}

interface FilesetResolverLike {
  forVisionTasks(wasmRoot: string): Promise<unknown>;
}

interface HandLandmarkerStatic {
  createFromOptions(
    fileset: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
      runningMode: "VIDEO" | "IMAGE";
      numHands: number;
    },
  ): Promise<HandLandmarkerLike>;
}

interface VisionModule {
  FilesetResolver: FilesetResolverLike;
  HandLandmarker: HandLandmarkerStatic;
}

function isVisionModule(m: unknown): m is VisionModule {
  if (typeof m !== "object" || m === null) return false;
  const rec = m as Record<string, unknown>;
  return (
    typeof rec.FilesetResolver === "object" &&
    rec.FilesetResolver !== null &&
    typeof rec.HandLandmarker === "object" &&
    rec.HandLandmarker !== null
  );
}

/** Create a one-hand VIDEO-mode landmarker. Throws if the CDN module is missing
 *  or WebGL/WASM is unavailable — callers must catch and degrade gracefully. */
export async function makeHandLandmarker(): Promise<HandLandmarkerLike> {
  const mod = (await import(/* webpackIgnore: true */ CDN)) as unknown;
  if (!isVisionModule(mod)) {
    throw new Error("MediaPipe vision module shape unexpected");
  }
  const fileset = await mod.FilesetResolver.forVisionTasks(WASM_ROOT);
  try {
    return await mod.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch {
    // GPU delegate unavailable → retry on CPU.
    return mod.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }
}
