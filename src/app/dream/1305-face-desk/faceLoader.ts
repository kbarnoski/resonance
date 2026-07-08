// faceLoader.ts — MediaPipe Tasks-Vision FaceLandmarker, loaded at RUNTIME from a CDN.
//
// The import URL is external, so webpack must NOT try to resolve it during
// `next build`: the `/* webpackIgnore: true */` magic comment keeps the bundle
// clean and the dep out of package.json. We declare only the shapes we use and
// narrow the CDN module from `unknown` — no `any`, so the strict build stays green.
//
// FaceLandmarker gives us, per video frame:
//   • faceBlendshapes[0].categories[]  — the 52 ARKit-style coefficients
//     (jawOpen, browInnerUp, eyeBlinkLeft, mouthSmileLeft, …) each 0..1.
//   • facialTransformationMatrixes[0].data — a column-major 4×4 that carries
//     head pose; we read yaw/pitch from it.

const CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface BlendCategory {
  categoryName: string;
  score: number;
}

export interface BlendGroup {
  categories: BlendCategory[];
}

export interface TransformMatrix {
  data: number[]; // column-major length-16
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceResult {
  faceBlendshapes?: BlendGroup[];
  facialTransformationMatrixes?: TransformMatrix[];
  faceLandmarks?: Landmark[][];
}

export interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceResult;
  close(): void;
}

interface FilesetResolverLike {
  forVisionTasks(wasmRoot: string): Promise<unknown>;
}

interface FaceLandmarkerStatic {
  createFromOptions(
    fileset: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
      runningMode: "VIDEO" | "IMAGE";
      numFaces: number;
      outputFaceBlendshapes: boolean;
      outputFacialTransformationMatrixes: boolean;
    },
  ): Promise<FaceLandmarkerLike>;
}

interface VisionModule {
  FilesetResolver: FilesetResolverLike;
  FaceLandmarker: FaceLandmarkerStatic;
}

function isVisionModule(m: unknown): m is VisionModule {
  if (typeof m !== "object" || m === null) return false;
  const rec = m as Record<string, unknown>;
  return (
    typeof rec.FilesetResolver === "object" &&
    rec.FilesetResolver !== null &&
    typeof rec.FaceLandmarker === "object" &&
    rec.FaceLandmarker !== null
  );
}

/** Create a single-face VIDEO-mode landmarker that emits blendshapes + head
 *  pose. Throws if the CDN module is missing or WebGL/WASM is unavailable —
 *  callers MUST catch and degrade gracefully. */
export async function makeFaceLandmarker(): Promise<FaceLandmarkerLike> {
  const mod = (await import(/* webpackIgnore: true */ CDN)) as unknown;
  if (!isVisionModule(mod)) {
    throw new Error("MediaPipe vision module shape unexpected");
  }
  const fileset = await mod.FilesetResolver.forVisionTasks(WASM_ROOT);
  return mod.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

/** Pull a named blendshape score (0..1) out of a result, 0 if absent. */
export function blendScore(res: FaceResult, name: string): number {
  const cats = res.faceBlendshapes?.[0]?.categories;
  if (!cats) return 0;
  for (const c of cats) if (c.categoryName === name) return c.score;
  return 0;
}

/** Approximate head yaw (turn L/R, radians) and pitch (nod, radians) from the
 *  column-major transformation matrix. Returns zeros if the matrix is absent. */
export function headPose(res: FaceResult): { yaw: number; pitch: number } {
  const m = res.facialTransformationMatrixes?.[0]?.data;
  if (!m || m.length < 16) return { yaw: 0, pitch: 0 };
  // Column-major: element [row + col*4]. Rotation block is the upper-left 3×3.
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];
  // yaw about the vertical axis, pitch about the horizontal axis.
  const yaw = Math.atan2(-r20, Math.hypot(r21, r22));
  const pitch = Math.atan2(r10, r00);
  return { yaw, pitch };
}
