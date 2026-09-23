// March Light visual rewrite v2 — THE MUSIC-VIDEO DOCTRINE (Karel
// 2026-09-21, docs/journey-design-spec.md). Six radically different
// shots per journey across micro↔cosmic registers; spirit-energy
// light-forms in 1-2 phases; Mexican Boy freed from the endless-candles
// monotony into a full color-and-geometry arc.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = JSON.parse(readFileSync("scripts/ml-output.json", "utf8"));

const TAIL = ", completely uninhabited, no text no signatures no watermarks no letters no writing";

const WORLDS = {
  "The First": { // F Major, 109s, dense low-register warmth (d29.8, reg 52) — the first light waking INSIDE the earth: seed, roots, amber veins in dark loam
    phases: [
      "DARK BACKGROUND, extreme macro — a seed casing splitting open in dark loam at closest range, one vein of warm amber light waking along the crack, soil grains glinting where the glow touches them, everything else deep brown-black",
      "abstract interior — inside the dark earth, a lattice of fine roots beginning to carry light, warm amber threading root to root in slow pulses, the network waking one junction at a time against soft black depth",
      "monumental — a cavern of ancient roots at cathedral scale, every column and arch of living wood seamed with running amber light, motes of gold drifting up through the warm dark, the underground dawn at full glow",
      "aerial — a dark forest floor from above at first light, seams of warm gold opening along the ground between the trunks like slow lightning made of dawn, low mist catching the color as it rises",
      "intimate — one pale green shoot breaking the surface into low amber light, soil falling away from its curve, the first arrival lit from the side against deep dark",
      "DARK BACKGROUND, macro finale — the young shoot at dusk holding one drop of amber light at its tip like a lantern carried up from below, vast quiet dark around",
    ],
  },
  "The First (Expanded)": { // same F Major material even denser (d39) — the same underground dawn at forest and valley magnitude
    phases: [
      "DARK BACKGROUND, wide — a dark valley of sleeping trees before first light, one faint seam of warm amber glowing along the lowest fold of the land, the same dawn about to happen everywhere at once",
      "macro — tree bark at closest range as the light arrives inside it, the grain's ridges filling with warm gold like channels flooding, one resin bead igniting amber on the dark surface",
      "monumental — the whole forest waking at once, every trunk seamed with climbing amber light, the canopy catching fire-gold from beneath, waves of warm luminance rolling trunk to trunk through the dark wood",
      "abstract — inside the rising warmth, layered veils of gold air climbing through darkness, motes streaming upward in slow rivers, the color deepening from ember to full morning amber with the climb",
      "aerial — the lit valley from above, rivers of warm gold branching through the dark canopy along every fold of the land, morning claiming the terrain vein by vein",
      "DARK BACKGROUND, finale — the valley at rest in full soft morning, low warm light lying in the folds, one seam of deeper amber still glowing along the first fold that woke",
    ],
  },
  "Dad's Song II": { // motifs: wood grain, window light, resin glow, kept song
    phases: [
      "DARK BACKGROUND, wide interior — a shaft of afternoon light through one high window in a dim wooden room, dust motes turning gold in the beam, the light landing on old grain that glows amber where touched, everything else warm dark",
      "extreme macro — inside the wood grain itself, ridges and valleys of honeyed timber flowing like canyon terrain, a knot blooming as a dark sun ringed in gold, resin veins glinting, years readable as verses",
      "monumental — the interior become instrument, beams and rafters of glowing grain arching like the hull of a great cello, light moving through the wooden vault in slow warm waves as if the room were being played, sawdust rising lit like slow sparks",
      "intimate spirit-touch — the dust in the window beam gathering briefly into a warmer drift of light that leans over a worked surface, attentive and formless, then loosening back into motes, the plane-marks below shining where it paused",
      "aerial abstraction — wood grain from impossibly far above, the pattern continental now, rivers of dark grain winding through golden timber lands, one bright knot like a warm city in the grain",
      "macro finale — a single seam of grain still faintly luminous in the near dark, like a voice remembered by the wood, the high window a dim blue square far behind",
    ],
  },
  "Yellow Bird": { // motifs: yellow leaves in flight, murmuration forms, gold on dark water
    phases: [
      "DARK BACKGROUND, macro — one yellow aspen leaf lifting off a dark branch at close range, its gold catching the only light, stem releasing in sharp focus, the grove waiting soft and dark behind",
      "medium flight shot — dozens of leaves streaming through shafts of morning light in curved rising paths, banking together in loose formation, each leaf a wingbeat of gold, motion trails soft in cool air",
      "cosmic murmuration — thousands of yellow leaves wheeling as one immense folding form above the treeline, the flock-shape opening and closing against a wind-streaked cloud sky, sunlight strobing through the turning mass, joyous airborne enormity off-center right",
      "aerial — the gold flight from above, the leaf-cloud casting a moving dappled shadow across dark forest canopy below, its shape writing slow cursive over the land",
      "intimate — single leaves planing down long glide-paths through backlit haze, one drifting current of pale light descending alongside them with gentle deliberateness, escorting the landing",
      "macro finale — one yellow leaf resting lit on black still water, its gold ring of ripples fading, bare branches soft in the upper dark",
    ],
  },
  "Spectre": { // motifs: cold iridescent wisps, fog chambers, standing light curtains
    phases: [
      "DARK BACKGROUND, macro — one pale wisp of cold light at close range drifting between dead reeds, its silver-blue slightly iridescent, doubled broken in black water below, the air listening",
      "wide marsh shot — slow columns of spectral luminance rising off the water at many depths, each veiled in its own fog halo, pale violet threading the silver, the dark between them deepening",
      "monumental haunting — tall curtains of pale iridescent light standing and slowly turning above black water, sheets passing through one another leaving brighter seams, the marsh doubling everything into a second world below, brightest curtain leaning off-axis",
      "abstract interior — inside the fog itself, a luminous chamber of pearl-grey light with no edges, one presence of paler light moving through with unhurried awareness, brightening as it nears and dimming as it passes, formless as breath",
      "aerial — the marsh from high above at night, wisps as scattered cold sparks across a black labyrinth of channels, one long curtain of pale light lying across the water like a fallen luminous ribbon",
      "macro finale — a single cold spark hovering just above its own reflection, fading and unfaded at once, reeds soft in the near dark, the visitation complete",
    ],
  },
  "Surrounded By Light": { // motifs: converging beams, forest corona, dew fire — ML's outdoor answer
    phases: [
      "DARK BACKGROUND, intimate — waist-deep mist between black trunks before dawn, one thin early ray entering low and touching the mist to gold along a single line, expectancy in a dark ring of trees",
      "extreme macro — a dew drop on a web strand as the light arrives, the whole misted clearing curved inside it upside down, the strand igniting as a thread of white fire, soft dark bokeh beyond",
      "monumental corona — the clearing ringed by a full crown of converging light shafts pouring in from every gap in the trees, mist blazing where beams cross at the hub, the canopy a burning lattice above, radiant envelopment off-center",
      "aerial — the forest from high above with the clearing as a blazing ring of crossed light in the dark canopy, mist rivers glowing along the low ground between the trees, morning claiming the woods outward from one bright wheel",
      "abstract spirit-touch — inside the convergence, columns of gold crossing a bright void, a slow warm current of light circling the hub with quiet intention, brushing each beam as it passes like a hand over harp strings",
      "wide finale — evening returning to the clearing, the ring of trunks holding violet dusk, one low sideways ray recrossing the mist as farewell along the bottom edge",
    ],
  },
  "Mexican Boy": { // A Major, 366s, dense, quiet ending — marigold FIRE across every register: cell → whirlwind → galaxy → mandala → land → water. No village, no architecture.
    phases: [
      "DARK BACKGROUND, microscopic — inside a single marigold petal backlit like stained glass, cellular architecture in fire-orange and rose glowing wall to wall, luminous veins branching through the tissue, one brilliant seam running the diagonal",
      "intimate kinetic — a column of marigold petals rising on a warm updraft into darkness, each petal an ember catching light as it turns, the spiral tightening as it climbs, gold dust streaming in its wake against deep black",
      "cosmic — a spiral galaxy made entirely of marigold fire wheeling in black space, arms of orange and magenta petal-dust curving through rose nebular glow, its core a furnace of gold, the whole bloom of it off-center with vast darkness claiming one side",
      "abstract mandala — concentric rings of orange, magenta and gold light unfolding outward like a flower opening inside a flower inside a flower, each layer's petal-geometry finer than the last, radiant fractal bloom breathing against blackness, the center burning white-gold off-axis",
      "aerial — a dark high desert at dusk from above, braided rivers of glowing petals and warm ember-dust winding across the black land toward a deep amber horizon, violet night pressing in from the edges, the earth carrying the celebration like slow lava made of flowers",
      "macro finale — one marigold petal drifting down onto still black water at night, its ember glow doubled in the reflection, fine rings spreading and fading, the long song ending quiet",
    ],
  },
  "Afterglow": { // motifs: sourceless sky-fire, alpenglow, banked strata, remembered heat
    phases: [
      "DARK BACKGROUND, wide — the minutes after sundown over a mountain lake, the sky above the ridge banded rose to ember to violet in smooth strata that own it entirely, alpenglow pink on the high bare peaks, the lake doubling everything in calm",
      "macro — heat remembered by stone at close range, a rock face still holding soft red along its grain as the air cools, one thin line of ember light along its top edge against deepening blue",
      "cosmic — the whole heaven a graded sourceless fire of rose, salmon and burnt gold layered edge to edge, no bright body anywhere, the air itself holding color like a struck bell holds tone, the deepest ember banked hard along the low left horizon",
      "aerial — ridgelines from above as black cutouts stacked in violet haze, each valley between them pooled with a different temperature of afterglow, a slow gradient archipelago fading toward night",
      "intimate spirit-touch — one soft band of warm light lingering above the lake after the others have gone, drifting slowly along the shoreline as if reluctant to leave, its reflection keeping pace below",
      "macro finale — the last impossible thread of ember along a black ridge at closest range, thin as wire and refusing the dark, stars sharpening above",
    ],
  },
  "Grasshopper": { // motifs: blade-of-grass cathedral, dew catapults, spring-loaded arcs (the one Karel liked — deepened)
    phases: [
      "DARK BACKGROUND, ankle-height wide — towering green stems rising like cathedral columns into darkness, dew strung along every blade holding tiny cold lights, one stem bent in a deep loaded arc lower right",
      "extreme macro — the bent blade's curve at closest range, tension visible in its fibers, a single heavy droplet at its tip lensing the whole dark meadow upside down, the instant before release",
      "kinetic chorus — dozens of dew-arcs launching simultaneously through shafts of green-gold light, droplet trajectories crossing like a fountain-field, stems whipping, seed heads bursting motes into the spray, spring-loaded joy at macro-jungle scale",
      "aerial — the meadow from above at night, launch-ripples spreading through the grass canopy in overlapping rings of disturbed dew-light, a map of leaps written across the dark field",
      "abstract — suspended among falling droplets in slow motion, each a lit world descending through green darkness, trajectories curving gracefully past the viewpoint, the air itself celebratory",
      "macro finale — one blade bent again under a single new lit droplet, tension quietly reloading in the sleeping meadow, soft green-black everywhere else",
    ],
  },
  "Love Again": { // motifs: green through ash, blossom on char, tender return
    phases: [
      "DARK BACKGROUND, wide — a burned forest at night, charred trunks in wet black rows, rain-glisten on carbon, and low in the frame one impossible point of soft green lit as if from within, beginning against all of it",
      "extreme macro — the shoot itself at close range, a curled fern head unrolling in sharp focus, its inner light catching rain beads along the frond, black ash bokeh behind",
      "monumental bloom — the charred canopy erupting in pale pink and white flowers along every scorched limb, petals lit rose against carbon dark, glowing ferns waist-high below, the burned cathedral flowering wall to wall, richest bloom climbing the leaning trunks",
      "aerial — the recovering forest from above, green constellations spreading through the black burn scar in branching patterns like slow luminous lichen, the wound visibly closing from its edges inward",
      "intimate spirit-touch — a gentle drift of pale rose light moving among the blossoms at branch height, pausing at the newest flowers as if greeting each one, formless and tender, petals stirring faintly in its wake",
      "macro finale — one late blossom glowing faintly rose in the low dark beside wet char, a petal resting on the black bark like a kept promise",
    ],
  },
};

for (const j of out.journeys) {
  const world = WORLDS[j.title];
  if (!world) { console.log(`!! no world for ${j.title}`); continue; }
  const { data: row } = await supabase.from("journeys").select("phases").eq("id", j.journeyId).single();
  const phases = row.phases.map((p, i) => ({ ...p, aiPrompt: world.phases[i] + TAIL }));
  const { error } = await supabase.from("journeys").update({ phases }).eq("id", j.journeyId);
  console.log(`${error ? "✗ " + error.message : "✓"} ${j.title}`);
}
console.log("done");
