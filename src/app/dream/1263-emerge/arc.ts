// ─────────────────────────────────────────────────────────────────────────────
// arc.ts — the 5-phase stateful JOURNEY controller for "Emerge".
//
//   A single >5-minute arc from stillness, through ego-dissolution, and back.
//   One global `journey` scalar (0..1 over the whole timeline) plus a phase name
//   drives BOTH the GPU particle field AND the audio bed. Every visual/audio
//   parameter is an eased keyframe track over `journey`, so minute 5 looks and
//   sounds genuinely different from minute 1 — real evolution, not a loop.
//
//   The five phases (self/other boundary condense → dissolve → re-condense):
//     1. Onset       0 – 15%  sparse teal motes in a dark void, near-still.
//     2. Come-up     15 – 35% particles CONDENSE into a bounded luminous body.
//     3. Peak        35 – 60% the boundary DISSOLVES: expansion, turbulence,
//                             white-gold light, figure/ground merge (ego loss).
//     4. Plateau     60 – 80% a warm luminous dispersed haze, slow swells.
//     5. Return      80 – 100% particles softly RE-CONDENSE to a calm glow.
//
//   No React, no globals — pure functions so the render loop can sample it every
//   frame, and a scrubber can jump straight to the peak for the morning reviewer.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArcState {
  /** 0..1 across the whole timeline. */
  journey: number;
  phaseIndex: number;
  phaseName: string;
  elapsed: number;
  total: number;
  // particle-field drivers ---------------------------------------------------
  /** 0 = dispersed cloud, 1 = tight bounded body. */
  condense: number;
  /** Outward radial push (boundary dissolution / expansion). */
  expansion: number;
  /** Curl-noise flow amplitude (turbulence). */
  flowAmp: number;
  /** Spatial frequency of the flow field. */
  flowScale: number;
  /** How fast the flow field morphs. */
  flowSpeed: number;
  /** 0..1 dissolution-into-light (whitens color, blooms center glow, opens void). */
  dissolve: number;
  /** 0 = cool teal/indigo, 1 = warm neon/gold. */
  warmth: number;
  /** Overall luminance drive. */
  brightness: number;
  /** Overall particle opacity. */
  alpha: number;
  /** Fraction of the point cloud currently visible (0..1). */
  population: number;
  /** Base point size in device px (before DPR). */
  pointSize: number;
  // audio driver -------------------------------------------------------------
  /** Shepard/drone drive — climaxes at the breakthrough. */
  intensity: number;
}

const PHASES: ReadonlyArray<{ end: number; name: string }> = [
  { end: 0.15, name: "Onset" },
  { end: 0.35, name: "Come-up" },
  { end: 0.6, name: "Peak · breakthrough" },
  { end: 0.8, name: "Plateau" },
  { end: 1.01, name: "Return" },
];

type KF = readonly [number, number];

