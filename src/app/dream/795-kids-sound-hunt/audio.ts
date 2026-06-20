// Audio helpers for the Sound Hunt dream.
// Pure module top: types + constants + non-browser helpers only.
// All AudioContext work happens inside functions called from handlers/effects.

// C-major pentatonic chord tones (one gentle octave + a couple highs),
// so revealing any subset always sounds consonant.
// Hz tuned low-and-warm for a bedtime register.
export const VOICE_HZ = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  329.63, // E4
  392.0, // G4
];

// Soft warm hues per voice (dim, not saturated) — amber / rose / dusk.
export const VOICE_HUE = [38, 28, 18, 350, 320, 285, 48, 8];

// Friendly animal-ish labels (shown faintly when found).
export const VOICE_NAME = [
  "owl",
  "frog",
  "cricket",
  "dove",
  "cat",
  "whale",
  "bird",
  "bee",
];

export const NUM_VOICES = 8;

// Each voice gets a fixed azimuth evenly spread around the 360° ring.
export function computeAzimuths(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((360 / n) * i);
  return out;
}

// Smallest signed angular distance (deg) between two headings, in [-180,180].
export function angleDelta(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

// Beam proximity → 0..1 gain envelope. Wide, forgiving lobe.
// Within BEAM_WIDTH degrees the voice swells smoothly toward 1.
export const BEAM_WIDTH = 46; // degrees half-width of the listening lobe
export const FOUND_WITHIN = 18; // degrees that latches a "found" reveal

export function computeProximity(delta: number): number {
  const a = Math.abs(delta);
  if (a >= BEAM_WIDTH) return 0;
  // cosine-shaped falloff for a soft, natural swell
  const t = a / BEAM_WIDTH; // 0 at center → 1 at edge
  return 0.5 + 0.5 * Math.cos(Math.PI * t);
}

// Convert azimuth degrees → unit position on the horizontal circle.
// 0° = front (-z), 90° = right (+x), like a compass turning clockwise.
export function azimuthToXZ(deg: number, radius: number): { x: number; z: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.sin(rad) * radius, z: -Math.cos(rad) * radius };
}

// A single spatialized voice: oscillator/voice chain feeding an HRTF panner.
export interface Voice {
  idx: number;
  azimuth: number;
  panner: PannerNode;
  gain: GainNode; // proximity-controlled swell gain
  osc: OscillatorNode;
  lfo: OscillatorNode; // gentle vibrato/tremolo source
  lfoGain: GainNode;
  found: boolean;
}

// Cross-browser panner positioning (positionX.value vs setPosition()).
export function applyPannerPosition(p: PannerNode, x: number, y: number, z: number): void {
  const px = p.positionX as AudioParam | undefined;
  if (px && typeof px.value === "number") {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    const legacy = p as unknown as {
      setPosition?: (x: number, y: number, z: number) => void;
    };
    legacy.setPosition?.(x, y, z);
  }
}

// Cross-browser listener orientation.
export function applyListenerOrientation(
  l: AudioListener,
  fx: number,
  fy: number,
  fz: number,
): void {
  const ofx = l.forwardX as AudioParam | undefined;
  if (ofx && typeof ofx.value === "number") {
    l.forwardX.value = fx;
    l.forwardY.value = fy;
    l.forwardZ.value = fz;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    const legacy = l as unknown as {
      setOrientation?: (
        fx: number,
        fy: number,
        fz: number,
        ux: number,
        uy: number,
        uz: number,
      ) => void;
    };
    legacy.setOrientation?.(fx, fy, fz, 0, 1, 0);
  }
}
