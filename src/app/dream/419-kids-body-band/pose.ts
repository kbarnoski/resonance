// pose.ts — landmark types, gesture detection, ghost dancer, motion energy.
//
// Turns 33 MediaPipe Pose landmarks into discrete drum-triggering gestures and
// a continuous motion-energy value. Forgiving thresholds + per-gesture cooldown
// so a wildly-dancing 4-year-old triggers lots of fun hits without machine-gun
// retriggering. Self-contained; no shared imports.

import type { DrumKind } from "./drums";

export interface Lm {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// ── Landmark indices ──────────────────────────────────────────────────────────
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

export interface GestureEvent {
  kind: DrumKind;
  velocity: number; // 0..1, from speed/size of the motion
  limb: "lWrist" | "rWrist" | "both" | "body" | "head"; // for visual flash
}

// Build a full 33-length landmark array from a sparse subset (ghost / tap).
export function fullLmArray(partial: Record<number, Lm>): Lm[] {
  const arr: Lm[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  for (const k in partial) arr[Number(k)] = partial[Number(k)];
  return arr;
}

// ── Gesture detector: stateful, fed one (smoothed) landmark frame at a time ──
export class GestureDetector {
  // Previous positions for velocity.
  private prev: Record<string, { x: number; y: number; t: number }> = {};
  // Last-fire timestamps (ms) per gesture for cooldown.
  private lastFire: Record<string, number> = {};
  // Smoothed motion energy 0..1.
  energy = 0;
  // Head-bob phase tracking for hi-hat ticks.
  private noseYHist: number[] = [];

  private cooldown(name: string, now: number, ms: number): boolean {
    const last = this.lastFire[name] ?? 0;
    if (now - last < ms) return false;
    this.lastFire[name] = now;
    return true;
  }

  private speedOf(name: string, x: number, y: number, now: number): number {
    const p = this.prev[name];
    this.prev[name] = { x, y, t: now };
    if (!p) return 0;
    const dt = Math.max(1, now - p.t);
    const d = Math.hypot(x - p.x, y - p.y);
    // normalized units per second
    return (d / dt) * 1000;
  }

  // Returns the list of gestures fired this frame.
  update(lms: Lm[], now: number): GestureEvent[] {
    const events: GestureEvent[] = [];

    const ls = lms[LM.L_SHOULDER];
    const rs = lms[LM.R_SHOULDER];
    const lw = lms[LM.L_WRIST];
    const rw = lms[LM.R_WRIST];
    const nose = lms[LM.NOSE];
    const lhip = lms[LM.L_HIP];
    const rhip = lms[LM.R_HIP];
    const lknee = lms[LM.L_KNEE];
    const rknee = lms[LM.R_KNEE];

    const shoulderY = (ls.y + rs.y) / 2;
    const shoulderSpan = Math.max(0.08, Math.abs(rs.x - ls.x));

    // ── Per-limb speeds (drive velocity + motion energy) ──────────────────
    const lwSpeed = this.speedOf("lw", lw.x, lw.y, now);
    const rwSpeed = this.speedOf("rw", rw.x, rw.y, now);
    const noseSpeed = this.speedOf("nose", nose.x, nose.y, now);

    // Motion energy: blend of limb speeds, smoothed.
    const rawEnergy = Math.min(1, (lwSpeed + rwSpeed) * 0.6 + noseSpeed * 0.3);
    this.energy = this.energy + (rawEnergy - this.energy) * 0.18;

    // ── LEFT hand raised high → TOM ───────────────────────────────────────
    // "high" = wrist clearly above shoulders. Forgiving threshold.
    if (lw.y < shoulderY - 0.06 && this.cooldown("lTom", now, 220)) {
      const vel = Math.min(1, 0.45 + lwSpeed * 1.4);
      events.push({ kind: "tom", velocity: vel, limb: "lWrist" });
    }

    // ── RIGHT hand raised high → SNARE / clap ─────────────────────────────
    if (rw.y < shoulderY - 0.06 && this.cooldown("rSnare", now, 220)) {
      const vel = Math.min(1, 0.45 + rwSpeed * 1.4);
      events.push({ kind: "snare", velocity: vel, limb: "rWrist" });
    }

    // ── BOTH hands thrown wide/up fast → CRASH ────────────────────────────
    const bothUp = lw.y < shoulderY && rw.y < shoulderY;
    const wide = Math.abs(rw.x - lw.x) > shoulderSpan * 1.8;
    const fast = lwSpeed + rwSpeed > 0.8;
    if ((bothUp || wide) && fast && this.cooldown("crash", now, 500)) {
      const vel = Math.min(1, 0.6 + (lwSpeed + rwSpeed) * 0.6);
      events.push({ kind: "crash", velocity: vel, limb: "both" });
    }

    // ── Crouch / quick body drop OR knee lift → KICK ──────────────────────
    // Knee lift: a knee rises well above its hip-to-ankle midline.
    const hipY = (lhip.y + rhip.y) / 2;
    const kneeLift =
      lknee.y < hipY + 0.12 || rknee.y < hipY + 0.12;
    // Body drop: shoulders move downward fast.
    const shoulderSpeed = this.speedOf("shoulder", 0.5, shoulderY, now);
    const droppedFast = shoulderSpeed > 0.5 && shoulderY > 0.45;
    if ((kneeLift || droppedFast) && this.cooldown("kick", now, 260)) {
      const vel = Math.min(1, 0.55 + shoulderSpeed * 0.8);
      events.push({ kind: "kick", velocity: vel, limb: "body" });
    }

    // ── Head bob / steady bounce → HI-HAT ticks ───────────────────────────
    // Detect a downward zero-crossing of nose Y velocity (a bob bottom).
    this.noseYHist.push(nose.y);
    if (this.noseYHist.length > 4) this.noseYHist.shift();
    if (this.noseYHist.length === 4) {
      const [a, b, c, d] = this.noseYHist;
      const wasFalling = b > a && c > b; // moving down
      const nowRising = d < c; // turned upward → bob bottom
      if (wasFalling && nowRising && noseSpeed > 0.05 && this.cooldown("hat", now, 140)) {
        const vel = Math.min(1, 0.3 + noseSpeed * 1.5);
        events.push({ kind: "hat", velocity: vel, limb: "head" });
      }
    }

    return events;
  }
}

// ── Ghost dancer ──────────────────────────────────────────────────────────────
// A synthetic looping body that drives the SAME gesture detector + groove, so a
// reviewer with no camera hears + sees a full groove hands-free within ~2s.
// Built from sine-driven limbs around a standing skeleton.
export function ghostPose(tSec: number): Lm[] {
  // Base standing skeleton (normalized, mirrored display handled by caller).
  const cx = 0.5;
  // A loop with phrases: bouncing, arms pumping, occasional both-up.
  const bob = Math.sin(tSec * Math.PI * 2 * 1.6) * 0.018; // head bob ~1.6 Hz
  const shoulderY = 0.28 + bob;
  const hipY = 0.54 + bob * 0.4;

  // Arms: alternate raising, with a periodic "both up" crash phrase.
  const armPhase = tSec * Math.PI * 2 * 0.9;
  const bothUpPhase = (tSec % 8) > 6.4 && (tSec % 8) < 7.0; // ~brief window
  const lUp = bothUpPhase ? 1 : (Math.sin(armPhase) * 0.5 + 0.5);
  const rUp = bothUpPhase ? 1 : (Math.sin(armPhase + Math.PI) * 0.5 + 0.5);

  // wrist y: high (small y) when "up"
  const lwY = bothUpPhase ? 0.08 : 0.46 - lUp * 0.42;
  const rwY = bothUpPhase ? 0.08 : 0.46 - rUp * 0.42;
  const lwX = bothUpPhase ? 0.18 : 0.34 - (lUp > 0.6 ? 0.08 : 0);
  const rwX = bothUpPhase ? 0.82 : 0.66 + (rUp > 0.6 ? 0.08 : 0);

  // Knees: alternate lifts for kicks.
  const kneePhase = tSec * Math.PI * 2 * 1.1;
  const lKneeLift = Math.sin(kneePhase) > 0.7 ? 0.1 : 0;
  const rKneeLift = Math.sin(kneePhase + Math.PI) > 0.7 ? 0.1 : 0;

  return fullLmArray({
    [LM.NOSE]: { x: cx, y: 0.12 + bob, z: 0, visibility: 1 },
    [LM.L_SHOULDER]: { x: cx - 0.12, y: shoulderY, z: 0, visibility: 1 },
    [LM.R_SHOULDER]: { x: cx + 0.12, y: shoulderY, z: 0, visibility: 1 },
    [LM.L_ELBOW]: { x: lwX - 0.02, y: (shoulderY + lwY) / 2, z: 0, visibility: 1 },
    [LM.R_ELBOW]: { x: rwX + 0.02, y: (shoulderY + rwY) / 2, z: 0, visibility: 1 },
    [LM.L_WRIST]: { x: lwX, y: lwY, z: 0, visibility: 1 },
    [LM.R_WRIST]: { x: rwX, y: rwY, z: 0, visibility: 1 },
    [LM.L_HIP]: { x: cx - 0.09, y: hipY, z: 0, visibility: 1 },
    [LM.R_HIP]: { x: cx + 0.09, y: hipY, z: 0, visibility: 1 },
    [LM.L_KNEE]: { x: cx - 0.09, y: hipY + 0.18 - lKneeLift, z: 0, visibility: 1 },
    [LM.R_KNEE]: { x: cx + 0.09, y: hipY + 0.18 - rKneeLift, z: 0, visibility: 1 },
    [LM.L_ANKLE]: { x: cx - 0.09, y: 0.9, z: 0, visibility: 1 },
    [LM.R_ANKLE]: { x: cx + 0.09, y: 0.9, z: 0, visibility: 1 },
  });
}

// One-pole smoothing of a landmark frame.
export function smoothLandmarks(cur: Lm[], target: Lm[], alpha: number): Lm[] {
  return cur.map((c, i) => {
    const t = target[i] ?? c;
    return {
      x: c.x + (t.x - c.x) * alpha,
      y: c.y + (t.y - c.y) * alpha,
      z: c.z + (t.z - c.z) * alpha,
      visibility: (c.visibility ?? 1) + ((t.visibility ?? 1) - (c.visibility ?? 1)) * alpha,
    };
  });
}
