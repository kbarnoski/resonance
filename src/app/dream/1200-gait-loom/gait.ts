// ─────────────────────────────────────────────────────────────────────────────
// gait.ts — gait cadence detection + limb-event extraction from a Pose stream.
//
//   The body is the sequencer's transport. Every frame we feed in the 33
//   landmarks; this engine tracks the *vertical* motion of each ankle (a footfall
//   = the foot returning to the ground after a lift) and the *speed* of each
//   wrist (a swing = a velocity peak). From the intervals between successive
//   footfalls it estimates a cadence and locks a musical BPM to it (median +
//   EMA smoothed, clamped ~60–160). Positions are normalized by torso height so
//   the detector is scale-invariant. Until a stable cadence exists it still emits
//   limb events (free-trigger) so the loom always makes sound.
//
//   Biomechanics note: human walking cadence sits ~90–130 steps/min; one footfall
//   ≈ one beat here, so BPM ≈ footfall rate. See README for references.
// ─────────────────────────────────────────────────────────────────────────────

import { LM, type Landmark } from "./pose";

export type Limb =
  | "footL"
  | "footR"
  | "wristL"
  | "wristR"
  | "kneeL"
  | "kneeR";

export interface LimbHit {
  limb: Limb;
  /** 0..1 event strength */
  intensity: number;
  /** -1..1 horizontal position (for panning), left→right */
  pan: number;
}

export interface GaitReadout {
  /** live footfalls detected this frame */
  footfalls: LimbHit[];
  /** live limb swings detected this frame */
  swings: LimbHit[];
  /** current locked tempo in BPM */
  bpm: number;
  /** raw cadence in steps/min (0 until known) */
  cadence: number;
  /** true once at least a few footfalls have set a stable clock */
  locked: boolean;
  /** 0..1 how much the body is currently moving (drives loom energy) */
  motion: number;
  /** seconds since the last footfall (for the "unravel when you stop" fade) */
  sinceStep: number;
}

