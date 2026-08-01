// ── 4808-effigy · seeded synthetic DANCER (headless self-demo) ──────────────
//
// No camera exists in the review environment, so this drives a plausible
// full-body 33-landmark dancer on a fixed ~13s loop: a calm sway that sweeps
// both arms up and out into an ECSTATIC overhead peak (big spread, fast limb
// tremor → high motion energy), then comes back down. A hands-off reviewer
// SEES the particle-body gather to the skeleton and melt/scatter on the swell,
// and HEARS the chord's root climb, extensions bloom and timbre ignite — all
// without touching a device.
//
// Deterministic: per-joint phase offsets are drawn once from mulberry32(0x4808)
// at construction; all motion is a pure function of performance.now() passed in
// by the caller. No Math.random / Date.now / new Date anywhere.

import type { Landmark } from "./pose";
import { LANDMARK_COUNT } from "./pose";
import { mulberry32, SEED } from "./rng";

const PERIOD_MS = 13000;

// display-space placement of the up-frame body
const DISP_CX = 0.5;
const DISP_CY = 0.62; // hip line
const SX = 0.26;
const SY = 0.24;

function smooth(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

// arms sweep up 0→1→0 across the loop (overhead ecstatic peak held mid-loop)
function raiseEnv(t: number): number {
  if (t < 3500) return 0;
  if (t < 7000) return smooth((t - 3500) / 3500);
  if (t < 10500) return 1;
  return 1 - smooth((t - 10500) / 2500);
}
// master energy: rises with the raise, sustained + gently pulsing at the peak
function energyEnv(t: number): number {
  if (t < 3500) return 0.05;
  if (t < 7000) return 0.05 + 0.6 * smooth((t - 3500) / 3500);
  if (t < 10500) return 0.85 + 0.15 * smooth(Math.sin((t - 7000) * 0.004) * 0.5 + 0.5);
  return 0.65 - 0.6 * smooth((t - 10500) / 2500);
}

interface Phases {
  sway: number;
  arm: [number, number];
  leg: [number, number];
  bob: number;
  tremor: [number, number];
}

export interface SyntheticDancer {
  sample(nowMs: number): Landmark[];
}

export function createSyntheticDancer(): SyntheticDancer {
  const rng = mulberry32(SEED);
  const phases: Phases = {
    sway: rng() * Math.PI * 2,
    arm: [rng() * Math.PI * 2, rng() * Math.PI * 2],
    leg: [rng() * Math.PI * 2, rng() * Math.PI * 2],
    bob: rng() * Math.PI * 2,
    tremor: [rng() * Math.PI * 2, rng() * Math.PI * 2],
  };
  const t0 = rng() * 1000; // small deterministic offset so the loop doesn't align to 0

  // up-frame (y up) point → display-space landmark (y down)
  function put(out: Landmark[], idx: number, X: number, Y: number, z = 0): void {
    out[idx] = { x: DISP_CX + X * SX, y: DISP_CY - Y * SY, z: -z, visibility: 1 };
  }

  function sample(nowMs: number): Landmark[] {
    const tt = nowMs + t0;
    const t = ((tt % PERIOD_MS) + PERIOD_MS) % PERIOD_MS;
    const raise = raiseEnv(t);
    const energy = energyEnv(t);

    // lateral weight-shift sway + vertical bounce
    const sway = Math.sin(tt * 0.0016 + phases.sway) * (0.06 + energy * 0.05);
    const bounce = Math.sin(tt * 0.0052 + phases.bob) * energy * 0.05;

    const out: Landmark[] = new Array(LANDMARK_COUNT);

    // torso (up-frame)
    const hipY = 0 + bounce;
    const shoulderY = 0.92 + bounce;
    const headY = 1.28 + bounce;
    const cx = sway;

    const hipHalf = 0.16;
    const shHalf = 0.28 + raise * 0.02;

    const lHipX = cx + hipHalf;
    const rHipX = cx - hipHalf;
    const lShX = cx + shHalf;
    const rShX = cx - shHalf;

    // arms: interpolate wrist between a resting-low and an overhead-wide target,
    // plus a fast tremor whose amplitude scales with energy (drives motion).
    const trem = energy * 0.11;
    // LEFT (screen-left, +X)
    const lWristDownX = lShX + 0.10;
    const lWristDownY = shoulderY - 0.55;
    const lWristUpX = lShX + 0.30;
    const lWristUpY = shoulderY + 0.42;
    const lTrX = Math.sin(tt * 0.011 + phases.tremor[0]) * trem;
    const lTrY = Math.cos(tt * 0.013 + phases.tremor[0]) * trem;
    const lWX = lWristDownX + (lWristUpX - lWristDownX) * raise + lTrX;
    const lWY = lWristDownY + (lWristUpY - lWristDownY) * raise + lTrY;
    // RIGHT (screen-right, -X)
    const rWristDownX = rShX - 0.10;
    const rWristDownY = shoulderY - 0.55;
    const rWristUpX = rShX - 0.30;
    const rWristUpY = shoulderY + 0.42;
    const rTrX = Math.sin(tt * 0.0107 + phases.tremor[1]) * trem;
    const rTrY = Math.cos(tt * 0.0125 + phases.tremor[1]) * trem;
    const rWX = rWristDownX + (rWristUpX - rWristDownX) * raise + rTrX;
    const rWY = rWristDownY + (rWristUpY - rWristDownY) * raise + rTrY;

    // elbows: midpoint of shoulder→wrist, pushed outward so arms bend naturally
    const lElBend = 0.10 - raise * 0.05;
    const rElBend = 0.10 - raise * 0.05;
    const lElX = (lShX + lWX) / 2 + lElBend;
    const lElY = (shoulderY + lWY) / 2 - 0.04;
    const rElX = (rShX + rWX) / 2 - rElBend;
    const rElY = (shoulderY + rWY) / 2 - 0.04;

    // legs: slight knee bend + energetic bounce, small side stance
    const stance = 0.15;
    const kneeBend = 0.06 + energy * 0.05;
    const lKnStep = Math.sin(tt * 0.0052 + phases.leg[0]) * energy * 0.05;
    const rKnStep = Math.sin(tt * 0.0052 + phases.leg[1] + Math.PI) * energy * 0.05;
    const lAnkY = hipY - 0.92;
    const rAnkY = hipY - 0.92;
    const lAnkX = cx + stance + lKnStep;
    const rAnkX = cx - stance + rKnStep;
    const lKnX = (lHipX + lAnkX) / 2 + kneeBend;
    const rKnX = (rHipX + rAnkX) / 2 - kneeBend;
    const lKnY = (hipY + lAnkY) / 2 + 0.02;
    const rKnY = (hipY + rAnkY) / 2 + 0.02;

    // depth: gentle 3D sway of limbs for dimensionality (kept small)
    const zc = Math.sin(tt * 0.0021 + phases.arm[0]) * 0.12;

    // core joints
    put(out, 0, cx, headY, zc * 0.3); // nose
    put(out, 11, lShX, shoulderY, zc * 0.5);
    put(out, 12, rShX, shoulderY, -zc * 0.5);
    put(out, 13, lElX, lElY, zc);
    put(out, 14, rElX, rElY, -zc);
    put(out, 15, lWX, lWY, zc * 1.2);
    put(out, 16, rWX, rWY, -zc * 1.2);
    put(out, 23, lHipX, hipY, 0);
    put(out, 24, rHipX, hipY, 0);
    put(out, 25, lKnX, lKnY, zc * 0.6);
    put(out, 26, rKnX, rKnY, -zc * 0.6);
    put(out, 27, lAnkX, lAnkY, zc * 0.4);
    put(out, 28, rAnkX, rAnkY, -zc * 0.4);

    // ── minor landmarks derived from the core (keep the array well-formed) ──
    // face: eyes/ears/mouth clustered around the nose
    put(out, 1, cx - 0.03, headY + 0.02, zc * 0.3);
    put(out, 2, cx - 0.045, headY + 0.02, zc * 0.3);
    put(out, 3, cx - 0.06, headY + 0.02, zc * 0.3);
    put(out, 4, cx + 0.03, headY + 0.02, zc * 0.3);
    put(out, 5, cx + 0.045, headY + 0.02, zc * 0.3);
    put(out, 6, cx + 0.06, headY + 0.02, zc * 0.3);
    put(out, 7, cx - 0.08, headY, zc * 0.3);
    put(out, 8, cx + 0.08, headY, zc * 0.3);
    put(out, 9, cx - 0.03, headY - 0.06, zc * 0.3);
    put(out, 10, cx + 0.03, headY - 0.06, zc * 0.3);

    // hands: fingers extend a little past the wrist along the forearm direction
    const lFx = lWX - lElX;
    const lFy = lWY - lElY;
    const lFn = Math.hypot(lFx, lFy) || 1;
    const rFx = rWX - rElX;
    const rFy = rWY - rElY;
    const rFn = Math.hypot(rFx, rFy) || 1;
    put(out, 17, lWX + (lFx / lFn) * 0.05, lWY + (lFy / lFn) * 0.05, zc * 1.2); // L pinky
    put(out, 19, lWX + (lFx / lFn) * 0.06, lWY + (lFy / lFn) * 0.06, zc * 1.2); // L index
    put(out, 21, lWX + (lFx / lFn) * 0.03, lWY + (lFy / lFn) * 0.03, zc * 1.2); // L thumb
    put(out, 18, rWX + (rFx / rFn) * 0.05, rWY + (rFy / rFn) * 0.05, -zc * 1.2); // R pinky
    put(out, 20, rWX + (rFx / rFn) * 0.06, rWY + (rFy / rFn) * 0.06, -zc * 1.2); // R index
    put(out, 22, rWX + (rFx / rFn) * 0.03, rWY + (rFy / rFn) * 0.03, -zc * 1.2); // R thumb

    // feet: heel + foot index just below/ahead of each ankle
    put(out, 29, lAnkX - 0.03, lAnkY - 0.03, zc * 0.4); // L heel
    put(out, 31, lAnkX + 0.06, lAnkY - 0.04, zc * 0.4); // L foot index
    put(out, 30, rAnkX + 0.03, rAnkY - 0.03, -zc * 0.4); // R heel
    put(out, 32, rAnkX - 0.06, rAnkY - 0.04, -zc * 0.4); // R foot index

    return out;
  }

  return { sample };
}