/** Smoothstep-interpolated keyframe track over journey j∈[0,1]. */
function track(j: number, kfs: ReadonlyArray<KF>): number {
  if (j <= kfs[0][0]) return kfs[0][1];
  const last = kfs[kfs.length - 1];
  if (j >= last[0]) return last[1];
  for (let i = 1; i < kfs.length; i++) {
    if (j <= kfs[i][0]) {
      const [j0, v0] = kfs[i - 1];
      const [j1, v1] = kfs[i];
      const t = (j - j0) / Math.max(1e-6, j1 - j0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
  }
  return last[1];
}

// The heart: eased envelopes. Read left→right as the journey unfolds.
const T_CONDENSE: KF[] = [[0, 0.12], [0.14, 0.22], [0.33, 1.0], [0.37, 0.95], [0.48, 0.22], [0.6, 0.1], [0.78, 0.16], [0.9, 0.72], [1, 0.86]];
const T_EXPAND: KF[] = [[0, 0], [0.34, 0.02], [0.42, 0.6], [0.5, 1.0], [0.6, 0.85], [0.78, 0.52], [0.9, 0.14], [1, 0.0]];
const T_FLOWAMP: KF[] = [[0, 0.06], [0.15, 0.12], [0.3, 0.22], [0.45, 0.55], [0.5, 0.72], [0.6, 0.52], [0.78, 0.4], [0.9, 0.22], [1, 0.11]];
const T_FLOWSCALE: KF[] = [[0, 0.65], [0.5, 1.2], [0.75, 1.0], [1, 0.75]];
const T_FLOWSPEED: KF[] = [[0, 0.03], [0.15, 0.05], [0.3, 0.09], [0.5, 0.17], [0.6, 0.12], [0.8, 0.07], [1, 0.04]];
const T_POP: KF[] = [[0, 0.06], [0.12, 0.13], [0.2, 0.46], [0.34, 1.0], [0.88, 1.0], [1, 0.9]];
const T_BRIGHT: KF[] = [[0, 0.28], [0.15, 0.38], [0.34, 0.62], [0.5, 1.0], [0.6, 0.86], [0.78, 0.7], [0.9, 0.55], [1, 0.46]];
const T_WARMTH: KF[] = [[0, 0.0], [0.15, 0.06], [0.34, 0.46], [0.5, 0.86], [0.6, 0.8], [0.78, 0.68], [0.9, 0.44], [1, 0.24]];
const T_DISSOLVE: KF[] = [[0, 0.0], [0.34, 0.05], [0.42, 0.4], [0.5, 1.0], [0.58, 0.9], [0.7, 0.55], [0.8, 0.3], [0.92, 0.08], [1, 0.0]];
const T_INTENSITY: KF[] = [[0, 0.05], [0.15, 0.12], [0.3, 0.35], [0.45, 0.8], [0.5, 1.0], [0.6, 0.72], [0.78, 0.5], [0.9, 0.25], [1, 0.1]];
const T_ALPHA: KF[] = [[0, 0.5], [0.34, 0.78], [0.5, 0.92], [0.7, 0.85], [1, 0.72]];
const T_POINT: KF[] = [[0, 2.9], [0.2, 2.6], [0.34, 2.1], [0.5, 1.7], [0.7, 2.0], [1, 2.4]];

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Sample the whole journey at absolute time `t` (seconds) of `total`.
 *  `neural` (0..1) is the OPTIONAL mic "neural-gain": a louder room deepens the
 *  dissolution — more turbulence, expansion, glow. Pass 0 for self-running. */
export function sampleArc(t: number, total: number, neural = 0): ArcState {
  const j = clamp01(t / Math.max(1, total));

  let phaseIndex = 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (j < PHASES[i].end) {
      phaseIndex = i;
      break;
    }
  }
  const ng = clamp01(neural);
  // Neural-gain only bites once the boundary is soft enough to disturb.
  const soften = track(j, [[0, 0], [0.34, 0.2], [0.5, 1.0], [0.8, 0.7], [1, 0.2]]);
  const nBoost = ng * soften;

  return {
    journey: j,
    phaseIndex,
    phaseName: PHASES[phaseIndex].name,
    elapsed: t,
    total,
    condense: clamp01(track(j, T_CONDENSE) - nBoost * 0.15),
    expansion: track(j, T_EXPAND) + nBoost * 0.35,
    flowAmp: track(j, T_FLOWAMP) + nBoost * 0.28,
    flowScale: track(j, T_FLOWSCALE),
    flowSpeed: track(j, T_FLOWSPEED) + nBoost * 0.04,
    dissolve: clamp01(track(j, T_DISSOLVE) + nBoost * 0.22),
    warmth: clamp01(track(j, T_WARMTH)),
    brightness: clamp01(track(j, T_BRIGHT) + nBoost * 0.12),
    alpha: clamp01(track(j, T_ALPHA)),
    population: clamp01(track(j, T_POP)),
    pointSize: track(j, T_POINT),
    intensity: clamp01(track(j, T_INTENSITY) + nBoost * 0.12),
  };
}
