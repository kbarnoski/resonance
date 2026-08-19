/**
 * Prompt decoration shared by the live AI image layer and the offline
 * harvest script (scripts/harvest-journey-images.mjs). Keeping these in
 * one module guarantees pre-baked journey images are assembled with the
 * exact same vocabulary as live fal generation.
 */

/**
 * Phase-aware cinematic perspectives — POV evolves through the journey arc.
 *
 * Inspired by:
 *   Kubrick — one-point perspective, symmetrical framing, slow zooms
 *   Tarkovsky — contemplative drift, water surfaces, rooms as mindscapes
 *   Malick — nature POV, looking up through canopy, magic hour backlight
 *   Villeneuve — vast negative space, scale contrast, silhouettes against geometry
 *   Spielberg — low-angle wonder, reaction before reveal
 *   Hitchcock — subjective POV, deep focus tension, overhead moral reckoning
 */
export const CINEMATIC_PERSPECTIVES: Record<string, string[]> = {
  // ── Threshold: grounding, orientation, gentle entry ──
  threshold: [
    "extreme wide aerial view looking down at 45 degrees, vast empty landscape, soft diffused light",
    "eye-level symmetrical one-point perspective down a dimly lit corridor, warm light at vanishing point",
    "camera at water surface level half submerged, looking across still lake toward distant forms",
    "low angle looking up through bare branches at overcast sky, natural geometric patterns",
    "medium wide shot centered on archway, silhouetted against soft interior light",
    "bird's eye view looking straight down at a crossroads of paths, long shadows extending",
    "slow dolly-forward perspective through empty room toward a window, foreground soft focus",
    "wide landscape with deep atmospheric perspective, three distinct depth layers: dark foreground silhouette, mid-ground structures, bright distant horizon",
    "camera low to ground looking across a textured surface toward the horizon, shallow depth of field",
    "centered symmetrical composition through a natural frame of rock or foliage, distant vanishing point",
  ],
  // ── Expansion: growing intensity, deepening engagement ──
  expansion: [
    "tracking shot moving through environment at eye height, motion blur on background, sharp foreground detail",
    "low angle looking up at towering vertical forms, converging lines creating dramatic forced perspective",
    "deep perspective looking into vast space, layered elements receding into distance",
    "worm's eye view from ground level looking straight up through organic forms at bright sky above",
    "slowly ascending perspective, camera rising, world expanding outward revealing hidden patterns",
    "telephoto compression flattening foreground against vast background, layers embedded in surroundings",
    "split-depth composition: sharp foreground detail on one side, deep background in focus on the other",
    "extreme close-up of a single reflective surface showing the world within its curved shape",
    "diagonal composition with strong leading lines pulling eye from lower left to upper right",
    "medium shot through layers of translucent material, each layer adding depth and color",
  ],
  // ── Transcendence: peak intensity, rule-breaking, the sublime ──
  transcendence: [
    "Dutch angle 25 degrees, dramatic chiaroscuro, forms half-lit half-shadow, tilting diagonally",
    "extreme close-up macro detail, shallow depth of field, single point of sharp focus surrounded by abstract bokeh",
    "symmetrical one-point perspective with blinding white light at vanishing point, all detail dissolving into radiance",
    "bird's eye from extreme height looking straight down, vast concentric pattern radiating from center",
    "abstract perspective with no clear up or down, floating in space, contradictory light sources, gravity dissolved",
    "vast negative space, single point of luminous color at center, overwhelming emptiness in all directions",
    "camera inside looking out through fractured prismatic surface, world broken into shifted copies, chromatic edges",
    "extreme low angle looking straight up at overwhelming scale, immense form towering above",
    "radial composition emanating from center, energy and light bursting outward in all directions",
    "tilted overhead perspective looking down at forms reaching upward, lit from above, spiraling composition",
  ],
  // ── Illumination: revelation, clarity emerging from intensity ──
  illumination: [
    "wide panoramic view from a high vantage point, world laid out below in golden light, vast and clear",
    "centered composition in a pool of warm directional light, surrounding darkness",
    "camera looking through crystalline transparent forms, light refracting into spectral colors, sharp detail",
    "overhead view at 45 degrees looking down at intricate patterns revealed by raking side light",
    "eye-level perspective across a threshold, looking from shadow into brilliance, light pouring through",
    "extreme close-up of luminous surface texture, backlit, every detail revealed, ethereal translucence",
    "slow zoom into a single detail that contains the whole — fractal, recursive, infinite",
    "two-point perspective with converging horizontals meeting at center, balanced and centered",
    "panoramic sweep with focal point sharp against soft atmospheric background, sense of revelation",
    "looking up from below at light streaming through an opening, volumetric rays, particles visible in beams",
  ],
  // ── Return: descent, grounding, coming back to earth ──
  return: [
    "same wide establishing perspective as opening but now at golden hour, warmer light, longer shadows",
    "medium close-up of organic textures in soft natural light, rim light on edges, peaceful warmth",
    "still centered overhead view looking down at calm surface with subtle ripples expanding from center",
    "eye-level across a threshold, looking from interior into exterior light, warm transition",
    "extreme wide landscape with balanced proportions, environment in harmony, balanced light",
    "close-up of natural textures at rest, warm light, fine detail, objects suggesting completion",
    "long perspective down a gently curving path, softer geometry than rigid corridors, warm ambient light",
    "camera slowly pulling back, revealing more of the surrounding world, gentle recession",
    "low angle through grass or low vegetation, layered depth planes, sky above, grounded and intimate",
    "reflected image in still water, both the real and reflected world equally sharp, perfect symmetry",
  ],
  // ── Integration: resolution, stillness, transformed view ──
  integration: [
    "perfectly still wide shot, environment in equilibrium, natural light, no dramatic angles",
    "intimate close-up of natural detail, soft wrap-around light, shallow focus, tender stillness",
    "bird's eye looking down at a complete pattern or mandala, the whole journey visible as a single form",
    "eye-level one-point perspective but with the corridor now opening into vast bright space, doors open",
    "extreme wide composition where all elements merge with the landscape, integrated and whole",
    "medium shot through a window or frame, inner and outer worlds connected through light",
    "camera at rest, observational, wide and unhurried, the composition breathes with generous space",
    "looking up at sky with no ground visible, pure atmosphere and light, weightless and free",
    "close-up of a small natural detail — leaf, stone, water drop — containing reflected light of the whole",
    "wide symmetric composition with warm golden tones, everything in its place, resolved and complete",
  ],
};

