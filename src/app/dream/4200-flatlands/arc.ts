// 4200-flatlands — arc.ts
//
// The dissociative descent as an audio-conducted state machine. A single
// performance.now() clock drives a keyframed parameter track; sampleArc(t)
// returns the full frame of audio + visual drives for that instant. Everything
// is deterministic (pure interpolation of fixed keyframes), so the piece walks
// the same derealization → white void → return every run with no input.
//
// The named arc (see README): Derealization → Detachment → Dissolution →
// the still point / white void → Return. Read as the clinical phenomenology
// of depersonalization/derealization (DPDR): the solid world flattens into a
// receding stack of cardboard-cutout planes (Abbott's Flatland), drifts apart
// into a white void at the still point, then re-coheres.

export type Stage =
  | "derealization"
  | "detachment"
  | "dissolution"
  | "void"
  | "return";

export interface Frame {
  stage: Stage;
  label: string;
  /** Total arc progress 0..1. */
  progress: number;
  /** Seconds elapsed (clamped to the arc length). */
  elapsed: number;
  ended: boolean;

  // ── audio drives ──
  shepard: number; // endless-descent drive (rate + brightness)
  drone: number; // just-intonation bed drive (cutoff + level)
  wet: number; // void-reverb wet mix

  // ── visual drives ──
  spread: number; // plane drift-apart (0 cohered → 1 scattered)
  fade: number; // edge loss / thin toward transparency
  fog: number; // fog density (swallows the far field)
  bloom: number; // bloom strength toward the white void
  dolly: number; // third-person camera pull-back
  white: number; // whiteness of the void (bg + exposure)
  sat: number; // colour presence (1 desaturated steel → 0 washed white)
  exposure: number; // base tone-mapping exposure
  motion: number; // global motion rate (near 0 at the still point)
}

interface Key {
  t: number;
  stage: Stage;
  shepard: number;
  drone: number;
  wet: number;
  spread: number;
  fade: number;
  fog: number;
  bloom: number;
  dolly: number;
  white: number;
  sat: number;
  exposure: number;
  motion: number;
}

export const STAGE_LABEL: Record<Stage, string> = {
  derealization: "Derealization — the world is present but subtly wrong",
  detachment: "Detachment — the planes drift apart, void opening between them",
  dissolution: "Dissolution — slabs thin toward transparency, fog takes the far field",
  void: "The still point — everything blooms to a calm white void",
  return: "Return — the planes re-cohere, colour and edges come back",
};

// Keyframe track (~5m30s). Params interpolate with smoothstep between keys.
const KEYS: Key[] = [
  // Derealization: solid-ish steel world, faint unreal shimmer.
  { t: 0,   stage: "derealization", shepard: 0.12, drone: 0.16, wet: 0.30, spread: 0.04, fade: 0.05, fog: 0.34, bloom: 0.22, dolly: 0.00, white: 0.00, sat: 0.82, exposure: 1.00, motion: 1.00 },
  { t: 55,  stage: "derealization", shepard: 0.20, drone: 0.24, wet: 0.34, spread: 0.12, fade: 0.09, fog: 0.40, bloom: 0.26, dolly: 0.08, white: 0.03, sat: 0.72, exposure: 0.99, motion: 0.98 },
  // Detachment: planes drift apart, camera pulls back, descent audible.
  { t: 120, stage: "detachment",    shepard: 0.40, drone: 0.38, wet: 0.44, spread: 0.34, fade: 0.20, fog: 0.50, bloom: 0.32, dolly: 0.30, white: 0.06, sat: 0.56, exposure: 0.97, motion: 0.92 },
  // Dissolution: full recession, slabs thin, fog swallows the far field.
  { t: 200, stage: "dissolution",   shepard: 0.62, drone: 0.56, wet: 0.60, spread: 0.62, fade: 0.48, fog: 0.66, bloom: 0.48, dolly: 0.58, white: 0.18, sat: 0.36, exposure: 0.98, motion: 0.78 },
  { t: 250, stage: "dissolution",   shepard: 0.70, drone: 0.62, wet: 0.72, spread: 0.82, fade: 0.72, fog: 0.80, bloom: 0.66, dolly: 0.82, white: 0.42, sat: 0.20, exposure: 1.06, motion: 0.42 },
  // The still point / white void: motion nearly stops, drone thins to one
  // held partial, reverb wide open, everything blooms to near-white. Peak.
  { t: 285, stage: "void",          shepard: 0.34, drone: 0.28, wet: 0.96, spread: 0.95, fade: 0.94, fog: 0.92, bloom: 1.00, dolly: 1.00, white: 1.00, sat: 0.08, exposure: 1.28, motion: 0.05 },
  // Return: planes re-cohere, edges + desaturated colour come back.
  { t: 320, stage: "return",        shepard: 0.30, drone: 0.40, wet: 0.62, spread: 0.48, fade: 0.42, fog: 0.58, bloom: 0.52, dolly: 0.50, white: 0.36, sat: 0.38, exposure: 1.06, motion: 0.52 },
  { t: 330, stage: "return",        shepard: 0.16, drone: 0.34, wet: 0.42, spread: 0.20, fade: 0.16, fog: 0.42, bloom: 0.30, dolly: 0.20, white: 0.14, sat: 0.62, exposure: 1.01, motion: 0.82 },
  { t: 355, stage: "return",        shepard: 0.10, drone: 0.28, wet: 0.32, spread: 0.05, fade: 0.05, fog: 0.34, bloom: 0.22, dolly: 0.04, white: 0.03, sat: 0.80, exposure: 1.00, motion: 0.94 },
];

export const TOTAL_SECONDS = KEYS[KEYS.length - 1].t;

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sampleArc(tSecRaw: number): Frame {
  const tSec = Math.min(tSecRaw, TOTAL_SECONDS);
  const ended = tSecRaw >= TOTAL_SECONDS;

  // find bracketing keyframes
  let i = 0;
  while (i < KEYS.length - 1 && KEYS[i + 1].t <= tSec) i++;
  const a = KEYS[i];
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const span = b.t - a.t;
  const k = span > 0 ? smoothstep((tSec - a.t) / span) : 0;

  // the stage label follows the later keyframe once we've crossed its start,
  // so the readout names the phase we are moving INTO.
  const stage = k > 0.5 ? b.stage : a.stage;

  return {
    stage,
    label: STAGE_LABEL[stage],
    progress: tSec / TOTAL_SECONDS,
    elapsed: tSec,
    ended,
    shepard: lerp(a.shepard, b.shepard, k),
    drone: lerp(a.drone, b.drone, k),
    wet: lerp(a.wet, b.wet, k),
    spread: lerp(a.spread, b.spread, k),
    fade: lerp(a.fade, b.fade, k),
    fog: lerp(a.fog, b.fog, k),
    bloom: lerp(a.bloom, b.bloom, k),
    dolly: lerp(a.dolly, b.dolly, k),
    white: lerp(a.white, b.white, k),
    sat: lerp(a.sat, b.sat, k),
    exposure: lerp(a.exposure, b.exposure, k),
    motion: lerp(a.motion, b.motion, k),
  };
}
