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
  gain: number;    // deviation -> drive gain
  decay: number;   // release rate (1-decay per frame)
  scale: number;   // max scale breath (gentle — mass, not flash)
  rateLo: number;  // time-dilation floor (music quiet = motion slows)
  rateHi: number;  // time-dilation ceiling (the kick SURGES the world)
};
/** MOTION-mapped EQ (research pass 2026-09-30: Milkdrop/TouchDesigner
 *  practice maps bands to distinct physical attributes; WCAG 2.3.1
 *  bans luminance flashing — so the music drives TIME, not brightness.
 *  Each layer's clock accelerates with its band. */
export const BAND_PROFILES: Record<BandFocus, BandProfile> = {
  bass:   { gain: 16, decay: 0.88,  scale: 0.035, rateLo: 0.30, rateHi: 2.30 },
  mid:    { gain: 11, decay: 0.945, scale: 0.015, rateLo: 0.55, rateHi: 1.50 },
  treble: { gain: 22, decay: 0.78,  scale: 0.010, rateLo: 0.50, rateHi: 2.60 },
};
