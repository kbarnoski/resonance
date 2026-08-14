// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom · demo.ts — the seeded scripted dancer.
//
//   Before any camera or audio, this synthetic body is already moving in the
//   room so the whole record-loop-canon idea is visible within ~2 seconds with
//   zero hardware. Its sway, bounce, and sweeping arms are a deterministic
//   function of the animation clock plus phase offsets drawn once from a seeded
//   mulberry32 — never Math.random, never the wall clock. Two visits (and the
//   muted phone) dance the same dance and build the same canon.
// ─────────────────────────────────────────────────────────────────────────────

import { JOINTS, N_JOINTS, type Frame } from "./body";
import { mulberry32 } from "./prng";

// Slot lookup mirrors body.ts's JOINTS ordering.
const S: Record<number, number> = {};
JOINTS.forEach((lm, k) => {
  S[lm] = k;
});

export class DemoDancer {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const r = mulberry32(seed);
    this.a = r() * Math.PI * 2;
    this.b = r() * Math.PI * 2;
    this.c = r() * Math.PI * 2;
    this.d = r() * Math.PI * 2;
  }

  /** Synthesize the dancer's pose at animation-age `age` (seconds). */
  frame(age: number, reduced: boolean): Frame {
    const sp = reduced ? 0.45 : 1;
    const t = age * sp;

    const sway = Math.sin(t * 0.6 + this.a) * 0.05;
    const cx = 0.5 + sway;
    const bounce = Math.sin(t * 1.8 + this.b) * 0.014 * sp;

    const noseY = 0.17 + bounce;
    const shY = 0.3 + bounce;
    const hipY = 0.55 + bounce * 0.6;
    const kneeY = 0.74 + bounce * 0.3;
    const ankleY = 0.92;

    const shHalf = 0.105;
    const hipHalf = 0.075;
    const armLen = 0.24;

    const lShX = cx - shHalf;
    const rShX = cx + shHalf;

    // Arm angles measured from straight-down; sweep up toward overhead.
    const thetaL = 1.4 + Math.sin(t * 1.1 + this.c) * 1.5;
    const thetaR = 1.4 + Math.sin(t * 0.95 + this.d + Math.PI * 0.7) * 1.5;

    const lWristX = lShX - armLen * Math.sin(thetaL) * 0.8;
    const lWristY = shY + armLen * Math.cos(thetaL);
    const rWristX = rShX + armLen * Math.sin(thetaR) * 0.8;
    const rWristY = shY + armLen * Math.cos(thetaR);

    // Elbows: midpoint with a slight outward bend.
    const lElbowX = (lShX + lWristX) / 2 - 0.02;
    const lElbowY = (shY + lWristY) / 2;
    const rElbowX = (rShX + rWristX) / 2 + 0.02;
    const rElbowY = (shY + rWristY) / 2;

    // A gentle weight-shift in the legs.
    const step = Math.sin(t * 0.9 + this.a) * 0.012;

    const f: Frame = new Array(N_JOINTS * 2);
    const put = (lm: number, x: number, y: number) => {
      const k = S[lm];
      f[2 * k] = x;
      f[2 * k + 1] = y;
    };

    put(0, cx + Math.sin(t * 0.5) * 0.01, noseY);
    put(11, lShX, shY);
    put(12, rShX, shY);
    put(13, lElbowX, lElbowY);
    put(14, rElbowX, rElbowY);
    put(15, lWristX, lWristY);
    put(16, rWristX, rWristY);
    put(23, cx - hipHalf, hipY);
    put(24, cx + hipHalf, hipY);
    put(25, cx - hipHalf + step, kneeY);
    put(26, cx + hipHalf + step, kneeY);
    put(27, cx - hipHalf + step * 1.4, ankleY);
    put(28, cx + hipHalf + step * 1.4, ankleY);

    return f;
  }
}
