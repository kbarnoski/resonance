// ─────────────────────────────────────────────────────────────────────────────
// mapping.ts — the ONE data→music/visual engine for 1374-sky-strata.
//
// `skyToDrivers(sky)` is a PURE function. Its output is consumed IDENTICALLY by
// the audio layer (audio.ts) and the SVG render (page.tsx), so what you hear and
// what you see are guaranteed to agree — the sky authors both.
//
//   speed        → arp tempo + strata drift speed
//   density      → number + thickness of strata bands
//   negative bz  → minor mode + higher, more-saturated bands (aurora energy)
//   Kp           → overall energy + palette (low: deep green/teal calm;
//                  high: reds/violets, more bands, more motion)
//
// Any audio-linked luminance motion stays ≤3 Hz (see page.tsx flicker guard).
// ─────────────────────────────────────────────────────────────────────────────

import type { Sky } from "./data";

export interface Drivers {
  /** Seconds between generative arp notes (lower = faster). */
  tempo: number;
  /** Number of strata bands to draw + voice (4..9). */
  strataCount: number;
  /** Band height scale (0.65..1.55). */
  thickness: number;
  /** Darker canvas + tenser palette (southward Bz or storming Kp). */
  darkMode: boolean;
  /** Minor pentatonic when true, major pentatonic when false. */
  minor: boolean;
  /** Drone drive + aurora luminance, 0..1. */
  energy: number;
  /** Seconds for one horizontal drift cycle (lower = faster). */
  driftSpeed: number;
  /** Base band hue, degrees 0..360. */
  hue: number;
  /** Band saturation, percent 40..95. */
  sat: number;
  /** Vertical lift of the band stack, 0..1 (aurora rides higher when active). */
  lift: number;
  /** Root note as MIDI number — the sky's KEY. */
  rootMidi: number;
}

const MAJOR_PENT = [0, 2, 4, 7, 9];
const MINOR_PENT = [0, 3, 5, 7, 10];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function skyToDrivers(sky: Sky): Drivers {
  const speed = clamp(sky.speed, 250, 800);
  const density = clamp(sky.density, 0, 30);
  const bz = clamp(sky.bz, -40, 40);
  const bt = clamp(sky.bt, 0, 40);
  const kp = clamp(sky.kp, 0, 9);

  // How far "south" the field points, 0 (northward/quiet) → 1 (strong storm).
  const south = clamp(-bz / 20, 0, 1);

  // speed → tempo (fast wind, brisk arp) and drift (fast wind, quicker bands).
  const sFrac = (speed - 250) / 550;
  const tempo = clamp(0.42 - sFrac * 0.27, 0.15, 0.42);
  const driftSpeed = clamp(60 - sFrac * 42, 18, 60);

  // density → band count + thickness; a storming Kp adds one extra band.
  const dFrac = density / 25;
  let strataCount = Math.round(lerp(4, 9, dFrac));
  if (kp >= 6) strataCount += 1;
  strataCount = clamp(strataCount, 4, 9);
  const thickness = clamp(lerp(0.65, 1.55, dFrac), 0.65, 1.55);

  // Kp → overall energy; Bt and southward Bz feed the aurora.
  const energy = clamp(0.22 + (kp / 9) * 0.5 + (bt / 40) * 0.16 + south * 0.18, 0, 1);

  // Kp low: green/teal calm (~165°). Kp high: violet (~295°). Southward pushes
  // further toward magenta/red so a storm literally reddens the sky.
  let hue = lerp(165, 295, kp / 9);
  hue += south * 40;
  hue = ((hue % 360) + 360) % 360;
  const sat = clamp(52 + (kp / 9) * 28 + south * 15, 40, 95);

  // Aurora rides higher up the frame as the field goes southward.
  const lift = clamp(0.15 + south * 0.6 + (kp / 9) * 0.2, 0, 1);

  // KEY: a quiet field sits in A; each storm step transposes up a consonant,
  // pentatonic-safe interval so the whole world re-tunes with the weather.
  const rootSteps = [0, 3, 5, 7, 10];
  const bucket = clamp(Math.round(kp / 2), 0, rootSteps.length - 1);
  const rootMidi = 45 + rootSteps[bucket]; // A2 = 45

  const minor = bz < -1;
  const darkMode = bz < -5 || kp >= 5;

  return {
    tempo,
    strataCount,
    thickness,
    darkMode,
    minor,
    energy,
    driftSpeed,
    hue,
    sat,
    lift,
    rootMidi,
  };
}

/**
 * Frequency (Hz) for a pentatonic scale DEGREE in the sky's current key. Degrees
 * wrap across octaves, so every value is always consonant (scale-index only —
 * there is no way to sound a wrong note).
 */
export function scaleFreq(d: Drivers, degree: number): number {
  const scale = d.minor ? MINOR_PENT : MAJOR_PENT;
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  const midi = d.rootMidi + oct * 12 + scale[idx];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
