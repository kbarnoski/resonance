// SBL visual rewrite (Karel 2026-09-20): the generated prompts converged
// on one golden light-from-darkness world with recurring moons. Each
// track now owns a UNIQUE visual domain — cosmic/earth/nature/infinite
// geometry, boundless movement, NO humans (not even silhouettes).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = JSON.parse(readFileSync("scripts/sbl-output.json", "utf8"));

const TAIL = ", no people no human figures no silhouettes of people, no text no signatures no watermarks no letters no writing";

const WORLDS = {
  "Rise": {
    palette: { primary: "#ffb347", secondary: "#0b1026", accent: "#7fd8ff", glow: "#ffe9c4" },
    phases: [
      "deep underground root systems glowing faint amber through black volcanic rock strata, no moon",
      "vertical cliff faces and geologic strata rushing upward, veins of molten gold climbing through midnight stone",
      "breaking through cloud ceiling into stratospheric vastness, immense columns of aurora light climbing forever upward, boundless vertical energy",
      "high thin air clarity, curved horizon glowing at the edge of space, delicate ice crystals ascending through beams",
      "slow weightless float among noctilucent clouds, upward currents softening, amber warmth thinning to silver",
      "the summit of atmosphere at rest, faint aurora ribbons breathing above a sleeping curved earth, no moon",
    ],
  },
  "Surrender": {
    palette: { primary: "#3fa7c4", secondary: "#0a1420", accent: "#e8f4f8", glow: "#9fdce8" },
    phases: [
      "black storm river churning through a midnight gorge, whitewater catching faint silver light, no moon",
      "rapids widening and slowing, sediment clouds swirling underwater in teal light shafts, current releasing its grip",
      "river mouth dissolving into a vast luminous ocean, freshwater and saltwater interleaving in glowing turquoise veils, total release into boundless water",
      "open ocean surface from below, sunrays fanning through clear water in cathedral shafts, suspended particles glittering",
      "slow deep-water descent through layered blue gradients, gentle currents carrying light downward",
      "still abyssal calm, one soft column of light reaching the seafloor, sand ripples at perfect rest",
    ],
  },
  "Openings": {
    palette: { primary: "#e08a4e", secondary: "#160d18", accent: "#b57edc", glow: "#ffd9ae" },
    phases: [
      "narrow slot canyon in near darkness, a thin seam of warm light carving down sculpted sandstone walls",
      "canyon widening, wave-carved rock ribbons glowing rust and violet as the seam of sky broadens overhead",
      "a colossal geode cracking open, amethyst and citrine crystal cavities blazing with released interior light, boundless mineral radiance",
      "vast natural stone arches framing brilliant open sky, light pouring through layered portals in sequence",
      "canyon mouth opening onto endless painted desert at dusk, banded rock glowing ember and violet",
      "wide open plain under first stars, the canyon far behind, one warm glow deep inside the distant rock",
    ],
  },
  "Surrounded By Light": {
    palette: { primary: "#fff2cc", secondary: "#141021", accent: "#ff9de2", glow: "#ffffff" },
    phases: [
      "inside darkness pierced by one thin prismatic beam splitting into faint spectral bands",
      "walls of pure refracted light assembling, rainbow caustics multiplying across invisible surfaces",
      "total immersion inside a prism, infinite spectral halls in every direction, light bending through light, blinding chromatic euphoria",
      "spectra settling into wide soft bands of warm white radiance, gentle lens flares drifting like weather",
      "light thinning to golden haze, single colors peeling away one by one into the dimness",
      "one last prismatic thread glowing in restored darkness, holding every color inside it",
    ],
  },
  "Drift": {
    palette: { primary: "#d9c7a0", secondary: "#101624", accent: "#8fb8c9", glow: "#f0e6cf" },
    phases: [
      "moonless night desert, wind beginning to slide fine sand sideways across long dune crests",
      "dune fields flowing laterally like slow ocean swells, sand rivers streaming horizontal in pale starlight",
      "boundless sea of dunes and low cloud sheets sliding past each other in silent endless lateral motion, horizon dissolved",
      "tidal flats mirroring the sky, thin sheets of water gliding across sand in gleaming layers",
      "slow fog banks drifting over still water, everything moving sideways at the pace of breath",
      "wind gone still, one last ripple pattern frozen in sand under starlight",
    ],
  },
  "Self": {
    palette: { primary: "#9fd8cb", secondary: "#0d1117", accent: "#e6c99f", glow: "#d8efe9" },
    phases: [
      "perfectly still mountain lake at night reflecting a mirror image so exact the horizon vanishes",
      "frost ferns growing across dark glass, each branch repeating its own shape at every scale",
      "infinite fractal canyon of self-similar rock forms, every wall containing smaller copies of the whole, recursive endless depth",
      "nautilus spirals and fern curls and river deltas overlaid, nature repeating one signature at every scale, luminous clarity",
      "the mirror lake again from farther away, mountains and their reflection breathing as one form",
      "a single dewdrop on dark moss containing the entire landscape in its curve",
    ],
  },
  "Message": {
    palette: { primary: "#59d4a8", secondary: "#071019", accent: "#f2e75e", glow: "#b9f5dd" },
    phases: [
      "pitch dark tide pools, one faint bioluminescent pulse traveling through the water like a sent word",
      "waves of blue-green bioluminescence answering each other across a black lagoon, ripple codes crossing",
      "entire ocean surface alive with cascading luminous pulses, lightning writing bright rivers across the sky above, signals everywhere at once",
      "the storm passing, glowing plankton wakes tracing slow spirals, sky flickering soft distant replies",
      "signals settling into a steady gentle pulse, tide breathing light in and out along the shore",
      "one final luminous ring expanding outward on black water until it meets the horizon",
    ],
  },
  "Grace": {
    palette: { primary: "#f2d59a", secondary: "#171126", accent: "#e88fb0", glow: "#fbeed3" },
    phases: [
      "high dark sky, first slow meteor drawing a silent gold thread that fades without violence",
      "meteor shower thickening but falling gently, embers descending like weightless snow over pine ridges",
      "sky full of soft golden fall, light landing on water and forest without a single impact, mountains receiving radiance like rain, tender overwhelming abundance",
      "after-fall glow, every leaf and stone edged in settled gold, air still shimmering with slow descent",
      "last few light-petals drifting down through violet dusk between dark trees",
      "the forest holding its gilded quiet, one ember of fallen light pulsing softly in the moss",
    ],
  },
  "Complete": {
    palette: { primary: "#c9b3f5", secondary: "#0e0b1e", accent: "#f5c96a", glow: "#e6dcff" },
    phases: [
      "a single incomplete stone circle on a dark plain, gap glowing faintly where the missing piece belongs",
      "concentric ripples, tree rings, orbital paths overlaying and rotating toward alignment",
      "immense rings of stone and star locking into one vast orbital mandala, every circle closing at once, geometric wholeness blazing",
      "the completed mandala turning slowly, rings of amber and violet light in serene rotation",
      "circles loosening into soft halos, rotation slowing like a settling gyroscope",
      "one perfect unbroken ring of soft light resting on dark still ground",
    ],
  },
  "Held": {
    palette: { primary: "#e8a87c", secondary: "#140f0d", accent: "#8fd0b6", glow: "#ffdec2" },
    phases: [
      "mouth of a warm cavern breathing faint amber light into blue night",
      "descending into vast glowing caverns, mineral walls curving inward like cupped hands of stone",
      "immense geode chamber wrapping fully around, warm crystal light on every side, completely enclosed in radiance, safe boundless interior",
      "underground hot spring steaming gently, teal water cradled in gold-lit stone bowls",
      "cavern narrowing to an intimate hollow, one nest of glowing crystals close enough to warm",
      "the smallest chamber, embers of light in the rock walls dimming to a heartbeat glow",
    ],
  },
  "Sway": {
    palette: { primary: "#2e8b74", secondary: "#06110e", accent: "#c4b1e0", glow: "#7fceb4" },
    phases: [
      "deep emerald kelp forest in near darkness, fronds beginning a slow synchronized lean",
      "kelp columns swaying in long underwater wind, teal light rocking between them like a pendulum",
      "entire forests of kelp and aurora curtains above the surface swaying in one immense shared rhythm, hypnotic boundless oscillation",
      "aurora ribbons folding and unfolding in slow arcs over dark water, green and violet trading places",
      "the sway lengthening, grasslands of seagrass bending in slower and slower waves",
      "one last frond settling upright in still emerald water, motion remembered in stillness",
    ],
  },
  "Mystic": {
    palette: { primary: "#7a5fd0", secondary: "#0a0918", accent: "#5ee8d8", glow: "#cdbdfa" },
    phases: [
      "deep indigo void, faint sacred geometry etching itself in thin iridescent lines",
      "a log-spiral nebula unfurling, crystal temple formations condensing along its arms",
      "infinite recursive mandala of nebulae and crystal architecture, every layer opening into deeper layers forever, iridescent visionary boundlessness",
      "the geometry resolving into one luminous temple of translucent crystal planes floating in star mist",
      "the temple dissolving back into slow spiral currents of indigo and seafoam light",
      "the original thin iridescent lines fading into a field of quiet stars, geometry complete and gone",
    ],
  },
};

for (const j of out.journeys) {
  const world = WORLDS[j.cleanTitle];
  if (!world) { console.log(`!! no world for ${j.cleanTitle}`); continue; }
  const { data: row } = await supabase.from("journeys").select("phases, theme").eq("id", j.journeyId).single();
  const phases = row.phases.map((p, i) => ({ ...p, aiPrompt: world.phases[i] + TAIL, palette: world.palette }));
  const theme = { ...row.theme, palette: world.palette };
  const { error } = await supabase.from("journeys").update({ phases, theme }).eq("id", j.journeyId);
  console.log(`${error ? "✗ " + error.message : "✓"} ${j.cleanTitle}`);
}
console.log("done");
