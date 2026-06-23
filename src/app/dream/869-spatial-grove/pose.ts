// pose.ts — whole-body sensing for Spatial Grove (MediaPipe Pose) + auto-demo.
//
// We track only what the grove needs from the body:
//   • torso-centre x  → listener X (pan laterally across the grove)
//   • shoulder-width  → depth proxy → listener Z (walk deeper / nearer)
// Both are EMA-smoothed in the page; here we just extract the raw features.
//
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// so the bundler never resolves the remote URL and it never enters package.json.

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
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
const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

// Load the landmarker from the CDN. Indirect `new Function` import keeps webpack
// from statically analysing the remote URL (never bundled, never in deps).
export async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const visionMod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await visionMod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return visionMod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// The two raw walking signals the grove reads each frame.
export interface WalkSignal {
  lateral: number; // -1 (left) .. 1 (right), mirrored so moving left feels left
  depth: number; // 0 (far / small body) .. 1 (near / large body)
  present: boolean; // did we actually see a torso this frame?
}

// Extract lateral position + depth proxy from a pose landmark array.
export function walkFromLandmarks(lm: Landmark[]): WalkSignal {
  const ls = lm[LM.leftShoulder];
  const rs = lm[LM.rightShoulder];
  const lh = lm[LM.leftHip];
  const rh = lm[LM.rightHip];
  if (!ls || !rs) return { lateral: 0, depth: 0.5, present: false };

  const vis = ((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2;
  if (vis < 0.35) return { lateral: 0, depth: 0.5, present: false };

  // Torso centre x: average shoulders + hips (when visible) in normalized [0,1].
  let cx = (ls.x + rs.x) / 2;
  if (lh && rh) cx = (cx + (lh.x + rh.x) / 2) / 2;
  // mirror (camera is selfie-flipped) and centre to [-1,1].
  const lateral = clamp((0.5 - cx) * 2 * 1.25, -1, 1);

  // Depth proxy: shoulder-width in normalized units. ~0.18 far .. ~0.45 near.
  const shoulderW = Math.abs(ls.x - rs.x);
  const depth = clamp01((shoulderW - 0.16) / (0.42 - 0.16));

  return { lateral, depth, present: true };
}

// ── Auto-demo: a synthetic listener walking a slow figure-8 through the grove ──
// Runs with zero hardware so a phone glance with no camera still hears + sees the
// grove bloom within ~1s. Lateral sweeps wide; depth oscillates so you wander in
// and out of clusters.
export function demoWalk(tSec: number): WalkSignal {
  const lateral = Math.sin(tSec * 0.28) * 0.92;
  // figure-8 in depth: faster than lateral, offset phase.
  const depth = 0.5 + Math.sin(tSec * 0.43 + Math.PI * 0.5) * 0.42;
  return { lateral: clamp(lateral, -1, 1), depth: clamp01(depth), present: true };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
