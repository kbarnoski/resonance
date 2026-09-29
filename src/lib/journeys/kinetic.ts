/**
 * KINETIC journeys (Karel 2026-09-29): a second species alongside the
 * meditative default. Shaders dominate and LISTEN — the primary layer
 * reacts to bass/beat, the dual to mids, the tertiary to highs —
 * while imagery drops to a whisper (one still, low opacity, texture
 * only). The journey row also sets audio_reactive=true so the
 * visualizer uses the real FFT instead of the synthetic slow waves.
 * Lab piece #1: Chemiluminescence.
 */
export function isKineticJourneyName(name?: string | null): boolean {
  if (!name) return false;
  return /^chemiluminescence/i.test(name.trim());
}

export type BandFocus = "bass" | "mid" | "treble";
