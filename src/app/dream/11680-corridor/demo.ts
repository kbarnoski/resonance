// ─────────────────────────────────────────────────────────────────────────────
// 11680-corridor · demo.ts — the seeded generative chorale + the silent driver.
//
//   Two jobs, one source of truth:
//
//   1. CHORALE — a slow, dawn-lit piano-ish pad progression, defined here as
//      chords of MIDI notes. audio.ts plays these through the safe master when
//      the visitor enters the tunnel. It is fully seeded (mulberry32) so the
//      piece that plays is identical every visit.
//
//   2. SILENT ENVELOPE — the muted-06:30-phone decider. On load, with NO audio
//      context yet, you must ALREADY be flying slowly down the glowing corridor.
//      silentEnvelope(tSec) returns the SAME feature shape the analyser produces
//      — { energy, low, high, centroid, onset } — derived deterministically from
//      performance.now(). Critically it emits a per-beat `onset` pulse so the
//      flythrough SURGES on the (silent) rhythm exactly as it would to sound.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, SEED, clamp } from "./prng";

/** The audio-reactive feature vector the visuals consume, from either the
 *  live analyser (audio on) or silentEnvelope (audio off). All 0..1. */
export interface Features {
  /** Overall loudness — thickens the corridor walls + lifts scatter gain. */
  energy: number;
  /** Low-band energy — swells the light at the tunnel's end + wall density. */
  low: number;
  /** High-band energy — sharpens the forward-scatter anisotropy g. */
  high: number;
  /** Spectral centroid (brightness) — tints the end-light gold ↔ amber. */
  centroid: number;
  /** Onset level (0..1): a beat hit. Drives the flythrough surge. */
  onset: number;
}

/** Seconds each chord is held before the pad drifts to the next one. */
export const CHORD_SECONDS = 5.0;

/** Seconds between flythrough beats (the pulse that surges the camera). */
export const BEAT_SECONDS = 0.66;

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
const LFOS = Array.from({ length: 5 }, () => ({
  period: 6 + lfoRng() * 10, // 6..16 s — all well below any flicker band
  phase: lfoRng() * Math.PI * 2,
}));

function lfo(i: number, t: number): number {
  const { period, phase } = LFOS[i];
  return 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2 + phase);
}

// Seeded swing on the silent beat grid so the flythrough surges unevenly but
// identically each run (never a metronome).
const swingRng = mulberry32(SEED ^ 0x3b17);
const SWING = Array.from({ length: 8 }, () => (swingRng() - 0.5) * 0.12);

/** Deterministic feature vector for the muted self-demo. Keeps you flying —
 *  and surging on the beat — down the corridor with no audio at all. */
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
  const e = lfo(4, tSec);

  const energy = clamp(0.28 + 0.5 * swell * vel + 0.14 * a, 0, 1);
  const low = clamp(0.3 + 0.4 * swell + 0.2 * b * c, 0, 1);
  const high = clamp(0.2 + 0.32 * (0.5 + 0.5 * Math.sin(tSec * 0.55)) + 0.18 * d, 0, 1);
  const centroid = clamp(0.4 + 0.28 * e + 0.12 * Math.sin(tSec * 0.23), 0, 1);

  // Per-beat onset pulse: a level that jumps to ~1 at each beat and decays over
  // the beat. The page's fast-attack/slow-release surge envelope turns this into
  // a forward lunge down the tunnel. Every 4th beat is a heavier downbeat.
  const beatIdx = Math.floor(tSec / BEAT_SECONDS);
  const swing = SWING[beatIdx % SWING.length];
  const beatPhase = clamp(((tSec / BEAT_SECONDS) % 1) - swing, 0, 1);
  const shape = Math.pow(1 - beatPhase, 3.0); // 1 at the hit, decays across beat
  const accent = beatIdx % 4 === 0 ? 1.0 : 0.62;
  const onset = clamp(shape * accent * (0.55 + 0.45 * vel), 0, 1);

  return { energy, low, high, centroid, onset };
}
