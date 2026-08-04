// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — THE JOURNEY ENGINE (the spine).
//
//   A single normalized TENSION CURVE  T(t) ∈ [0,1]  runs over a ~4-minute
//   timeline, shaped as a Freytag arc and mapped to a SPATIAL passage through
//   sacred architecture. The SAME curve drives both the generative music and
//   the camera journey — the camera's place in the corridor IS the dramatic arc.
//
//   Freytag phases → passage:
//     Narthex      (0.00–0.15)  low tension, dim, enclosed, slow threshold.
//     Nave         (0.15–0.50)  rising action: corridor lengthens, columns
//                               rise & multiply, light grows ahead, camera
//                               accelerates.
//     Breakthrough (0.50–0.65)  climax: the architecture opens into a blinding
//                               aperture; highest tension, brightest, widest.
//     Ascent       (0.65–1.00)  falling action + resolution: the space calms
//                               and rises, light softens to a warm afterglow,
//                               a sense of arriving — then loops gently home.
//
//   T(t) is a smoothstep spline through named control points plus a small
//   seeded low-frequency wobble, so it is continuous and never mechanical.
//   Every derived scalar (lightIntensity, corridorScale, warmth, cameraSpeed,
//   harmonicTension …) is read off the same clock each frame.
//
//   Real-audio override: if a file is dropped, an AnalyserNode-derived tension
//   proxy REPLACES the synthetic T and drives everything from that live value.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, smoothstep, lerp, clamp } from "./prng";

export type PhaseName = "Narthex" | "Nave" | "Breakthrough" | "Ascent";

export interface Frame {
  /** cycle fraction 0..1 (synthetic clock position). */
  p: number;
  phase: PhaseName;
  /** normalized dramatic tension 0..1 — the master variable. */
  T: number;
  /** harmony driver (== T, named for the score's benefit). */
  harmonicTension: number;
  /** brightness of the aperture ahead, 0 (dim narthex) → 1 (blinding). */
  lightIntensity: number;
  /** how open/expansive the passage is, ~0.7 (enclosed) → ~1.6 (aperture). */
  corridorScale: number;
  /** colour temperature 0 (cool indigo) → 1 (warm gold). */
  warmth: number;
  /** forward camera velocity scalar. */
  cameraSpeed: number;
  /** 0..1 how deep inside the Breakthrough climax (shimmer / glare). */
  breakthroughness: number;
  /** 0..1 the resolving afterglow of the Ascent. */
  ascentness: number;
  /** monotonically increasing forward distance travelled (world units). */
  journey: number;
  /** true while a dropped audio file is driving the tension. */
  live: boolean;
}

type CP = readonly [p: number, v: number];

// A smoothstep spline evaluated through ascending control points.
function spline(points: readonly CP[], p: number): number {
  const x = clamp(p, 0, 1);
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, v0] = points[i];
    const [x1, v1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      return lerp(v0, v1, smoothstep(x0, x1, x));
    }
  }
  return last[1];
}

// ── Freytag arc: the tension curve. Peaks mid-Breakthrough, resolves home. ──
const T_CURVE: readonly CP[] = [
  [0.0, 0.06],
  [0.12, 0.14],
  [0.3, 0.42],
  [0.5, 0.78],
  [0.575, 1.0], // climax
  [0.65, 0.82],
  [0.8, 0.42],
  [0.92, 0.18],
  [1.0, 0.06], // loops back to the threshold
];

// Aperture brightness. Holds a warm afterglow floor through the Ascent
// rather than snapping dark, then dims for the loop back into the Narthex.
const LIGHT_CURVE: readonly CP[] = [
  [0.0, 0.05],
  [0.15, 0.12],
  [0.45, 0.55],
  [0.55, 1.0],
  [0.62, 1.0],
  [0.7, 0.66],
  [0.85, 0.44],
  [1.0, 0.05],
];

// How open the space is: enclosed threshold → lengthening nave → wide aperture.
const CORRIDOR_CURVE: readonly CP[] = [
  [0.0, 0.7],
  [0.15, 0.78],
  [0.45, 1.05],
  [0.575, 1.6],
  [0.7, 1.35],
  [0.85, 1.2],
  [1.0, 0.7],
];

// Colour temperature: cool indigo → gold at the Breakthrough.
const WARMTH_CURVE: readonly CP[] = [
  [0.0, 0.05],
  [0.3, 0.22],
  [0.5, 0.72],
  [0.575, 1.0],
  [0.7, 0.86],
  [0.85, 0.62],
  [1.0, 0.05],
];

