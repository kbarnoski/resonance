// ── Presence Field · body sensing (MediaPipe Pose) + auto-demo body ──────────
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// so the bundler never tries to resolve the remote URL — it is never added to
// package.json and the production build never depends on it resolving.

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

// MediaPipe Pose landmark indices.
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
} as const;

// Bones we draw as the luminous skeleton.
export const BONES: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [0, 11],
  [0, 12],
];

// Load the landmarker from the CDN. Indirect `new Function` import keeps webpack
// from statically analysing the remote URL.
export async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const visionMod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await visionMod.FilesetResolver.forVisionTasks(
    MEDIAPIPE_WASM,
  );
  return visionMod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// ── Features the audio + visuals read each frame ─────────────────────────────
export interface PoseFeatures {
  spread: number; // 0 narrow .. 1 arms wide
  brightness: number; // 0 .. 1 (raised hands + motion)
  motion: number; // overall body motion 0..1
}

// A normalized, mirrored body in [-1,1] space, with computed features and the
// raw points for drawing. y is up-positive (we invert MediaPipe's down-y).
export interface Body {
  // region → normalized position in [-1,1] (x right, y up), z depth 0..1.
  pts: Record<number, { x: number; y: number; z: number; v: number }>;
  feat: PoseFeatures;
}

// Convert a MediaPipe landmark array into our mirrored, y-up Body, computing
// features and per-frame motion against the previous centre.
export function bodyFromLandmarks(
  lm: Landmark[],
  prevCentre: [number, number],
): { body: Body; centre: [number, number] } {
  const pts: Body["pts"] = {};
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    pts[i] = {
      x: (0.5 - p.x) * 2, // mirror + center → [-1,1]
      y: (0.5 - p.y) * 2, // invert so up is positive
      z: clamp01(0.5 - p.z), // rough depth, closer ≈ larger
      v: p.visibility ?? 1,
    };
  }

  const ls = pts[LM.leftShoulder];
  const rs = pts[LM.rightShoulder];
  const lw = pts[LM.leftWrist];
  const rw = pts[LM.rightWrist];

  const shoulderW = Math.max(0.05, Math.abs(ls.x - rs.x));
  const wristSpan = Math.abs(lw.x - rw.x);
  const spread = clamp01((wristSpan / (shoulderW * 4)) * 1.0);

  const shoulderY = (ls.y + rs.y) / 2;
  const handLift = clamp01(
    ((lw.y - shoulderY + (rw.y - shoulderY)) / 2 + 0.4) / 1.2,
  );

  const cx = (ls.x + rs.x) / 2;
  const cy = (ls.y + rs.y) / 2;
  const motion = clamp01(
    Math.hypot(cx - prevCentre[0], cy - prevCentre[1]) * 6,
  );

  const brightness = clamp01(handLift * 0.7 + motion * 0.5);

  return {
    body: { pts, feat: { spread, brightness, motion } },
    centre: [cx, cy],
  };
}

// ── Auto-demo: a synthetic drifting "body" whose limbs sweep the voices ──────
// Runs with zero hardware so a silent glance still hears + sees the spatial
// ensemble. Returns a Body in the same shape as bodyFromLandmarks output.
export function demoBody(tSec: number): Body {
  const sw = 0.32; // half shoulder width
  const breathe = Math.sin(tSec * 0.5) * 0.04;
  // Arms sweep on slow, offset sinusoids so voices orbit the room.
  const lArm = tSec * 0.55;
  const rArm = tSec * 0.55 + Math.PI * 0.85;
  const reach = 0.55 + Math.sin(tSec * 0.27) * 0.35; // arms open & close

  const shoulderY = 0.35 + breathe;
  const hipY = -0.35 + breathe;

  const lShoulder = { x: sw, y: shoulderY };
  const rShoulder = { x: -sw, y: shoulderY };

  const lWrist = {
    x: sw + Math.cos(lArm) * reach + 0.15,
    y: shoulderY + Math.sin(lArm) * reach * 0.9,
  };
  const rWrist = {
    x: -sw - Math.cos(rArm) * reach - 0.15,
    y: shoulderY + Math.sin(rArm) * reach * 0.9,
  };
  const lElbow = {
    x: (lShoulder.x + lWrist.x) / 2 + 0.05,
    y: (lShoulder.y + lWrist.y) / 2,
  };
  const rElbow = {
    x: (rShoulder.x + rWrist.x) / 2 - 0.05,
    y: (rShoulder.y + rWrist.y) / 2,
  };

  const mk = (x: number, y: number, z = 0.5) => ({ x, y, z, v: 1 });
  const pts: Body["pts"] = {
    [LM.nose]: mk(Math.sin(tSec * 0.4) * 0.06, shoulderY + 0.45),
    [LM.leftShoulder]: mk(lShoulder.x, lShoulder.y),
    [LM.rightShoulder]: mk(rShoulder.x, rShoulder.y),
    [LM.leftElbow]: mk(lElbow.x, lElbow.y),
    [LM.rightElbow]: mk(rElbow.x, rElbow.y),
    [LM.leftWrist]: mk(lWrist.x, lWrist.y),
    [LM.rightWrist]: mk(rWrist.x, rWrist.y),
    [LM.leftHip]: mk(sw * 0.7, hipY),
    [LM.rightHip]: mk(-sw * 0.7, hipY),
  };

  const spread = clamp01((Math.abs(lWrist.x - rWrist.x) / 2.4));
  const handLift = clamp01(((lWrist.y + rWrist.y) / 2 + 0.2) / 1.2);
  const motion = 0.35 + Math.abs(Math.sin(tSec * 0.55)) * 0.3;
  return {
    pts,
    feat: { spread, brightness: clamp01(handLift * 0.7 + 0.3), motion },
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
