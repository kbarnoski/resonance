// Welcome Home visual rewrite v4 — THE MUSIC-VIDEO DOCTRINE
// (docs/journey-design-spec.md, extended to WH 2026-09-22). Six radically
// different shots per journey across micro↔cosmic registers; motif family
// per track kept from the album's heart (composed at home through
// lockdown). NO humans, NO moons — skies occupied, never negated.
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TAIL = ", completely uninhabited, no text no signatures no watermarks no letters no writing";

// Journey ids from TRAMOKYO_SETLIST (WH block, album order).
const WH = [
  ["27f52cf0-5fad-420f-8324-8017c414f1f8", "Interplay"],
  ["a5b5f0cf-9a6b-451a-8293-3d98f3904342", "Bath"],
  ["79e33115-7f1e-44bc-b950-7adf5055dd55", "Welcome Home"],
  ["00fcca2b-bc1e-461a-8dcd-3fff74587f3e", "The Knife"],
  ["eb79818b-c7e8-45a7-886c-2a432fe83332", "2019"],
  ["5a3beb75-4788-4448-a024-4bfae30040c3", "The Knife (Jam)"],
  ["5a3e5044-9da5-404e-b3d6-c0c4fc757a5b", "Playa"],
  ["08f4c26e-4185-440a-a25c-2440e8e7ae47", "Isolation"],
  ["8997623d-8770-41ce-863d-f359d1a213c4", "Rebound"],
  ["cd517f5a-c4eb-4d50-8a53-044aa668d087", "Stir Crazy"],
  ["38daff92-ae34-4448-8868-5f1df6029b94", "Rolling"],
  ["019e1e1d-c7e2-4609-a9c6-364a2755b115", "Quarantine"],
  ["b207b557-e984-4a06-ae71-83124bcd80d5", "All Together"],
];

