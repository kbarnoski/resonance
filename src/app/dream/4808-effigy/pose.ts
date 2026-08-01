// ── 4808-effigy · full-body sensing (MediaPipe PoseLandmarker) + feature map ──
//
// MediaPipe Tasks-Vision is loaded from a CDN AT RUNTIME via an indirect import
// so the bundler never resolves the remote URL — it is never added to
// package.json and the production build never depends on it resolving. Mirrors
// the pattern in src/app/dream/677-presence-field/pose.ts.
//
// The whole moving body (33 landmarks) is the resonator. This module turns a
// raw landmark array into a PoseFrame: a small set of continuous scalars that
// BOTH the resonant-chord synth and the particle-body read every frame. Motion
// energy (frame-to-frame landmark velocity) is the master "intensity".

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

// MediaPipe Pose landmark indices (the ones our features use).
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

export const LANDMARK_COUNT = 33;

// Bones drawn as the luminous skeleton AND used as particle attractors.
export const BONES: Array<[number, number]> = [
  [11, 12], // shoulders
  [11, 13], // L upper arm
  [13, 15], // L forearm
  [12, 14], // R upper arm
  [14, 16], // R forearm
  [11, 23], // L torso side
  [12, 24], // R torso side
  [23, 24], // hips
  [23, 25], // L thigh
  [25, 27], // L shin
  [24, 26], // R thigh
  [26, 28], // R shin
  [0, 11], // neck L
  [0, 12], // neck R
  [27, 31], // L foot
  [28, 32], // R foot
];

// Load the landmarker from the CDN. Indirect `new Function` import keeps webpack
// from statically analysing the remote URL (never bundled, never in package.json).
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

