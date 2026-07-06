// ── Tideglass · body sensing (MediaPipe Pose) + fallback frame builders ──────
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect
// import, so the bundler never resolves the remote URL and it never enters
// package.json. We read the two WRISTS (grain-heads), the SHOULDERS + HIPS
// (torso lean / horizontal centre) and derive a compact PoseFrame that both the
// granular engine (audio.ts) and the point-cloud renderer (page.tsx) consume.
//
// Named reference: BlazePose (Bazarevsky et al., Google, 2020) — the on-device
// pose model behind PoseLandmarker.

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
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

interface PoseVision {
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
const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

// Load the landmarker from the CDN. The indirect `new Function` import keeps the
// bundler from statically analysing the remote URL. GPU delegate may throw on
// some machines, so the caller retries with "CPU".
export async function createLandmarker(
  delegate: "GPU" | "CPU" = "GPU",
): Promise<PoseLandmarkerInst> {
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as PoseVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// ── The compact frame both audio + visuals read each tick ────────────────────
// Coordinates are mirrored + y-up in [-1, 1]. `left`/`right` are the two hands
// (grain-heads); `torsoX` is the body's horizontal place in the room; `lean` is
// the shoulder tilt; `spread` (0..1) is the reach between the hands.
export interface PoseFrame {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  torsoX: number;
  lean: number;
  spread: number;
  visible: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

// Assemble a PoseFrame from two hand positions already in mirrored y-up [-1,1]
// space, plus optional torso overrides. Used by BOTH the fallback pucks and the
// auto-drift demo, so the fallback drives the identical instrument.
export function makeFrame(
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  torsoX?: number,
  lean?: number,
): PoseFrame {
  const reach = Math.hypot(lx - rx, ly - ry);
  return {
    lx,
    ly,
    rx,
    ry,
    torsoX: torsoX ?? (lx + rx) / 2,
    lean: lean ?? clamp((ly - ry) * 0.9, -1, 1),
    spread: clamp01(reach / 2.4),
    visible: true,
  };
}

// Convert a raw MediaPipe landmark array into a PoseFrame. Mirrors x (front
// camera) and flips y so raising a hand raises `ly`/`ry`. Torso centre + lean
// come from the shoulders/hips; the hands come from the wrists.
export function frameFromLandmarks(lm: Landmark[]): PoseFrame {
  const mx = (p: Landmark) => (0.5 - p.x) * 2; // mirror + centre → [-1,1]
  const my = (p: Landmark) => (0.5 - p.y) * 2; // invert so up is positive

  const lw = lm[LM.leftWrist];
  const rw = lm[LM.rightWrist];
  const ls = lm[LM.leftShoulder];
  const rs = lm[LM.rightShoulder];
  const lh = lm[LM.leftHip];
  const rh = lm[LM.rightHip];

  const wristVis = Math.min(lw?.visibility ?? 0, rw?.visibility ?? 0);
  const visible = !!lw && !!rw && wristVis > 0.35;

  const lx = mx(lw);
  const ly = my(lw);
  const rx = mx(rw);
  const ry = my(rw);

  // Torso horizontal centre = mean of shoulders + hips; lean = shoulder tilt.
  const cx =
    (mx(ls) + mx(rs) + mx(lh) + mx(rh)) / 4 || (lx + rx) / 2;
  const lean = clamp((my(ls) - my(rs)) * 3.2, -1, 1);

  const f = makeFrame(lx, ly, rx, ry, cx, lean);
  f.visible = visible;
  return f;
}

// ── Auto-drift demo: two hands that wander so the cloud plays itself ─────────
// Runs with zero hardware AND is the "auto-drift" layer under the fallback
// pucks — a silent 06:30 glance still hears + sees a living grain cloud.
export function demoFrame(tSec: number): PoseFrame {
  // Two hands sweeping on slow, offset orbits; reach opens and closes.
  const reach = 0.55 + Math.sin(tSec * 0.23) * 0.4; // hands together ↔ wide
  const lift = Math.sin(tSec * 0.31) * 0.55; // both rise + fall together
  const lx = -0.15 - reach + Math.cos(tSec * 0.47) * 0.12;
  const ly = lift + Math.sin(tSec * 0.6) * 0.35 + 0.1;
  const rx = 0.15 + reach + Math.cos(tSec * 0.41 + 1.7) * 0.12;
  const ry = lift + Math.sin(tSec * 0.53 + 0.9) * 0.35 + 0.1;
  const torsoX = Math.sin(tSec * 0.13) * 0.5; // body drifts across the room
  const lean = Math.sin(tSec * 0.19) * 0.5;
  return makeFrame(lx, ly, rx, ry, torsoX, lean);
}
