// ─────────────────────────────────────────────────────────────────────────────
// arc.ts — the stateful "final simulation" arc controller.
//
// A single scalar C (coherence, 0→1→0) drives the whole piece. It is the
// Borjigin gamma surge rendered as a SLOW luminance/binding ramp (≪3 Hz), never
// a strobe. `converge` pulls the 24 cluster centroids toward one point at the
// boundless peak. Both are pure functions of loop time so audio and visuals can
// each derive them from their own clock and stay in step.
// ─────────────────────────────────────────────────────────────────────────────

export type Phase = "fading" | "surge" | "boundless" | "return";

export interface ArcState {
  /** Coherence 0..1 — binds the field, drives luminance and audio density. */
  C: number;
  /** Centroid convergence 0..1 — clusters collapse toward one radiant point. */
  converge: number;
  phase: Phase;
  label: string;
  /** 0..1 within the current phase. */
  progress: number;
  /** Seconds since the start of the current loop. */
  tLoop: number;
}

export const ARC_TOTAL = 360; // seconds per loop (~6 min)

const T_FADING = 60; //   0– 60  fading
const T_SURGE = 180; //  60–180  the surge / binding
const T_BOUNDLESS = 300; // 180–300  boundless light
// 300–360  return

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const PHASE_LABEL: Record<Phase, string> = {
  fading: "Fading — the senses withdraw",
  surge: "The surge — a life binds at once",
  boundless: "Boundless light — one breathing whole",
  return: "Return — the light recedes",
};

export function sampleArc(tSeconds: number): ArcState {
  const tLoop = ((tSeconds % ARC_TOTAL) + ARC_TOTAL) % ARC_TOTAL;
  let C = 0;
  let converge = 0;
  let phase: Phase;
  let progress: number;

  if (tLoop < T_FADING) {
    phase = "fading";
    progress = tLoop / T_FADING;
    // Barely-there coherence; the field is scattered and dim.
    C = 0.03 * (1 - progress);
    converge = 0;
  } else if (tLoop < T_SURGE) {
    phase = "surge";
    progress = (tLoop - T_FADING) / (T_SURGE - T_FADING);
    // A slow 120-second ramp 0→1 (~0.004 Hz) — the gamma surge as luminance.
    C = smoothstep(0, 1, progress);
    converge = 0.12 * smoothstep(0.65, 1, progress);
  } else if (tLoop < T_BOUNDLESS) {
    phase = "boundless";
    progress = (tLoop - T_SURGE) / (T_BOUNDLESS - T_SURGE);
    // Held near full, breathing very slowly (~0.0125 Hz).
    C = 0.94 + 0.06 * Math.sin(progress * Math.PI * 3);
    converge = 0.12 + 0.88 * smoothstep(0, 0.5, progress);
  } else {
    phase = "return";
    progress = (tLoop - T_BOUNDLESS) / (ARC_TOTAL - T_BOUNDLESS);
    // Release: light recedes, motes disperse back to scattered drift.
    C = 1 - smoothstep(0, 1, progress);
    converge = 1 - smoothstep(0, 0.85, progress);
  }

  return { C, converge, phase, label: PHASE_LABEL[phase], progress, tLoop };
}
