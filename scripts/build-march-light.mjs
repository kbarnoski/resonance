// March Light → 10 journeys + path, built COMPLETE in one pass with every
// law learned this week: Snowflake-class hand compositions, one unique
// domain per track, occupied skies (no orbs can spawn), positively
// asserted emptiness (no humans), per-track palettes + shader spread,
// analysis-aligned phase bounds, name-only titles, film grain zero.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const tracks = JSON.parse(readFileSync("scripts/ml-import.json", "utf8"));

const TAIL = ", asymmetric off-center composition with strong diagonal weight, completely uninhabited, no text no signatures no watermarks no letters no writing";

const TEMPLATE = [
  { id: "threshold", shaderOpacity: 0.60, denoisingRange: [0.3, 0.5], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: 0, vignette: 0.35, poetryIntervalSeconds: 10, intensityMultiplier: 0.4, ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.02 },
  { id: "expansion", shaderOpacity: 0.60, denoisingRange: [0.4, 0.65], targetFps: 1, bloomIntensity: 0.3, chromaticAberration: 0.03, colorTemperature: 0.1, vignette: 0.25, poetryIntervalSeconds: 7, intensityMultiplier: 0.7, ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 }, filmGrain: 0, particleDensity: 0.05, halation: 0.04 },
  { id: "transcendence", shaderOpacity: 0.60, denoisingRange: [0.6, 0.85], targetFps: 2, bloomIntensity: 0.7, chromaticAberration: 0.08, colorTemperature: 0.3, vignette: 0.15, poetryIntervalSeconds: 5, intensityMultiplier: 1.0, ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 }, filmGrain: 0, particleDensity: 0.08, halation: 0.08 },
  { id: "illumination", shaderOpacity: 0.60, denoisingRange: [0.4, 0.6], targetFps: 1, bloomIntensity: 0.4, chromaticAberration: 0.04, colorTemperature: 0.1, vignette: 0.3, poetryIntervalSeconds: 8, intensityMultiplier: 0.75, ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 }, filmGrain: 0, particleDensity: 0.04, halation: 0.05 },
  { id: "return", shaderOpacity: 0.60, denoisingRange: [0.25, 0.45], targetFps: 0.5, bloomIntensity: 0.2, chromaticAberration: 0.05, colorTemperature: -0.1, vignette: 0.3, poetryIntervalSeconds: 10, intensityMultiplier: 0.5, ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.03 },
  { id: "integration", shaderOpacity: 0.60, denoisingRange: [0.2, 0.35], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: -0.2, vignette: 0.4, poetryIntervalSeconds: 15, intensityMultiplier: 0.3, ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 }, filmGrain: 0, particleDensity: 0.01, halation: 0.01 },
];

