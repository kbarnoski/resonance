// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom · body.ts — the shared body model.
//
//   A `Frame` is one captured pose: a flat number[] of [x0,y0, x1,y1, …] for a
//   fixed subset of MediaPipe's 33 landmarks, in normalized 0..1 image space
//   (x already mirrored so moving right moves the body right; y is 0 at the top
//   /head, 1 at the bottom/feet). A joint the sensor couldn't see is stored as
//   NaN and simply not drawn. Frames are the atoms of a recorded loop.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoseLandmark } from "./poseLoader";
import { clamp01 } from "./prng";

// The MediaPipe landmark indices we keep — a full-body skeleton.
export const JOINTS = [
  0, // nose
  11, 12, // shoulders
  13, 14, // elbows
  15, 16, // wrists
  23, 24, // hips
  25, 26, // knees
  27, 28, // ankles
] as const;

// landmark index → position within a Frame (its slot k → x at 2k, y at 2k+1).
const SLOT: Record<number, number> = {};
JOINTS.forEach((lm, k) => {
  SLOT[lm] = k;
});

// Bones drawn as the luminous skeleton, expressed in Frame-slot pairs.
export const BONES: Array<[number, number]> = (
  [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
    [0, 11],
    [0, 12],
  ] as Array<[number, number]>
).map(([a, b]) => [SLOT[a], SLOT[b]] as [number, number]);

export const N_JOINTS = JOINTS.length;

export type Frame = number[];

const NOSE = SLOT[0];
const L_WRIST = SLOT[15];
const R_WRIST = SLOT[16];

/** Build a Frame from a MediaPipe landmark array, mirroring x. Joints below the
 *  visibility floor are stored NaN so they neither draw nor sound. */
export function frameFromLandmarks(lm: PoseLandmark[]): Frame {
  const f: Frame = new Array(N_JOINTS * 2);
  for (let k = 0; k < N_JOINTS; k++) {
    const p = lm[JOINTS[k]];
    if (!p || (p.visibility ?? 1) < 0.35) {
      f[2 * k] = NaN;
      f[2 * k + 1] = NaN;
    } else {
      f[2 * k] = 1 - p.x; // mirror
      f[2 * k + 1] = p.y;
    }
  }
  return f;
}

/** Mean per-joint displacement between two frames → a 0..1 motion energy. */
export function frameMotion(prev: Frame | null, cur: Frame): number {
  if (!prev) return 0;
  let sum = 0;
  let n = 0;
  for (let k = 0; k < N_JOINTS; k++) {
    const ax = prev[2 * k];
    const ay = prev[2 * k + 1];
    const bx = cur[2 * k];
    const by = cur[2 * k + 1];
    if (Number.isNaN(ax) || Number.isNaN(bx)) continue;
    sum += Math.hypot(bx - ax, by - ay);
    n++;
  }
  if (n === 0) return 0;
  return clamp01((sum / n) * 14);
}

/** Average raised-ness of the two wrists → 0 (low) .. 1 (overhead). */
export function wristHeight(f: Frame): number {
  let sum = 0;
  let n = 0;
  for (const w of [L_WRIST, R_WRIST]) {
    const y = f[2 * w + 1];
    if (!Number.isNaN(y)) {
      sum += 1 - y;
      n++;
    }
  }
  if (n === 0) {
    const ny = f[2 * NOSE + 1];
    return Number.isNaN(ny) ? 0.5 : clamp01(1 - ny);
  }
  return clamp01(sum / n);
}

/** Horizontal centre of mass of the visible joints, 0..1. */
export function bodyCentreX(f: Frame): number {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < N_JOINTS; k++) {
    const x = f[2 * k];
    if (!Number.isNaN(x)) {
      sum += x;
      n++;
    }
  }
  return n === 0 ? 0.5 : sum / n;
}

/** Total motion across a frame sequence — used to reject a "still" recording. */
export function sequenceMotion(frames: Frame[]): number {
  if (frames.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < frames.length; i++) {
    sum += frameMotion(frames[i - 1], frames[i]);
  }
  return sum / (frames.length - 1);
}
