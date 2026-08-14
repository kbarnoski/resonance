// poseLoader.ts — MediaPipe Tasks-Vision PoseLandmarker, loaded at RUNTIME from a CDN.
//
// The import URL is external, so webpack must NOT try to resolve it during
// `next build`: the `/* webpackIgnore: true */` magic comment keeps the bundle
// clean and the dependency out of package.json. We declare only the shapes we
// use and narrow the CDN module from `unknown` — no `any`, so the strict build
// stays green. All browser work is deferred to call time, so this module is
// SSR-safe and server-renders without touching `window`.

const CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseResult {
  landmarks: PoseLandmark[][];
}

export interface PoseLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseResult;
  close(): void;
}

interface FilesetResolverLike {
  forVisionTasks(wasmRoot: string): Promise<unknown>;
}

interface PoseLandmarkerStatic {
  createFromOptions(
    fileset: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
      runningMode: "VIDEO" | "IMAGE";
      numPoses: number;
    },
  ): Promise<PoseLandmarkerLike>;
}

interface VisionModule {
  FilesetResolver: FilesetResolverLike;
  PoseLandmarker: PoseLandmarkerStatic;
}

function isVisionModule(m: unknown): m is VisionModule {
  if (typeof m !== "object" || m === null) return false;
  const rec = m as Record<string, unknown>;
  return (
    typeof rec.FilesetResolver === "object" &&
    rec.FilesetResolver !== null &&
    typeof rec.PoseLandmarker === "object" &&
    rec.PoseLandmarker !== null
  );
}

/** Create a single-pose VIDEO-mode landmarker (33 landmarks). Throws if the CDN
 *  module is missing or WebGL/WASM is unavailable — callers must catch and
 *  degrade to the seeded demo dancer. */
export async function makePoseLandmarker(): Promise<PoseLandmarkerLike> {
  const mod = (await import(/* webpackIgnore: true */ CDN)) as unknown;
  if (!isVisionModule(mod)) {
    throw new Error("MediaPipe vision module shape unexpected");
  }
  const fileset = await mod.FilesetResolver.forVisionTasks(WASM_ROOT);
  return mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}