// ── The per-frame feature vector the audio + visuals read ────────────────────
export interface PoseFrame {
  present: boolean;
  /** 0..1 whole-body posture scalar (raised arms + tall stance). Picks root. */
  posture: number;
  /** 0..1 limb spread (wrist span + ankle span, torso-normalised). */
  spread: number;
  /** 0..1 arms-up verticality → brightness / chord quality. */
  verticality: number;
  /** 0..1 MASTER intensity: smoothed frame-to-frame landmark velocity. */
  motion: number;
  /** 0..1 openness (verticality + spread) → filter brightness + FM index. */
  openness: number;
  /** -1..1 lateral lean / shoulder tilt → stereo pan. */
  tilt: number;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function clampPM(n: number): number {
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

// Joints whose motion counts toward the master intensity (limbs + head).
const MOTION_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export interface PoseTracker {
  /**
   * @param lm   display-space landmarks (x,y in [0,1], y DOWN, already mirrored
   *             for the real-camera path) or null when the body has left frame.
   * @param dt   seconds since previous update.
   * @returns    the smoothed PoseFrame plus the body's 33 world points as a
   *             reused Float32Array (33*3), y-UP, centred ~origin.
   */
  update(lm: Landmark[] | null, dt: number): { frame: PoseFrame; world: Float32Array };
}

export function createPoseTracker(): PoseTracker {
  const world = new Float32Array(LANDMARK_COUNT * 3);
  const prev = new Float32Array(LANDMARK_COUNT * 3);
  let havePrev = false;

  // smoothed features (exponential, low-latency)
  const f: PoseFrame = {
    present: false,
    posture: 0.35,
    spread: 0.2,
    verticality: 0.2,
    motion: 0,
    openness: 0.2,
    tilt: 0,
  };

  function worldPoint(i: number): { x: number; y: number; z: number } {
    return { x: world[i * 3], y: world[i * 3 + 1], z: world[i * 3 + 2] };
  }

  function update(lm: Landmark[] | null, dt: number) {
    const k = 1 - Math.exp(-Math.max(dt, 1 / 240) / 0.14);

    if (!lm || lm.length < LANDMARK_COUNT) {
      // body absent → decay intensity, ease features toward neutral, fade out.
      f.present = false;
      f.motion += (0 - f.motion) * k;
      f.verticality += (0.15 - f.verticality) * k * 0.5;
      f.spread += (0.15 - f.spread) * k * 0.5;
      f.openness += (0.15 - f.openness) * k * 0.5;
      f.tilt += (0 - f.tilt) * k * 0.5;
      havePrev = false;
      return { frame: f, world };
    }

    // Landmark (display space, y-down) → world (centred, y-UP).
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const p = lm[i] ?? { x: 0.5, y: 0.5, z: 0 };
      world[i * 3] = (p.x - 0.5) * 2;
      world[i * 3 + 1] = (0.5 - p.y) * 2;
      world[i * 3 + 2] = -(p.z ?? 0) * 1.2;
    }

    const ls = worldPoint(LM.leftShoulder);
    const rs = worldPoint(LM.rightShoulder);
    const lh = worldPoint(LM.leftHip);
    const rh = worldPoint(LM.rightHip);
    const lw = worldPoint(LM.leftWrist);
    const rw = worldPoint(LM.rightWrist);
    const la = worldPoint(LM.leftAnkle);
    const ra = worldPoint(LM.rightAnkle);

    const shMidX = (ls.x + rs.x) / 2;
    const shMidY = (ls.y + rs.y) / 2;
    const hipMidY = (lh.y + rh.y) / 2;
    const ankMidY = (la.y + ra.y) / 2;

    const torso = Math.max(0.25, Math.hypot(shMidX - (lh.x + rh.x) / 2, shMidY - hipMidY));
    const shoulderW = Math.max(0.15, Math.abs(ls.x - rs.x));

    // arms-up verticality: wrists above the shoulder line
    const wristLift = ((lw.y - shMidY) + (rw.y - shMidY)) / 2;
    const vertTarget = clamp01((wristLift / torso + 0.25) / 1.5);

    // limb spread: wrist span + ankle span, torso/shoulder-normalised
    const wristSpan = Math.abs(lw.x - rw.x);
    const ankleSpan = Math.abs(la.x - ra.x);
    const spreadTarget = clamp01((wristSpan + ankleSpan) / (shoulderW * 4.4));

    // tall vs crouched: shoulder-to-ankle drop vs torso length
    const legDrop = shMidY - ankMidY;
    const tallTarget = clamp01((legDrop / torso - 1.1) / 1.5);

    const postureTarget = clamp01(vertTarget * 0.58 + tallTarget * 0.42);
    const opennessTarget = clamp01(vertTarget * 0.6 + spreadTarget * 0.55);
    // lateral lean of COM + shoulder-line slope
    const tiltTarget = clampPM(shMidX * 0.7 + (ls.y - rs.y) * 1.6);

    // ── master intensity: mean joint speed, torso-normalised ────────────────
    let motionTarget = f.motion;
    if (havePrev) {
      let sum = 0;
      for (const j of MOTION_JOINTS) {
        const dx = world[j * 3] - prev[j * 3];
        const dy = world[j * 3 + 1] - prev[j * 3 + 1];
        const dz = world[j * 3 + 2] - prev[j * 3 + 2];
        sum += Math.hypot(dx, dy, dz);
      }
      const meanDisp = sum / MOTION_JOINTS.length;
      const speed = meanDisp / Math.max(dt, 1 / 120) / torso; // 1/sec, scale-free
      motionTarget = clamp01(speed * 0.85);
    }
    prev.set(world);
    havePrev = true;

    // smooth everything (motion a touch snappier so swells read live)
    f.present = true;
    f.verticality += (vertTarget - f.verticality) * k;
    f.spread += (spreadTarget - f.spread) * k;
    f.posture += (postureTarget - f.posture) * k;
    f.openness += (opennessTarget - f.openness) * k;
    f.tilt += (tiltTarget - f.tilt) * k;
    const mk = 1 - Math.exp(-Math.max(dt, 1 / 240) / 0.11);
    f.motion += (motionTarget - f.motion) * mk;

    return { frame: f, world };
  }

  return { update };
}
