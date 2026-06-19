// movements.ts — Tape Erosion · 5-movement state machine
// Total arc: ~6–8 minutes. Each movement has target ErosionParams and GL erosion params.
// The controller interpolates smoothly between movements so transitions are imperceptible.

import type { ErosionParams } from "./audio";

// ─── Movement definitions ──────────────────────────────────────────────────────

export type MovementName = "Intact" | "Eroding" | "Sparse" | "Ghost" | "Reforming";

export interface GLErosionParams {
  /** Feedback decay (0 = instant, 1 = permanent — keep 0.90–0.99) */
  decay: number;
  /** Horizontal smear radius in UV units (0–0.015) */
  smear: number;
  /** Vertical bleed (frequency spread) radius (0–0.015) */
  bleed: number;
  /** Random noise inject into the spectral field (0–0.05) */
  noiseLevel: number;
  /** Brightness/contrast of the rendered field (0.5–2.5) */
  brightness: number;
  /** Horizontal advection velocity (drift in UV/frame, can be negative) */
  advect: number;
}

export interface MovementSpec {
  name: MovementName;
  /** Duration of this movement in seconds */
  duration: number;
  audio: ErosionParams;
  gl: GLErosionParams;
}

// Six minutes total; each movement transitions smoothly into the next.
export const MOVEMENTS: MovementSpec[] = [
  {
    name: "Intact",
    duration: 70, // ~1 min 10s
    audio: {
      rateDrift: 0.0,
      lpCutoff: 9500,
      dropoutProb: 0.0,
      reverbWet: 0.12,
      grainDensity: 7,
      masterGain: 0.72,
    },
    gl: {
      decay: 0.945,
      smear: 0.0010,
      bleed: 0.0008,
      noiseLevel: 0.002,
      brightness: 1.35,
      advect: 0.00010,
    },
  },
  {
    name: "Eroding",
    duration: 90, // ~1 min 30s
    audio: {
      rateDrift: 0.30,
      lpCutoff: 5500,
      dropoutProb: 0.12,
      reverbWet: 0.28,
      grainDensity: 5,
      masterGain: 0.65,
    },
    gl: {
      decay: 0.960,
      smear: 0.0035,
      bleed: 0.0028,
      noiseLevel: 0.010,
      brightness: 1.20,
      advect: 0.00018,
    },
  },
  {
    name: "Sparse",
    duration: 100, // ~1 min 40s
    audio: {
      rateDrift: 0.60,
      lpCutoff: 2800,
      dropoutProb: 0.38,
      reverbWet: 0.48,
      grainDensity: 2.8,
      masterGain: 0.52,
    },
    gl: {
      decay: 0.975,
      smear: 0.0080,
      bleed: 0.0065,
      noiseLevel: 0.022,
      brightness: 0.92,
      advect: 0.00028,
    },
  },
  {
    name: "Ghost",
    duration: 100, // ~1 min 40s
    audio: {
      rateDrift: 0.90,
      lpCutoff: 1100,
      dropoutProb: 0.65,
      reverbWet: 0.72,
      grainDensity: 1.6,
      masterGain: 0.40,
    },
    gl: {
      decay: 0.990,
      smear: 0.0140,
      bleed: 0.0120,
      noiseLevel: 0.035,
      brightness: 0.68,
      advect: 0.00040,
    },
  },
  {
    name: "Reforming",
    duration: 90, // ~1 min 30s
    audio: {
      rateDrift: 0.18,
      lpCutoff: 6800,
      dropoutProb: 0.06,
      reverbWet: 0.32,
      grainDensity: 5.5,
      masterGain: 0.62,
    },
    gl: {
      decay: 0.952,
      smear: 0.0022,
      bleed: 0.0018,
      noiseLevel: 0.008,
      brightness: 1.15,
      advect: 0.00012,
    },
  },
];

// Total duration in seconds
export const TOTAL_DURATION = MOVEMENTS.reduce((s, m) => s + m.duration, 0);

// ─── Controller state ─────────────────────────────────────────────────────────

export interface MovementState {
  movementIndex: number;
  name: MovementName;
  elapsedInMovement: number;
  totalElapsed: number;
  audio: ErosionParams;
  gl: GLErosionParams;
  /** 0–1 progress through the ENTIRE piece */
  pieceProgress: number;
}

function lerpAudio(a: ErosionParams, b: ErosionParams, t: number): ErosionParams {
  const s = Math.max(0, Math.min(1, t));
  return {
    rateDrift: a.rateDrift + (b.rateDrift - a.rateDrift) * s,
    lpCutoff: a.lpCutoff + (b.lpCutoff - a.lpCutoff) * s,
    dropoutProb: a.dropoutProb + (b.dropoutProb - a.dropoutProb) * s,
    reverbWet: a.reverbWet + (b.reverbWet - a.reverbWet) * s,
    grainDensity: a.grainDensity + (b.grainDensity - a.grainDensity) * s,
    masterGain: a.masterGain + (b.masterGain - a.masterGain) * s,
  };
}

function lerpGL(a: GLErosionParams, b: GLErosionParams, t: number): GLErosionParams {
  const s = Math.max(0, Math.min(1, t));
  return {
    decay: a.decay + (b.decay - a.decay) * s,
    smear: a.smear + (b.smear - a.smear) * s,
    bleed: a.bleed + (b.bleed - a.bleed) * s,
    noiseLevel: a.noiseLevel + (b.noiseLevel - a.noiseLevel) * s,
    brightness: a.brightness + (b.brightness - a.brightness) * s,
    advect: a.advect + (b.advect - a.advect) * s,
  };
}

// Smooth S-curve for cross-fade zone
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Compute the interpolated movement state for a given total elapsed time (seconds).
 * During the last 12s of each movement it cross-fades into the next movement.
 */
export function computeMovementState(totalElapsed: number): MovementState {
  const clamped = Math.min(totalElapsed, TOTAL_DURATION - 0.001);

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < MOVEMENTS.length; i++) {
    if (clamped < acc + MOVEMENTS[i].duration) {
      idx = i;
      break;
    }
    acc += MOVEMENTS[i].duration;
    idx = i;
  }

  const m = MOVEMENTS[idx];
  const elapsedInMovement = clamped - acc;

  // Cross-fade zone: last 12s of current movement
  const XFADE = 12;
  const xfadeStart = m.duration - XFADE;
  let audio: ErosionParams = m.audio;
  let gl: GLErosionParams = m.gl;

  if (elapsedInMovement >= xfadeStart && idx < MOVEMENTS.length - 1) {
    const next = MOVEMENTS[idx + 1];
    const t = smoothstep((elapsedInMovement - xfadeStart) / XFADE);
    audio = lerpAudio(m.audio, next.audio, t);
    gl = lerpGL(m.gl, next.gl, t);
  }

  return {
    movementIndex: idx,
    name: m.name,
    elapsedInMovement,
    totalElapsed: clamped,
    audio,
    gl,
    pieceProgress: clamped / TOTAL_DURATION,
  };
}