const WORLDS = {
  "Interplay": { // motifs: two voices — warm amber + river-blue — braiding, grazing, exchanging
    palette: { primary: "#f0a860", secondary: "#0e1420", accent: "#6fb8d8", glow: "#ffe0b8" },
    phases: [
      "DARK BACKGROUND, extreme macro — two dew threads on a single strand of silk, one catching amber light, one catching blue, sliding slowly toward each other, the space between them charged, everything else black",
      "abstract — two currents of luminous smoke braiding in dark space, amber winding over blue over amber in slow helical turns, pale gold sparks where they graze, loose strands trailing off the diagonal into open dark",
      "cosmic — two vast rivers of stars streaming past one another in black space, one warm-toned and one cool, their edges pulling filaments across the gap, crossings flaring white-gold, counterpoint at galactic scale, weight swept corner to corner",
      "aerial — two real rivers converging in dark terrain at dusk, one running gold with late sun, one blue with sky, their merged current striped with both colors for miles downstream, banks black on either side",
      "intimate — beneath dark water, two currents of glow grazing and parting, sediment sparks lifting where they touch, tenderness in the near-miss, deep tea-dark all around",
      "DARK BACKGROUND, macro finale — two faint glows resting apart, each stained with a trace of the other's color now, the amber cooled slightly blue, the blue warmed slightly gold, changed by the meeting",
    ],
  },
  "Bath": { // motifs: warm water, steam veils, caustic light-nets, wet stone
    palette: { primary: "#f5c98a", secondary: "#141210", accent: "#8fc9c0", glow: "#ffe9c9" },
    phases: [
      "DARK BACKGROUND, macro — one drop of warm water swelling at the lip of dark stone, gold light bent through its belly, a curl of steam crossing behind it, wet mineral glinting at the edge of focus",
      "underwater — looking up at a ceiling of liquid gold rippling overhead, caustic light-nets sweeping across amber depth, columns of silver bubbles rising like chandeliers, complete warm envelopment",
      "monumental — vast natural hot-spring terraces steaming at dusk, tier upon tier of glowing mineral pools descending into dark, gold vapor climbing off every rim, teal shadows pooled between the shelves, cathedral steam",
      "aerial — thermal pools from high above at night, rounds of impossible aquamarine and amber glowing through drifting steam, dark stone lacing between them like lead in stained glass",
      "abstract — inside the steam itself, layered luminous veils folding and drifting, warmth as an atmosphere, jade shadows in the recesses, brightness blooming through the fog off-center",
      "DARK BACKGROUND, macro finale — one last patch of warm light shrinking on still water, a single steam wisp rising through it, fine rings spaced like long breaths, comfort remembered by the water",
    ],
  },
  "Welcome Home": { // motifs: distant window-light, snow, hearth amber, the path home
    palette: { primary: "#ffbe6e", secondary: "#0d1322", accent: "#9db8e8", glow: "#ffd9a0" },
    phases: [
      "DARK BACKGROUND, vast wide — a dark snow-dusted landscape under deep blue night, one small warm window glowing far away low in the frame, a silver thread of chimney smoke above it, enormous cold made bearable by one promise of warmth",
      "extreme macro — frost ferns covering window glass edge to edge, no sky and no space beyond the ice, the crystal architecture melting from the inside out, warm amber light raking low across the frost from one side so every ridge burns gold on its lit edge and deep blue in its shadow, only ice and light",
      "landscape in motion — a winding path of faintly luminous snow weaving between tall dark hedgerows that wall both sides, the sky above filled completely with low heavy snow clouds glowing faint blue, far ahead the one warm window-glow strengthening between the hedges, frost sparkling where the path catches its light, the blue night yielding degree by degree",
      "monumental arrival — doorway-gold flooding outward across snow in a broad delta of warmth, every icicle on the dark eaves ablaze with amber, the cold pushed back to the frame's edges where it hangs respectful and blue",
      "aerial — a snowbound valley from above at night, one homestead's warm light pooling in the white like an ember in ash, its glow tracing the near fences and trees, blue dark holding the rest of the world gently",
      "DARK BACKGROUND, interior finale — honeyed light lying in long panes across worn wooden floorboards, dust motes turning slowly, a hearth's flicker breathing on the walls, night pressed harmless against the glass",
    ],
  },
  "The Knife": { // motifs: obsidian planes, razor light, red glints, clean severance
    palette: { primary: "#d8dde8", secondary: "#0a0a0f", accent: "#e85f7a", glow: "#f0f4ff" },
    phases: [
      "DARK BACKGROUND, minimal — one razor-thin vertical line of white light splitting pure black slightly off-center, edges impossibly sharp, faint cold gleam pooling at its base, tension as geometry",
      "extreme macro — the edge itself, a blade-thin plane of light meeting black glass at closest range, a single rose-red glint burning at the point of contact, molecular precision",
      "monumental — a canyon of sheared obsidian faces, thin sheets of white light standing in every fracture, walls mirror-smooth and towering into dark, crimson edge-light tracing the newest cuts, severance at architectural scale",
      "aerial — a vast field of black glass from above, fractures glowing cold white in branching cuts across the dark surface, one long master fracture running the diagonal with rose light welling in its depth",
      "abstract — obsidian planes suspended mid-split, light flooding through every gap in hard clean sheets, shards' mirror-faces reflecting other cuts recursively, a suspended explosion of separation, densest sweep lower left to upper right",
      "DARK BACKGROUND, macro finale — one thin horizontal seam of light resting low in the frame, soft at its ends, the cut healed into quiet brightness, dark whole again above and below",
    ],
  },
  "2019": { // motifs: golden late-summer memory, fireflies, seed-light, amber horizon
    palette: { primary: "#e8b86a", secondary: "#161310", accent: "#a8c47f", glow: "#ffe6ae" },
    phases: [
      "DARK BACKGROUND, macro — dew beading a spider's orb-web between dark grass stems, each drop holding a miniature amber sky, the golden field soft-focused beyond, a whole era kept in small crystal spheres",
      "landscape — long amber rays raking across rolling meadow from a low unseen sun, grass tips ignited in stripes, drifting seed-fluff glowing as it crosses the beams, green-gold shadows stretching enormous",
      "cosmic — golden hour at the scale of a whole world, meadows and orchards layered ridge upon ridge into honeyed distance, colossal soft cumulus catching peach fire and filling the sky entirely, pollen-light drifting thick and slow through all the air",
      "intimate — dusk thickening between dark grass stems, the first fireflies blinking sparse and confident in the middle dark, one drifting close and near-blinding in its smallness, amber banked along the horizon behind",
      "aerial — orchard ridges from above at last light, rows curving with the land like combed velvet, plum shadow flooding the valleys while the crests keep a rim of honey, the day folding itself away",
      "DARK BACKGROUND, finale — full night over the remembered field, a thin band of deepest amber refusing to leave the horizon's edge, two or three fireflies keeping the year lit, memory banked like coals",
    ],
  },
  "The Knife (Jam)": { // motifs: molten seams, live fracture, copper filigree, improvisation
    palette: { primary: "#e8e2d0", secondary: "#0c0a10", accent: "#ff7a5c", glow: "#fff0dd" },
    phases: [
      "DARK BACKGROUND, macro — a healed seam of light glowing again at closest range, molten orange bleeding into its white, first crackling branches testing outward from the line like opening riffs, the dark leaning in",
      "abstract kinetic — light forking and rejoining in jagged live paths, obsidian splitting along unplanned seams, molten gold welling through new cracks while older cuts cool white, the pattern refusing symmetry, riffing in bursts",
      "cosmic storm — a kaleidoscope of obsidian shards and molten seams tumbling through black space, every fragment mid-turn with light streaming off its edges, cuts spawning cuts in cascades, white heat and ember orange trading lead, the core burning off-center",
      "aerial — a black volcanic plain from high above at night, molten filigree veining the dark crust in branching copper rivers, fresh gold breaking through in pulses along the master seam, improvisation written on a landscape",
      "monumental — the tumble slowed into a vast rotating mobile of dark fragments bound by cooled copper filigree, light standing in the bindings, the wildness revealed as architecture in motion",
      "DARK BACKGROUND, macro finale — scattered shards resting in the low dark, each holding one faint ember line where it was cut, small last sparks traded between the nearest two, the silence after improvisation fuller than the silence before",
    ],
  },
  "Playa": { // motifs: cracked clay mosaic, luminous dust, mirage bands, salt crystals
    palette: { primary: "#e8cba0", secondary: "#141018", accent: "#d87fb0", glow: "#fff2d9" },
    phases: [
      "DARK BACKGROUND, macro — one crack-polygon of pale clay at closest range, curled edges catching pink dusk light, fine salt crystals glittering in the fissures like embedded stars, the flatness soft beyond",
      "ground-level — the crack mosaic raking away into blue-violet distance under thin low light, each seam a fine dark line in bone clay, the pattern dissolving into stacked mirage bands that fill the far air edge to edge",
      "monumental — colossal luminous dust storms walling the entire horizon of the empty flats, the sky a low ceiling of rose-and-violet lit dust pressing down with no clear air above, monumental dust columns wandering the middle distance like slow weather",
      "aerial — the playa from high above at dusk, the crack mosaic a vast pale net across dark ground, a single gold dust-devil's spiral track written across it, glowing haze pooled at the basin's rim",
      "abstract — inside the mirage itself, stacked bands of liquid light and rose haze bending and doubling, the ground's bone glow smeared into slow ribbons, heat memory as pure color",
      "DARK BACKGROUND, finale — the flats at night beneath a sky veiled entirely in thin high dust glowing faint violet, the crack-pattern faintly phosphorescent as if the ground remembered the day, one dust column resting motionless far off",
    ],
  },
  "Isolation": { // motifs: lone island pine, fog sea, one faithful light, gold doorway
    palette: { primary: "#7fa8c9", secondary: "#0a0f16", accent: "#e8d9a8", glow: "#c9dcee" },
    phases: [
      "DARK BACKGROUND, wide — one small rocky island bearing a single wind-bent pine, alone in a sea of night fog filling every direction, lit by a pale cold sheen, placed small in the corner of an enormous empty frame",
      "macro — the pine's needles at closest range, each holding a bead of condensed fog lit faint silver-blue, one needle's drop about to fall into the grey below, endurance in fine detail",
      "cosmic — the fog sea stretched to a curved horizon under an immense dark sky filled with high thin luminous haze, the island a speck of held light in the lower distance, colossal slow fog-swells crossing the frame like the breathing of the world",
      "monumental — a tall narrow vertical curtain of gold light standing open in the fog directly above the island, sharp-edged like a doorway, its luminous walls reaching from fog ceiling to pine crown, hard vertical geometry in a horizontal vastness",
      "aerial — the fog sea from above, long rifts opening in the grey to show black water far below, the island's small light glowing up through its own clear well, other faint islands appearing in distant rifts — never near, but there",
      "DARK BACKGROUND, finale — night clear at last, the island and its pine beneath fine sharp pinpoint stars scattered through high thin haze, its own small light banked steady at the shoreline, alone still but no longer surrounded",
    ],
  },
  "Rebound": { // motifs: ripple rings, interference lace, standing waves, canyon echo
    palette: { primary: "#6dd4c0", secondary: "#0d1214", accent: "#f5b060", glow: "#c9f2e6" },
    phases: [
      "DARK BACKGROUND, extreme macro — a single drop's crown rising off black water at the instant of impact, teal light caught in the thin liquid coronet, droplets suspended above it, the first impulse held mid-instant",
      "surface abstract — reflected rings crossing incoming ones in sharpening interference lace, the water's skin waking into geometry, amber glints kindling where crests collide, the pattern building along the diagonal",
      "monumental — a dark canyon ringing wall to wall with answered energy, waves of light-laced water and luminous pressure-rings leaping stone to stone, spray lifting off collision crests in glowing arcs, teal and gold shockwaves interleaving down the corridor into depth",
      "aerial — the canyon pool from high above, concentric rings and their echoes written across black water as bright interlocking circles, the stone walls' reflections cutting the pattern into crescents, energy mapped from the sky",
      "intimate — standing waves holding their positions mid-pool, stable shining ridges with light standing in place upon them, chaos resolved into resonant structure, one taller crest deliberately off-center",
      "DARK BACKGROUND, macro finale — one last faint ring arriving back at its origin point and closing there, the water holding a slight luminous tremble in memory, the canyon dark and satisfied",
    ],
  },
  "Stir Crazy": { // motifs: leaf-and-ember vortex, stone cylinder, violet static, release
    palette: { primary: "#e89a5c", secondary: "#120e14", accent: "#b06fd8", glow: "#ffd9ad" },
    phases: [
      "DARK BACKGROUND, macro — one dry leaf trembling on dark stone at closest range, ember dust crawling across it, a thread of violet static licking along its curled edge, energy with nowhere to go",
      "interior wide — a high-walled circular hollow of dark stone open only to night sky, small twitching spirals of glowing dust kicking up and collapsing in the corners, faint amber charge in the disturbed air, the walls dominating",
      "monumental — the vortex at furious glory filling the stone cylinder wall to wall, a tower of spiraling ember-and-violet fire-dust roaring upward, leaves flashing gold through the light bands, the column leaning hard off-axis with its crown bursting past the frame",
      "aerial — looking straight down into the spinning eye from above the rim, rings of ember and violet turning at different speeds around a dark calm center, leaves orbiting in lit streaks, the geometry of trapped fury",
      "release — the vortex's crown breaking over the rim and unraveling into open night as long luminous streamers, pressure venting into beauty, ember light escaping upward in ribbons while the column below relaxes its spin",
      "DARK BACKGROUND, finale — the hollow at rest, leaves lying in a perfect spiral signature on the stone floor, three or four motes still circling slowly above it out of habit, energy spent into pattern",
    ],
  },
  "Rolling": { // motifs: hill swells, traveling light bands, wind-combed grass, valley fog
    palette: { primary: "#a8c86f", secondary: "#0e1310", accent: "#f0d080", glow: "#e0f0b8" },
    phases: [
      "DARK BACKGROUND, macro — one grass blade bending under wind at closest range, a bead of dawn light riding its curve, neighboring blades soft behind it all leaning the same way, the great motion present in one small bend",
      "wide — pre-dawn hills as long stacked dark ridgelines rolling to the horizon, each ridge softer blue-green than the last, a pale gold seam of first light lying in the deepest saddle, ground fog pooled in the valleys like slow rivers",
      "landscape in motion — cloud shadows and light bands pouring across the slopes in alternating waves, each hillcrest igniting green-gold as the wave crests it then dimming as shadow follows, grasses streaming in the same rhythm",
      "planetary — an ocean of hills to every horizon with waves of light, shadow, and low cloud traveling the land in grand overlapping swells, valleys flooding with luminous fog then emptying, ridgelines flashing in slow sequence, the largest swell cresting off-center",
      "aerial — cloud shadow archipelagos drifting across the green swells from high above, their dark shapes sliding over crests and pouring down slopes, sunlit islands of meadow opening and closing between them",
      "DARK BACKGROUND, finale — dusk stilling the swells, ridgelines resting in deepening layers of blue-green dark, the last light-wave dissolving on the farthest crest, fog returning to the valleys for the night",
    ],
  },
  "Quarantine": { // motifs: rain-beaded glass, one amber interior reflection, two worlds one pane
    palette: { primary: "#8fb8d8", secondary: "#11131a", accent: "#f0c98a", glow: "#d0e4f2" },
    phases: [
      "DARK BACKGROUND, extreme macro — one raindrop-lens on dark glass at closest range, a whole inverted grey world held miniature inside it, one thread of warm amber reflected at its rim from a light behind the pane",
      "abstract — the beaded curtain, thousands of small trembling lenses across the glass, every bead carrying the cold outside light rippling as gusts press the pane, one steady amber reflection floating unmoved among the blue",
      "monumental — lightning washing the sky beyond the glass, cold silver-blue cascading through the whole bead-field in waves, each droplet flaring in sequence, the enormity outside pressed against the thin clear boundary, spectacular and safe at once",
      "clarity paths — slow single drops cutting long clean trails through the mist on the glass, and through each trail a slice of the outside visible true at last, rain-washed garden leaves glistening and dark branches breathing in the wind, returning color sharing the pane with the steady amber reflection",
      "aerial — rain-lit rooftops from directly above at night, overlapping planes of wet slate and tile each holding beads of the storm's silver, faint steam rising off warm chimneys, one small amber-lit skylight glowing among all the grey, shelter seen as a map of roofs edge to edge",
      "DARK BACKGROUND, finale — the window open at last, the glass standing clear and drop-less, catching one star and the room's small amber light together in the same reflection, inside and outside reconciled",
    ],
  },
  "All Together": { // motifs: scattered lights, luminous tributaries, the confluence river, delta
    palette: { primary: "#f5c26b", secondary: "#101020", accent: "#7fd0c9", glow: "#ffe8bd" },
    phases: [
      "DARK BACKGROUND, vast wide — many small separate lights scattered across a dark watershed, a glint in a high valley, a gleam in a wood, a spark on a far slope, each alone in its own pool of night, thin luminous threads just beginning to leave each one",
      "macro — one confluence at closest range, two thin rivulets of teal and gold light meeting between dark stones, the joining point flaring softly, the merged thread brighter than either was alone",
      "aerial — the network grown dendritic across dark terrain from high above, luminous tributaries bending toward a common valley, every branching lit, the gathering visible as a tree of light lying on the land",
      "monumental — the great confluence, every stream arriving at once into one immense braided river of light between dark banks, gold and teal interleaved, all the small lonely lights present inside the one brightness, the flow entering from many corners and leaving as one",
      "intimate — the river's surface up close in calm glory, currents from different sources visible as gentle internal ribbons of tone all moving at one speed, soft dark sandbars parting the flow without dividing it",
      "DARK BACKGROUND, finale — a still estuary at night holding the sky, all the water there is resting in one dark shining body, small lights along its far edge glowing like the first scattered sparks come home",
    ],
  },
};

for (const [id, name] of WH) {
  const world = WORLDS[name];
  if (!world) { console.log(`!! no world for ${name}`); continue; }
  const { data: row, error: rerr } = await supabase.from("journeys").select("phases, theme").eq("id", id).single();
  if (rerr || !row) { console.log(`✗ ${name}: ${rerr?.message ?? "not found"}`); continue; }
  const phases = row.phases.map((p, i) => ({ ...p, aiPrompt: world.phases[i] + TAIL, palette: world.palette }));
  const theme = { ...(row.theme ?? {}), palette: world.palette };
  const { error } = await supabase.from("journeys").update({ phases, theme, subtitle: "" }).eq("id", id);
  console.log(`${error ? "✗ " + error.message : "✓"} ${name}`);
}
console.log("done");
