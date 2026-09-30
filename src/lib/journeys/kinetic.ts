/**
 * KINETIC journeys (Karel 2026-09-29): a second species alongside the
 * meditative default. Shaders dominate and LISTEN — the primary layer
 * reacts to bass/beat, the dual to mids, the tertiary to highs —
 * while imagery drops to a whisper (one still, low opacity, texture
 * only). The journey row also sets audio_reactive=true so the
 * visualizer uses the real FFT instead of the synthetic slow waves.
 * Lab piece #1: Chemiluminescence.
 */
/** Band-split reactive shaders (bass/mid/treble per layer). */
export function isKineticJourneyName(name?: string | null): boolean {
  if (!name) return false;
  return /^(chemiluminescence|rolling|stand|cabin soul)/i.test(name.trim());
}

/** Imagery whisper (one low-opacity still) — pure-shader lab pieces
 *  only; Rolling/Stand keep epic imagery under their reactive light. */
export function isWhisperImageryName(name?: string | null): boolean {
  if (!name) return false;
  return /^chemiluminescence/i.test(name.trim());
}

export type BandFocus = "bass" | "mid" | "treble";

/** Per-band EQ voice (Karel 2026-09-30: "each shader should have its
 *  own response so when they all are shown its a cohesive eq visual
 *  experience"). Bass punches, mid swells, treble shimmers. */
export type BandProfile = {
  gain: number;    // onset (spectral flux) -> envelope attack gain
  decay: number;   // per-frame envelope decay (60fps)
  floor: number;   // how much of the level-norm keeps the layer present
  scale: number;   // max scale punch
  brightLo: number;
  brightHi: number;
};
export const BAND_PROFILES: Record<BandFocus, BandProfile> = {
  bass:   { gain: 16, decay: 0.88,  floor: 0.28, scale: 0.075, brightLo: 0.40, brightHi: 1.35 },
  mid:    { gain: 11, decay: 0.945, floor: 0.34, scale: 0.030, brightLo: 0.50, brightHi: 1.05 },
  treble: { gain: 22, decay: 0.78,  floor: 0.22, scale: 0.020, brightLo: 0.42, brightHi: 1.30 },
};
