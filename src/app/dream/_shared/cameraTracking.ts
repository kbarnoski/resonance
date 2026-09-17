// ─────────────────────────────────────────────────────────────────────────────
// cameraTracking.ts — shared MediaPipe Tasks-Vision loaders for the dream lab.
//
// This is the canonical home of the runtime-CDN pattern proven in
// 15760-conduct / 15824-canon (hands) and 3760-ictus / 677-presence-field
// (pose): the `@mediapipe/tasks-vision` module is imported AT RUNTIME from
// jsdelivr through an indirect `new Function("return import(...)")`, so the
// bundler never resolves the URL during `next build`. Nothing lands in
// package.json, the module is SSR-safe (everything defers to call time), and
// the browser fetches the JS + WASM + model only when a visitor actually
// starts the camera.
//
// Every loader tries the GPU delegate first and falls back to CPU once —
// GPU-delegate init can fail on older integrated graphics while CPU still
// tracks hands at usable rates. Loaders throw on total failure: callers MUST
// degrade gracefully (pointer fallback, visible notice) per the lab rules.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const GESTURE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface Category {
  categoryName?: string;
  displayName?: string;
  score?: number;
}

export interface HandResult {
  landmarks: Landmark[][];
  handednesses?: Category[][];
  handedness?: Category[][];
}

export interface PoseResult {
  landmarks: Landmark[][];
}

export interface FaceResult {
  faceLandmarks: Landmark[][];
  faceBlendshapes?: { categories: Category[] }[];
}

export interface GestureResult {
  landmarks: Landmark[][];
  gestures: Category[][];
  handednesses?: Category[][];
  handedness?: Category[][];
}

export interface HandLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): HandResult;
  close(): void;
}
export interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
export interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceResult;
  close(): void;
}
export interface GestureRecognizerInst {
  recognizeForVideo(video: HTMLVideoElement, ts: number): GestureResult;
  close(): void;
}

interface BaseOptions {
  baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
  runningMode: "VIDEO" | "IMAGE";
}

interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: BaseOptions & { numHands?: number },
    ): Promise<HandLandmarkerInst>;
  };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: BaseOptions & { numPoses?: number },
    ): Promise<PoseLandmarkerInst>;
  };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: BaseOptions & {
        numFaces?: number;
        outputFaceBlendshapes?: boolean;
      },
    ): Promise<FaceLandmarkerInst>;
  };
  GestureRecognizer: {
    createFromOptions(
      fileset: unknown,
      opts: BaseOptions & { numHands?: number },
    ): Promise<GestureRecognizerInst>;
  };
}

let visionModPromise: Promise<MediaPipeVision> | null = null;
let filesetPromise: Promise<unknown> | null = null;

async function loadVision(): Promise<{
  mod: MediaPipeVision;
  fileset: unknown;
}> {
  if (!visionModPromise) {
    visionModPromise = (new Function(
      `return import("${MEDIAPIPE_CDN}")`,
    )() as Promise<unknown>) as Promise<MediaPipeVision>;
  }
  const mod = await visionModPromise;
  if (!filesetPromise) {
    filesetPromise = mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  }
  return { mod, fileset: await filesetPromise };
}

async function withGpuFallback<T>(
  create: (delegate: "GPU" | "CPU") => Promise<T>,
): Promise<T> {
  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}

/** Two-hand landmarker — the Canon/Conduct workhorse. Throws on failure. */
export async function createHandTracker(
  numHands = 2,
): Promise<HandLandmarkerInst> {
  const { mod, fileset } = await loadVision();
  return withGpuFallback((delegate) =>
    mod.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: "VIDEO",
      numHands,
    }),
  );
}

/** Full-body pose landmarker (lite model — fast enough for realtime). */
export async function createPoseTracker(
  numPoses = 1,
): Promise<PoseLandmarkerInst> {
  const { mod, fileset } = await loadVision();
  return withGpuFallback((delegate) =>
    mod.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses,
    }),
  );
}

/** Face landmarker, with expression blendshapes for conducting-by-face. */
export async function createFaceTracker(
  numFaces = 1,
): Promise<FaceLandmarkerInst> {
  const { mod, fileset } = await loadVision();
  return withGpuFallback((delegate) =>
    mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces,
      outputFaceBlendshapes: true,
    }),
  );
}

/** Canned-gesture recognizer (open palm, fist, point, thumbs, victory). */
export async function createGestureTracker(
  numHands = 2,
): Promise<GestureRecognizerInst> {
  const { mod, fileset } = await loadVision();
  return withGpuFallback((delegate) =>
    mod.GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: GESTURE_MODEL, delegate },
      runningMode: "VIDEO",
      numHands,
    }),
  );
}

// ── Camera setup ─────────────────────────────────────────────────────────────

/**
 * Open the webcam into a video element and resolve once frames are flowing.
 * Caller owns the element (usually hidden or a small mirrored preview) and
 * must stop the returned stream's tracks on teardown.
 */
export async function startCamera(
  video: HTMLVideoElement,
  constraints: MediaTrackConstraints = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: "user",
  },
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints,
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
  }
  return stream;
}

// ── Landmark indices ─────────────────────────────────────────────────────────

/** MediaPipe hand landmark indices (21 points). */
export const HAND_LM = {
  wrist: 0,
  thumbTip: 4,
  indexTip: 8,
  middleMcp: 9,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20,
} as const;

export const FINGER_TIPS = [4, 8, 12, 16, 20] as const;

/** MediaPipe pose landmark indices (33 points) — the ones protos read. */
export const POSE_LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

// ── Hand feature reading (Canon's proven conducting math) ────────────────────

export interface HandFeatures {
  /** Mirrored center in pos-space, right = +x, up = +y, roughly [-1.2, 1.2]. */
  cx: number;
  cy: number;
  /** 0 = fist … 1 = fully spread fingers. */
  open: number;
  fist: boolean;
  /** Vertical conducting height, 0 (bottom) … 1 (top). */
  height: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Normalized hand landmarks → mirrored center + openness + height, exactly as
 * validated in 15824-canon. The x-mirror makes the reading match a mirrored
 * webcam preview (it reads like a mirror to the person conducting).
 */
export function computeHandFeatures(lm: Landmark[]): HandFeatures {
  const cxN = 1 - lm[HAND_LM.middleMcp].x;
  const cyN = lm[HAND_LM.middleMcp].y;
  const wrist = lm[HAND_LM.wrist];
  const palm =
    Math.hypot(
      1 - wrist.x - (1 - lm[HAND_LM.middleMcp].x),
      wrist.y - lm[HAND_LM.middleMcp].y,
    ) + 1e-4;
  let sum = 0;
  for (const t of FINGER_TIPS) {
    sum += Math.hypot(1 - lm[t].x - (1 - wrist.x), lm[t].y - wrist.y);
  }
  const ratio = sum / FINGER_TIPS.length / palm;
  const open = clamp01((ratio - 1.4) / (2.6 - 1.4));
  const cx = (cxN * 2 - 1) * 1.2;
  const cy = ((1 - cyN) * 2 - 1) * 1.2;
  return {
    cx,
    cy,
    open,
    fist: open < 0.14,
    height: clamp01((cy + 1.2) / 2.4),
  };
}
