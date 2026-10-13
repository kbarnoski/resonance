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
    // the former Kinetic Lab, upgraded to the Archetype (Karel 2026-10-11:
    // "once upgraded no need for a kinetic lab set")
    "Stand 10", "Cabin Soul 8", "Rolling 2", "Cabin Soul 5", "Chemiluminescence 1",
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
  if (journey.id && JOURNEY_SHADER_DIM[journey.id]?.[mode] != null) return JOURNEY_SHADER_DIM[journey.id][mode];
  if (isMasteredJourneyLike(journey)) return 1;
  return SHADER_SUPPORT_GAIN[mode] ?? 1;
}

/** Hand dims for single shaders in a journey (Karel's notes, mastered ones included). */
export const JOURNEY_SHADER_DIM: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // Karel 2026-10-13: "the triangles shader in ghost is a bit too bright. should be a bit more transparent"
  ghost: { yantra: 0.65 },
};

/** Band-split reactive shaders (bass/mid/treble per layer). */
export function isKineticJourneyName(name?: string | null): boolean {
  if (!name) return false;
  if (isExpansionKineticName(name)) return true;
  // Lab pieces carry a take number ("Rolling 2", "Cabin Soul 8"). The
  // bare prefix also caught the Welcome Home album's "Rolling" (2026-10-05):
  // it played as a kinetic lab piece — imagery whispered, its cast frozen.
  return /^(chemiluminescence|rolling|stand|cabin soul)\s+\d/i.test(name.trim());
}

/** FULL KINETIC MODE gate (Karel 2026-10-09: "i only want snowflake and ghost
 *  exempt from kinetic. every other one should be fully kinetic"; "we built
 *  out a system to use everywhere but snowflake and ghost"). The kinetic
 *  LAYER behaviour — mid voice always on, short treble windows at any
 *  intensity, structural-presence fades, full band response, 60 fps headroom
 *  cap — now runs on every non-mastered journey. Which shaders a journey
 *  plays (its cast) is a separate question: isKineticJourneyName still
 *  selects the hand-curated kinetic casts; every other journey keeps its own. */
export function isFullKineticJourney(journey?: { id?: string | null; name?: string | null } | null): boolean {
  if (!journey || (!journey.id && !journey.name)) return false;
  return !isMasteredJourneyLike(journey);
}

/** Imagery whisper (one low-opacity still) — pure-shader lab pieces
 *  only; Rolling/Stand keep epic imagery under their reactive light. */
