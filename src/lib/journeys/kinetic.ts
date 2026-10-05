import { SHADER_SUPPORT_GAIN, SHADER_LEAD_GAIN, EXPANSION_LEADS } from "@/lib/shaders/shader-gain.generated";
import { isMasteredJourneyLike } from "./mastered";

/**
 * KINETIC journeys (Karel 2026-09-29): a second species alongside the
 * meditative default. Shaders dominate and LISTEN — the primary layer
 * reacts to bass/beat, the dual to mids, the tertiary to highs —
 * while imagery drops to a whisper (one still, low opacity, texture
 * only). The journey row also sets audio_reactive=true so the
 * visualizer uses the real FFT instead of the synthetic slow waves.
 * Lab piece #1: Chemiluminescence.
 */
/**
 * The EXPANSION journeys — kinetic WITH imaging (Karel 2026-10-01: "just
 * make all in expansion and these batches kinetic with the imaging as
 * well"). Exact names (case-insensitive), because several Expansion
 * pieces share a prefix with a mastered Kinetic Lab journey whose
 * imaging stays paused ("Chemiluminescence" vs "Chemiluminescence 1",
 * "Cabin Soul 6" vs "Cabin Soul 5/8"). Set 1 (2026-09-29) + set 2.
 */
export const EXPANSION_KINETIC_NAMES: ReadonlySet<string> = new Set(
  [
    // Set 1
    "Surrounded by Light 6", "Nothing 30", "Night Wind 2", "The Other Side 10",
    "Northern Plane 5", "No question 8",
    // Set 2 (the rest of ~/Desktop/Suno Songs, deduped 2026-10-01)
    "Amboise 1", "Amboise 2", "Bells 1", "Cabin Soul 6", "Chemiluminescence",
    "Chenin 3", "Chenin 5", "Horses 1", "Loire 2", "Loire 5A", "Never Forget 4",
    "Night Wind 4", "Night Wind 5", "Night Wind 9", "Night Wind 11",
    "No question 7", "Northern Plane 3", "Rattler 2", "Redwoods Sway 2",
    "Rise 1", "Roll Away 8", "Sancerre Cry 4", "Singular 4",
    "Surrounded by Light 3", "Surrounded by Light 19", "The Other Side 9",
    "Torraine 5", "Torraine 6", "Torraine 7",
    "Tranquility 3", "Tranquility 8", "Tranquility 11", "Tranquility 17",
    "Tranquility 21", "Tranquility 30", "Tranquility 33", "Tranquility 34",
    "Tranquility 35", "Tranquility 36", "Tranquility 38",
    "Velvet Tears 1", "Yellow Bird 3", "Yellow Bird 6",
  ].map((n) => n.toLowerCase()),
);

export function isExpansionKineticName(name?: string | null): boolean {
  if (!name) return false;
  return EXPANSION_KINETIC_NAMES.has(name.trim().toLowerCase());
}

/** Per-shader opacity gain for an Expansion kinetic layer (Karel
 *  2026-10-05: "i swear that the pool of shaders used in expansion
 *  journeys seems super limited ... ensure there is true diversity").
 *  Brighter vetted shaders are normalized down to the layer budget
 *  (support mean <= 25 / black floor <= 6; a journey's own lead mean
 *  <= 45 / floor <= 10) instead of being excluded — measured by
 *  scripts/vet-shaders.mjs. Every other journey is unchanged (1). */
export function expansionLayerGain(name?: string | null, mode?: string | null): number {
  if (!mode || !isExpansionKineticName(name)) return 1;
  if (EXPANSION_LEADS[name!.trim().toLowerCase()] === mode) return SHADER_LEAD_GAIN[mode] ?? 1;
  return SHADER_SUPPORT_GAIN[mode] ?? 1;
}

/** Per-shader opacity gain for ANY journey's layer (Karel 2026-10-05:
 *  "everything besides snowflake, realized, ghost is getting the
 *  treatment"). Expansion -> its own lead/support gains; the mastered
 *  three and the Kinetic Lab (approved casts) -> 1, untouched; every
 *  other journey -> the vetted support gain, so its brighter shaders sit
 *  at the same layer budget instead of washing the blacks. */
export function journeyLayerGain(journey?: { id?: string | null; name?: string | null } | null, mode?: string | null): number {
  if (!mode || !journey) return 1;
  if (isExpansionKineticName(journey.name)) return expansionLayerGain(journey.name, mode);
  if (isKineticJourneyName(journey.name)) return 1; // Kinetic Lab
  if (isMasteredJourneyLike(journey)) return 1;
  return SHADER_SUPPORT_GAIN[mode] ?? 1;
}

/** Band-split reactive shaders (bass/mid/treble per layer). */
export function isKineticJourneyName(name?: string | null): boolean {
  if (!name) return false;
  if (isExpansionKineticName(name)) return true;
  // Lab pieces carry a take number ("Rolling 2", "Cabin Soul 8"). The
  // bare prefix also caught the Welcome Home album's "Rolling" (2026-10-05):
  // it played as a kinetic lab piece — imagery whispered, its cast frozen.
  return /^(chemiluminescence|rolling|stand|cabin soul)\s+\d/i.test(name.trim());
}

/** Imagery whisper (one low-opacity still) — pure-shader lab pieces
 *  only; Rolling/Stand keep epic imagery under their reactive light. */
export function isWhisperImageryName(name?: string | null): boolean {
  if (!name) return false;
  // Expansion = kinetic shaders OVER full imaging (Karel 2026-10-01).
  if (isExpansionKineticName(name)) return false;
  // Imaging PAUSED for the whole Kinetic Lab for now (Karel 2026-09-30:
  // "make them all kinetic with their imaging paused") — pure shaders
  // on black while the lead-actor language matures.
  return isKineticJourneyName(name);
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
