// deposit.ts — turn spectral energy into pigment Strokes injected into the fluid.
//
// This is the heart of the data-as-pigment mapping (see README). Five spectral
// bands each own a slowly drifting ANCHOR that orbits the frame like a current.
// A band injects pigment of its own colour at its anchor in proportion to its
// energy, so the spectral shape of Karel's chord becomes the spatial shape of
// the pigment cloud. A detected onset blooms a radial ring outward from the
// dominant band's anchor.
//
// The SAME generator also runs BEFORE any audio (buildAmbientStrokes): a seeded,
// synthetic set of band energies keeps the ocean alive and breathing so a silent
// phone viewer sees the whole idea on load, with no interaction.

import type { SpectralFrame } from "./analysis";
import { BAND_COUNT } from "./analysis";
import type { Stroke } from "./gl";

// Hue parameter (0..1) for each band along the shared violet ramp:
// sub → deep indigo-blue, air → pale magenta. Oceanic, no off-brand hues.
const BAND_HUE = [0.06, 0.28, 0.5, 0.72, 0.92];

export interface DepositState {
  /** Per-band orbital phase + radius + centre, seeded once. */
  anchors: Array<{ phase: number; speed: number; radius: number; cx: number; cy: number }>;
  seededBloomLeft: number;
}

export function makeDepositState(rand: () => number): DepositState {
  const anchors = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    anchors.push({
      phase: rand() * Math.PI * 2,
      speed: 0.012 + rand() * 0.03, // radians/sec — very slow drift
      radius: 0.16 + rand() * 0.22,
      cx: 0.3 + rand() * 0.4,
      cy: 0.28 + b * 0.11 + (rand() - 0.5) * 0.08, // stacked low→high vertically
    });
  }
  // A few opening blooms so the field is already painting on the first frames.
  return { anchors, seededBloomLeft: 5 };
}

/** Anchor position for band b at time t (0..1 uv, y up). */
function anchorPos(
  state: DepositState,
  b: number,
  time: number
): { x: number; y: number } {
  const a = state.anchors[b];
  const ang = a.phase + time * a.speed;
  return {
    x: clamp01(a.cx + Math.cos(ang) * a.radius * 0.9),
    y: clamp01(a.cy + Math.sin(ang * 0.8) * a.radius * 0.5),
  };
}

/** Music-driven pigment: inject each band at its anchor, bloom on onset. */
export function buildStrokes(
  frame: SpectralFrame,
  state: DepositState,
  rand: () => number,
  time: number,
  reduced: boolean
): Stroke[] {
  const strokes: Stroke[] = [];

  for (let b = 0; b < BAND_COUNT; b++) {
    const e = frame.bandsSmooth[b];
    if (e < 0.04) continue;
    const p = anchorPos(state, b, time);
    // Higher bands paint smaller, sharper; low bands paint broad and soft.
    const size = (34 - b * 4) + e * 46;
    const bright = 0.04 + e * 0.42;
    const jx = (rand() - 0.5) * 0.05;
    const jy = (rand() - 0.5) * 0.05;
    strokes.push(makeStroke(p.x + jx, p.y + jy, BAND_HUE[b], size, bright, rand, time));
  }

  // Onset bloom: a radial ring of pigment from the dominant band's anchor.
  if (!reduced && frame.onset > 0.015) {
    const c = anchorPos(state, frame.dominant, time);
    const petals = Math.min(10, 3 + Math.floor(frame.onset * 40));
    const hue = BAND_HUE[frame.dominant];
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2 + rand() * 0.4;
      const r = 0.03 + frame.onset * 0.14;
      const hj = clamp01(hue + (rand() - 0.5) * 0.16);
      const s: Stroke = {
        x: clamp01(c.x + Math.cos(ang) * r),
        y: clamp01(c.y + Math.sin(ang) * r),
        hue: hj,
        size: 20 + frame.onset * 60,
        brightness: 0.18 + frame.onset * 0.6,
        vx: Math.cos(ang) * (0.12 + frame.onset * 0.25),
        vy: Math.sin(ang) * (0.12 + frame.onset * 0.25),
      };
      strokes.push(s);
    }
  }

  return strokes;
}

/** Pre-audio ambient: seeded synthetic band energies keep the ocean breathing. */
export function buildAmbientStrokes(
  state: DepositState,
  rand: () => number,
  time: number,
  reduced: boolean
): Stroke[] {
  const strokes: Stroke[] = [];
  const rate = reduced ? 0.5 : 1;

  for (let b = 0; b < BAND_COUNT; b++) {
    // Slow overlapping sines simulate a gentle spectral swell.
    const e =
      0.12 +
      0.5 *
        Math.max(
          0,
          Math.sin(time * (0.05 + b * 0.017) * rate + b * 1.7) *
            Math.sin(time * 0.021 * rate + b)
        );
    if (e < 0.06) continue;
    const p = anchorPos(state, b, time);
    const size = (34 - b * 4) + e * 40;
    const bright = 0.05 + e * 0.3;
    strokes.push(
      makeStroke(
        p.x + (rand() - 0.5) * 0.05,
        p.y + (rand() - 0.5) * 0.05,
        BAND_HUE[b],
        size,
        bright,
        rand,
        time
      )
    );
  }

  // Occasional seeded opening blooms so the field is instantly alive on load.
  if (state.seededBloomLeft > 0 && !reduced && rand() < 0.06) {
    state.seededBloomLeft -= 1;
    const b = Math.floor(rand() * BAND_COUNT);
    const c = anchorPos(state, b, time);
    const hue = BAND_HUE[b];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 0.05 + rand() * 0.06;
      strokes.push({
        x: clamp01(c.x + Math.cos(ang) * r),
        y: clamp01(c.y + Math.sin(ang) * r),
        hue: clamp01(hue + (rand() - 0.5) * 0.14),
        size: 30 + rand() * 30,
        brightness: 0.22,
        vx: Math.cos(ang) * 0.12,
        vy: Math.sin(ang) * 0.12,
      });
    }
  }

  return strokes;
}

function makeStroke(
  x: number,
  y: number,
  hue: number,
  size: number,
  brightness: number,
  rand: () => number,
  time: number
): Stroke {
  // A gentle push: slow swirl with slight lateral bias — oceanic, not rising.
  const ang = time * 0.15 + rand() * Math.PI * 2;
  const mag = 0.03 + rand() * 0.05;
  return {
    x: clamp01(x),
    y: clamp01(y),
    hue: clamp01(hue),
    size,
    brightness,
    vx: Math.cos(ang) * mag,
    vy: Math.sin(ang) * mag * 0.5,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
