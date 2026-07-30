// ─────────────────────────────────────────────────────────────────────────────
// strike.ts — turning pose landmarks into discrete CONTACTS and continuous
// timbre controls. DOM-free numeric logic (imports only landmark types).
//
//   Strike detection: a downward-velocity spike of a tracked limb crossing its
//   virtual strike plane. We smooth each limb's vertical velocity, fire on the
//   rising edge past a threshold (with a refractory gap), and re-arm once the
//   limb slows — so one physical strike is exactly one contact.
//
//   Timbre: torso lean → openness, arm spread → voicing width, hand height →
//   register. These are the between-strike continuous controls.
// ─────────────────────────────────────────────────────────────────────────────

import { type Landmark, LM, STRIKE_LANDMARKS } from "./poseLoader";

const VEL_THRESH = 1.1; // normalized-height units / second to trigger
const VEL_REARM = 0.45; // must slow below this before another strike
const VEL_MAX = 3.2; // maps to full strength
const REFRACTORY = 0.14; // seconds between strikes on one limb
const VIS = 0.4; // min landmark visibility to trust

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface Strike {
  limb: number;
  strength: number;
}

/** Per-limb downward-velocity strike detector (4 limbs). */
export class StrikeTracker {
  private prevY: number[] = [NaN, NaN, NaN, NaN];
  private vy: number[] = [0, 0, 0, 0];
  private armed: boolean[] = [true, true, true, true];
  private lastFire: number[] = [-1, -1, -1, -1];

  reset(): void {
    this.prevY = [NaN, NaN, NaN, NaN];
    this.vy = [0, 0, 0, 0];
    this.armed = [true, true, true, true];
    this.lastFire = [-1, -1, -1, -1];
  }

  /**
   * @param ys  normalized y per limb (0 top … 1 bottom), or null if not visible.
   * @param now elapsed seconds.
   * @param dt  frame delta seconds.
   */
  update(ys: (number | null)[], now: number, dt: number): Strike[] {
    const out: Strike[] = [];
    const safeDt = Math.max(0.008, Math.min(0.05, dt));
    for (let l = 0; l < 4; l++) {
      const y = ys[l];
      if (y == null) {
        this.prevY[l] = NaN;
        this.vy[l] *= 0.6;
        continue;
      }
      const prev = this.prevY[l];
      this.prevY[l] = y;
      if (Number.isNaN(prev)) continue;
      const instV = (y - prev) / safeDt; // + = downward
      // EMA smooth to reject jitter
      this.vy[l] = this.vy[l] * 0.55 + instV * 0.45;
      const v = this.vy[l];

      if (this.armed[l] && v > VEL_THRESH && now - this.lastFire[l] > REFRACTORY) {
        this.armed[l] = false;
        this.lastFire[l] = now;
        out.push({
          limb: l,
          strength: clamp01(0.25 + (v - VEL_THRESH) / (VEL_MAX - VEL_THRESH)),
        });
      } else if (v < VEL_REARM) {
        this.armed[l] = true;
      }
    }
    return out;
  }
}

export interface LimbPoint {
  x: number; // -1..1 (mirrored)
  y: number; // -1..1 (up positive)
  yRaw: number; // 0..1 (MediaPipe down-positive) for strike detection
  present: boolean;
}

/** Extract the four strike-limb points from a landmark array. */
export function readStrikeLimbs(lm: Landmark[]): LimbPoint[] {
  return STRIKE_LANDMARKS.map((idx) => {
    const p = lm[idx];
    if (!p) return { x: 0, y: 0, yRaw: 0.5, present: false };
    const present = (p.visibility ?? 1) > VIS;
    return {
      x: (0.5 - p.x) * 2,
      y: (0.5 - p.y) * 2,
      yRaw: p.y,
      present,
    };
  });
}

export interface Timbre {
  lean: number; // 0..1
  spread: number; // 0..1
  height: number; // 0..1
}

/** Continuous body → timbre controls from a landmark array. */
export function computeTimbre(lm: Landmark[]): Timbre {
  const ls = lm[LM.leftShoulder];
  const rs = lm[LM.rightShoulder];
  const lh = lm[LM.leftHip];
  const rh = lm[LM.rightHip];
  const lw = lm[LM.leftWrist];
  const rw = lm[LM.rightWrist];

  let lean = 0.5;
  if (ls && rs && lh && rh) {
    const shMid = (ls.x + rs.x) / 2;
    const hipMid = (lh.x + rh.x) / 2;
    lean = clamp01((shMid - hipMid) * 3.2 + 0.5);
  }

  let spread = 0.4;
  if (ls && rs && lw && rw) {
    const shoulderW = Math.max(0.05, Math.abs(ls.x - rs.x));
    spread = clamp01(Math.abs(lw.x - rw.x) / (shoulderW * 3.2));
  }

  let height = 0.4;
  if (lw && rw) {
    const avgY = (lw.y + rw.y) / 2; // 0 top .. 1 bottom
    height = clamp01((0.9 - avgY) / 0.7);
  }

  return { lean, spread, height };
}
