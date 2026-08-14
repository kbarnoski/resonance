// ─────────────────────────────────────────────────────────────────────────────
// 11600-cloudveil · demo.ts — the seeded generative chorale + the silent driver.
//
//   Two jobs, one source of truth:
//
//   1. CHORALE — a slow, dawn-lit piano-ish pad progression, defined here as
//      chords of MIDI notes. audio.ts plays these through the safe master when
//      the visitor starts sound. It is fully seeded (mulberry32) so the piece
//      that plays is identical every visit.
//
//   2. SILENT ENVELOPE — the muted-06:30-phone decider. On load, with NO audio
//      context yet, the cloud must already be breathing. silentEnvelope(tSec)
//      returns the SAME { energy, low, high } feature shape the analyser
//      produces, derived deterministically from performance.now() and a set of
//      seeded LFOs whose slow swell traces the SAME chord rhythm the chorale
//      would play. So the muted phone sees exactly the motion the audio would
//      have driven — just silent.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, SEED, clamp } from "./prng";

/** The audio-reactive feature vector the visuals consume, from either the
 *  live analyser (audio on) or silentEnvelope (audio off). All 0..1. */
export interface Features {
  /** Overall loudness — drives cloud density + scattered-light gain. */
  energy: number;
  /** Low-band energy — drives the sun's intensity + cloud thickness. */
  low: number;
  /** High-band energy — drives forward-scatter anisotropy g (glassier glow). */
  high: number;
}

/** Seconds each chord is held before the pad drifts to the next one. */
export const CHORD_SECONDS = 5.0;

/** The dawn progression, as chords of MIDI notes. Am → F → C → G — consonant,
 *  hymn-like, resolves forever. Warm, never tense. */
export const PROGRESSION: number[][] = [
  [57, 60, 64, 69], // Am   (A C E A)
  [53, 57, 60, 65], // Fmaj (F A C F)
  [48, 55, 60, 64], // Cmaj (C G C E)
  [55, 59, 62, 67], // Gmaj (G B D G)
];

// Seeded per-chord velocity shaping so the pad breathes unevenly but identically
// every run.
const rng = mulberry32(SEED ^ 0xa17e);
const CHORD_VELOCITY = PROGRESSION.map(() => 0.7 + rng() * 0.3);

/** Velocity (0..1) for chord index i — deterministic. */
export function chordVelocity(i: number): number {
  return CHORD_VELOCITY[i % CHORD_VELOCITY.length];
}

// A little bank of seeded LFOs for the silent envelope. Each has a slow period
// and a fixed phase, so the silent drift is smooth, organic, and reproducible.
const lfoRng = mulberry32(SEED ^ 0x5c0f);
const LFOS = Array.from({ length: 4 }, () => ({
  period: 6 + lfoRng() * 10, // 6..16 s — all well below any flicker band
  phase: lfoRng() * Math.PI * 2,
}));

function lfo(i: number, t: number): number {
  const { period, phase } = LFOS[i];
  return 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2 + phase);
}

/** Deterministic feature vector for the muted self-demo. Drives the cloud so
 *  visible motion appears within a frame of load, with no audio at all. */
export function silentEnvelope(tSec: number): Features {
  // The "current chord" swell — a slow triangle that peaks mid-chord, matching
  // the chorale's legato pad shape.
  const chordPhase = (tSec / CHORD_SECONDS) % 1;
  const chordIdx = Math.floor(tSec / CHORD_SECONDS) % PROGRESSION.length;
  const swell = Math.sin(chordPhase * Math.PI); // 0→1→0 across the chord
  const vel = chordVelocity(chordIdx);

  const a = lfo(0, tSec);
  const b = lfo(1, tSec);
  const c = lfo(2, tSec);
  const d = lfo(3, tSec);

  const energy = clamp(0.28 + 0.5 * swell * vel + 0.14 * a, 0, 1);
  const low = clamp(0.3 + 0.4 * swell + 0.2 * b * c, 0, 1);
  const high = clamp(0.2 + 0.35 * (0.5 + 0.5 * Math.sin(tSec * 0.5)) + 0.2 * d, 0, 1);

  return { energy, low, high };
}
