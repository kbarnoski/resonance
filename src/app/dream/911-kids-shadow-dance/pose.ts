// Whole-body motion sensing for the shadow-dance.
//
// MediaPipe Tasks-Vision is loaded from a CDN at RUNTIME via a webpackIgnore
// dynamic import so it is never bundled and never appears in package.json.
// The camera frames never leave the browser — we only read normalized
// landmarks and derive three movement *qualities* from them:
//
//   energy       — how much the whole body is moving (mean landmark speed)
//   impulsivity  — sudden, sharp moves (high-passed jerk: change in speed)
//   fluidity     — smooth, sustained motion (1 - jitter of the speed signal)
//
// No pitch, no scale, no chord logic anywhere. The kid composes by MOVING.

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
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
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
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

export async function createLandmarker(): Promise<PoseLandmarkerInst> {
  // The localized `as any`/cast lives ONLY on the dynamic CDN import.
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

/** A single movement-quality reading, all normalized roughly to 0..1. */
export interface MotionFrame {
  energy: number; // total body motion magnitude
  impulsivity: number; // sharp/sudden spike (jerk), decays fast
  fluidity: number; // smoothness of sustained motion
  cx: number; // body center x in clip space (-1..1)
  cy: number; // body center y in clip space (-1..1)
  spread: number; // how wide the body is (limbs out → bigger bloom)
}

const ZERO: MotionFrame = {
  energy: 0,
  impulsivity: 0,
  fluidity: 0.5,
  cx: 0,
  cy: 0,
  spread: 0.4,
};

/**
 * Turns a stream of landmark frames into smoothed movement qualities.
 * Stateful — keep one MotionAnalyser per source (camera or ghost).
 */
export class MotionAnalyser {
  private prev: Landmark[] | null = null;
  private prevSpeed = 0;
  private energy = 0;
  private impulse = 0;
  private fluidity = 0.5;
  private speedVar = 0;

  reset() {
    this.prev = null;
    this.prevSpeed = 0;
    this.energy = 0;
    this.impulse = 0;
    this.fluidity = 0.5;
    this.speedVar = 0;
  }

  /** Feed the latest landmarks (33 normalized points). Returns the frame. */
  push(lm: Landmark[] | null): MotionFrame {
    if (!lm || lm.length === 0) {
      // No body: relax everything toward calm but never to dead silence.
      this.energy *= 0.9;
      this.impulse *= 0.8;
      return { ...ZERO, energy: this.energy, impulsivity: this.impulse };
    }

    // Body center + spread (in normalized 0..1, y down).
    let mx = 0;
    let my = 0;
    let n = 0;
    for (const p of lm) {
      if ((p.visibility ?? 1) < 0.3) continue;
      mx += p.x;
      my += p.y;
      n++;
    }
    if (n === 0) n = 1;
    mx /= n;
    my /= n;
    let spread = 0;
    for (const p of lm) {
      const dx = p.x - mx;
      const dy = p.y - my;
      spread += Math.sqrt(dx * dx + dy * dy);
    }
    spread = Math.min(1, (spread / lm.length) * 4);

    // Mean per-landmark displacement vs the previous frame = instantaneous speed.
    let speed = 0;
    if (this.prev && this.prev.length === lm.length) {
      let sum = 0;
      for (let i = 0; i < lm.length; i++) {
        const dx = lm[i].x - this.prev[i].x;
        const dy = lm[i].y - this.prev[i].y;
        sum += Math.sqrt(dx * dx + dy * dy);
      }
      speed = sum / lm.length;
    }
    this.prev = lm;

    // ENERGY: smoothed speed, scaled so an ordinary wiggle reaches ~0.5.
    const rawEnergy = Math.min(1, speed * 14);
    this.energy += (rawEnergy - this.energy) * 0.35;

    // IMPULSIVITY: positive jerk (rising speed) high-passed; fast decay so it
    // reads as a discrete "hit" rather than a sustained level.
    const jerk = Math.max(0, speed - this.prevSpeed);
    this.prevSpeed = speed;
    const rawImpulse = Math.min(1, jerk * 60);
    this.impulse = Math.max(this.impulse * 0.82, rawImpulse);

    // FLUIDITY: low variance of speed = smooth. Track variance, invert it.
    const dev = Math.abs(speed - this.prevSpeed);
    this.speedVar += (dev - this.speedVar) * 0.2;
    const rawFluid = 1 - Math.min(1, this.speedVar * 90);
    this.fluidity += (rawFluid - this.fluidity) * 0.1;

    return {
      energy: this.energy,
      impulsivity: this.impulse,
      fluidity: this.fluidity,
      cx: (0.5 - mx) * 2, // mirror so it feels like a mirror; clip space
      cy: (0.5 - my) * 2,
      spread,
    };
  }
}

/**
 * Synthetic "ghost dancer" — produces believable landmark frames that cycle
 * through the three movement qualities so the auto-demo drives the IDENTICAL
 * pipeline (same MotionAnalyser → same audio + particles). Used when there is
 * no camera, permission is denied, MediaPipe fails, or the body goes still.
 */
export function ghostLandmarks(t: number): Landmark[] {
  // Three overlapping phases of behaviour:
  //  - flowing: slow smooth arm circles (high fluidity)
  //  - bursty:  occasional sharp stomps/throws (high impulsivity)
  //  - calm:    near-still (low energy) so the ambient bed breathes
  const phase = (t * 0.18) % 3;
  const energyDrive =
    phase < 1 ? 0.7 : phase < 2 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5)) : 0.18;

  const breathe = Math.sin(t * 0.4) * 0.02;
  const shY = 0.4 + breathe;
  const hipY = 0.62 + breathe;
  const sw = 0.13;

  // Sharp limb throws during the bursty phase.
  const burst =
    phase >= 1 && phase < 2 ? Math.max(0, Math.sin(t * 6)) ** 6 : 0;
  const lArm = t * 0.5 * energyDrive;
  const rArm = t * 0.44 * energyDrive + Math.PI * 0.7;
  const reach = (0.18 + 0.14 * energyDrive) * (1 + burst * 1.5);

  const lW = {
    x: 0.5 + sw + Math.cos(lArm) * reach,
    y: shY + Math.sin(lArm) * reach,
  };
  const rW = {
    x: 0.5 - sw - Math.cos(rArm) * reach,
    y: shY + Math.sin(rArm) * reach,
  };
  const legSwing = Math.sin(t * 0.9) * 0.05 * energyDrive + burst * 0.06;

  const mk = (x: number, y: number): Landmark => ({
    x,
    y,
    z: 0,
    visibility: 1,
  });

  // 33 points, but only the meaningful ones differ; fill the rest near center.
  const out: Landmark[] = [];
  for (let i = 0; i < 33; i++) out.push(mk(0.5, shY));
  out[0] = mk(0.5 + Math.sin(t * 0.35) * 0.02, shY - 0.13); // nose
  out[11] = mk(0.5 + sw, shY); // L shoulder
  out[12] = mk(0.5 - sw, shY); // R shoulder
  out[13] = mk((0.5 + sw + lW.x) / 2, (shY + lW.y) / 2); // L elbow
  out[14] = mk((0.5 - sw + rW.x) / 2, (shY + rW.y) / 2); // R elbow
  out[15] = mk(lW.x, lW.y); // L wrist
  out[16] = mk(rW.x, rW.y); // R wrist
  out[23] = mk(0.5 + sw * 0.7, hipY); // L hip
  out[24] = mk(0.5 - sw * 0.7, hipY); // R hip
  out[25] = mk(0.5 + sw * 0.7 + legSwing, hipY + 0.18); // L knee
  out[26] = mk(0.5 - sw * 0.7 - legSwing, hipY + 0.18); // R knee
  out[27] = mk(0.5 + sw * 0.7 + legSwing, hipY + 0.34); // L ankle
  out[28] = mk(0.5 - sw * 0.7 - legSwing, hipY + 0.34); // R ankle
  return out;
}
