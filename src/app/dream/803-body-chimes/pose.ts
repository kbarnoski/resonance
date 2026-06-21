// ── Body Chimes · body sensing (MediaPipe Pose) + self-playing ghost body ────
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// so the bundler never resolves the remote URL — it is never in package.json and
// the production build never depends on it resolving.

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
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

// MediaPipe Pose landmark indices.
export const LM = {
  nose: 0,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

// The five striker points we project into the 3D field of resonant bodies.
export type StrikerKey =
  | "head"
  | "leftWrist"
  | "rightWrist"
  | "leftAnkle"
  | "rightAnkle";

export const STRIKER_LM: Record<StrikerKey, number> = {
  head: LM.nose,
  leftWrist: LM.leftWrist,
  rightWrist: LM.rightWrist,
  leftAnkle: LM.leftAnkle,
  rightAnkle: LM.rightAnkle,
};

export const STRIKER_KEYS: StrikerKey[] = [
  "head",
  "leftWrist",
  "rightWrist",
  "leftAnkle",
  "rightAnkle",
];

// A striker point in normalized, mirrored, y-up scene space.
export interface Striker {
  x: number; // [-1,1] right+
  y: number; // [-1,1] up+
  z: number; // 0..1 depth (closer ≈ larger)
  v: number; // visibility 0..1
}

export type StrikerSet = Record<StrikerKey, Striker>;

// Load the landmarker from the CDN. The webpackIgnore comment keeps the bundler
// from trying to resolve the remote module at build time.
export async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const visionMod = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_CDN
  )) as unknown as MediaPipeVision;
  const fileset = await visionMod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return visionMod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// Convert a MediaPipe landmark array into our mirrored, y-up striker set.
export function strikersFromLandmarks(lm: Landmark[]): StrikerSet {
  const mk = (idx: number): Striker => {
    const p = lm[idx];
    if (!p) return { x: 0, y: 0, z: 0.5, v: 0 };
    return {
      x: (0.5 - p.x) * 2, // mirror + center → [-1,1]
      y: (0.5 - p.y) * 2, // invert so up is positive
      z: clamp01(0.5 - p.z), // rough depth
      v: p.visibility ?? 1,
    };
  };
  return {
    head: mk(STRIKER_LM.head),
    leftWrist: mk(STRIKER_LM.leftWrist),
    rightWrist: mk(STRIKER_LM.rightWrist),
    leftAnkle: mk(STRIKER_LM.leftAnkle),
    rightAnkle: mk(STRIKER_LM.rightAnkle),
  };
}

// ── Self-playing ghost body: drifting strikers that sweep the field ──────────
// Runs hands-free (camera denied / MediaPipe failed) so the room plays itself.
export function ghostStrikers(tSec: number): StrikerSet {
  const breathe = Math.sin(tSec * 0.4) * 0.05;
  // Wrists trace slow offset Lissajous orbits so they pass through bodies.
  const lw = orbit(tSec * 0.5, 0.7, 0.55, 0.45, 0.55 + breathe, 0.32);
  const rw = orbit(tSec * 0.5 + Math.PI * 0.9, 0.62, 0.5, 0.4, 0.55 + breathe, 0.42);
  // Ankles sweep low and slow.
  const la = orbit(tSec * 0.33 + 1.1, 0.4, 0.3, -0.55 + breathe, 0.2, 0.55);
  const ra = orbit(tSec * 0.33 + 2.7, 0.42, 0.28, -0.55 + breathe, 0.2, 0.6);
  const head: Striker = {
    x: Math.sin(tSec * 0.3) * 0.08,
    y: 0.45 + breathe,
    z: 0.5,
    v: 1,
  };
  return {
    head,
    leftWrist: lw,
    rightWrist: rw,
    leftAnkle: la,
    rightAnkle: ra,
  };
}

function orbit(
  t: number,
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  z: number,
): Striker {
  return {
    x: cx + Math.cos(t) * ax,
    y: cy + Math.sin(t * 1.3) * ay,
    z: clamp01(z + Math.sin(t * 0.7) * 0.25),
    v: 1,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
