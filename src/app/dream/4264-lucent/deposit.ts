// deposit.ts — turn a SpectralFrame into light-deposit Strokes.
//
// This is the heart of the music→light mapping (see README):
//   • spectral centroid → HUE on the violet ramp AND vertical position of the
//     new light (bright timbres bloom higher and paler; dark ones sink and
//     deepen toward indigo).
//   • RMS loudness        → deposit BRIGHTNESS and SIZE.
//   • spectral flux (onset energy) → the NUMBER of new strokes: a loud attack
//     bursts several plumes at once, a sustained tone trickles one.
//
// Emitter x-positions random-walk (seeded) so the field is painted across the
// whole frame over a long performance rather than in one column.

import type { SpectralFrame } from "./analysis";
import type { Stroke } from "./gl";

export interface DepositState {
  /** Persistent horizontal emitters that random-walk across the frame. */
  emitters: number[];
  /** Rolling flux baseline for adaptive onset detection. */
  fluxAvg: number;
}

export function makeDepositState(rand: () => number): DepositState {
  return {
    emitters: [rand(), rand(), rand()],
    fluxAvg: 0,
  };
}

/**
 * Produce the strokes to deposit this frame. `rand` is the shared mulberry32
 * stream; `time` seconds drives slow horizontal drift.
 */
export function buildStrokes(
  frame: SpectralFrame,
  state: DepositState,
  rand: () => number,
  time: number
): Stroke[] {
  const strokes: Stroke[] = [];

  // Adaptive onset: flux above its slow average = an attack.
  state.fluxAvg += (frame.flux - state.fluxAvg) * 0.05;
  const onset = Math.max(0, frame.flux - state.fluxAvg);

  // Random-walk the emitters slowly so light spreads across the canvas.
  for (let i = 0; i < state.emitters.length; i++) {
    state.emitters[i] += (rand() - 0.5) * 0.02;
    if (state.emitters[i] < 0.05) state.emitters[i] = 0.05;
    if (state.emitters[i] > 0.95) state.emitters[i] = 0.95;
  }

  // Centroid → vertical band + hue. Bright timbres rise & pale.
  const c = frame.centroidSmooth;
  const baseY = 0.18 + c * 0.64;
  const hue = 0.25 + c * 0.65; // stays inside the violet→light arc

  // Loudness → size + brightness. Keep modest: the field ACCUMULATES.
  const size = 12 + frame.rms * 46;
  const bright = 0.05 + frame.rms * 0.35;

  // Baseline trickle: one soft plume per active emitter when there's sound.
  const active = frame.rms > 0.02;
  if (active) {
    const ei = Math.floor(rand() * state.emitters.length);
    const x = state.emitters[ei] + (rand() - 0.5) * 0.04;
    const y = baseY + (rand() - 0.5) * 0.10;
    strokes.push(makeStroke(x, y, hue, size, bright, rand, time));
  }

  // Onset burst: flux spawns a cluster of brighter plumes.
  const burst = Math.min(7, Math.floor(onset * 26));
  for (let b = 0; b < burst; b++) {
    const ei = Math.floor(rand() * state.emitters.length);
    const x = state.emitters[ei] + (rand() - 0.5) * 0.16;
    const y = baseY + (rand() - 0.5) * 0.20;
    const hj = Math.min(1, Math.max(0, hue + (rand() - 0.5) * 0.18));
    strokes.push(
      makeStroke(x, y, hj, size * (0.8 + rand() * 0.9), bright * 1.4, rand, time)
    );
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
  // A gentle push: outward swirl + slight buoyancy, so plumes drift and curl.
  const ang = time * 0.2 + rand() * Math.PI * 2;
  const mag = 0.04 + rand() * 0.06;
  return {
    x: clamp01(x),
    y: clamp01(y),
    hue: clamp01(hue),
    size,
    brightness,
    vx: Math.cos(ang) * mag,
    vy: Math.abs(Math.sin(ang)) * mag * 0.6 + 0.02, // slight upward bias
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