// Forward velocity: slow threshold → accelerating nave → calm ascent.
const SPEED_CURVE: readonly CP[] = [
  [0.0, 0.35],
  [0.15, 0.5],
  [0.45, 1.5],
  [0.55, 1.2],
  [0.65, 0.9],
  [0.85, 0.48],
  [1.0, 0.35],
];

function phaseFor(p: number): PhaseName {
  if (p < 0.15) return "Narthex";
  if (p < 0.5) return "Nave";
  if (p < 0.65) return "Breakthrough";
  return "Ascent";
}

const CYCLE_SECONDS = 240; // ~4 minutes per journey; loops indefinitely.

export class JourneyEngine {
  private t = 0; // elapsed seconds (wraps each cycle)
  private journey = 0; // cumulative forward distance
  private wobblePhase: number[];
  private wobbleRate: number[];
  private wobbleAmp: number[];

  // live-audio override
  private liveActive = false;
  private liveT = 0; // smoothed live tension proxy

  constructor(seed: number) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    // three slow, incommensurate wobble oscillators — keep T "breathing".
    this.wobblePhase = [rng() * 6.283, rng() * 6.283, rng() * 6.283];
    this.wobbleRate = [0.017 + rng() * 0.01, 0.031 + rng() * 0.013, 0.047 + rng() * 0.02];
    this.wobbleAmp = [0.03, 0.02, 0.012];
  }

  /** Feed a live tension proxy (0..1) derived from a dropped audio file. */
  setLiveTension(value: number | null): void {
    if (value === null) {
      this.liveActive = false;
      return;
    }
    this.liveActive = true;
    // one-pole smoothing so the visuals don't jitter on transients
    this.liveT = lerp(this.liveT, clamp(value, 0, 1), 0.12);
  }

  isLive(): boolean {
    return this.liveActive;
  }

  private wobble(): number {
    let w = 0;
    for (let i = 0; i < this.wobblePhase.length; i++) {
      w += Math.sin(this.wobblePhase[i] + this.t * this.wobbleRate[i] * 6.283) * this.wobbleAmp[i];
    }
    return w;
  }

  /** Advance the clock and return this frame's full state. */
  update(dt: number): Frame {
    this.t = (this.t + dt) % CYCLE_SECONDS;
    const p = this.t / CYCLE_SECONDS;

    let T: number;
    let light: number;
    let corridor: number;
    let warmth: number;
    let speed: number;
    let phase: PhaseName;
    const wob = this.wobble();

    if (this.liveActive) {
      // Live file drives tension; every scalar is a monotonic map off liveT so
      // the same arc-shape holds whatever the source material.
      T = clamp(this.liveT + wob * 0.4, 0, 1);
      light = clamp(0.05 + smoothstep(0.15, 0.95, T) * 0.95, 0, 1);
      corridor = lerp(0.72, 1.6, smoothstep(0.1, 0.95, T));
      warmth = clamp(T, 0, 1);
      speed = 0.4 + T * 1.0;
      phase =
        T < 0.2 ? "Narthex" : T < 0.55 ? "Nave" : T < 0.8 ? "Breakthrough" : "Ascent";
    } else {
      T = clamp(spline(T_CURVE, p) + wob, 0, 1);
      light = clamp(spline(LIGHT_CURVE, p) + wob * 0.5, 0, 1);
      corridor = spline(CORRIDOR_CURVE, p);
      warmth = clamp(spline(WARMTH_CURVE, p) + wob * 0.3, 0, 1);
      speed = spline(SPEED_CURVE, p);
      phase = phaseFor(p);
    }

    // derived climax / resolution weights
    const breakthroughness = smoothstep(0.55, 0.9, light) * clamp(T, 0, 1);
    const ascentness = this.liveActive
      ? 0
      : smoothstep(0.5, 0.85, p) * (1 - smoothstep(0.94, 1.0, p));

    this.journey += speed * dt * 6.0; // world units/sec of forward drift

    return {
      p,
      phase,
      T,
      harmonicTension: T,
      lightIntensity: light,
      corridorScale: corridor,
      warmth,
      cameraSpeed: speed,
      breakthroughness,
      ascentness,
      journey: this.journey,
      live: this.liveActive,
    };
  }
}