export function isWhisperImageryName(name?: string | null): boolean {
  if (!name) return false;
  // Expansion = kinetic shaders OVER full imaging (Karel 2026-10-01).
  if (isExpansionKineticName(name)) return false;
  // Imaging back ON everywhere (Karel 2026-10-05: "why does chemi not have
  // the imaging layering? all journeys besides Snowflake and Ghost should
  // have the imaging and kinetics.") — the 09-30 Kinetic Lab pause
  // ("make them all kinetic with their imaging paused") is lifted.
  return false;
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
/** +20% RESPONSE (Karel 2026-10-05: "the shaders could respond another
 *  20% more responsive to the sound than they do. a lot of times it is
 *  really subtle"): gain x1.2, scale x1.2, and the rate swing widened
 *  20% around 1.0 (lo = 1-(1-lo)*1.2, hi = 1+(hi-1)*1.2). Decay — the
 *  release slew — is unchanged, so the extra drive swells, never jitters;
 *  still motion only, never luminance. Pre-bump values:
 *  bass 16/0.035/0.30-2.30, mid 11/0.015/0.55-1.50, treble 22/0.010/0.50-2.60. */
// +20 % again (Karel 2026-10-06: "shaders another 20% more responsive"):
// gain and scale ×1.2, each band's speed range widened 20 % around 1.0
// +20 % a third time (Karel 2026-10-12: "bump up the responsiveness to the audio
// in all journeys by another 20%. dont over do it"): same recipe — decay
// unchanged (it swells, never jitters), bass scale held at its 0.05 ceiling and
// its rate floor at 0.08. 10-06 values: bass 23.04/0.0499/0.08-2.872,
// mid 15.84/0.0216/0.352-1.72, treble 31.68/0.0144/0.28-3.304.
export const BAND_PROFILES: Record<BandFocus, BandProfile> = {
  bass:   { gain: 27.648, decay: 0.88,  scale: 0.0499, rateLo: 0.08, rateHi: 3.2464 }, // scale held under the 0.05 "breath, not a zoom" ceiling; rate floor 0.08 (never freezes)
  mid:    { gain: 19.008, decay: 0.945, scale: 0.02592, rateLo: 0.2224, rateHi: 1.864 },
  treble: { gain: 38.016, decay: 0.78,  scale: 0.01728, rateLo: 0.136, rateHi: 3.7648 },
};

/** AUDIO-REACTIVE gate (Karel 2026-10-05, "this goes for all" — every
 *  journey EXCEPT the mastered three). Non-kinetic journeys (featured,
 *  the albums, Vigil, built-ins) get the same per-layer band drive on
 *  their shader clocks — time-dilation / flow / shimmer — but NONE of
 *  the other kinetic-mode behaviours: no imagery whisper, no locked
 *  dual+tertiary, no structural-presence fades, casts and layer counts
 *  untouched, and their uniforms keep their existing (smooth) values so
 *  no shader's luminance ever couples to the music. */
export function isAudioReactiveJourney(journey?: { id?: string | null; name?: string | null } | null): boolean {
  if (!journey || (!journey.id && !journey.name)) return false;
  return !isMasteredJourneyLike(journey);
}

/** STEADY-CLOCK shaders (Karel 2026-10-11, Rattler 2's r3-fernunfurl finale:
 *  "big swirling shaders that rotate and react to the sound ... makes it feel
 *  like a glitch instead of intentional" / "its ok to have that shader ... just
 *  wouldnt want them glitching to music" / "i havent had issue with the dark
 *  hurricane swirling one its just these swirl graphical ones"). The big
 *  graphic spirals turn the WHOLE frame: a band-driven clock (0.08x-2.9x)
 *  reads as the frame lurching, not as flow. These keep every journey slot
 *  but run on a steady clock with the slow synthetic uniforms — no band rate,
 *  no tempo flow, no kinetic amplitude. Found by scripts/audit-shader-rotation.mjs
 *  (log-polar rotation fit over all 252) and sorted by eye; maelstrom /
 *  maelstrom-dark (the dark hurricane) deliberately stay reactive. */
export const STEADY_CLOCK_SHADERS: ReadonlySet<string> = new Set([
  "r2-spiralgal", "r3-fernunfurl", "fibonacci-spiral", "chrysalis",
  "r-blackhole", "r-kaleido", "whirlpool", "spiral",
]);

export function isSteadyClockShader(mode?: string | null): boolean {
  return !!mode && STEADY_CLOCK_SHADERS.has(mode);
}

/** Drive-only clock rate: same band profile and swing as kinetic mode,
 *  but centred on the journey's own resting pace (1.0 at lv=0.5) so a
 *  meditative journey keeps its tempo between phrases and only surges /
 *  slows with the music. Clamped to the profile's floor and ceiling. */
/** PER-JOURNEY RESPONSE (Karel 2026-10-12): some tracks want more than the
 *  loop-wide profile — "for chemo … the shaders should be another 50% more
 *  responsive since its big funky up beat energy track". Multiplies the band
 *  drive gain, widens the speed swing around 1.0 and grows the scale breath
 *  (capped under the 0.05 "breath, not a zoom" ceiling); the release slew is
 *  unchanged, so it swells, never jitters. Motion only, never luminance. */
// …a LADDER (Karel 2026-10-12: "the solo piano ones get the base setting, then
// the next level gets more and so on such that the intense stuff is highly
// reactive") — the Rise Above vibe tiers. Journeys outside RA stay at base.
const FAR_OUT = 1.1, AMBIENT = 1.2, GROOVE = 1.35, BIG = 1.6;
export const JOURNEY_RESPONSE: Readonly<Record<string, number>> = {
  // solo piano — base (×1): First Light, Bath, The First (Expanded), Testimony 3,
  // Grasshopper, Yellow Bird, The Summit, Welcome Home, Afterglow, Realized
  // far out
  "cosmic-drift": FAR_OUT,
  "mycelium-dream": FAR_OUT,
  // ambient & voices
  "6ff51cde-f4ca-4285-8707-0f77eaf9394c": AMBIENT, // Amboise 1
  "1f83e254-a0c8-45ec-974f-8b363038a98d": AMBIENT, // Rise 1
  "e9beec7a-6aa4-41bb-83f0-c827603ed51d": AMBIENT, // Northern Plane 3
  "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80": AMBIENT, // Night Wind 2
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc": AMBIENT, // Surrounded by Light 6
  "8ca69280-944c-4ccb-9f7f-692f3f7f7a6f": AMBIENT, // Singular 4
  "13e71555-03d6-4b27-ad32-2c6834559c24": AMBIENT, // Northern Plane 5
  "19acdb4c-5a52-4532-99bd-a59652c7ff8e": AMBIENT, // No question 7
  "79cad85a-13fa-4db9-b4cd-a507b62a6084": AMBIENT, // Nothing 30
  "87009cf3-8c07-48eb-88d8-e7acb6a14e41": AMBIENT, // Night Wind 4
  "9662fec9-04fa-4202-9859-8f01cd287aad": AMBIENT, // Tranquility 38
  "8f3e82e2-0a30-499f-ba74-5158208a07a0": AMBIENT, // Never Forget 4
  "99b7ad2c-a212-440e-85fa-0c670c1e4296": AMBIENT, // Redwoods Sway 2
  "6cb979ce-3b76-4851-a0ba-3f100fddfcb3": AMBIENT, // Yellow Bird 3
  // lounge & groove
  "a96b4696-c02b-4004-a1a5-a0b1eee09308": GROOVE, // Loire 2
  "6407bf5c-7862-49e8-883d-59754c4caf18": GROOVE, // No question 8
  "84a82478-f0f2-4c49-b800-b4fe722f1df5": GROOVE, // Stand 10
  "81683231-3b3c-4542-8696-13dfcf56469a": GROOVE, // Loire 5A
  "3ee9acf2-c89d-42b2-b9a3-d5fce97da2ac": GROOVE, // Cabin Soul 8
  "86b64938-26ea-40b9-9ea1-461323a049d5": GROOVE, // Chenin 3
  "4ef43223-42cf-4ce8-9088-7578569f7de6": GROOVE, // Sancerre Cry 4
  "aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6": GROOVE, // Velvet Tears 1
  "85124aed-c3b4-42e2-870a-b14bc5425b72": GROOVE, // Night Wind 9
  // big & intense (+ both Chemiluminescence takes: "big funky up beat energy")
  "9f7d1b51-aeac-4dfc-a39f-b00101a403f9": BIG, // Chemiluminescence 1
  "1f5e3884-5317-4146-ba18-4742eaf74ce9": BIG, // Chemiluminescence
  "4d17da19-6834-4005-a944-34c27a88a320": BIG, // Amboise 2
  "ecf0d90f-7e1b-4ecb-a654-ecea936caca8": BIG, // Bells 1
  "3814f116-5c54-499c-9d9b-355201700fdc": BIG, // Rattler 2
  "c7a0c1c2-c5d2-487b-8c54-73b134e6f09a": BIG, // Horses 1
  "24101852-61ee-4ac9-8fd7-da2ae19ab0a3": BIG, // The Other Side 9
  "6ee9f014-8203-437c-b05c-9d8bd0de9d3e": BIG, // Chenin 5 — THE PEAK
};
/** EVERY journey, not only Rise Above (Karel 2026-10-12: "it should be for all
 *  105 not just ra set"). The deep analysis cannot sort them (its energy score
 *  overlaps across Karel's own RA tiers), so: an exact RA placement first; else
 *  the Expansion's song FAMILY, by the tier Karel gave its RA take; else his own
 *  piano-led albums and studio pieces — the base. */
// (Expansion tracks are always "<Name> <No.>" — Karel's own "Rolling" is a
// piano original, "Rolling 2" the Expansion song)
const FAMILY_RESPONSE: ReadonlyArray<[RegExp, number]> = [
  [/^(the other side|bells|rattler|horses|chemiluminescence|amboise 2$)\s*\d*$/i, BIG],
  [/^(cabin soul|rolling|stand|loire|chenin|sancerre cry|velvet tears|no question)\s+\d+[a-z]?$/i, GROOVE],
  [/^(tranquility|torraine|northern plane|yellow bird|night wind|amboise|rise|singular|nothing|never forget|redwoods sway)\s+\d+[a-z]?$/i, AMBIENT],
];
export function journeyResponse(journey?: { id?: string | null; name?: string | null } | null): number {
  if (journey?.id && JOURNEY_RESPONSE[journey.id]) return JOURNEY_RESPONSE[journey.id];
  const name = (journey?.name ?? "").trim();
  for (const [re, k] of FAMILY_RESPONSE) if (re.test(name)) return k;
  return 1;
}
/** A band profile scaled by a journey's response multiplier. */
export function boostedProfile(prof: BandProfile, k: number): BandProfile {
  if (k === 1) return prof;
  return {
    gain: prof.gain * k,
    decay: prof.decay,
    scale: Math.min(0.0499, prof.scale * k),
    rateLo: Math.max(0.08, 1 - (1 - prof.rateLo) * k),
    rateHi: 1 + (prof.rateHi - 1) * k,
  };
}

export function driveOnlyRate(prof: BandProfile, lv: number): number {
  const r = 1 + (lv - 0.5) * (prof.rateHi - prof.rateLo);
  return Math.min(prof.rateHi, Math.max(prof.rateLo, r));
}

/** Pixel-budget ceiling for native-resolution layers: a backing store up
 *  to ~6.5Mpx (a 3024x1964 retina panel is 5.9Mpx) renders at native DPR
 *  (<=2); bigger surfaces (4K projectors) stay at 1x. */
export const NATIVE_RES_MAX_PX = 6.5e6;

/** DPR ceiling for the imagery canvases (ai-image + depth-parallax).
 *  2026-10-05 ("looks rasterized" — Johnny via Karel): a 1.5x canvas on a
 *  DPR-2 panel is resampled twice, so imagery renders at native DPR where
 *  the budget allows — measured free on the kiosk M4 Pro (The Bloom 83fps,
 *  Expansion 74fps, same as 1.5x). Shader layers stay at 1.5x: native
 *  shaders cost ~25-35fps (see visualizer.tsx). Mastered journeys keep
 *  the 1.5x ceiling they were mastered on. */
export function imageryDprCeil(
  cssW: number,
  cssH: number,
  journey?: { id?: string | null; name?: string | null } | null,
  dpr: number = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1,
): number {
  if (isMasteredJourneyLike(journey)) return 1.5;
  const native = Math.min(dpr, 2);
  if (native <= 1.5) return 1.5;
  return cssW * cssH * native * native <= NATIVE_RES_MAX_PX ? 2 : 1.5;
}