const WORLDS = {
  "The First": {
    palette: { primary: "#bfe8e0", secondary: "#0c1416", accent: "#ffd9a0", glow: "#e8fff8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "shimmer", mood: "dreamy",
    phases: [
      "DARK BACKGROUND — extreme macro of a frozen brook's surface in pre-dawn dimness, one bead of meltwater forming at the tip of an ice blade in the lower right, the droplet holding a spark of first pale gold light, frost crystal architecture receding into blue-black shadow around it, the entire world waiting on one drop, microscopic and monumental",
      "the drop falls — melt threading in bright veins beneath translucent ice, thin water fingers spreading through crystal chambers, the frozen surface developing luminous fractures of pale aqua, trapped bubbles freeing themselves in silver strings, first-light gold seeping into the blue from one edge, the thaw as slow ignition",
      "the brook waking whole — ice sheets parting in slow motion as clear spring water surges through in braided ribbons of aqua and white-gold, shattered crystal panes turning and glinting as they ride the new current, spray droplets hanging lit above the flow, the release of a season in one surge, dense sparkling motion sweeping the lower diagonal against dark thawing banks",
      "clear running water in full morning clarity, sunlight reaching the streambed and lighting every amber pebble, long silk threads of current over stones, last ice fragments dissolving mid-drift into pure transparency, cold made luminous",
      "the stream easing into a still pool ringed by softening frost, surface smoothing to a pale mirror, gold light broadening and quieting on the water, thaw complete and resting",
      "DARK BACKGROUND — dusk returning to the freed brook, water moving quiet and dark now with one thin ribbon of afterlight along its center, the ice gone, the sound implied by soft blur at the stones, first day of flowing ended in peace",
    ],
  },
  "The First (Expanded)": {
    palette: { primary: "#8fd4c9", secondary: "#0a1218", accent: "#ffcf8a", glow: "#d9f7ef" },
    cats: ["Elemental", "3D Worlds", "Cosmic"], ambient: "forest", voice: "fable", mood: "dreamy",
    phases: [
      "DARK BACKGROUND — a whole frozen valley from a high ridge in pre-dawn blue, the river a motionless pale vein winding through dark ice-bound forest below, thin gold beginning to rim the far ridgeline, everything held in vast crystalline stillness — the same first morning, now seen from the mountain",
      "light spilling over the ridge in a slow flood, hillsides of icebound trees kindling one slope at a time, the frozen river vein warming from white to pale aqua along its length as melt begins beneath, streamers of freed mist rising off the waking forest, the valley loosening",
      "the valley in full thaw at world scale — a hundred released streams flashing down every slope in braided silver, the main river bursting its ice in a chain of slow luminous ruptures down its whole winding length, mist columns climbing gold into a sky filled with fast low cloud, the mountain's entire snowmelt singing at once, immense water-light everywhere, weight along the river's diagonal",
      "the flooded river broad and calm in full morning, carrying sheets of thinning ice like glass leaves, meadows emerging green-gold at the banks, the valley's air washed and shining",
      "afternoon settling, streams thinning to threads, the river's surface long and unhurried, low warm light lying across the wet valley in bands",
      "DARK BACKGROUND — the valley at nightfall breathing its first free night, the river dark and moving under a cloud-banded sky, scattered pools on the meadows holding the last pale glow, the expanded world at rest",
    ],
  },
  "Dad's Song II": {
    palette: { primary: "#d8a05f", secondary: "#171009", accent: "#8fb8a0", glow: "#ffe4b0" },
    cats: ["Organic", "Dark"], ambient: "sacred", voice: "ballad", mood: "flowing",
    phases: [
      "DARK BACKGROUND — a shaft of afternoon light entering a dim wooden interior through one small high window, dust motes turning gold in the beam, the light landing on rich old wood-grain whose rings and figure glow amber where touched, everything else warm darkness smelling of years, memory as a lit surface",
      "the wood-grain opening like terrain — the camera inside the grain now, ridges and valleys of honeyed timber flowing in long parallel songs, knots blooming like dark suns ringed in gold, resin veins glinting, the annual rings readable as verses, warm macro immensity",
      "the whole interior singing — beams and rafters of glowing grain arching overhead like the hull of an instrument, light moving through the wooden vault in slow warm waves as if the room itself were being played, brass glints answering from shadowed corners, sawdust motes rising lit like slow sparks, a father's workshop rendered as cathedral, radiance densest along the left arcade",
      "stillness after the swell — one worked surface in close light, plane-marks and hand-smoothed curves catching low gold, the tools' geometry resting in soft shadow beyond, craft as tenderness made visible",
      "the window light lowering, amber deepening to bronze along the grain, the vault's glow banking into the wood as if stored there, dust settling out of the beam",
      "DARK BACKGROUND — the room nearly dark, one seam of grain still faintly luminous like a remembered voice, the high window a dim blue square upper left, the song kept in the wood",
    ],
  },
  "Yellow Bird": {
    palette: { primary: "#ffd94d", secondary: "#101408", accent: "#7fb0d8", glow: "#fff0a8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "nova", mood: "dreamy",
    phases: [
      "DARK BACKGROUND — a dim autumn grove at first light, one single yellow aspen leaf lifting off a dark branch into the air, its gold catching the only brightness in the frame, spiraling upward on an unseen current, the rest of the grove waiting in green-black shadow, one small flight beginning",
      "more leaves answering — dozens of yellow leaves streaming off the aspens in curved rising paths, banking together in loose formation through shafts of morning light, each leaf a wingbeat of gold, the grove exhaling its color upward, motion trails soft in the cool air",
      "a sky filled with the flight of yellow — thousands of aspen leaves wheeling as one immense murmuration of gold above the treeline, the flock-form folding and unfolding against a wind-streaked cloud sky, sunlight strobing through the turning mass, the ground far below carpeted in the few already fallen, joyous airborne enormity, the swirl's heart off-center right",
      "the great flight thinning into clear air, single leaves planing down long glide-paths through backlit haze, each descent unhurried and shining, blue shadow returning between the gold",
      "leaves settling on still water one by one, each landing sending a small gold ring across the dark surface, the flight becoming a floating constellation",
      "DARK BACKGROUND — the grove at dusk, bare branches quiet against deep blue, one last yellow leaf resting lit on black water in the lower left, flight remembered",
    ],
  },
  "Spectre": {
    palette: { primary: "#a8d8e8", secondary: "#0a0d14", accent: "#c9a8f0", glow: "#e0f4ff" },
    cats: ["Dark", "Visionary"], ambient: "abyss", voice: "sage", mood: "mystical",
    phases: [
      "DARK BACKGROUND — a black marsh at night breathing low fog, one pale wisp of cold light drifting between dead reeds in the lower left, its glow silver-blue and slightly iridescent, reflected broken in dark water, the air heavy and listening, a presence made only of light",
      "more wisps kindling across the marsh — slow columns and ribbons of spectral luminance rising off the water at different depths, each one veiled in its own halo of fog, pale violet threading the silver, their light bending the mist into curved chambers, the dark between them deepening",
      "the marsh in full haunting — tall aurora-like curtains of cold iridescent light standing and slowly turning above the black water, their sheets passing through one another leaving brighter seams, fog glowing from within across the whole scene, reeds silhouetted at many depths, the water doubling everything into a second spectral world below, sublime unearthly presence, brightest curtain leaning off-axis left",
      "the light thinning into legible veils, one tall pale sheet remaining with soft edges, its glow steady and almost gentle now, the fog around it hushed silver",
      "the veils sinking back toward the water, iridescence draining to plain moon-less grey-blue, wisps shrinking to sparks among the reeds",
      "DARK BACKGROUND — the marsh dark and still, one last cold spark floating just above its own reflection in the lower right, fading and unfaded at once, the visitation complete",
    ],
  },
  "Surrounded By Light": {
    palette: { primary: "#ffe9b0", secondary: "#12160c", accent: "#a8d88f", glow: "#fff8dd" },
    cats: ["Visionary", "Organic"], ambient: "forest", voice: "fable", mood: "transcendent",
    phases: [
      "DARK BACKGROUND — a dim forest clearing before dawn, mist lying waist-deep between black trunks, one thin ray of early light entering low from the right and touching the mist to gold along a single line, the ring of trees holding the dark, expectancy",
      "rays multiplying around the clearing's circumference — beams entering between the trunks from many directions as the light climbs, each shaft distinct in the mist, the clearing's center brightening where they begin to overlap, the forest becoming a wheel of light with a quiet hub",
      "encircled completely — the clearing ringed by a full corona of converging light shafts pouring in from every gap in the trees, mist blazing gold where the beams cross at center, the canopy above a burning lattice of backlit leaves, standing inside a crown of morning at forest scale, radiant envelopment with the brightest convergence just left of center — the outdoor answer to being surrounded by light",
      "the mist burning off, beams broadening into general warm brilliance, dew on every leaf and web catching separate fire, the clearing floor a field of small lights",
      "the light climbing past the canopy, the ring of shafts releasing one by one, warm green shade returning below with gold retained at the leaf edges",
      "DARK BACKGROUND — evening in the clearing, the ring of trunks now holding a soft violet dusk, one low sideways ray recrossing the mist as a farewell along the lower edge, the circle remembered",
    ],
  },
  "Mexican Boy": {
    palette: { primary: "#f08a4a", secondary: "#1a0d10", accent: "#e84a8f", glow: "#ffd0a0" },
    cats: ["Elemental", "Geometry"], ambient: "desert", voice: "echo", mood: "flowing",
    phases: [
      "DARK BACKGROUND — a terracotta canyon at last light, adobe-toned walls stacked in warm geometric planes, one small courtyard of marigold blossoms glowing orange in the lower shadow like held embers, strings of unlit paper lanterns crossing the space overhead, the warmth of a place that is loved, completely uninhabited and waiting",
      "the lanterns kindling one strand at a time — globes of rose and amber light coming alive along the crossing lines, marigold petals beginning to lift and drift on the evening air, the terracotta planes catching festive color in ascending terraces, the canyon warming into celebration",
      "full radiant fiesta of light and petals — the canyon terraces ablaze with strung lanterns in magenta, orange and gold, marigold petals streaming through the air in luminous rivers between the walls, papel-bright color washing every adobe plane, the geometry dancing with warm light at joyful scale, abundance without a single figure, the brightest cascade pouring down the right terraces",
      "the celebration easing into glow — lantern light steady and low, petals settling into drifts along the terrace edges like orange snow, long warm shadows knitting the planes together",
      "strands dimming strand by strand, the marigold drifts holding their color in the dusk, rose light narrowing to the lowest courtyard",
      "DARK BACKGROUND — the canyon quiet under deep blue night, one lantern left glowing above the marigold courtyard in the lower left, petals still, warmth kept for tomorrow",
    ],
  },
  "Afterglow": {
    palette: { primary: "#f0876a", secondary: "#141019", accent: "#8f9fd8", glow: "#ffc9a8" },
    cats: ["Cosmic", "Elemental"], ambient: "heaven", voice: "shimmer", mood: "transcendent",
    phases: [
      "DARK BACKGROUND — the minutes after sundown over a mountain lake, the light source already gone below the ridgeline, the sky above the ridge banded rose to ember to violet in smooth wide strata that own it entirely, the peaks holding pink alpenglow on their snow, the lake doubling the bands in perfect calm",
      "the afterglow deepening — the ember band intensifying along the ridge while violet presses down from above, thin horizontal cloud blades igniting coral, heat visibly remembered by the rock faces in soft red, the world lit by what has already left",
      "afterglow at full sky-wide glory — the entire heaven a graded fire of rose, salmon and burnt gold layered edge to edge with no source visible anywhere, alpenglow blazing on every summit, the lake a second burning sky below, the air itself holding color like a struck bell holds tone, enormous sourceless radiance, the deepest ember banked hard along the low left horizon",
      "the bands simplifying — a single wide breath of warm rose over gathering blue-grey, the peaks' glow narrowing to their highest snow, clarity in the cooling",
      "violet claiming the strata one by one, the ember shrinking to a thin bright seam on the ridgeline, the lake going pewter with one warm stripe",
      "DARK BACKGROUND — night assembled, the sky deep indigo with the ridge a black cut across the lower frame, one last impossible thread of ember refusing the dark along it, the glow after the glow",
    ],
  },
  "Grasshopper": {
    palette: { primary: "#9fd86a", secondary: "#0a1408", accent: "#e8e05f", glow: "#d0f0a8" },
    cats: ["Organic", "Geometry"], ambient: "forest", voice: "nova", mood: "hypnotic",
    phases: [
      "DARK BACKGROUND — a night meadow at blade-of-grass scale, towering green stems rising like a cathedral of columns into darkness overhead, dew beads strung along every blade holding tiny cold lights, one stem in the lower right bent in a deep tense arc, energy loaded in the curve, the world seen from ankle height of the small",
      "the tension traveling — bent blades releasing in sequence across the meadow, each spring flinging its dew upward in glittering arcs that hang and scatter, stems swaying in the after-spring, chain reactions of small catapults lighting the dark with flung droplets, kinetic whimsy at macro scale",
      "the meadow in full leaping chorus — dozens of dew-arcs launching simultaneously through shafts of green-gold light, droplet trajectories crossing like a fountain-field, grass columns whipping and shimmering, seed heads bursting their motes into the spray, the whole micro-jungle alive with spring-loaded joy, densest arcs vaulting the left half against deep green dark",
      "the flights resolving — droplets descending in slow lit curves back to the blades, each landing a small bright shock that beads and stills, the meadow's geometry gleaming and rearranged",
      "sway subsiding to a breathing rock, dew re-forming quietly along the stems, the columns tall and calm in dim jade light",
      "DARK BACKGROUND — the meadow still, one blade in the lower left again bent under a single heavy lit droplet — tension quietly reloading for another night — everything else soft green-black sleep",
    ],
  },
  "Love Again": {
    palette: { primary: "#e88fa8", secondary: "#130f10", accent: "#8fd0a8", glow: "#ffe0e8" },
    cats: ["Organic", "Visionary"], ambient: "sacred", voice: "ballad", mood: "transcendent",
    phases: [
      "DARK BACKGROUND — a burned forest at night, charred trunks in wet black rows under a cloud-shrouded sky, rain-glisten on the carbon, and low in the frame one impossible point of soft green — a single shoot lit as if from within, standing in the ash, beginning against all of it",
      "the green multiplying — shoots and curled ferns rising through the ash field in scattered constellations, each with its faint inner light, moss spreading emerald films up the ruined bark, the black ground webbing with tender luminous growth, the forest deciding to feel again",
      "blossom on the black branches — the charred canopy erupting in pale pink and white flowers along every scorched limb, petals lit rose against the carbon dark, ferns waist-high and glowing green below, rain beads on the blooms catching light like small vows, the burned cathedral flowering wall to wall, tender overwhelming return, the richest bloom climbing the leaning trunks on the right",
      "morning finding the new forest — soft grey-gold light through the flowering black limbs, petals drifting down onto green, the contrast gentled into one breathing whole",
      "petal-fall thickening as the bloom gives itself to the ground, pink settling over ash, the green deepening confident beneath",
      "DARK BACKGROUND — dusk in the recovered grove, black limbs and full soft foliage sharing the same quiet, one late blossom glowing faintly rose in the low dark like a kept promise — love again",
    ],
  },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function computeBounds(notes, duration) {
  if (!Array.isArray(notes) || notes.length < 40 || !duration) return [0, 0.10, 0.26, 0.48, 0.65, 0.82, 1];
  const BIN = 0.5, n = Math.ceil(duration / BIN), e = new Array(n).fill(0);
  for (const nt of notes) { const i = Math.floor(nt.time / BIN); if (i >= 0 && i < n) e[i] += (nt.velocity ?? 64) / 127; }
  const W = Math.max(2, Math.round(6 / BIN));
  const sm = e.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += e[k]; c++; } return s / c; });
  const max = Math.max(...sm); if (max <= 0) return [0, 0.10, 0.26, 0.48, 0.65, 0.82, 1];
  const norm = sm.map((v) => v / max), frac = (i) => (i * BIN) / duration;
  let tp = 0, best = -1; for (let i = Math.floor(0.15 * n); i < Math.floor(0.88 * n); i++) if (norm[i] > best) { best = norm[i]; tp = i; }
  let a = tp, b = tp; while (a > 0 && norm[a - 1] >= 0.72) a--; while (b < n - 1 && norm[b + 1] >= 0.72) b++;
  let t2 = clamp(frac(a), 0.16, 0.55), t3 = clamp(frac(b + 1), t2 + 0.12, 0.72);
  let r = 0; while (r < n && norm[r] < 0.28) r++;
  let t1 = clamp(frac(r), 0.05, Math.min(0.16, t2 - 0.06));
  let f = b; while (f < n - 1 && norm[f] >= 0.5) f++;
  let t4 = clamp(frac(f), t3 + 0.06, 0.84);
  let t5 = clamp(t4 + (1 - t4) * 0.55, t4 + 0.05, 0.92);
  const bounds = [0, t1, t2, t3, t4, t5, 1];
  for (let i = 1; i < 6; i++) if (bounds[i] < bounds[i - 1] + 0.05) bounds[i] = bounds[i - 1] + 0.05;
  if (bounds[5] > 0.95) bounds[5] = 0.95;
  return bounds.map((x) => Number(x.toFixed(3)));
}

