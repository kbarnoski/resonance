// ─────────────────────────────────────────────────────────────────────────────
// poseLoader.ts — MediaPipe Tasks-Vision PoseLandmarker, loaded at RUNTIME from
// a CDN. The remote URL is imported through an indirect `new Function` so the
// bundler never resolves it during `next build` — it stays out of package.json
// and production never depends on it resolving. Everything is deferred to call
// time, so this module is SSR-safe.
//
// Adapted from the proven pattern in 677-presence-field/pose.ts (kept self-
// contained here per the dream-lab cross-import rules). Extended to expose ankle
// landmarks, since a "strike" can be a hand OR a foot crossing its plane.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface PoseResult {
  landmarks: Landmark[][];
}

export interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}

interface MediaPipeVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numPoses?: number;
      },
    ): Promise<PoseLandmarkerInst>;
  };
}

// MediaPipe Pose landmark indices we read.
export const LM = {
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

// The four "strike limbs", in the audio-voice order used everywhere downstream.
// 0 = left hand, 1 = right hand, 2 = left foot, 3 = right foot.
export const STRIKE_LANDMARKS = [
  LM.leftWrist,
  LM.rightWrist,
  LM.leftAnkle,
  LM.rightAnkle,
] as const;

export const LIMB_LABELS = ["L·hand", "R·hand", "L·foot", "R·foot"] as const;

/** Load the landmarker from the CDN. Throws on failure — callers must degrade. */
export async function createPoseLandmarker(): Promise<PoseLandmarkerInst> {
  const visionMod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset =
    await visionMod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return visionMod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}
