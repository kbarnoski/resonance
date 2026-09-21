// Welcome Home visual rewrite — SNOWFLAKE-CLASS compositions (2026-09-20).
// The WH path journeys were April generator output (~31 words/phase);
// Karel's design spec demands full compositions. One unique domain per
// track, rooted in the album's heart: composed at home through lockdown,
// coming home to a place, a self, a state of being. NO humans, NO moons.
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TAIL = ", no moon no planets no celestial spheres, no people no human figures no silhouettes of people, no text no signatures no watermarks no letters no writing";

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
  "Interplay": {
    palette: { primary: "#f0a860", secondary: "#0e1420", accent: "#6fb8d8", glow: "#ffe0b8" },
    phases: [
      "DARK BACKGROUND — two thin streams of light entering opposite corners of black space, one warm amber from the lower left, one cool river-blue from the upper right, each advancing hesitantly toward the other and pausing, their glow not yet touching, the darkness between them charged, minimal and expectant, extreme corner-weighted asymmetry",
      "the two light-streams meeting mid-frame and beginning to braid, amber winding over blue winding over amber in slow helical turns, sparks of pale gold where the currents graze, each keeping its color while borrowing the other's motion, the braid drifting diagonally upward with loose strands trailing into open dark, dialogue as luminous weaving",
      "the interweaving at full ecstatic complexity — dozens of amber and blue currents braided into a river of counterpoint sweeping the frame corner to corner, crossings flaring white-gold, eddies where one voice circles the other, the pattern dense and songlike yet never tangled, boundless conversational energy, weight along the diagonal with black depth behind",
      "the braid opening into a broad shining delta, the two colors now flowing side by side in wide calm bands, boundaries feathered where they exchange glints, sandbar-like islands of darkness parting the flow, clarity after intricacy, the current heading toward a bright horizon low in the frame",
      "the streams thinning and slowing, unbraiding gently into parallel ribbons that dim as they travel, small last crossings sparking faintly farewell, the black regaining ground between them, tenderness in the separation",
      "DARK BACKGROUND — two faint glows resting at opposite corners once more, each carrying a trace of the other's color now — the amber cooled slightly blue, the blue warmed slightly gold — changed by the meeting, vast quiet dark between",
    ],
  },
  "Bath": {
    palette: { primary: "#f5c98a", secondary: "#141210", accent: "#8fc9c0", glow: "#ffe9c9" },
    phases: [
      "DARK BACKGROUND — a dark tiled space holding still water, one shaft of warm gold light entering steeply from a high unseen opening and landing on the surface at the lower right, steam beginning to climb the beam in slow curls, everything outside the light lost to soft black, wet stone glints at the shaft's edge, intimate hush",
      "steam thickening into luminous layers, the golden shaft diffusing into broad soft volumes that drift and fold, water surface trembling with fine rings where condensation falls, teal shadows pooling in the fog's recesses, warmth becoming an atmosphere rather than a beam, the brightness blooming leftward through the veils",
      "full immersion seen from beneath the surface — a ceiling of liquid gold rippling overhead, caustic light nets sweeping across everything in slow celebration, columns of bubbles rising like silver chandeliers through amber depth, steam-light flaring where the surface breaks, complete envelopment in warmth at dream scale, radiance densest above with deep tea-dark water below",
      "the water stilled to glass, caustics settled into slow-breathing gold lace across pale stone beneath, steam thinned to a shine in the air, every surface rinsed and luminous, clean clarity with jade shadows in the corners, weight low and serene",
      "the light shaft softening toward evening amber, steam curls fewer and slower, rings on the water spaced like long breaths, the tiles dimming from gold to bronze at the edges of the pool of light, warmth banking down for the night",
      "DARK BACKGROUND — the bath at rest in near dark, one last patch of warm light shrinking gently on still water in the lower left, a single steam wisp rising through it, the room's darkness soft as towels, comfort remembered by the water",
    ],
  },
  "Welcome Home": {
    palette: { primary: "#ffbe6e", secondary: "#0d1322", accent: "#9db8e8", glow: "#ffd9a0" },
    phases: [
      "DARK BACKGROUND — a vast dark landscape under deep blue night, one small warm window of light glowing far away in the lower right, a thread of chimney smoke rising silver above it, snow-dusted fields rolling black between here and there, the immense cold made bearable by one distant promise of warmth, enormous negative space",
      "the way home unspooling — a winding path of faintly luminous ground weaving through dark hedgerows and sleeping fields toward the growing window-light, frost sparkling where the path catches the glow, the warm light strengthening from ember to lantern as distance closes, the blue night yielding degree by degree, motion homeward along a soft diagonal",
      "arrival at radiant scale — the home's light no longer a window but a golden atmosphere flooding outward, doorway-glow spilling across snow in a broad delta of warmth, every icicle on the dark eaves ablaze with amber, the cold pushed back to the frame's far edges where it hangs respectful and blue, homecoming rendered as light embracing ground, overwhelming warm welcome",
      "the interior glow at rest — honeyed light lying in long panes across worn wooden floorboards, dust motes turning slowly in the brightness, a hearth's flicker breathing on the walls, the windows now looking out at the tamed blue dark, safety as illumination, warm geometry low and left",
      "the house light banking down, amber deepening to ember-rose in the panes, the night outside softened from cold blue to velvet, the smoke thread slower, warmth settling into the walls for keeping, quiet gratitude",
      "DARK BACKGROUND — the window small again but seen from inside the warmth now, night pressed harmlessly against the glass upper left, one ember pulse of hearth-light in the low dark of the room, home holding, stillness complete",
    ],
  },
  "The Knife": {
    palette: { primary: "#d8dde8", secondary: "#0a0a0f", accent: "#e85f7a", glow: "#f0f4ff" },
    phases: [
      "DARK BACKGROUND — one razor-thin vertical line of white light splitting pure black slightly right of center, its edges impossibly sharp, faint cold gleam pooling narrowly at its base, the darkness on either side pressurized and absolute, tension as geometry, nothing else",
      "the line multiplying — several thin blades of light at slicing angles, each cut revealing a sliver of steel-blue depth behind the black surface, edges catching rose-red glints at their points, shards of dark beginning to separate and slide, precision escalating, composition strung along aggressive diagonals with black mass upper left",
      "the dark shattered wide — obsidian planes suspended mid-split across the whole frame, white light flooding through every fracture in hard clean sheets, edges burning thin crimson, the shards' mirror-faces reflecting other cuts recursively, a frozen explosion of severance at architectural scale, exhilarating and exact, densest fracture sweeping lower left to upper right",
      "the cuts resolved into a still composition of separated planes, each obsidian face now calmly lit along its cut edge, light standing in the gaps like blades at rest, cold clarity, the red glints faded to warm steel, order made from severing, balanced asymmetry",
      "the planes drifting slowly apart and dimming, gaps widening into soft grey light, edges losing their burn, the sharpness relaxing into space, black faces turning away one by one",
      "DARK BACKGROUND — one thin line of light remaining low in the frame, horizontal now and soft at its ends, the cut healed into a seam of quiet brightness, dark whole again above and below",
    ],
  },
  "2019": {
    palette: { primary: "#e8b86a", secondary: "#161310", accent: "#a8c47f", glow: "#ffe6ae" },
    phases: [
      "DARK BACKGROUND — late-summer dusk field remembered through haze, tall dry grass in silhouette across the lower quarter, a deep amber glow banked along the horizon like the day refusing to end, fireflies' first sparse lights blinking in the middle dark, the air thick with golden particulate memory, softness on every edge",
      "the remembered light swelling — long amber rays raking across rolling meadow from a low unseen sun, grass tips ignited in lines that stripe the slopes, drifting seed-fluff glowing as it crosses the beams, green-gold shadows stretching enormous and unhurried, the abundance of an ordinary evening, warm diagonals sweeping right",
      "golden hour at the scale of a whole world — endless meadows and orchards layered ridge upon ridge into honeyed distance, every layer holding its own tone of amber, colossal soft cumulus catching peach fire above, pollen and seed-light thick as slow snow through the whole air, the fullness of the time before, nostalgic radiant maximal, horizon set low with the lit sky vast",
      "the scene clarified into a single perfect detail — dew beading a spider's orb-web strung between dark grass stems, each drop holding the amber sky in miniature, the great glowing field soft-focused beyond, the whole era kept in small crystal spheres, macro tenderness against golden blur",
      "the amber banking down through rose to plum along the horizon, field sounds implied by stillness, the fireflies more confident now in the gathering dark, warmth becoming keepsake, gentle recession",
      "DARK BACKGROUND — full night over the remembered field, a thin band of deepest amber still refusing to leave the horizon's edge lower left, two or three fireflies keeping the year lit, memory banked like coals",
    ],
  },
  "The Knife (Jam)": {
    palette: { primary: "#e8e2d0", secondary: "#0c0a10", accent: "#ff7a5c", glow: "#fff0dd" },
    phases: [
      "DARK BACKGROUND — the healed seam of light from the knife's rest beginning to glow again low in the frame, molten orange bleeding into its white this time, faint crackling branches of light testing outward from the line like the first licks of improvisation, the dark leaning in to listen",
      "the line breaking rank — light forking and rejoining in jagged live paths, obsidian dark splitting along unplanned seams, molten gold welling through the newest cracks while older cuts cool white, the pattern refusing symmetry, riffing across the frame in bursts, energy discovering its own route",
      "full improvisational shatter-flow at maximum — a kaleidoscopic storm of obsidian shards and molten seams tumbling through black space, every fragment mid-turn with light streaming off its edges, cuts spawning cuts in cascades, white heat and ember orange trading lead, controlled chaos dancing at cosmic scale, the storm's core burning off-center left with debris arcing across the whole frame",
      "the wildness finding form — the tumbling shards slowing into a vast slow-rotating mobile, molten seams cooled to glowing copper filigree binding the fragments in mid-air, the improvisation revealed as architecture in motion, luminous balance discovered not designed",
      "the mobile drifting apart with grace, fragments dimming to charcoal, copper light thinning to threads, the last few pieces still trading small sparks as they separate, the jam winding down through quotations of itself",
      "DARK BACKGROUND — stillness with heat in it, scattered shards resting in the low dark, each holding one faint ember line where it was cut, the silence after improvisation fuller than the silence before, weight low and settling",
    ],
  },
  "Playa": {
    palette: { primary: "#e8cba0", secondary: "#141018", accent: "#d87fb0", glow: "#fff2d9" },
    phases: [
      "DARK BACKGROUND — cracked playa floor stretching from the foreground into deep dusk, the mud-polygon mosaic catching a thin low light that rakes across from the right, each crack a fine dark seam in pale clay, the pattern dissolving into blue-violet distance, huge quiet flatness, geometry supplied by drought",
      "heat memory shimmering above the flats — the horizon line dissolving into liquid mirage bands that float fragments of sky between earth and air, the crack-mosaic glowing warm bone and rose as light strengthens, dust-devils of pale gold tracing brief spirals far off, the playa breathing, banded composition low and wide",
      "the flats at full alien majesty — the cracked mosaic sweeping unbroken to a 360-degree horizon rendered edge to edge, mirage layers stacking silver above the hardpan, monumental dust columns luminous rose and gold wandering the middle distance like slow weather, the sky enormous violet fire above the pale infinite floor, desolation as splendor, ground plane vast and low with the burning sky claiming everything else",
      "detail after immensity — one crack-polygon in macro, its curled clay edges catching pink dusk light, fine salt crystals glittering in the fissures like embedded stars, the great flatness soft beyond, the whole desert's logic legible in one tile",
      "the light lying down — cracks filling with cool shadow as the raking sun releases the flats, the mosaic dimming from bone to lavender-grey, the last mirage folding itself away, stillness reclaiming the miles",
      "DARK BACKGROUND — the playa under stars, the crack-pattern faintly phosphorescent as if the ground remembered the day, one distant dust column resting motionless against deep violet night, silence with texture",
    ],
  },
  "Isolation": {
    palette: { primary: "#7fa8c9", secondary: "#0a0f16", accent: "#e8d9a8", glow: "#c9dcee" },
    phases: [
      "DARK BACKGROUND — one small rocky island bearing a single wind-bent pine, alone in a sea of night fog that fills every direction, the island lit by a pale cold sheen from nowhere, fog surface lapping its shore in slow silence, placed small in the lower left of an enormous empty frame, aloneness made visible and dignified",
      "the fog sea deepening and moving — long slow swells of grey-blue vapor rolling past the island at different depths, the pine's silhouette holding still while everything else drifts, occasional soft rifts in the fog revealing black depth below, the island's little light unwavering, solitude weathering the currents",
      "isolation at its most vast — the fog sea stretched to a curved horizon under an immense dark sky, the island now a speck of held light in the lower distance, colossal slow fog-swells crossing the whole frame like the breathing of the world, the single pine still discernible by its faithful gleam, one small brightness refusing the enormity, sublime and aching, negative space nearly total",
      "a rift opening in the fog directly above the island — a column of soft gold light finding it precisely, the pine's needles suddenly warm-edged, the fog walls of the opening glowing pearl, the world acknowledging the one who stayed, tender vertical light in a horizontal grey vastness",
      "the fog thinning everywhere into loose silver scarves, other small islands appearing faintly in the middle distance — never near, but there — the light more general now and kinder, the isolation revealed as one among scattered many",
      "DARK BACKGROUND — night clear at last, the fog gone, the little island and its pine resting under sharp quiet stars, its own light banked low and steady, alone still but no longer surrounded, peace at the edge of the frame",
    ],
  },
  "Rebound": {
    palette: { primary: "#6dd4c0", secondary: "#0d1214", accent: "#f5b060", glow: "#c9f2e6" },
    phases: [
      "DARK BACKGROUND — a dark canyon pool at night, one single drop's ripple-ring expanding across black water from a point low right, the ring's crest catching thin teal light, the canyon walls absorbing all else, the first impulse sent out into the world, minimal concentric motion in stillness",
      "the ripple reaching the far stone and returning — reflected rings crossing the incoming ones in sharpening interference lace, the water's surface waking into geometry, amber glints kindling where crests collide, energy learning it comes back, the pattern building left to right",
      "full rebound at canyon scale — waves of light-laced water and echoing luminous air-pressure rings leaping wall to wall, each return amplified, spray lifting off collision crests in glowing arcs, the whole gorge ringing visibly with answered energy, teal and gold shockwaves interleaving down the corridor of stone into depth, exuberant elastic power everywhere at once",
      "the echoes organized into standing waves — stable shining ridges of water holding their positions mid-pool, light standing in place upon them, the chaos resolved into resonant structure, the canyon and the water agreed on a shape, serene power, symmetry deliberately broken by one taller crest off-center",
      "the standing waves subsiding ring by ring, returns arriving softer and farther apart, the interference lace opening back into simple circles, amber cooling out of the teal, momentum spending itself with grace",
      "DARK BACKGROUND — the pool nearly still, one last faint ring arriving back at its origin point low right and closing there, the water holding a slight luminous tremble in memory, the canyon dark and satisfied",
    ],
  },
  "Stir Crazy": {
    palette: { primary: "#e89a5c", secondary: "#120e14", accent: "#b06fd8", glow: "#ffd9ad" },
    phases: [
      "DARK BACKGROUND — a high-walled circular hollow of dark stone open only to night sky, dry leaves and glowing dust lying restless on its floor, small twitching spirals kicking up and collapsing in the corners, faint amber charge in the disturbed air, contained energy with nowhere to go, walls dominating the frame",
      "the agitation organizing — a single coherent vortex of luminous leaves and ember dust winding up the hollow's center, tightening and accelerating, violet static flickering along its skin, loose debris orbiting in from the edges to join, the walls streaked with the light of circulation, restlessness becoming a engine",
      "the vortex at furious glory filling the stone cylinder wall to wall — a tower of spiraling ember-and-violet fire-dust roaring upward, leaves flashing gold as they whip through the light bands, the enclosure's rim glowing with overflow, the trapped energy magnificent precisely because it is trapped, kinetic saturation, the column leaning hard off-axis with its crown bursting past the upper frame",
      "the spout finding the sky — the vortex's crown breaking over the rim and unraveling into the open night as long luminous streamers, pressure venting into beauty, the column below relaxing its spin, ember light escaping upward in ribbons, release as clarity",
      "the spiral slowing to a wide lazy carousel of drifting sparks, leaves planing gently back toward the floor in long arcs, violet static gone, the hollow's air soft with settling gold",
      "DARK BACKGROUND — the hollow at rest under the open sky it finally touched, leaves lying in a perfect spiral signature on the floor, three or four motes still circling slowly above it out of habit, energy spent into pattern",
    ],
  },
  "Rolling": {
    palette: { primary: "#a8c86f", secondary: "#0e1310", accent: "#f0d080", glow: "#e0f0b8" },
    phases: [
      "DARK BACKGROUND — pre-dawn hills as long stacked silhouettes rolling to the horizon, each ridge a softer blue-green than the one before, a pale gold seam of first light lying in the deepest saddle low right, ground fog pooled in the valleys like slow rivers, the landscape mid-breath, layered horizontals with one warm accent",
      "the rolling awakening — cloud shadows and light bands beginning to pour across the slopes in alternating waves, each hillcrest igniting green-gold as the light wave crests it then dimming as shadow follows, grasses streaming in the same rhythm, the whole terrain moving without moving, undulation as music made land",
      "world-scale rolling — an ocean of hills to every horizon with waves of light, shadow, wind-bent grass and low cloud all traveling the land in grand overlapping swells, valleys flooding with luminous fog then emptying, ridgelines flashing in sequence like a slow keyboard, the planet's surface frankly liquid, majestic perpetual motion, no single center, the largest swell cresting off-right",
      "one hilltop in clarity — wind-combed grass in close detail flowing like fur under warm light, seed heads flickering gold, the great green swells soft in the distance beyond, the vast motion present in each blade's small bend",
      "the waves lengthening and slowing, light bands broadening into steady afternoon amber, cloud shadows fewer and enormous, the hills' breathing deepening toward rest, long soft gradients",
      "DARK BACKGROUND — dusk stilling the swells, ridgelines resting in deepening layers of blue-green dark, the last light-wave dissolving on the farthest crest, fog returning to the valleys for the night, the roll complete",
    ],
  },
  "Quarantine": {
    palette: { primary: "#8fb8d8", secondary: "#11131a", accent: "#f0c98a", glow: "#d0e4f2" },
    phases: [
      "DARK BACKGROUND — rain-streaked window glass filling the frame, the world beyond reduced to smeared blue-grey luminance and the soft running lights of weather, each raindrop trail refracting a thread of the outside, the interior side of the glass in shadow save one warm amber reflection floating faint in the pane's corner, inside looking out",
      "the rain heavying — droplet trails multiplying into a beaded curtain of small lenses, every bead carrying an inverted miniature of the grey world, the outside's cold light rippling as gusts press the glass, the little amber interior reflection holding steady among the blue, two worlds sharing one surface",
      "the pane at cosmic intimacy — the beaded glass becoming a field of thousands of trembling worlds, each droplet-lens flaring as lightning washes the sky beyond, cold silver-blue cascading through the bead-field in waves while the one amber reflection burns quietly unmoved, the enormity outside pressed against the thin clear boundary, spectacular and safe at once, the storm's brightness sweeping diagonally",
      "the rain easing to slow single drops, long clean trails cutting clarity-paths through the mist on the glass, through them the outside visible true for the first time — washed streets of light, breathing trees — the amber reflection now sharing the pane comfortably with the world's returning color",
      "the glass drying in patches, the boundary less certain, outside air implied by the first open clarity at the window's edge, the interior warmth reaching through as a broadening gold cast on the sill, the separation ending gently",
      "DARK BACKGROUND — the window open at last, night air moving the curtain-shadow softly at the frame's edge, the glass standing clear and drop-less catching one star and the room's small amber light together in the same reflection, inside and outside reconciled",
    ],
  },
  "All Together": {
    palette: { primary: "#f5c26b", secondary: "#101020", accent: "#7fd0c9", glow: "#ffe8bd" },
    phases: [
      "DARK BACKGROUND — many small separate lights scattered across a vast dark watershed — a glint in a high valley, a gleam in a wood, a spark on a far slope — each alone in its own pool of night, thin threads of luminous water beginning to leave each one, descending, the gathering not yet visible but begun",
      "the threads finding each other — luminous rivulets of teal and gold merging pair by pair into brighter streams, each confluence flaring softly at the joining point, the network of light growing dendritic across the dark terrain, tributaries bending toward a common valley, union as watershed",
      "the great confluence — every stream arriving at once into one immense braided river of light sweeping through the frame, gold and teal currents interleaved but unseparated now, the joined flow broad and blazing between dark banks, all the small lonely lights present inside the one brightness, the river running toward a glowing sea implied beyond the frame's edge, overwhelming communion, the flow entering from many corners and leaving as one",
      "the river's surface in calm glory — currents from different sources visible as gentle internal ribbons of tone, all moving at one speed, sandbars of soft dark parting and rejoining the flow without dividing it, togetherness with texture, wide serene power",
      "the river broadening into a slow delta at dusk, the light distributing itself generously across many calm channels — separate again in shape yet all one water, rose and amber settling on every branch equally, the giving-back",
      "DARK BACKGROUND — a still estuary at night holding the sky, all the water there is resting in one dark shining body, small lights along its far edge glowing like the first scattered sparks come home, completion as calm plenty, horizon low, the shine unbroken",
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
