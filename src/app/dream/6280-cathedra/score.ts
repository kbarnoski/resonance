// ─────────────────────────────────────────────────────────────────────────────
// score.ts — the harmonic plan, keyed to the tension curve.
//
//   Low tension  → open, consonant intervals (octaves & fifths, a warm choral
//                  bed): the Inner Sanctuary at rest.
//   Rising       → add colour (major 9ths / 6ths), the register creeps upward.
//   Breakthrough → brightest & most expansive: a Lydian #11 shimmer, doubled an
//                  octave up — luminous, not dissonant-harsh; "blinding" light
//                  rendered as harmony.
//   Ascent       → the colour resolves back toward open consonance, higher and
//                  softer: arrival, afterglow.
//
//   Voicings are given as semitone offsets from a root. selectChord() picks the
//   band by tension and lifts the whole voicing in register as tension climbs,
//   so minute 3 sits materially higher and brighter than minute 0.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from "./prng";

export const ROOT_MIDI = 45; // A2 — the drone home.

export interface Chord {
  /** sustained pad tones (midi), low → high. */
  pad: number[];
  /** pool the bell/piano voice arpeggiates through (midi). */
  bell: number[];
  /** sub-drone root (midi). */
  sub: number;
  /** 0..1 rhythmic density of struck notes for this band. */
  density: number;
  /** lowpass openness hint 0..1 (also nudged live by T). */
  brightness: number;
}

// Voicing banks as offsets from the (register-shifted) root.
const OPEN = [0, 7, 12, 19]; // octave + fifth — utterly open
const WARM9 = [0, 7, 14, 16, 21]; // major add9/6 — warmth
const LYDIAN = [0, 7, 14, 18, 21, 24]; // #11 shimmer — expansive
const RESOLVE = [0, 7, 12, 16, 19, 24]; // major, high & settled

function build(offsets: number[], root: number): number[] {
  return offsets.map((o) => root + o);
}

/**
 * Choose the chord for a given harmonic tension. `register` (semitones) lifts
 * the whole voicing as tension rises so the piece physically ascends.
 */
export function selectChord(T: number): Chord {
  const tension = clamp(T, 0, 1);
  // register lift: up to a major tenth above home at the climax
  const register = Math.round(tension * 16);
  const root = ROOT_MIDI + register;

  let offsets: number[];
  let density: number;
  let brightness: number;

  if (tension < 0.28) {
    offsets = OPEN;
    density = 0.12;
    brightness = 0.18;
  } else if (tension < 0.52) {
    offsets = WARM9;
    density = 0.3;
    brightness = 0.42;
  } else if (tension < 0.72) {
    offsets = LYDIAN;
    density = 0.62;
    brightness = 0.9;
  } else {
    offsets = RESOLVE;
    density = 0.34;
    brightness = 0.6;
  }

  const pad = build(offsets, root);
  // bells draw from the chord plus its octave above for sparkle at height
  const bell = pad.concat(pad.map((n) => n + 12));

  return {
    pad,
    bell,
    sub: ROOT_MIDI - 12 + (register >= 12 ? 12 : 0), // sub rises an octave late
    density,
    brightness,
  };
}

/** Equal-tempered midi → frequency. */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
