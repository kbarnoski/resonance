// ── Presence Bloom · body sensing (MediaPipe Pose) + synthetic ghost body ────
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// guarded with `webpackIgnore` so the bundler never resolves the remote URL — it
// is never added to package.json and the production build never depends on it.

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

// MediaPipe Pose landmark indices we use.
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

// Bones we draw as the faint presence skeleton.
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

// Load the landmarker from the CDN. `webpackIgnore` keeps the bundler from
// statically resolving the remote URL.
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

// ── A normalized, mirrored, y-up body in [-1,1] space ────────────────────────
export interface BodyFeatures {
  motion: number; // overall body motion 0..1
  brightness: number; // raised hands + motion 0..1
}

export interface Body {
  pts: Record<number, { x: number; y: number; z: number; v: number }>;
  feat: BodyFeatures;
}

// Convert a MediaPipe landmark array into our mirrored, y-up Body.
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
      z: clamp01(0.5 - p.z),
      v: p.visibility ?? 1,
    };
  }

  const ls = pts[LM.leftShoulder];
  const rs = pts[LM.rightShoulder];
  const lw = pts[LM.leftWrist];
  const rw = pts[LM.rightWrist];

  const shoulderY = (ls.y + rs.y) / 2;
  const handLift = clamp01(
    ((lw.y - shoulderY + (rw.y - shoulderY)) / 2 + 0.4) / 1.2,
  );

  const cx = (ls.x + rs.x) / 2;
  const cy = (ls.y + rs.y) / 2;
  const motion = clamp01(
    Math.hypot(cx - prevCentre[0], cy - prevCentre[1]) * 6,
  );

  const brightness = clamp01(handLift * 0.6 + motion * 0.55);

  return { body: { pts, feat: { motion, brightness } }, centre: [cx, cy] };
}

// ── Synthetic ghost body: drifts and reaches with no hardware at all ─────────
// Same shape as bodyFromLandmarks output so real input can take over seamlessly.
export function makeGhostBody(tSec: number): Body {
  const sw = 0.3;
  const breathe = Math.sin(tSec * 0.4) * 0.05;
  // Slow, offset reaches so the ghost paints the whole sphere over minutes.
  const lArm = tSec * 0.33;
  const rArm = tSec * 0.29 + Math.PI * 0.7;
  const reach = 0.6 + Math.sin(tSec * 0.17) * 0.35;

  const shoulderY = 0.34 + breathe;
  const hipY = -0.34 + breathe;
  const lShoulder = { x: sw, y: shoulderY };
  const rShoulder = { x: -sw, y: shoulderY };

  const lWrist = {
    x: sw + Math.cos(lArm) * reach + 0.12,
    y: shoulderY + Math.sin(lArm) * reach * 0.95,
  };
  const rWrist = {
    x: -sw - Math.cos(rArm) * reach - 0.12,
    y: shoulderY + Math.sin(rArm) * reach * 0.95,
  };
  const lElbow = {
    x: (lShoulder.x + lWrist.x) / 2 + 0.04,
    y: (lShoulder.y + lWrist.y) / 2,
  };
  const rElbow = {
    x: (rShoulder.x + rWrist.x) / 2 - 0.04,
    y: (rShoulder.y + rWrist.y) / 2,
  };

  const mk = (x: number, y: number, z = 0.5) => ({ x, y, z, v: 1 });
  const pts: Body["pts"] = {
    [LM.nose]: mk(Math.sin(tSec * 0.35) * 0.06, shoulderY + 0.45),
    [LM.leftShoulder]: mk(lShoulder.x, lShoulder.y),
    [LM.rightShoulder]: mk(rShoulder.x, rShoulder.y),
    [LM.leftElbow]: mk(lElbow.x, lElbow.y),
    [LM.rightElbow]: mk(rElbow.x, rElbow.y),
    [LM.leftWrist]: mk(lWrist.x, lWrist.y),
    [LM.rightWrist]: mk(rWrist.x, rWrist.y),
    [LM.leftHip]: mk(sw * 0.7, hipY),
    [LM.rightHip]: mk(-sw * 0.7, hipY),
  };

  const handLift = clamp01(((lWrist.y + rWrist.y) / 2 + 0.2) / 1.2);
  const motion = 0.3 + Math.abs(Math.sin(tSec * 0.45)) * 0.3;
  return { pts, feat: { motion, brightness: clamp01(handLift * 0.6 + 0.3) } };
}

// ── Per-wrist gesture detector: dwell, then an outward flick (speed peak) ─────
// Spawns at most one voice per completed gesture so placement stays intentional.
export interface WristTracker {
  hist: Array<{ x: number; y: number; z: number; t: number }>;
  dwellStart: number; // when the wrist became slow enough to "load"
  armed: boolean; // dwell satisfied → ready to fire on a flick
  cooldownUntil: number;
}

export function makeWristTracker(): WristTracker {
  return { hist: [], dwellStart: -1, armed: false, cooldownUntil: 0 };
}

export interface PlaceEvent {
  x: number;
  y: number;
  z: number; // depth 0..1
}

// Feed a wrist point each frame; returns a PlaceEvent on a completed gesture.
export function runWristGesture(
  tr: WristTracker,
  pt: { x: number; y: number; z: number },
  tSec: number,
): PlaceEvent | null {
  tr.hist.push({ ...pt, t: tSec });
  // Keep ~0.4s of history.
  while (tr.hist.length > 2 && tSec - tr.hist[0].t > 0.4) tr.hist.shift();

  // Instantaneous speed from the last two samples.
  let speed = 0;
  if (tr.hist.length >= 2) {
    const a = tr.hist[tr.hist.length - 2];
    const b = tr.hist[tr.hist.length - 1];
    const dt = Math.max(1e-3, b.t - a.t);
    speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
  }

  if (tSec < tr.cooldownUntil) return null;

  const SLOW = 0.55; // below this → dwelling
  const FAST = 1.9; // above this → flick

  if (speed < SLOW) {
    if (tr.dwellStart < 0) tr.dwellStart = tSec;
    if (tSec - tr.dwellStart > 0.65) tr.armed = true;
  } else if (speed > FAST && tr.armed) {
    // Fire: place a voice at the current wrist position.
    tr.armed = false;
    tr.dwellStart = -1;
    tr.cooldownUntil = tSec + 1.1;
    return { x: pt.x, y: pt.y, z: pt.z };
  } else if (speed > SLOW * 1.6) {
    // Moving but not a flick — break the dwell so it must re-load.
    tr.dwellStart = -1;
    tr.armed = false;
  }
  return null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
