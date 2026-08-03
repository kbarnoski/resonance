// tension.ts — a hand-rolled version of Morwaread Farbood's parametric model
// of musical tension ("A Parametric, Temporal Model of Musical Tension",
// Music Perception, 2012).
//
// Farbood models perceived tension as a weighted combination of musical
// parameters. We use five: LOUDNESS, PITCH HEIGHT (register), HARMONIC
// TENSION (distance from the tonic / dissonance), ONSET DENSITY and TEMPO.
//
// The model runs BOTH ways:
//   forward  — given the parameters actually chosen, compute a scalar
//              tension ∈ [0,1] (the "live" tension that rides the curve).
//   inverse  — given a TARGET tension (the Freytag shape from arc.ts), choose
//              register, dynamics, harmony, density and tempo to hit it.
//
// The inverse direction is what makes minute 5 feel earned by minute 1: the
// dramaturgy drives the notes, not the other way around.

import { mulberry32, hashSeed } from "./rng";
import { targetTension, tensionTrend, actAt } from "./arc";

// Weights sum to 1. Harmony is weighted highest — dissonance is the strongest
// lever on felt tension in a tonal, piano-led texture.
export const WEIGHTS = {
  loudness: 0.22,
  register: 0.16,
  harmony: 0.3,
  density: 0.16,
  tempo: 0.16,
} as const;

export interface Params {
  loudness: number; // 0..1
  register: number; // 0..1  (pitch height)
  density: number; // 0..1   (onset density / probability)
  tempo: number; // 0..1     (0 = slow/calm, 1 = fast/urgent)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** INVERSE model: derive musical parameters from the demanded tension. */
export function computeParams(pos: number): Params {
  const tau = targetTension(pos);
  return {
    loudness: clamp01(0.16 + 0.84 * tau),
    register: clamp01(0.1 + 0.78 * tau),
    density: clamp01(0.06 + 0.92 * (tau * tau * (3 - 2 * tau))),
    tempo: clamp01(tau),
  };
}

/** FORWARD model: scalar tension from realised parameters + harmony weight. */
export function realizedTension(p: Params, harmonyWeight: number): number {
  return clamp01(
    WEIGHTS.loudness * p.loudness +
      WEIGHTS.register * p.register +
      WEIGHTS.harmony * harmonyWeight +
      WEIGHTS.density * p.density +
      WEIGHTS.tempo * p.tempo
  );
}

// ── Harmony ──────────────────────────────────────────────────────────────
// A small functional-ish vocabulary in A (a warm, modal centre). Tones are
// semitone offsets from the tonic pitch class; `weight` is the chord's
// intrinsic harmonic tension (tonic ≈ 0, altered dominants & clusters ≈ 1).
// The resolution deliberately lands on a bright A-major add9 (a Picardy
// third) so the dénouement's tonic is "transformed", not merely restored.

export interface Chord {
  name: string;
  tones: number[]; // semitone offsets from tonic, low → high
  bass: number; // semitone offset for the bass/cello root
  weight: number; // intrinsic harmonic tension 0..1
}

export const CHORDS: Chord[] = [
  { name: "i · Am add9", tones: [0, 7, 12, 14], bass: 0, weight: 0.08 },
  { name: "III · C", tones: [3, 7, 10, 15], bass: 3, weight: 0.18 },
  { name: "VI · F", tones: [-4, 0, 3, 8], bass: -4, weight: 0.24 },
  { name: "iv · Dm", tones: [-7, 0, 5, 8], bass: -7, weight: 0.3 },
  { name: "VII · G", tones: [-2, 2, 5, 10], bass: -2, weight: 0.42 },
  { name: "V · E", tones: [-5, 2, 7, 11], bass: -5, weight: 0.58 },
  { name: "V7 · E7", tones: [-5, 2, 5, 11], bass: -5, weight: 0.66 },
  { name: "vii° · G#dim", tones: [-1, 2, 5, 11], bass: -1, weight: 0.8 },
  { name: "V7♭9 · E7♭9", tones: [-5, 2, 8, 11], bass: -5, weight: 0.9 },
  { name: "♭II cluster", tones: [1, 4, 5, 8], bass: 1, weight: 0.95 },
  { name: "I △ · A add9 (transformed)", tones: [0, 4, 7, 14], bass: 0, weight: 0.12 },
];

// How many times the harmony changes across the whole journey. ~6s per chord
// at a 6-minute length — an unhurried harmonic rhythm.
export const NUM_SLOTS = 60;

/** Which harmony slot a normalised position falls in. */
export function slotAt(pos: number): number {
  const s = Math.floor(Math.max(0, Math.min(0.9999, pos)) * NUM_SLOTS);
  return s;
}

/**
 * Choose the chord for a harmony slot. Deterministic in (seed, slot). Picks
 * among the chords nearest the demanded harmonic tension, so the progression
 * tracks the Freytag curve while still varying between renders. The final
 * slots force the transformed-tonic resolution.
 */
export function chordForSlot(slot: number, seed: number): Chord {
  const pos = (slot + 0.5) / NUM_SLOTS;
  const rng = mulberry32(hashSeed(seed, slot, 0x0c));

  // Force the dénouement to resolve onto the transformed tonic.
  if (pos >= 0.92) return CHORDS[CHORDS.length - 1];
  // The inciting incident: the first chord of the rising action is a clear,
  // bright harmonic event (the subtonic VII lift) regardless of the RNG.
  if (slot === Math.floor(0.14 * NUM_SLOTS)) return CHORDS[4];

  const demand = targetTension(pos);
  const ranked = CHORDS.map((c, i) => ({ i, d: Math.abs(c.weight - demand) }))
    .filter((r) => r.i !== CHORDS.length - 1) // reserve the transformed tonic
    .sort((a, b) => a.d - b.d);
  const pool = ranked.slice(0, 3);
  const pick = pool[Math.floor(rng() * pool.length)] ?? ranked[0];
  return CHORDS[pick.i];
}

// ── Human-readable narration ───────────────────────────────────────────────
const TENSION_MIDI_TONIC = 57; // A3 — reference pitch for the ensemble.
export { TENSION_MIDI_TONIC };

/** A short sentence describing what the music is doing right now. */
export function runDescribe(pos: number, params: Params, chord: Chord): string {
  const act = actAt(pos);
  const trend = tensionTrend(pos);
  const rising = trend > 0.004;
  const falling = trend < -0.004;

  switch (act.id) {
    case "exposition":
      return "sparse felt-piano over a still tonic — the calm before";
    case "rising": {
      const parts: string[] = [];
      if (pos < 0.2) parts.push("the inciting incident lands");
      if (params.density > 0.45) parts.push("onsets thickening");
      if (params.register > 0.5) parts.push("register climbing");
      if (chord.weight > 0.5) parts.push("dissonance rising");
      if (params.tempo > 0.5) parts.push("tempo pressing forward");
      parts.push("strings & percussion entering");
      return "rising action — " + parts.slice(0, 3).join(", ");
    }
    case "climax":
      return "climax — fullest, highest, most dissonant, luminous peak";
    case "falling":
      return rising
        ? "falling action — an aftershock swells"
        : "falling action — dynamics thinning, dissonance resolving";
    case "denouement":
      return "dénouement — a transformed tonic, warm and at rest";
    default:
      return falling ? "releasing" : "unfolding";
  }
}