const DEFAULT_BPM = 100;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function vis(l: Landmark | undefined): number {
  return l?.visibility ?? 1;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-foot vertical state machine: lift, then plant → footfall. */
interface FootState {
  baseline: number; // slow EMA of normalized foot height
  lifted: boolean; // currently up
  liftPeak: number; // max deviation reached while up
}

/** Per-wrist speed tracker for swing (velocity-peak) detection. */
interface SwingState {
  x: number;
  y: number;
  speedEnv: number; // adaptive envelope of speed
  armed: boolean;
}

export interface GaitEngine {
  update(landmarks: Landmark[] | null, tSec: number): GaitReadout;
  /** Feed a manual footfall (fallback pad / spacebar) at the given limb. */
  manualStep(limb: Limb, intensity: number, pan: number): void;
  reset(): void;
}

export function createGaitEngine(): GaitEngine {
  const feet: Record<"footL" | "footR", FootState> = {
    footL: { baseline: 0, lifted: false, liftPeak: 0 },
    footR: { baseline: 0, lifted: false, liftPeak: 0 },
  };
  const wrists: Record<"wristL" | "wristR", SwingState> = {
    wristL: { x: 0, y: 0, speedEnv: 0.02, armed: true },
    wristR: { x: 0, y: 0, speedEnv: 0.02, armed: true },
  };

  const stepTimes: number[] = []; // seconds of recent footfalls
  const intervals: number[] = []; // recent inter-footfall intervals (s)
  let bpm = DEFAULT_BPM;
  let cadence = 0;
  let locked = false;
  let lastStepT = -10;
  let motion = 0;
  let initialized = false;

  // Manual events queued between frames.
  const manualFootfalls: LimbHit[] = [];
  const manualSwings: LimbHit[] = [];

  const registerFootfall = (t: number): void => {
    if (t - lastStepT < 0.18) return; // refractory ~333 spm ceiling
    if (lastStepT > -5) {
      const dt = t - lastStepT;
      if (dt > 0.2 && dt < 2.0) {
        intervals.push(dt);
        if (intervals.length > 6) intervals.shift();
      }
    }
    lastStepT = t;
    stepTimes.push(t);
    if (stepTimes.length > 8) stepTimes.shift();

    if (intervals.length >= 2) {
      const dt = median(intervals);
      cadence = 60 / dt; // steps per minute
      const target = clamp(cadence, 60, 160); // one footfall ≈ one beat
      // EMA toward the new tempo so the groove speeds/slows smoothly.
      bpm = bpm + (target - bpm) * 0.34;
      locked = true;
    }
  };

  const update = (landmarks: Landmark[] | null, t: number): GaitReadout => {
    const footfalls: LimbHit[] = [];
    const swings: LimbHit[] = [];

    // Drain manual (fallback) events first — they always count.
    if (manualFootfalls.length) {
      for (const h of manualFootfalls) {
        footfalls.push(h);
        registerFootfall(t);
      }
      manualFootfalls.length = 0;
    }
    if (manualSwings.length) {
      for (const h of manualSwings) swings.push(h);
      manualSwings.length = 0;
    }

    if (landmarks && landmarks.length >= 33) {
      // Torso height for scale-invariant thresholds.
      const sh = landmarks[LM.L_SHOULDER];
      const hip = landmarks[LM.L_HIP];
      const hip2 = landmarks[LM.R_HIP];
      const hipY = (hip.y + hip2.y) / 2;
      let torso = Math.abs(hipY - sh.y);
      if (!(torso > 0.05)) torso = 0.25; // guard against degenerate poses
      const liftThresh = torso * 0.09; // foot must rise this far to "lift"
      const plantThresh = torso * 0.04; // …then return within this to "plant"

      // Ankles → footfalls. Note: larger y = lower on screen (closer to ground).
      const ankles: [Limb & ("footL" | "footR"), number][] = [
        ["footL", LM.L_ANKLE],
        ["footR", LM.R_ANKLE],
      ];
      for (const [key, idx] of ankles) {
        const a = landmarks[idx];
        if (vis(a) < 0.5) continue;
        const st = feet[key];
        const h = a.y; // vertical
        if (!initialized) st.baseline = h;
        // Baseline tracks the resting (low) position slowly.
        st.baseline = st.baseline * 0.97 + h * 0.03;
        const rise = st.baseline - h; // >0 when foot is above its baseline
        if (!st.lifted && rise > liftThresh) {
          st.lifted = true;
          st.liftPeak = rise;
        } else if (st.lifted) {
          st.liftPeak = Math.max(st.liftPeak, rise);
          if (rise < plantThresh) {
            // Foot has come back down → footfall.
            st.lifted = false;
            const intensity = clamp(st.liftPeak / (torso * 0.35), 0.2, 1);
            const pan = clamp((0.5 - a.x) * 2, -1, 1); // mirror-aware handled by caller
            footfalls.push({ limb: key, intensity, pan });
            registerFootfall(t);
          }
        }
      }

      // Knees → mid accents on strong lift (adds weave between footfalls).
      const knees: [Limb, number, "footL" | "footR"][] = [
        ["kneeL", LM.L_KNEE, "footL"],
        ["kneeR", LM.R_KNEE, "footR"],
      ];
      // (knees ride the same lift state — emitted softly at peak lift)
      for (const [key, idx, foot] of knees) {
        const k = landmarks[idx];
        if (vis(k) < 0.5) continue;
        const st = feet[foot];
        if (st.lifted && st.liftPeak > liftThresh * 1.8 && Math.random() < 0.04) {
          swings.push({
            limb: key,
            intensity: clamp(st.liftPeak * 2, 0.2, 0.7),
            pan: clamp((0.5 - k.x) * 2, -1, 1),
          });
        }
      }

      // Wrists → swings on velocity peaks.
      const wr: [("wristL" | "wristR"), number][] = [
        ["wristL", LM.L_WRIST],
        ["wristR", LM.R_WRIST],
      ];
      let motionAccum = 0;
      for (const [key, idx] of wr) {
        const w = landmarks[idx];
        const s = wrists[key];
        if (vis(w) < 0.4) {
          continue;
        }
        if (initialized) {
          const dx = w.x - s.x;
          const dy = w.y - s.y;
          const speed = Math.hypot(dx, dy);
          motionAccum += speed;
          s.speedEnv = Math.max(s.speedEnv * 0.9, speed);
          const thresh = Math.max(0.012, s.speedEnv * 0.62);
          if (s.armed && speed > thresh && speed > 0.02) {
            s.armed = false;
            swings.push({
              limb: key,
              intensity: clamp(speed * 14, 0.2, 1),
              pan: clamp((0.5 - w.x) * 2, -1, 1),
            });
          } else if (speed < thresh * 0.45) {
            s.armed = true;
          }
        }
        s.x = w.x;
        s.y = w.y;
      }
      motion = motion * 0.85 + clamp(motionAccum * 20, 0, 1) * 0.15;
      initialized = true;
    } else {
      motion *= 0.9;
    }

    // A little motion energy from any manual events too.
    if (footfalls.length || swings.length) motion = Math.min(1, motion + 0.35);

    // Lose the lock if the body has been still for a while.
    const sinceStep = t - lastStepT;
    if (sinceStep > 2.6) locked = false;

    return {
      footfalls,
      swings,
      bpm,
      cadence,
      locked,
      motion,
      sinceStep: Math.max(0, sinceStep),
    };
  };

  return {
    update,
    manualStep(limb, intensity, pan) {
      if (limb === "footL" || limb === "footR") {
        manualFootfalls.push({ limb, intensity, pan });
      } else {
        manualSwings.push({ limb, intensity, pan });
      }
    },
    reset() {
      stepTimes.length = 0;
      intervals.length = 0;
      bpm = DEFAULT_BPM;
      cadence = 0;
      locked = false;
      lastStepT = -10;
      motion = 0;
      initialized = false;
    },
  };
}
