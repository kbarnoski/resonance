// SBL visual rewrite v3 — SNOWFLAKE-CLASS compositions (Karel 2026-09-20).
// Each phase prompt is a full composition to the journey design spec:
// declared background, explicit asymmetric placement, scale identity
// (micro ↔ cosmic), palette architecture, motion language, negatives.
// One unique visual domain per track. NO humans, NO moons/planets.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = JSON.parse(readFileSync("scripts/sbl-output.json", "utf8"));

const TAIL = ", asymmetric off-center composition with strong diagonal weight, no text no signatures no watermarks no letters no writing";

const WORLDS = {
  "Rise": {
    palette: { primary: "#ffb347", secondary: "#0b1026", accent: "#7fd8ff", glow: "#ffe9c4" },
    labels: { threshold: "Roots", expansion: "Climb", transcendence: "Break", illumination: "Thin Air", return: "Float", integration: "Summit" },
    phases: [
      "DARK BACKGROUND — cross-section of deep earth filling only the lower right third of frame, glowing amber root filaments threading through black volcanic strata like slow lightning held in stone, each rootlet tip pulsing faint gold, the upper two thirds pure lightless underground void pressing down, microscopic mineral grains catching ember light along the root paths, faint heat shimmer rising off the brightest veins, the first pressure of ascent gathering at the bottom of the world, asymmetric weight low and right",
      "immense vertical cliff strata sweeping up the left edge of frame and out of view, banded rock in rust and charcoal with molten gold veins climbing the seams at different speeds, the right two thirds open black-blue predawn sky, small updraft currents of glowing dust spiraling off ledges and streaming upward, scale ambiguous between canyon wall and planetary crust, cool indigo air against hot mineral gold, everything in the frame pulling upward along diagonals",
      "breaking through a ceiling of clouds rendered from below at colossal scale, the cloud deck torn open in the lower left where columns of aurora light punch through and climb the full height of the frame, curtains of amber and cyan radiance ascending into thin violet-black stratosphere above, ice crystals streaming up the light columns like reverse snowfall, the horizon curved and burning at one edge, boundless vertical euphoria, dense detail lower left dissolving to open sky upper right",
      "extreme altitude clarity — the curved rim of atmosphere a thin luminous band running diagonally across the lower quarter of frame, gradient bands of gold to rose to deep indigo stacked above it with knife-edge precision, sparse noctilucent cloud filaments glowing electric blue drifting in the middle distance, a few ascending ice crystals catching light like slow embers, vast negative space above, the silence after the break, macro crystal detail against planetary scale",
      "slow weightless drift among silver-blue noctilucent veils, wispy cloud structures at many depths sliding gently past one another, the warm amber of the climb thinning to pale champagne light along the lowest veil, upward motion decaying into hover, composition weighted lower left with enormous soft darkness opening above and right, feather-fine filament detail against endless gradient sky",
      "DARK BACKGROUND — the top of the atmosphere at rest, one thin breathing ribbon of aurora low in the frame undulating in slow motion over a sleeping curved horizon, faint stars sharpening in the deep indigo above, the amber of the whole ascent reduced to a single warm memory glowing at the ribbon's brightest fold, monumental stillness, almost nothing against everything, weight low and left",
    ],
  },
  "Surrender": {
    palette: { primary: "#3fa7c4", secondary: "#0a1420", accent: "#e8f4f8", glow: "#9fdce8" },
    labels: { threshold: "Grip", expansion: "Loosen", transcendence: "Release", illumination: "Open Water", return: "Descend", integration: "Seafloor" },
    phases: [
      "DARK BACKGROUND — black storm river churning through a midnight gorge, the whitewater confined to a violent diagonal band across the lower left, spray frozen mid-air catching thin silver light, wet gorge walls rising into darkness on the right two thirds, every droplet in the torrent straining forward, cold steel-blue highlights on black water, the tension of holding on rendered as hydraulics, asymmetric and turbulent",
      "the river widening and slowing seen from just beneath the surface, sediment clouds unfurling in slow galaxies through shafts of teal light entering from the upper right, the current's grip visibly loosening as streamlines separate and soften, bubbles rising in unhurried spirals, underwater dune ripples in the lower third, cool green-blue gradients deepening leftward into unlit water, letting-go as fluid dynamics",
      "the river mouth dissolving into a vast luminous ocean at cosmic scale, freshwater and saltwater interleaving in glowing turquoise and milk-white veils that stretch from the lower right into an infinite open sea filling most of the frame, the boundary between waters flowering into slow fractal blooms, immense fans of light spreading through the depth, total release rendered as two waters becoming one, the last dark thread of river vanishing at the frame edge",
      "open ocean interior lit from above, colossal cathedral shafts of sunlight fanning down through clear blue water from the upper left, suspended motes glittering along each shaft, the beams converging toward a bright sand plain far below in the right depth, gentle caustic nets wavering across everything, scale from dust-mote to abyss in one view, serene enormous clarity",
      "slow deep-water descent through stacked gradients of blue — powder to cerulean to ink — thin horizontal light strata bending softly, a few luminous particles sinking alongside like companions, faint pressure waves crossing diagonally, the warmth of the surface reduced to a pale memory at the top edge, composition nearly empty and profoundly calm",
      "DARK BACKGROUND — abyssal seafloor stillness, one soft column of blue-white light reaching down from the upper right to touch rippled sand in the lower left, perfect undisturbed ripple geometry radiating from the light's landing, sparse motes drifting through the beam, everything else deep lightless water at rest, surrender complete, micro sand-grain detail inside planetary darkness",
    ],
  },
  "Openings": {
    palette: { primary: "#e08a4e", secondary: "#160d18", accent: "#b57edc", glow: "#ffd9ae" },
    labels: { threshold: "Seam", expansion: "Widening", transcendence: "Geode", illumination: "Arches", return: "Mouth", integration: "Plain" },
    phases: [
      "DARK BACKGROUND — narrow slot canyon interior in near darkness, one thin seam of warm light carving down wave-sculpted sandstone from a crack far above, the illuminated ribbon of rock occupying only the right quarter of frame, flowing strata lines in rust and deep violet emerging where the light grazes, fine dust motes drifting through the beam, the rest swallowed in stone shadow, intimate scale, weight hard right",
      "the canyon widening in sweeping curves, ribbons of wave-carved rock glowing ember and amethyst as the seam of sky broadens overhead into a jagged bright river along the top edge, layered sandstone waves rolling diagonally through the frame at many depths, reflected light bouncing warm between the walls, the compression easing with every curve, sculptural macro detail lower left into open glow upper right",
      "a colossal geode cracking open at planetary scale, the split running diagonally from lower left to upper right, dark stone shell peeling back to reveal blazing interior chambers of amethyst and citrine crystal, released light erupting outward in prismatic shafts, crystal spires the size of towers catching violet and gold fire, mineral dust glittering as it escapes the opening into surrounding blackness, boundless interior radiance breaking out, dense crystal detail inside the crack against vast dark shell",
      "a corridor of natural stone arches receding into brilliant open sky, each arch framing the next in a diminishing sequence toward the upper left, warm light pouring through every portal in visible volumetric slabs, banded rock glowing tangerine and mauve at the edges of shadow, the geometry found not built, the frame weighted low and right with the arch-corridor ascending away",
      "the canyon mouth opening onto endless painted desert at dusk, the last canyon walls as dark diagonal wings at the frame edges, beyond them banded mesas glowing ember and violet under a gradient sky stacked rose to indigo, long soft shadows reaching across rippled ground toward the viewer, the release of open distance after enclosure, horizon deliberately low and off-center",
      "DARK BACKGROUND — wide open plain under first stars, the canyon a low dark seam on the far right horizon with one warm glow still breathing deep inside its crack, cool indigo night settling over the rippled desert floor in the foreground, immense open sky taking three quarters of the frame, the opening now behind and within, quiet vastness",
    ],
  },
  "Surrounded By Light": {
    palette: { primary: "#fff2cc", secondary: "#141021", accent: "#ff9de2", glow: "#ffffff" },
    labels: { threshold: "First Beam", expansion: "Assembly", transcendence: "Immersion", illumination: "White", return: "Peel", integration: "Thread" },
    phases: [
      "DARK BACKGROUND — absolute darkness pierced by one thin prismatic beam entering from the upper left corner, the beam splitting mid-frame into faint parallel spectral bands that fade before reaching the lower right, microscopic dust igniting rainbow sparks only inside the light's path, the geometry razor sharp against the void, one gesture of light in an ocean of black, extreme asymmetry",
      "walls of pure refracted light assembling in space — vertical and diagonal planes of spectral color materializing at different depths like architecture being born, rainbow caustic nets multiplying across invisible surfaces, each new plane igniting the next, the structure growing from the lower right toward open darkness upper left, chromatic edges razor thin, light building a place to stand",
      "total immersion inside a prism at boundless scale — infinite spectral halls receding in every direction, corridors of refracted rainbow bending through one another, floors and ceilings of liquid color exchanging places, blinding white cores blooming where beams intersect, chromatic aberration fringing every edge, the geometry vast yet crystalline in detail, euphoric saturation with no center, no horizon, only light inhabiting light",
      "the spectra settling into wide calm bands of warm white radiance stacked diagonally, soft lens blooms drifting through like weather, faint residual color ghosting at the band edges — a breath of rose, a whisper of cyan, brightness so complete it becomes gentle, near-white minimalism with enormous luminous depth, weight upper left dissolving right",
      "the light thinning to golden haze, single colors peeling away one by one and drifting off the frame like silk scarves — a violet ribbon exiting lower left, a green shimmer dissolving upper right, the remaining glow softening toward amber dusk, darkness respectfully returning at the corners, the disassembly as beautiful as the build",
      "DARK BACKGROUND — restored darkness holding one last prismatic thread across the lower third, thin as wire, every color of the journey still alive inside its length, faint bloom where it bends, black velvet everywhere else, the entire immersion remembered in a single line of light",
    ],
  },
  "Drift": {
    palette: { primary: "#d9c7a0", secondary: "#101624", accent: "#8fb8c9", glow: "#f0e6cf" },
    labels: { threshold: "First Wind", expansion: "Sand Rivers", transcendence: "Open Sea", illumination: "Mirror Tide", return: "Fog", integration: "Last Ripple" },
    phases: [
      "DARK BACKGROUND — moonless night desert, long dune crests as pale diagonal blades across the lower half, fine sand just beginning to slide sideways off the ridgelines in thin luminous streams caught by starlight, each grain-stream a soft horizontal comet, deep blue-black sky filling the top, the first breath of lateral motion in a sleeping landscape, quiet asymmetric sweep to the right",
      "dune fields flowing like slow ocean swells, whole ridgelines migrating rightward in visible sheets of streaming sand, pale gold grain-rivers braiding between shadowed troughs, low cloud bands sliding the opposite direction above in silver-blue, two layers of the world gliding past each other, dense flowing texture lower left against open drifting sky",
      "a boundless sea of dunes and low cloud sheets in silent endless lateral motion, horizon dissolved so sand and sky interleave in alternating drifting bands across the whole frame, streaming grain-veils glowing champagne against deep indigo shadows, the entire visible world sliding at the pace of deep sleep, hypnotic planetary conveyance without destination, no fixed point anywhere, glorious weightless enormity",
      "tidal flats at night mirroring the sky perfectly, thin sheets of silver water gliding across dark sand in overlapping gleaming layers from the right, each sheet carrying inverted starlight, wet sand ribs emerging and vanishing as the water breathes sideways, the world doubled and both halves drifting, luminous minimalism weighted low",
      "slow fog banks drifting over black still water, layered veils of pale mist sliding at slightly different speeds through the middle of the frame, the nearest wisps in soft focus, water surface visible only as faint long reflections beneath, everything horizontal, everything gentle, the drift decaying toward stillness",
      "DARK BACKGROUND — wind gone, one last ripple pattern frozen mid-slide across dark sand in the lower left, its crests holding faint starlight like a signature, vast still night above and right, motion remembered by the shape it left behind",
    ],
  },
  "Self": {
    palette: { primary: "#9fd8cb", secondary: "#0d1117", accent: "#e6c99f", glow: "#d8efe9" },
    labels: { threshold: "Mirror", expansion: "Frost Fern", transcendence: "Recursion", illumination: "Signature", return: "Breath", integration: "Dewdrop" },
    phases: [
      "DARK BACKGROUND — perfectly still mountain lake at night, the dark ridge line and its reflection meeting so exactly that the horizon disappears, the mirrored world occupying a diagonal band through the frame with deep starless black above and below, one faint teal glow bleeding up from beneath the water at the far left, symmetry so complete it becomes strange, vast quiet, no figures anywhere",
      "frost ferns growing across dark glass in extreme macro, each crystalline branch sprouting smaller identical branches which sprout smaller ones again, pale seafoam and silver arms reaching diagonally from the lower right corner across two thirds of black frame, gold backlight catching the newest micro-branches at the growing tips, self-similarity in the act of becoming, the rest open darkness",
      "an infinite fractal canyon where every rock wall contains smaller canyons which contain smaller ones forever, terraced self-similar formations in teal-grey stone descending and receding without end, warm amber light threading the deepest folds at every scale simultaneously, vertigo of recursion rendered serene, the pattern dense in the lower left and dissolving into misted depth upper right, boundless interior geography",
      "nature repeating one signature across overlaid scales — a nautilus spiral, an unfurling fern coil, a branching river delta seen from far above — the three forms ghosted through one another in luminous seafoam and sand-gold line-work against deep charcoal, each alignment flaring softly where the curves agree, the single shape beneath all shapes made visible, weight low and left",
      "the mirror lake again from higher and farther, mountains and their reflection breathing as one dark diamond form in the lower right of a vast dusk gradient, thin mist erasing the seam between world and image, teal afterglow along one shore only, the doubled self at peace with its doubling, enormous open sky",
      "DARK BACKGROUND — extreme macro of a single dewdrop resting on dark moss, the entire mountain-and-lake landscape curved inside its sphere in miniature, one point of gold light alive inside the drop, moss filaments in soft silhouette around it, the whole in the smallest part, weight lower left, everything else soft darkness",
    ],
  },
  "Message": {
    palette: { primary: "#59d4a8", secondary: "#071019", accent: "#f2e75e", glow: "#b9f5dd" },
    labels: { threshold: "Pulse", expansion: "Reply", transcendence: "Broadcast", illumination: "Wake", return: "Steady", integration: "Ring" },
    phases: [
      "DARK BACKGROUND — pitch-black tide pools at night, one faint bioluminescent pulse traveling through the shallow water like a spoken word made of light, its blue-green wake tracing the pool's edge in the lower right corner, wet rock silhouettes framing darkness everywhere else, a single sentence of light in a silent world, extreme quiet asymmetry",
      "waves of blue-green bioluminescence answering each other across a black lagoon, expanding luminous rings intersecting mid-water in moiré blooms, each crest igniting plankton fire along its curve, the calls entering from the left edge and the replies rising from the lower right, yellow-green sparks where wavefronts cross, the conversation quickening, dark water carrying every word",
      "the entire ocean surface alive with cascading luminous pulses at storm scale, rivers of teal fire branching across black swells to the horizon, sheet lightning writing brilliant fractal script across the sky above and the water answering every stroke in phosphorescence, sky-signal and sea-signal locked in call and response, overwhelming synchranous radiance, the frame full yet weighted upper left to lower right along the brightest exchange",
      "the storm passed, glowing plankton wakes tracing slow long spirals across calming water, the sky flickering soft distant replies below the far clouds, each wake a sentence winding toward the others in emerald cursive, gentle yellow-white gleams at the spiral hearts, meaning settling into afterglow, generous dark water between the lines",
      "signals settling into one steady gentle pulse, the tide breathing light in and out along a dark shore in the lower third, each exhale a dim green luminescence sinking back into sand, the sky quiet, the conversation complete but not ended, minimal and warm",
      "DARK BACKGROUND — one final luminous ring expanding outward on black water, its circle already wider than the frame so only the arc crosses the lower left corner, thinning as it travels toward a horizon it will certainly reach, everything else still black ocean and night, the message sent",
    ],
  },
  "Grace": {
    palette: { primary: "#f2d59a", secondary: "#171126", accent: "#e88fb0", glow: "#fbeed3" },
    labels: { threshold: "First Fall", expansion: "Shower", transcendence: "Abundance", illumination: "Gilded", return: "Petals", integration: "Ember" },
    phases: [
      "DARK BACKGROUND — a sky banked with soft charcoal clouds over silhouetted pine ridges, one slow meteor drawing a silent gold thread down through a gap in the cloud at the upper right, its light landing softly beyond the ridge without violence, faint rose afterglow along the cloud edges where it passed, the forest holding its breath in the lower dark third, a single act of giving",
      "the meteor shower thickening but falling gently — dozens of gold embers descending like weightless snow over dark pine slopes, each trail curved and unhurried, warm light beginning to pool in the valley mist between ridges, rose and champagne streaks layered at different depths, the sky giving more with every second, diagonal fall from upper left, receiving forest low and right",
      "sky-wide soft golden fall at full abundance, light landing on lake water and forest canopy without a single impact, every surface receiving radiance like slow rain — the lake scattering it into rings of gilt, the canopy holding it in glowing crowns, mountains at the frame edge washed in falling shimmer, tender overwhelming generosity at landscape scale, the densest fall sweeping the left half while the right opens to deep violet night",
      "after the fall — every leaf edge, stone rim and ripple crest outlined in settled gold, the air still shimmering with the last slow descent, close macro foreground of gilded fern and bark against a valley of soft embered light, rose dusk gradient above, the world wearing what it was given, weight low with luminous detail",
      "the last few light-petals drifting down through violet dusk between dark tree trunks, each petal a soft gold flake turning as it falls, thin mist catching faint pink at knee height, the forest floor beginning to dim, four or five falling lights and no more, spare and tender, weight center-left",
      "DARK BACKGROUND — the forest holding its gilded quiet, one ember of fallen light pulsing softly in deep moss at the lower right, its glow breathing against black trunks, tiny motes orbiting it like slow fireflies of gold dust, the night complete around one kept gift",
    ],
  },
  "Complete": {
    palette: { primary: "#c9b3f5", secondary: "#0e0b1e", accent: "#f5c96a", glow: "#e6dcff" },
    labels: { threshold: "Gap", expansion: "Alignment", transcendence: "Mandala", illumination: "Rotation", return: "Halo", integration: "Ring" },
    phases: [
      "DARK BACKGROUND — a single incomplete stone circle on a vast dark plain, ancient weathered monoliths in deep violet shadow, the one missing position glowing faintly amber where its stone should stand, the circle placed low left with immense starless night above, absence rendered as soft light, patient and unresolved",
      "concentric ripples on black water, tree rings in aged wood, and pale orbital paths in dark sky overlaid as translucent layers, each ring system slowly rotating toward alignment with the others, moments of resonance flaring gold where circles briefly agree, lavender line-work on near-black, the geometry gathering purpose, weight upper right with drift toward center",
      "immense rings of standing stone and streaming star-trails locking into one vast orbital mandala, circle inside circle from monument scale to galactic scale, every ring closing simultaneously in a single slow click of cosmic machinery, gold light flooding the completed seams, violet radiance breathing outward through the pattern, geometric wholeness at maximum, the mandala centered high with its lowest arc sweeping off-frame, dense sacred detail against deep space",
      "the completed mandala in serene rotation, rings of amber and violet light turning at nested speeds like a transparent orrery, soft glints traveling the circumferences, fine dust illuminated inside the mechanism, calm majesty, the structure seen at an oblique angle so its ellipses stack asymmetrically toward the left",
      "the circles loosening into soft halos, rotation slowing like a settling gyroscope, ring edges feathering into lavender mist, gold dimming to warm gray, each halo drifting slightly apart from its neighbors as the tension releases, gentle unwinding in generous darkness",
      "DARK BACKGROUND — one perfect unbroken ring of soft light resting on dark still ground, thin and calm, faint reflection beneath it, the missing stone no longer missing anywhere, placed low right with the night vast and finished above",
    ],
  },
  "Held": {
    palette: { primary: "#e8a87c", secondary: "#140f0d", accent: "#8fd0b6", glow: "#ffdec2" },
    labels: { threshold: "Mouth", expansion: "Descent", transcendence: "Chamber", illumination: "Spring", return: "Hollow", integration: "Heartbeat" },
    phases: [
      "DARK BACKGROUND — the mouth of a warm cavern breathing faint amber light into blue night, rough stone lips framing a soft interior glow at the lower left, mist curling out and rising as it cools into the dark, the invitation of shelter rendered as light held inside rock, vast cold night filling the rest of the frame",
      "descending into vast glowing caverns, mineral walls curving inward like cupped hands of stone, strata of warm ochre and deep umber sweeping in protective arcs overhead, veins of soft gold light following the folds, columns and curtains of flowstone half-lit at many depths, the passage turning gently rightward and down, enclosure growing not as confinement but as embrace",
      "an immense geode chamber wrapping fully around the viewpoint, warm crystal light on every side — walls of honey-amber and rose crystal rising into a vaulted dark ceiling where the tallest spires fade into shadow, the floor a still pool doubling the radiance, completely surrounded by glow at cathedral scale, safe boundless interior, densest brilliance low and left with the vault soaring dark above",
      "an underground hot spring steaming gently, teal-clear water cradled in gold-lit stone bowls terraced down the frame's right side, wisps of steam drifting through beams that enter from an unseen opening above, wet mineral rims glittering, the meeting of warm stone and cool water in complete privacy, soft macro textures everywhere the light lands",
      "the cavern narrowing to an intimate hollow, one nest of glowing crystals close enough to warm the air around it, their light reaching only a few feet into rounded darkness, tiny calcite sparkles in the near walls, everything beyond the small radius soft black stone, the world reduced to a held space the size of rest",
      "DARK BACKGROUND — the smallest chamber, embers of light in the rock walls dimming to a heartbeat glow, a slow pulse of faint amber under the stone's skin at the lower right, all edges lost to warm darkness, being held rendered as light almost asleep",
    ],
  },
  "Sway": {
    palette: { primary: "#2e8b74", secondary: "#06110e", accent: "#c4b1e0", glow: "#7fceb4" },
    labels: { threshold: "Lean", expansion: "Pendulum", transcendence: "One Rhythm", illumination: "Curtains", return: "Slowing", integration: "Upright" },
    phases: [
      "DARK BACKGROUND — deep emerald kelp forest in near darkness, tall fronds as black-green silhouettes beginning one synchronized lean to the right, the only light a dim teal glow filtering from far above and catching frond edges in thin lines, the seafloor lost in dark, the first beat of an enormous slow rhythm, weight left with the lean opening rightward",
      "kelp columns swaying in a long underwater wind, teal light rocking between the fronds like a slow pendulum, shafts sweeping left then right across the forest and dragging luminous plankton with them, the canopy far overhead flexing as one, deep minor-key green-on-black with violet glints where the light turns, hypnotic period visible in every stalk",
      "entire forests of kelp below and aurora curtains above the surface swaying in one immense shared rhythm, the water's ceiling rendered as a rippling mirror between the two — emerald fronds arcing right as violet-green sky curtains arc left, then trading, the whole frame breathing at a single tempo, boundless oscillation binding sea and sky, dense motion left dissolving toward open dark right",
      "aurora ribbons folding and unfolding in slow arcs over dark water, green and violet trading places along each fold, the reflections stretching and snapping softly with the swell, thin cloud strands riding the same rhythm, the pendulum now made entirely of light, upper half generous with motion while the sea below keeps black time",
      "the sway lengthening, underwater meadows of seagrass bending in slower and slower waves, each pass shallower than the last, the teal glow dimming toward jade dusk, particles settling out of the water column, the rhythm subsiding without ever quite stopping, sparse and tender",
      "DARK BACKGROUND — one last kelp frond settling upright in still emerald water at the lower right, micro-bubbles beading its blade, the memory of every arc present in its final stillness, black-green depth everywhere else, motion completed into poise",
    ],
  },
  "Mystic": {
    palette: { primary: "#7a5fd0", secondary: "#0a0918", accent: "#5ee8d8", glow: "#cdbdfa" },
    labels: { threshold: "Etching", expansion: "Unfurling", transcendence: "Infinite", illumination: "Temple", return: "Currents", integration: "Quiet Stars" },
    phases: [
      "DARK BACKGROUND — deep indigo void where faint sacred geometry is etching itself into existence — thin iridescent lines drawing interlocking circles and golden-ratio spirals in the lower left, each line appearing stroke by stroke as if remembered rather than made, the construction barely brighter than the dark, seafoam shimmer at the newest intersections, the rest of the frame patient black-violet space",
      "a log-spiral nebula unfurling across the frame from the upper right, its arms drawn in luminous violet dust with crystal temple formations condensing along their curves like dew on a web, each embryonic structure refracting teal at its edges, the spiral's mathematics visible in its grace, star mist thickening where the arms wind tightest, dark void held open at the lower left",
      "an infinite recursive mandala of nebulae and crystal architecture, every layer opening into deeper layers forever — spiral arms containing temples containing spirals containing temples without end, iridescent violet, seafoam and pale gold interleaved at every depth, slow rotation at nested speeds, visionary boundlessness rendered precise rather than chaotic, the recursion densest off-center right with the leftward depths falling away into ever-finer light",
      "the geometry resolved into one luminous temple of translucent crystal planes floating in star mist, vast angular sheets of glass-light intersecting at reverent angles, interior glow of soft lavender breathing through the faces, thin walkway-like edges catching teal, the structure enormous yet weightless, presented off-axis from below so its planes stack asymmetrically into the dark above",
      "the temple dissolving back into slow spiral currents of indigo and seafoam light, planes thinning to veils, veils to threads, threads winding into the same golden-ratio curves that began everything, particles streaming gently along the spiral paths toward the frame's edge, sacred architecture returning to pure motion",
      "DARK BACKGROUND — the original thin iridescent lines fading into a field of quiet sharp stars, one last incomplete circle glowing faintly at the lower left as if leaving room to begin again, deep indigo silence, the geometry complete and gone",
    ],
  },
};

for (const j of out.journeys) {
  const world = WORLDS[j.cleanTitle];
  if (!world) { console.log(`!! no world for ${j.cleanTitle}`); continue; }
  const { data: row } = await supabase.from("journeys").select("phases, theme").eq("id", j.journeyId).single();
  const phases = row.phases.map((p, i) => ({ ...p, aiPrompt: world.phases[i] + TAIL, palette: world.palette }));
  const theme = { ...row.theme, palette: world.palette };
  const patch = { phases, theme };
  const { error } = await supabase.from("journeys").update(patch).eq("id", j.journeyId);
  console.log(`${error ? "✗ " + error.message : "✓"} ${j.cleanTitle} (${world.phases.reduce((a, p) => a + p.split(" ").length, 0 / 6) / 6 | 0} avg words)`);
}
console.log("done");
