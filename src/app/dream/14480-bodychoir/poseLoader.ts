// ── Body Choir · whole-body sensing (MediaPipe Pose) + autonomous demo ────────
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// so the bundler never resolves the remote URL at build time — it is never added
// to package.json and the production build never depends on it resolving. The
// jsdelivr host is CSP-whitelisted, so the runtime import succeeds in the browser.

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
} as const;

// Bones drawn as the conductor skeleton (live + translucent ghosts).
export const BONES: ReadonlyArray<readonly [number, number]> = [
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

// Load the landmarker from the CDN. The indirect `new Function` import keeps
// webpack from statically analysing (and trying to resolve) the remote URL.
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

// ── The four conducting controls read every frame ────────────────────────────
export interface ConductControls {
  leftElev: number; // 0..1  left-arm elevation  → LOWER-half swell
  rightElev: number; // 0..1  right-arm elevation → UPPER-half swell
  spread: number; // 0..1  wrist-to-wrist span  → width + openness
  lean: number; // -1..1 torso tilt          → spectral tilt
}

export interface Vec {
  x: number;
  y: number;
  z: number;
  v: number;
}

// One recorded moment of a conducting pass: the skeleton (for the ghost body)
// plus the control values it produced (for the summed mix).
export interface BodyFrame {
  pts: Record<number, Vec>;
  ctrl: ConductControls;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampS(n: number): number {
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

// Convert a MediaPipe landmark array into a mirrored, y-up BodyFrame, computing
// the four conducting controls. Low-visibility joints are guarded so a
// half-detected body never throws the mix into extremes.
export function frameFromLandmarks(lm: Landmark[]): BodyFrame {
  const pts: Record<number, Vec> = {};
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    pts[i] = {
      x: (0.5 - p.x) * 2, // mirror + centre → [-1,1]
      y: (0.5 - p.y) * 2, // invert so up is positive
      z: p.z,
      v: p.visibility ?? 1,
    };
  }

  const ls = pts[LM.leftShoulder];
  const rs = pts[LM.rightShoulder];
  const lw = pts[LM.leftWrist];
  const rw = pts[LM.rightWrist];

  const shoulderY = (ls.y + rs.y) / 2;
  const shoulderW = Math.max(0.18, Math.abs(ls.x - rs.x));

  // Arm elevation: wrist height relative to shoulder. Wrist at shoulder ≈ 0.5,
  // well above ≈ 1, hanging low ≈ 0. Guard on wrist visibility.
  const lVis = lw.v > 0.4 ? 1 : 0;
  const rVis = rw.v > 0.4 ? 1 : 0;
  const leftElev = lVis
    ? clamp01((lw.y - shoulderY) / 0.8 + 0.45)
    : 0;
  const rightElev = rVis
    ? clamp01((rw.y - shoulderY) / 0.8 + 0.45)
    : 0;

  // Two-arm spread: wrist span in shoulder-widths, mapped 0..1.
  const span = lVis && rVis ? Math.abs(lw.x - rw.x) : shoulderW;
  const spread = clamp01((span / shoulderW - 0.8) / 3.0);

  // Torso lean from shoulder tilt (positive = leaning to screen-right/brighter).
  const lean = clampS((rs.y - ls.y) / (shoulderW * 0.9));

  return { pts, ctrl: { leftElev, rightElev, spread, lean } };
}

// ── Autonomous "ghost conductor" (graceful degradation) ──────────────────────
// With no camera or a failed MediaPipe load, a synthetic drifting conductor
// slowly sweeps both arms so the piece is immediately audible and alive. Returns
// the same BodyFrame shape as frameFromLandmarks.
export function demoConductor(tSec: number): BodyFrame {
  const sw = 0.34; // half shoulder width
  const breathe = Math.sin(tSec * 0.5) * 0.05;
  const shoulderY = 0.28 + breathe;
  const hipY = -0.55 + breathe;

  // Each arm rides its own slow sinusoid so both wings of the catalog swell in
  // turn; a shared reach opens and closes the ensemble.
  const lSwing = Math.sin(tSec * 0.31) * 0.55; // vertical lift
  const rSwing = Math.sin(tSec * 0.31 + Math.PI * 0.8) * 0.55;
  const reach = 0.55 + Math.sin(tSec * 0.19) * 0.35;
  const tilt = Math.sin(tSec * 0.13) * 0.5;

  const lShoulder = { x: sw, y: shoulderY + tilt * 0.12 };
  const rShoulder = { x: -sw, y: shoulderY - tilt * 0.12 };
  const lWrist = { x: sw + reach, y: lShoulder.y + lSwing + 0.2 };
  const rWrist = { x: -sw - reach, y: rShoulder.y + rSwing + 0.2 };
  const lElbow = {
    x: (lShoulder.x + lWrist.x) / 2 + 0.05,
    y: (lShoulder.y + lWrist.y) / 2,
  };
  const rElbow = {
    x: (rShoulder.x + rWrist.x) / 2 - 0.05,
    y: (rShoulder.y + rWrist.y) / 2,
  };

  const mk = (x: number, y: number): Vec => ({ x, y, z: 0, v: 1 });
  const pts: Record<number, Vec> = {
    [LM.nose]: mk(Math.sin(tSec * 0.4) * 0.05, shoulderY + 0.5),
    [LM.leftShoulder]: mk(lShoulder.x, lShoulder.y),
    [LM.rightShoulder]: mk(rShoulder.x, rShoulder.y),
    [LM.leftElbow]: mk(lElbow.x, lElbow.y),
    [LM.rightElbow]: mk(rElbow.x, rElbow.y),
    [LM.leftWrist]: mk(lWrist.x, lWrist.y),
    [LM.rightWrist]: mk(rWrist.x, rWrist.y),
    [LM.leftHip]: mk(sw * 0.7, hipY),
    [LM.rightHip]: mk(-sw * 0.7, hipY),
  };

  const shoulderYc = (lShoulder.y + rShoulder.y) / 2;
  const ctrl: ConductControls = {
    leftElev: clamp01((lWrist.y - shoulderYc) / 0.8 + 0.45),
    rightElev: clamp01((rWrist.y - shoulderYc) / 0.8 + 0.45),
    spread: clamp01((Math.abs(lWrist.x - rWrist.x) - 0.9) / 1.6),
    lean: clampS(tilt),
  };
  return { pts, ctrl };
}
