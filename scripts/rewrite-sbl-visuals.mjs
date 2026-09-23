// SBL visual rewrite v4 — THE MUSIC-VIDEO DOCTRINE (Karel 2026-09-21).
// See docs/journey-design-spec.md. Each journey = six radically different
// SHOTS of one motif family, traversing micro ↔ landscape ↔ cosmic scale,
// asymmetric, unfolding, uninhabited, skies occupied. SBL journeys carry
// subtle spirit-energy light-forms in 1-2 phases (formless, never
// figurative). No two phases share a POV or scale register.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = JSON.parse(readFileSync("scripts/sbl-output.json", "utf8"));

const TAIL = ", completely uninhabited, no text no signatures no watermarks no letters no writing";

const WORLDS = {
  "Rise": { // D Major, 103s, dense, massive Q3 climax — daybreak surge: filament, canyon veins, gold flood breaking through cloud
    palette: { primary: "#ffb347", secondary: "#0b1026", accent: "#7fd8ff", glow: "#ffe9c4" },
    phases: [
      "DARK BACKGROUND, extreme macro — a single amber filament of light threading through black mineral grain, sharp focus on one glowing junction lower right, bokeh sparks of deeper filaments defocused behind, vast dark negative space above",
      "aerial view straight down onto a canyon system at night, its branching gorges veined with rising amber light like a luminous root map, updraft dust glowing as it climbs out of the deepest forks, diagonal fracture from lower left to upper right",
      "cosmic scale — an ocean of dark cloud torn open by the risen sun seen from inside the tear, immense waves of gold light flooding through and breaking over the cloud ridges below, radiant spray of lit mist climbing past the viewpoint, the curved horizon burning far below at one corner, boundless vertical euphoria",
      "intimate scale — one updraft caught in a shaft of high-altitude light, a slow intentional current of pale luminous air rising through it like a breath that knows its way, thin gold particles orbiting the current, deep indigo emptiness around, spirit-quiet",
      "wide planetary shot — the atmosphere's curved rim as a knife-thin band of stacked gold-rose-indigo across the lower frame, one soft ribbon of light drifting above it with unhurried purpose, enormous dark space claiming the rest",
      "macro again, transformed — a single bead of dew at rest on dark stone at the top of the world, the whole risen morning caught as one point of amber light refracting inside it, everything else soft black stillness",
    ],
  },
  "Surrender": { // motifs: black water, teal light shafts, dissolving boundaries, sediment galaxies
    palette: { primary: "#3fa7c4", secondary: "#0a1420", accent: "#e8f4f8", glow: "#9fdce8" },
    phases: [
      "DARK BACKGROUND, violent close-up — whitewater caught mid-explosion against black, every droplet sharp and straining, warm dusk light on the spray, the torrent occupying one hard diagonal band, blackness pressing in from the rest",
      "underwater medium shot — sediment clouds unfurling in slow galaxies through tilted shafts of teal light, streamlines visibly loosening, bubbles spiraling up unhurried, dark water deepening leftward",
      "aerial cosmic view — a river delta from great height dissolving into a luminous ocean, freshwater and saltwater interleaving in vast glowing turquoise fractals across the whole lower frame, the last dark thread of river vanishing at the edge, release rendered as geography",
      "abstract immersion — no horizon, suspended in mid-water where colossal cathedral shafts of light cross at angles, motes glittering along each beam, one slow pale current of luminous water moving through with gentle intention, like being breathed",
      "extreme macro — a single droplet rejoining a still surface, the impact crown suspended at millimeter scale, rings of pale teal light expanding across darkness, sharpness at the crown and infinite soft dark beyond",
      "wide, nearly empty — the deep seafloor under one soft distant column of blue-white light far off-center, rippled sand in perfect rest across the foreground dark, surrender complete at planetary quiet",
    ],
  },
  "Openings": { // motifs: sculpted sandstone, seams of light, crystal cavities, portals
    palette: { primary: "#e08a4e", secondary: "#160d18", accent: "#b57edc", glow: "#ffd9ae" },
    phases: [
      "DARK BACKGROUND, extreme macro — a hairline crack in dark stone glowing from within, warm light escaping along its length like a lit seam, mineral grain sharp at the fissure edge, black stone mass filling the frame around it",
      "low interior wide — slot canyon walls of wave-sculpted rock sweeping overhead in flowing ribbons, one jagged bright river of sky far above, dust motes falling through the descending seam of light, rust and violet strata at many depths",
      "monumental scale — a colossal geode split open across the diagonal, dark shell peeling back from blazing amethyst and citrine chambers, prismatic shafts erupting into surrounding blackness, tower-sized crystals catching violet fire, mineral dust escaping as glittering weather",
      "aerial view straight down — a labyrinth of canyon openings from high above at dusk, every crack in the vast rock plateau glowing warm from inside, a luminous vein-map of open seams across dark stone to the frame's edge",
      "intimate threshold shot — one natural stone arch framing painted desert beyond, a slow veil of pale gold light drifting through the opening with quiet intention, as if the doorway itself exhaled, banded dusk sky stacked rose to indigo behind",
      "cosmic abstraction — the crack motif at galactic scale, a dark nebula splitting along a luminous seam, star-bright interior light escaping the fissure into deep space, the first macro shot reborn as heavens",
    ],
  },
  "Surrounded By Light": { // motifs: prismatic beams, spectral planes, caustics, white radiance
    palette: { primary: "#fff2cc", secondary: "#141021", accent: "#ff9de2", glow: "#ffffff" },
    phases: [
      "DARK BACKGROUND, minimal — one thin prismatic beam crossing black space from the upper corner, splitting into faint spectral bands that dissolve before the far edge, microscopic dust igniting rainbow sparks only inside the light",
      "extreme macro — the surface of a prism face at crystal-lattice scale, light entering as a white wall and shattering into geometric spectral rivers that race along internal planes, chromatic edges razor sharp against glassy dark",
      "boundless immersion — infinite spectral halls receding in every direction with no floor or ceiling, corridors of refracted rainbow bending through one another, blinding white cores blooming at intersections, no horizon, only light inhabiting light at architectural infinity",
      "landscape scale — a dark valley seen from a ridge, filled entirely with horizontal strata of luminous prismatic haze, bands of rose and cyan and gold lying between the black slopes like a sea of stacked light, one slow current of pale radiance moving through the bands with soft intention",
      "aerial cosmic — spectral caustic nets sweeping across a vast dark curved surface far below, rainbow interference patterns at planetary scale drifting and crossing, deep space above holding thin white blooms",
      "macro finale — a single thread of light on black velvet, thin as wire, every color of the journey alive inside its length, one faint bloom where it bends, absolute dark elsewhere",
    ],
  },
  "Drift": { // motifs: streaming sand, lateral sheets, tidal mirrors, fog veils
    palette: { primary: "#d9c7a0", secondary: "#101624", accent: "#8fb8c9", glow: "#f0e6cf" },
    phases: [
      "DARK BACKGROUND, ground-level macro — sand grains streaming sideways across a dune crest in razor focus, each grain a lit particle in laminar flow, the stream a bright horizontal ribbon against deep blue-black night",
      "wide aerial — an ocean of dunes from high above under storm-lit clouds, whole ridgelines migrating in visible sheets, pale gold grain-rivers braiding between shadowed troughs, cloud bands sliding the opposite direction, two layers of world gliding past each other",
      "boundless abstraction — horizon dissolved, alternating drifting bands of luminous sand-veil and indigo cloud interleaved across the entire frame at cosmic scale, everything sliding at the pace of deep sleep, hypnotic planetary conveyance with no fixed point",
      "intimate mirror shot — thin sheets of silver water gliding across dark tidal sand, inverted sky carried in each sheet, wet ripples emerging and vanishing, one veil of pale mist drifting across with unhurried near-presence, low weighted composition",
      "macro stillness — a single ripple pattern in wet sand at close range, its crests holding starlight like a signature, one grain still rolling to rest in sharp focus, soft dark past the ridge",
      "cosmic wide — fog banks as seen from far above at night, layered pale veils sliding over black water toward a dissolved horizon, the drift now weather-scale and nearly still, enormous soft negative space",
    ],
  },
  "Self": { // motifs: mirrors, self-similarity, recursion, the whole in the part
    palette: { primary: "#9fd8cb", secondary: "#0d1117", accent: "#e6c99f", glow: "#d8efe9" },
    phases: [
      "DARK BACKGROUND, wide and strange — a mirror lake so still the mountain and its reflection fuse into one symmetric diamond form floating in blackness, the sole deliberate symmetry, one faint teal glow bleeding from beneath the waterline",
      "extreme macro — a living fern frond unfurling against dark glass, each branch sprouting smaller identical branches at every scale, gold backlight on the newest micro-tips, self-similarity in the act of becoming",
      "monumental recursion — a fractal canyon where every wall contains smaller canyons containing smaller ones forever, terraced teal-grey stone descending without end, warm amber light threading every scale simultaneously, vertigo rendered serene",
      "aerial overlay — nautilus spiral, fern coil, and branching river delta ghosted through one another from high above in luminous line-work, the single signature beneath all forms flaring where the curves agree, deep charcoal ground",
      "intimate — a slow ribbon of pale luminous mist crossing the dark lake surface with quiet intention, its reflection moving in perfect unison below, two presences that are one, mountains soft in the far dark",
      "macro finale — one dewdrop on black moss holding the entire mountain-and-lake world curved inside its sphere, a point of gold light alive at its heart, the whole in the smallest part",
    ],
  },
  "Message": { // motifs: bioluminescent pulses, ripple codes, lightning script, expanding rings
    palette: { primary: "#59d4a8", secondary: "#071019", accent: "#f2e75e", glow: "#b9f5dd" },
    phases: [
      "DARK BACKGROUND, macro — a single bioluminescent pulse traveling through shallow black water at close range, plankton igniting in its wake like a spoken word made visible, wet dark stones framing the black water",
      "wide lagoon shot — expanding luminous rings crossing each other in moiré blooms across black water, calls entering from one edge, replies rising from another, yellow-green sparks where wavefronts intersect, the conversation quickening",
      "cosmic storm scale — an entire ocean surface alive with cascading teal fire to the horizon while branching lightning writes brilliant fractal script across the sky, sky-signal and sea-signal locked in call and response, overwhelming synchronous radiance on the storm's diagonal",
      "aerial afterglow — glowing plankton wakes tracing slow spirals across calming water seen from above, each wake a sentence in emerald cursive winding toward the others, generous dark water between the lines",
      "intimate — one gentle pulse of light breathing along a dark shoreline at dusk, a soft luminous current lingering in the shallows with an almost-listening stillness, sand grains glinting at the waterline in near focus",
      "abstract finale — a single luminous ring expanded wider than the frame, only its thinning arc crossing one corner of black water on its way to a horizon it will certainly reach",
    ],
  },
  "Grace": { // motifs: falling ember light, gilded surfaces, soft descent, kept gifts
    palette: { primary: "#f2d59a", secondary: "#171126", accent: "#e88fb0", glow: "#fbeed3" },
    phases: [
      "DARK BACKGROUND, wide — a sky banked edge to edge with soft charcoal clouds over black pine ridges, one slow gold meteor thread descending through a cloud gap, landing softly beyond the ridge without violence, rose afterglow on the cloud edges",
      "macro — a single ember of falling light passing a pine branch at arm's length, needles igniting in rim-gold as it drifts by slower than a falling leaf, bokeh of further falling lights defocused in the dark behind",
      "cosmic abundance — the entire sky filled with descending ember trails so every light above is a moving falling streak, radiance landing on lake and canopy without a single impact, mountains washed in falling shimmer, tender overwhelming generosity at landscape scale",
      "aerial — the gilded valley from above after the fall, every ridge and river edged in settled gold like circuitry of grace, thin mist pooling luminous in the hollows, violet dusk pressing at the frame's edges",
      "intimate spirit-touch — a slow veil of warm light drifting between dark trunks at ground level, pausing as if attending to the moss it gilds, petals of light settling around its passage, near-presence without form",
      "macro finale — one ember of fallen light pulsing softly in deep moss, tiny motes orbiting it like slow gold fireflies, black forest holding its kept gift",
    ],
  },
  "Complete": { // motifs: circles closing, rings of stone and star, orbital mandalas
    palette: { primary: "#c9b3f5", secondary: "#0e0b1e", accent: "#f5c96a", glow: "#e6dcff" },
    phases: [
      "DARK BACKGROUND, wide low shot — an ancient incomplete stone circle on a black plain, the one missing position glowing faint amber, placed low left with immense starless dark above, absence rendered as soft light",
      "macro — tree rings in aged dark wood at extreme close range, one ring glowing as a thin gold thread among the many, grain texture sharp, the circle motif at the scale of years",
      "cosmic convergence — immense rings of standing stone and streaming star-trails locking into one vast orbital mandala, circle within circle from monument to galaxy, gold flooding the closing seams, violet radiance breathing outward, the one deliberate near-symmetry presented oblique so its ellipses stack off-axis",
      "aerial — ripple rings on black water from a single unseen touch, seen from directly above, expanding through reflected starlight until the outermost arc exits the frame, lavender line-work on near-black",
      "intimate — one soft halo of pale light resting in dark air above still ground, breathing slowly, a ring with quiet presence, its faint reflection completing a second circle below",
      "wide finale — one perfect unbroken ring of soft light on dark ground, low right, thin and calm, the night vast and finished above it",
    ],
  },
  "Held": { // motifs: cupped stone, interior glow, warm crystal, enclosure
    palette: { primary: "#e8a87c", secondary: "#140f0d", accent: "#8fd0b6", glow: "#ffdec2" },
    phases: [
      "DARK BACKGROUND, wide exterior — a warm cavern mouth breathing faint amber into blue night from the lower left, mist curling out and rising as it cools, vast cold dark holding the rest of the frame",
      "macro — calcite crystals on a cave wall at close range, each facet holding a grain of warm light, water beading and dropping in sharp focus, the glow coming from somewhere deeper",
      "monumental interior — an immense geode chamber wrapping fully around, honey-amber and rose crystal walls rising into a vaulted dark ceiling, the floor a still pool doubling the radiance, cathedral enclosure in glow, densest brilliance low and left",
      "abstract warmth — no walls visible, suspended inside layered gradients of amber light and soft shadow like being inside an ember, slow convection of glow, one gentle current of paler light circling with careful intention",
      "intimate — a nest of glowing crystals lighting only a few feet of rounded darkness, tiny sparkles in the near walls, the world reduced to a held space the size of rest",
      "macro finale — the pulse of light under the stone's skin at closest range, a slow amber heartbeat in the rock, all edges lost to warm dark",
    ],
  },
  "Sway": { // motifs: kelp pendulums, plankton-glow currents, shared rhythm, G-minor emerald dark
    palette: { primary: "#2e8b74", secondary: "#06110e", accent: "#c4b1e0", glow: "#7fceb4" },
    phases: [
      "DARK BACKGROUND, low underwater wide — emerald kelp columns in dim black-green outline beginning one synchronized lean, dim teal light catching only the frond edges, the seafloor lost, first beat of an enormous rhythm",
      "macro — a single kelp blade arcing through the frame in close focus, micro-bubbles beading its surface, light rocking across it like a slow pendulum, deep green dark behind",
      "cosmic double-world — kelp forests below and vast drifting sheets of plankton-glow riding the underside of a rippling mirror surface above, emerald arcs and violet light-folds trading direction in one immense shared rhythm, the whole water column bound to a single tempo, dense motion left dissolving to open dark right",
      "aerial — ribbons of bioluminescent bloom from high above folding across dark swell, green and violet exchanging places along each fold, the glow stretching and releasing with the water's roll, the pendulum made entirely of light",
      "intimate spirit-touch — one pale ribbon of luminous water weaving slowly between the swaying stalks with unmistakable intention, brushing each column as it passes, formless and gentle in the emerald dark",
      "macro finale — a single frond settling upright in still water, the last arc of its motion remembered in its curve, black-green depth everywhere",
    ],
  },
  "Mystic": { // motifs: sacred geometry etching, log-spirals, crystal temples, recursion
    palette: { primary: "#7a5fd0", secondary: "#0a0918", accent: "#5ee8d8", glow: "#cdbdfa" },
    phases: [
      "DARK BACKGROUND, macro — thin iridescent lines etching themselves into black at close range, an interlocking circle taking shape stroke by stroke as if remembered, seafoam shimmer at the newest intersection, patient dark around",
      "cosmic — a log-spiral nebula unfurling across deep space, crystal temple formations condensing along its arms like dew on a web, the mathematics visible in its grace, void held open at one corner",
      "infinite recursion — a mandala of nebulae and crystal architecture where every layer opens into deeper layers forever, iridescent violet and seafoam and pale gold interleaved at every depth, slow rotation at nested speeds, precision instead of chaos, densest off-center",
      "monumental — one luminous temple of translucent crystal planes floating in star mist, vast angular sheets intersecting at reverent angles, presented from below and off-axis so the geometry stacks asymmetrically into dark",
      "intimate spirit-touch — a slender current of pale aware light moving through the temple's planes, tracing the geometry as if reading it, dimming respectfully at each threshold, presence without form",
      "wide finale — a field of quiet sharp stars where the geometry has dissolved, one incomplete circle of faint iridescence low in the frame leaving room to begin again",
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