export const PROMPT_INTERPRETATIONS = [
  "painterly and impressionistic", "photographic and textural",
  "geometric and structured", "fluid and organic",
  "minimal and sparse", "dense and layered",
  "dreamy and soft focus", "sharp and crystalline",
  "ethereal and translucent", "raw and tactile",
  "microscopic detail", "atmospheric and hazy",
];

export const PROMPT_MOODS = [
  "quiet solitude", "vast stillness", "gentle motion",
  "raw power", "delicate fragility", "infinite depth",
  "emerging from darkness", "dissolving into light",
  "tension between opposites", "peaceful emptiness",
];

/** Appended server-side to every generated prompt across every journey. */
export const STYLE_SUFFIX =
  "photorealistic cinematic photograph, real photographic materials and lighting, " +
  "surreal dreamlike but lifelike, luminous, transcendent, ethereal, " +
  "every celestial body (moon planet earth sun) rendered as a perfect round sphere";

/** Global negative prompt — concepts that should NEVER appear, regardless
 *  of journey. Callers can extend via the request's negativePrompt field. */
export const GLOBAL_NEGATIVE =
  "bird feathers, bird wings, plumage, feathered wings, " +
  "additional people, additional figures, multiple people, multiple women, " +
  "crowds, bystanders, onlookers, distant figures, background person, " +
  "text, watermark, signature, logo, writing, letters, " +
  "illustration, cartoon, painting, anime, concept art, 3d render, " +
  "deformed anatomy, extra limbs, extra arms, missing limb, blurry face, " +
  "low quality, oversaturated";