const results = [];
for (const t of tracks) {
  const world = WORLDS[t.title];
  if (!world) { console.log(`!! no world for ${t.title}`); continue; }
  const { data: an } = await supabase.from("analyses").select("notes").eq("recording_id", t.id).single();
  const bounds = computeBounds(an?.notes, t.duration);
  const phases = TEMPLATE.map((tpl, i) => ({
    ...tpl,
    start: bounds[i], end: bounds[i + 1],
    shaderModes: [],
    aiPrompt: world.phases[i] + TAIL,
    aiPromptModifiers: {},
    poetryMood: world.mood,
    guidancePhrases: [],
    voice: world.voice,
    palette: world.palette,
  }));
  const theme = {
    visualVocabulary: { environments: [], entities: [], textures: [], atmospheres: [] },
    shaderCategories: world.cats,
    palette: world.palette,
    voice: world.voice,
    poetryImagery: world.phases[2].slice(0, 120),
    poetryMood: world.mood,
    ambientTheme: world.ambient,
  };
  const row = {
    user_id: USER_ID, recording_id: t.id,
    name: t.title, subtitle: "", description: `"${t.title}" from March Light by Karel Barnoski.`,
    story_text: null, realm_id: "custom", phases, theme,
    share_token: randomUUID().replace(/-/g, "").slice(0, 16),
    creator_name: "Karel Barnoski", audio_reactive: false, is_public: false,
  };
  const { data, error } = await supabase.from("journeys").insert(row).select("id").single();
  console.log(`${error ? "✗ " + error.message : "✓"} ${t.title.padEnd(24)} bounds ${bounds.slice(1, 6).map((b) => b.toFixed(2)).join(" ")}`);
  if (!error) results.push({ order: t.order, journeyId: data.id, recordingId: t.id, title: t.title });
}

const pathToken = randomUUID().replace(/-/g, "").slice(0, 16);
const { data: pathData, error: pathErr } = await supabase.from("journey_paths").insert({
  user_id: USER_ID, name: "March Light", subtitle: "the album as a journey",
  description: "Ten pieces of March Light — from The First's thaw to Love Again's bloom in the burned forest. Walk through the record as an experience.",
  journey_ids: results.sort((a, b) => a.order - b.order).map((r) => r.journeyId),
  share_token: pathToken, accent_color: "#a8d8c9", glow_color: "#e0f4ea",
}).select("id").single();
if (pathErr) { console.error("path failed:", pathErr.message); process.exit(1); }
writeFileSync("scripts/ml-output.json", JSON.stringify({ pathId: pathData.id, pathShareToken: pathToken, journeys: results }, null, 2));
console.log(`\n✓ March Light path: ${pathData.id} · token ${pathToken}`);
