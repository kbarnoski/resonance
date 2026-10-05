// Expansion set 2 — one world per journey (Karel 2026-10-01 go).
// THEME LAW (law 0): world = f(analysis profile, mood, name, lyrics).
// Each entry records the profile that drove it (`why`). Takes of the
// same piece share a FAMILY (and one exclusive lead-actor shader) but
// every take gets its own domain. Material law: ice/frost/snow/crystal/
// aurora belong to Snowflake alone; no drug language; no figures; no
// orbs/discs in skies (occupy space positively, never negate).
//
// Shape: phases[6] = threshold, expansion, transcendence, illumination,
// return, integration. `micro` + `abstract` feed shots 2 and 3 of each
// phase's 3-shot aiPromptSequence (build-expansion-2.mjs composes them).

/** Lead actor per PIECE (kinetic law: one exclusive lead per journey;
 *  Karel's rule for this batch: takes of the same piece share one lead,
 *  different pieces get different leads). Mastered leads (sparkler,
 *  comet-swarm, helix-stream, ember-fountain, galaxy-seed) are off-limits. */
export const PIECE_LEADS = {
  // 24 pieces need 24 leads. The particle pool that is not a mastered
  // lead: the 11 remaining "company" heroes (render-verified 2026-09-30)
  // + review-pack/registry particle shaders. Lines/ribbons/full-frame
  // washes are deliberately excluded (kinetic law: particles only;
  // Karel banned r3-lightrivers / r3-ghostribbons / r3-wishtrails /
  // spore-dot floods elsewhere) — except two motion-only r3 wisps that
  // never touch u_bass, used where a single-take piece needed a lead.
  // Also flagged: starfield + constellation pulse brightness gently on
  // u_bass (0.7+0.5·bass) — watch them against the no-flash law. Marked (*) = not yet seen by Karel as a
  // lead — review first in the samples/kiosk pass.
  "Surrounded by Light": "orbit-weaver",   // light that ENCIRCLES — orbits around a still centre
  "Nothing": "r2-pixie",                   // (*) one mote in the void — sparse trailing sparkle
  "Night Wind": "murmuration",             // wind made visible — a flowing flock of motes
  "The Other Side": "binary-stars",        // two worlds mirrored across a threshold
  "Northern Plane": "r-stardust",          // (*) a horizontal river of dust over immensity
  "No question": "ribbon-of-light",        // one unwavering line
  "Amboise": "r2-spiralgal",               // (*) Leonardo's spiral water-studies (he died at Amboise)
  "Bells": "rose-window",                  // radial resonance of a struck bell
  "Cabin Soul": "starfield",               // (*) lyric: "the night sky"
  "Chemiluminescence": "r3-fairyglow",     // (*) cold glimmers born of reaction (biolume rejected: explicit bassFlash strobe)
  "Chenin": "pollen",                      // (*) honeyed golden drift
  "Horses": "meteor-rain",                 // galloping streaks
  "Loire": "cascade-veil",                 // river veils
  "Never Forget": "r3-dreamtendrils",      // (*) memory drifting in slow tendrils (motion-only: no u_bass brightness)
  "Rattler": "r-embers",                   // (*) lyric: "I am fire, from the mountain"
  "Redwoods Sway": "firefly-field",        // lyric: "forest charm, echoes hum in the wood tonight"
  "Rise": "ember-drift",                   // (*) sparks rising
  "Roll Away": "will-o-wisp",              // lyric: "get lost with me in the mountains" — the wandering light
  "Sancerre Cry": "fracture-light",        // lyric: "you was a church for me ... light and light"
  "Singular": "r3-magneticwisps",          // (*) field lines curving around one pole (protostar rejected: bass-pulsed bright core)
  "Torraine": "constellation",             // (*) lyric: "tell me your name so I can call it true" — naming stars
  "Tranquility": "pendulum-dust",          // calm periodic swing
  "Velvet Tears": "r-droplets",            // (*) slow luminous drops
  "Yellow Bird": "r2-curlswarm",           // (*) lyric: "little bird singing ... fly me home" — a curling flight
};

/** Shared supporting collage (Karel: "i do like your collage of a few").
 *  Never a lead anywhere in Expansion or the Kinetic Lab — the Lab's
 *  validated collage core (r-stardust / r2-curlswarm / r3-fairyglow /
 *  r-droplets became Expansion leads: 24 pieces exhaust the pool). */
export const SUPPORT_POOL = ["resonant-rings", "plankton", "drift"];

export const pieceOf = (title) => title.replace(/\s+\d+[A-Za-z]?$/, "");

export const WORLDS = {
  // ── AMBOISE — Leonardo's last home on the Loire: his water and air
  //    studies made luminous (no drawings — the phenomena themselves).
  "Amboise 1": {
    why: "F Major, dense (31 n/s), mid register, sustained high plateau peaking mid-piece, 129 chords — warm, teeming, ever-turning: spiral eddies of a golden river",
    palette: { primary: "#e8b878", secondary: "#100b07", accent: "#7fb8c4", glow: "#ffe2b0" },
    cats: ["Elemental", "Geometry"], ambient: "sacred", voice: "fable", mood: "flowing",
    micro: "a single golden eddy curling on itself in clear river water, its spiral edge lit like spun honey",
    abstract: "nested luminous spirals of moving water seen from directly above, warm gold on deep umber",
    phases: [
      "DARK BACKGROUND — dark river water at late dusk, one small spiral eddy turning in the lower left with a thread of warm gold caught in its curl, the rest of the current a deep umber glass",
      "the eddies multiplying — a broad river surface alive with dozens of slow turning spirals, each catching low golden light along its rim, the current braiding between them",
      "the great turning — the whole river become one vast field of interlocking golden vortices seen from high above, spirals within spirals, warm light pouring along every curved edge, the largest whorl set right of center",
      "the river steady and generous, wide golden spirals loosening into long curved currents, warm light resting on the surface",
      "the light lowering, eddies slowing to faint amber curls drifting downstream through umber water",
      "DARK BACKGROUND — near-dark water, a last slow spiral of honey light fading in the upper right, the current carrying it home",
    ],
  },
  "Amboise 2": {
    why: "F Major but LOW register (median 43), sparse (16 n/s), strong velocity, opens near its peak and holds — heavy warm air: Leonardo's flight studies as vast slow currents of air",
    palette: { primary: "#d8a070", secondary: "#0d0907", accent: "#a8b8d0", glow: "#f4d0a0" },
    cats: ["Elemental", "Cosmic"], ambient: "desert", voice: "sage", mood: "dreamy",
    micro: "fine warm dust riding a rising thermal, every mote lit amber against shadow",
    abstract: "vast curved streamlines of warm air drawn in luminous amber dust across deep brown space",
    phases: [
      "DARK BACKGROUND — a broad river valley in deep evening, the warm air above it made visible as long faint streamlines of amber dust rising from the lower left, heavy and slow",
      "the air lifting — great curved currents of dust-lit air climbing over the dark valley, thermals rolling upward in slow spirals, the warmth of the day rising as light",
      "the full ascent of air — colossal sweeping arcs of amber-lit wind arching across the whole sky above the dark river plain, streamlines layered in vast parallel curves, the strongest current bending upward left of center",
      "the currents broad and level, warm light drifting along wide calm streamlines above the valley",
      "the air settling, streamlines sinking and thinning toward the dark river, motes drifting down",
      "DARK BACKGROUND — the valley dark and still, one last faint curve of amber dust hanging low over the water",
    ],
  },

  // ── BELLS — a struck bell's resonance as rings of light.
  "Bells 1": {
    why: "C Minor, low register (48), sparse (15 n/s), opens AT its peak and sustains (99788879) — a great bell struck once, its tone filling the air and decaying long",
    palette: { primary: "#c8945a", secondary: "#0c0806", accent: "#6f8fa8", glow: "#f0c890" },
    cats: ["Geometry", "Visionary"], ambient: "sacred", voice: "sage", mood: "mystical",
    micro: "the bronze lip of a vast bell in close detail, a shiver of light running along its curved rim",
    abstract: "concentric rings of bronze light expanding through dark air, each ring fainter and wider than the last",
    phases: [
      "DARK BACKGROUND — the first stroke: a single thin ring of bronze light expanding through dark dusk air over still water, its centre empty and dark, its echo already a second fainter ring behind it",
      "the tone spreading — concentric rings of warm bronze light rolling outward across the darkness, the water below trembling in matching circles",
      "the full peal — wave upon wave of luminous bronze rings filling the whole sky and water, overlapping and interfering into a vast shimmering lattice of resonance, the rings' common centre an open dark point just left of middle, all the light living in the rings themselves",
      "the resonance sustained, broad slow rings of amber passing through the dusk, the air humming in light",
      "the tone decaying, rings widening apart and dimming to faint copper lines",
      "DARK BACKGROUND — silence returning, one last faint bronze ring expanding at the edge of the dark water",
    ],
  },

  // ── CABIN SOUL 6 — lyric: "the night sky". Same cabin intimacy as
  //    5 (kintsugi) and 8 (hearth) but turned UPWARD: warmth below,
  //    the sky's enormity above.
  "Cabin Soul 6": {
    why: "G Minor, mid-low register, steady climb to a late peak (45668974), widest chord vocabulary of the set (145), lyric 'the night sky' — intimacy that opens upward",
    palette: { primary: "#d8a868", secondary: "#070a12", accent: "#7f98c8", glow: "#ffd8a0" },
    cats: ["Cosmic", "Organic"], ambient: "forest", voice: "ballad", mood: "dreamy",
    micro: "a small warm ember glow at the lower edge of frame, its light catching the needles of a dark pine bough",
    abstract: "a deep blue-black sky dense with soft stars above a thin band of warm amber glow along the bottom edge",
    phases: [
      "DARK BACKGROUND — looking up through dark pine tops into a deep blue night, the first few stars appearing, a faint warm amber glow rising from below the lower edge of frame",
      "the sky opening — more and more stars emerging between the dark pine crowns, the river of the galaxy beginning to show as a soft pale band, warm glow still rising from below",
      "the whole night sky — a vast star-river arching across the frame through the ring of dark pine crowns, dense luminous dust and countless stars, warm amber light glowing up from the lower edge to meet it, the brightest band crossing right of center",
      "the sky steady and enormous, stars breathing softly, the warm glow below calm and constant",
      "the stars thinning as the glow below sinks to embers, pine tops darker against the deep blue",
      "DARK BACKGROUND — a few stars above dark pine crowns, one small warm ember glow at the lower edge, the night held close",
    ],
  },

  // ── CHEMILUMINESCENCE (plain) — Chemi 1 owns the teal glow in black
  //    fluid; this take is the late-peaking crescendo (15324496): light
  //    born of reaction along a breaking shoreline.
  "Chemiluminescence": {
    why: "E Major, quiet sparse opening then a long build to a late peak (env 15324496, peak 81%), high-mid register — a reaction gathering until the whole shore ignites",
    palette: { primary: "#9fe870", secondary: "#050c08", accent: "#e8d870", glow: "#e0ffc0" },
    cats: ["Elemental", "Visionary"], ambient: "abyss", voice: "echo", mood: "hypnotic",
    micro: "a single breaking ripple at the water's edge glowing green-gold from within, beads of lit foam lifting off it",
    abstract: "long parallel lines of breaking surf drawn in cold green-gold light across black water",
    phases: [
      "DARK BACKGROUND — a black shoreline at night, one small wave folding over in the lower right and glowing faintly green-gold along its lip as it breaks, everything else dark water",
      "the reaction catching — each new wave lighting a little more as it breaks, lines of cold green-gold foam running along the shore, glowing droplets scattered on the wet sand",
      "the whole shore alight — wave after wave breaking in brilliant green-gold light along a long curving coastline, luminous foam surging up the dark sand, the sea's edge one living line of cold fire, the brightest breaker left of center",
      "the glow sustained, broad soft waves of green-gold light washing in and drawing back, the sand shimmering with afterglow",
      "the reaction ebbing, breakers dimming to faint green threads, the dark water returning between them",
      "DARK BACKGROUND — the shore quiet and dark, one last small wave glowing as it folds, the light spent",
    ],
  },

  // ── CHENIN — the honeyed Loire grape: gold, nectar, morning dew.
  "Chenin 3": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "D Major, dense (31 n/s), high sustained energy building to a late peak (88898795) — golden abundance ripening to a harvest blaze",
    palette: { primary: "#f0c060", secondary: "#100c04", accent: "#a8c878", glow: "#fff0b0" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "fable", mood: "flowing",
    micro: "a single translucent golden grape in extreme close-up, its skin dusted with bloom, warm light glowing through it",
    abstract: "countless glowing golden spheres of nectar suspended in warm amber haze, soft bokeh depth",
    phases: [
      "DARK BACKGROUND — extreme close macro of one golden grape glowing from within in deep shadow, a bead of nectar forming at its stem, warm light just beginning",
      "the vine waking — clusters of translucent golden grapes catching low sunlight among dark leaves, honeyed glow passing from fruit to fruit, motes of pollen drifting in the warm air",
      "harvest radiance — rows of vines blazing gold under a vast amber haze at the height of evening, every cluster lit from within like lanterns, honey-light pouring across the whole hillside, the richest glow off-center right",
      "the warmth steady, golden haze settled over the vines, nectar beads shining along the stems",
      "the light lowering to deep amber, clusters dimming one by one into shadow",
      "DARK BACKGROUND — one golden grape still glowing faintly in near darkness, a last bead of nectar catching the light",
    ],
  },
  "Chenin 5": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "D Major, sparse (16 n/s), HIGH register (median 62), early peak then gentle breathing (48966464) — airy morning freshness: dew on vine tendrils",
    palette: { primary: "#e8e098", secondary: "#0a0c08", accent: "#98d0b8", glow: "#fffbe0" },
    cats: ["Organic", "Visionary"], ambient: "forest", voice: "shimmer", mood: "dreamy",
    micro: "a curling vine tendril holding a single dew drop that glows pale gold",
    abstract: "spirals of fine vine tendrils drawn in pale gold light against soft dark green",
    phases: [
      "DARK BACKGROUND — a single curling vine tendril in pre-dawn darkness, one dew drop on its tip catching the faintest pale gold",
      "first light — dew drops along a lattice of fine tendrils glittering pale gold, morning mist moving softly between the dark leaves",
      "the bright morning — a whole vineyard slope glittering with millions of dew drops lit pale gold by soft diffuse light, tendrils spiraling everywhere in delicate luminous curls, the airiest brightness upper left",
      "the dew softening, light pale and even across the leaves, tendrils swaying gently",
      "the drops evaporating into faint shimmering haze, the green deepening",
      "DARK BACKGROUND — one tendril curl remaining in soft shadow, a last glint of gold on its tip",
    ],
  },

  // ── HORSES — galloping energy, made of weather (no animals drawn).
  "Horses 1": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs — look DOWN, no horizon in frame
    why: "F Minor, the most minor-heavy track (63% minor chords), opens hard and sustains high (99887886) across a long 4 minutes — relentless gallop: storm-manes and dust plumes racing across a dusk steppe",
    palette: { primary: "#c8784a", secondary: "#0c0806", accent: "#8a98b0", glow: "#f0b080" },
    cats: ["Elemental", "Dark"], ambient: "desert", voice: "echo", mood: "flowing",
    micro: "a plume of fine dust lifting off dry ground, each grain lit copper by a low light",
    abstract: "long racing streaks of copper dust and grey cloud drawn horizontally across a darkening steppe",
    phases: [
      "DARK BACKGROUND — a vast dusk steppe, a long plume of copper dust already racing across the horizon in the lower left, storm cloud streaming low above it",
      "the rush — waves of wind-driven dust sweeping across the plain in long copper streaks, low storm clouds tearing past overhead in long streamers",
      "full force of the weather — the whole steppe alive with racing walls of lit dust and torn cloud streaming in one direction, colossal speed and weight, copper light glowing inside the plumes, the leading wave just right of center",
      "the run steadying, long even streaks of dust riding the wind, cloud streamers flowing level",
      "the wind easing, dust settling in slow copper veils over the darkening grass",
      "DARK BACKGROUND — the steppe still at nightfall, one thin trail of copper dust hanging in the air over the empty grass",
    ],
  },

  // ── LOIRE — the river itself.
  "Loire 2": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "C Major, short (1:43), HIGH register (60), quiet start building to a late peak (36689496) — a bright young river racing over braided sandbars",
    palette: { primary: "#a8d0e0", secondary: "#060c10", accent: "#f0d8a0", glow: "#e8f8ff" },
    cats: ["Elemental", "Organic"], ambient: "forest", voice: "shimmer", mood: "flowing",
    micro: "clear shallow water racing over pale sand ripples, sunlight netting the riverbed",
    abstract: "braided silver channels of a river seen from far above, threading between pale sandbars",
    phases: [
      "DARK BACKGROUND — a dark river at first light, one silver channel catching the sky as it threads between pale sandbars in the lower left",
      "the channels brightening — braided silver water racing between long sandbanks, morning mist lifting off the current in soft veils",
      "the river in full light — a wide braided river from high above, dozens of bright silver channels weaving across golden sandbars in flowing patterns, light glittering on every riffle, the brightest braid crossing left of center",
      "the current calm and bright, long silver channels gliding past the sand",
      "the light softening, channels dimming to pewter as mist returns",
      "DARK BACKGROUND — the river dusky and quiet, one silver thread of water still catching the light",
    ],
  },
  "Loire 5A": {
    why: "G Minor, LOW register (48), sparse (16 n/s), opens at its peak then recedes and settles (97566633) — the river in deep evening flood: broad, dark, slow, heavy",
    palette: { primary: "#7f98a0", secondary: "#05080a", accent: "#c8a878", glow: "#c8dce0" },
    cats: ["Elemental", "Dark"], ambient: "abyss", voice: "sage", mood: "mystical",
    micro: "the smooth dark back of deep moving water, a slow boil of current surfacing in silver",
    abstract: "the broad dark river surface in long slow silver folds, heavy mist lying in bands above",
    phases: [
      "DARK BACKGROUND — a broad river in full flood at dusk, its whole dark surface moving as one heavy glide, long silver folds of current and low mist bands lying over it",
      "the flood slowing — wide slow swirls surfacing in pewter light, the mist thickening in layers above the water",
      "the deep river — a vast dark expanse of moving water filling the frame to a misted horizon, enormous slow folds of current catching dim silver light, power held in stillness, the brightest fold lower right",
      "the current softening into broad glassy sheets, mist lying calm above",
      "the light fading from the water, only faint silver seams where the current turns",
      "DARK BACKGROUND — near-black water in slow motion, one faint pale seam of current in the mist",
    ],
  },

  // ── NEVER FORGET — lyric: "the whole of a beach ... where are you?"
  "Never Forget 4": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "G# Minor, mid register, soft velocity (49), rises to a mid peak then falls away (76779652), lyric 'the whole of a beach ... where are you?' — memory: a vast low-tide beach where every pool keeps the sky",
    palette: { primary: "#b8a8d0", secondary: "#08070c", accent: "#e8c8a0", glow: "#ece0ff" },
    cats: ["Elemental", "Visionary"], ambient: "abyss", voice: "ballad", mood: "dreamy",
    micro: "a small tide pool at dusk holding a perfect reflection of violet sky, its rim of wet sand shining",
    abstract: "hundreds of tide pools scattered across wet sand like mirrors, each holding a fragment of lavender light",
    phases: [
      "DARK BACKGROUND — a vast low-tide beach at dusk, the wet sand nearly dark, one small tide pool in the lower right still holding a fragment of violet sky",
      "the beach remembering — more and more tide pools catching the last light across the wet sand, ribbons of shallow water threading between them toward a distant line of surf",
      "the whole of the beach — an immense shining expanse of wet sand and tide pools from above, every pool holding lavender and gold light, the receding sea a far silver line, the largest shining pool left of center",
      "the light lingering, pools glowing softly, the wet sand a long mirror of dusk",
      "the light leaving, pools dimming one by one into the dark sand",
      "DARK BACKGROUND — the beach in darkness, one last tide pool holding a faint violet gleam",
    ],
  },

  // ── NIGHT WIND — set 1 (Night Wind 2) owns the grass sea; each take
  //    finds a different medium for the same invisible current.
  "Night Wind 4": {
    why: "B Major, the DENSEST Night Wind take (28 n/s), full mid-piece plateau (78998653) — wind through a night forest canopy, every bough streaming",
    palette: { primary: "#90b8a0", secondary: "#060a08", accent: "#c8b888", glow: "#d0f0dc" },
    cats: ["Elemental", "Organic"], ambient: "forest", voice: "echo", mood: "flowing",
    micro: "a single leafy twig bending in a strong gust, its leaves turned silver-side up",
    abstract: "streaming silver-green lines of wind combing through dark foliage in one direction",
    phases: [
      "DARK BACKGROUND — the edge of a dark forest at night, one bough beginning to sway, its leaves flipping silver in the first breath of wind",
      "the canopy stirring — waves of moving leaves rolling through the treetops, silver undersides flashing in streaks, the dark trunks steady beneath",
      "the full wind in the forest — an entire canopy surging and streaming in one direction under a fast cloud sky, rivers of silver-green leaves rippling across the treetops in huge rolling waves, the strongest gust tearing through right of center",
      "the wind steady, long rolling motion in the boughs, leaves glimmering in calmer waves",
      "the gusts fading, single branches swaying slowly into stillness",
      "DARK BACKGROUND — the forest quiet under slowed clouds, one last leaf drifting down through the dark",
    ],
  },
  "Night Wind 5": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs — look DOWN, no horizon in frame
    why: "B Major, early peak (19%) then long even sustain (69886664) — the gust arrives at once and keeps blowing: night wind streaming sand off dune crests",
    palette: { primary: "#c8b090", secondary: "#0a0806", accent: "#8fa8b8", glow: "#f0e0c8" },
    cats: ["Elemental", "Cosmic"], ambient: "desert", voice: "echo", mood: "flowing",
    micro: "fine sand lifting off a sharp dune crest in a thin luminous veil",
    abstract: "long ribbons of wind-blown sand streaming in parallel across dark dune ridges",
    phases: [
      "DARK BACKGROUND — dark dunes at night under a fast cloud sky, a thin veil of pale sand already streaming off one sharp crest in the lower left",
      "the dunes streaming — sand pouring off every ridge in luminous plumes, ripples racing across the slopes, the wind drawing itself in fine grains",
      "the great wind over the dunes — an endless sea of dune crests each trailing long glowing veils of sand into the night, the whole landscape streaming in one direction under torn racing cloud, the highest crest streaming sand left of center",
      "the wind steady, sand veils long and even, ripples flowing across the slopes",
      "the gusts easing, plumes thinning to faint wisps along the crests",
      "DARK BACKGROUND — the dunes still in darkness, one last wisp of sand curling off a crest",
    ],
  },
  "Night Wind 9": {
    why: "B Major, sparse (20 n/s), slow build to a LATE peak (77788986, peak 69%) — the wind gathering out over the open sea at night until the spindrift flies",
    palette: { primary: "#98b0c8", secondary: "#05080c", accent: "#d8d0b0", glow: "#d8e8f8" },
    cats: ["Elemental", "Cosmic"], ambient: "abyss", voice: "sage", mood: "flowing",
    micro: "spray tearing off the top of a dark wave, each droplet lit silver",
    abstract: "streaks of silver spindrift flying horizontally over dark heaving water",
    phases: [
      "DARK BACKGROUND — open sea at night, long dark swells, the faintest line of silver spray lifting off one crest in the lower right",
      "the wind rising over the water — whitecaps appearing in long rows, spray streaming off the crests in silver threads, cloud rushing low overhead",
      "night gale at sea — heaving dark water to the horizon with spindrift flying off every crest in long luminous silver streaks, the wind visible everywhere in torn spray and racing cloud, the wildest crest left of center",
      "the gale steadying, long rows of whitecaps glimmering under streaming cloud",
      "the wind dropping, the spray falling back, swells rolling smoother",
      "DARK BACKGROUND — dark swells calming, one last thread of silver spray hanging over the water",
    ],
  },
  "Night Wind 11": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "B Major, sparse, opens at its peak (98856787) then winds down — the wind already high in the sky: cloud rivers torn into streamers above dark hills",
    palette: { primary: "#a0a8c8", secondary: "#06060c", accent: "#c8b8a0", glow: "#e0e4f8" },
    cats: ["Cosmic", "Elemental"], ambient: "desert", voice: "shimmer", mood: "dreamy",
    micro: "a thin cloud streamer drawn out by wind into fine silver filaments",
    abstract: "long parallel streamers of cloud racing across a deep blue-black sky",
    phases: [
      "DARK BACKGROUND — dark rolling hills beneath a sky of torn cloud streamers already racing overhead, pale edges lit by the hidden sky",
      "streamers multiplying — layer upon layer of cloud ribbons flying across the sky at different speeds, their silver edges braiding",
      "the sky river at full force — the entire sky a torrent of streaming cloud filaments over the dark hills, pale silver ribbons of cloud pulled into immense parallel currents, the whole sky made of streaming vapor",
      "the cloud rivers slowing into long smooth bands, silver edges softening",
      "the sky calming, streamers thinning apart into wide dark gaps",
      "DARK BACKGROUND — dark hills under a quiet sky, one last silver streamer drifting slowly overhead",
    ],
  },

  // ── NO QUESTION 7 — set 1's take 8 owns the golden line on water;
  //    take 7 is the MINOR shadow of that certainty.
  "No question 7": {
    why: "C Minor (8 is C Major), sparse (18 n/s), steady build to a late-middle peak (66686975) — certainty in the dark: one vertical line of light rising through deep forest night",
    palette: { primary: "#d8b880", secondary: "#08090a", accent: "#7fa0b8", glow: "#f8e0b0" },
    cats: ["Geometry", "Visionary"], ambient: "sacred", voice: "ballad", mood: "transcendent",
    micro: "a thin vertical filament of warm light seen close, motes of dust drifting slowly through it",
    abstract: "a single perfectly straight vertical line of warm light dividing deep darkness",
    phases: [
      "DARK BACKGROUND — seen from above the treetops at night, a sea of dark forest canopy under mist, and one thin perfectly vertical line of warm light rising out of the canopy into the dark sky just right of center, nothing else lit",
      "the line strengthening — the vertical beam widening slightly and glowing into the mist around it, dust motes drifting through it, the treetops around it catching faint warmth",
      "the certainty at full height — the line of light a radiant column rising out of a dense sea of mist over the dark canopy high into the sky, its base lost in the glowing mist, unbroken and unmistakable",
      "the column steady, its warmth settled into the mist over the treetops",
      "the beam narrowing back toward a thread, the mist cooling",
      "DARK BACKGROUND — dark canopy under mist, one thin vertical thread of warm light still standing true",
    ],
  },

  // ── NORTHERN PLANE 3 — 5 owns the boreal plain at night; take 3 is
  //    higher-registered and brighter: the plain at the long northern
  //    twilight, lakes as mirrors.
  "Northern Plane 3": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "C Major, HIGH register (60, vs 43 in take 5), tiny chord vocabulary (47) — monolithic calm, steady breathing envelope — the long northern twilight over a plain of mirror lakes",
    palette: { primary: "#b8c8e0", secondary: "#080a10", accent: "#e8c0a0", glow: "#eef4ff" },
    cats: ["Cosmic", "Elemental"], ambient: "desert", voice: "sage", mood: "dreamy",
    micro: "the glassy edge of a small dark lake holding a strip of pale rose sky",
    abstract: "countless small lakes scattered across a flat dark land, each a mirror of pale twilight",
    phases: [
      "DARK BACKGROUND — a flat northern plain at deep twilight, low dark land and one small lake in the lower left holding a long strip of pale rose sky",
      "the mirrors appearing — dozens of small lakes catching the twilight across the plain, long low cloud bands overhead reflected in each",
      "the plain of mirrors — an immense flat land from high above scattered with hundreds of lakes all holding the same pale rose and blue twilight, the horizon a long luminous seam under layered cloud, the brightest mirror left of center",
      "the twilight lingering, mirrors calm and pale, the land darkening between them",
      "the light draining from the lakes, only faint pewter remaining",
      "DARK BACKGROUND — dark plain, one small lake still holding a thread of rose light",
    ],
  },

  // ── RATTLER — lyric: "I am fire, from the mountain. I'm a bird."
  "Rattler 2": {
    why: "D# Minor, widest harmonic vocabulary in the batch (192 chords), rising to a mid peak then falling away (78989652), lyric 'I am fire from the mountain ... I'm a bird' — fire pouring down a mountainside and lifting into the air as sparks",
    palette: { primary: "#e87848", secondary: "#0e0605", accent: "#e8c070", glow: "#ffc090" },
    cats: ["Elemental", "Dark"], ambient: "desert", voice: "echo", mood: "flowing",
    micro: "a stream of bright sparks lifting from glowing embers on dark rock",
    abstract: "rivers of orange fire-light and rising sparks drawn across a dark mountain slope",
    phases: [
      "DARK BACKGROUND — a dark mountain flank at night, a thin glowing seam of ember-orange light opening near the summit in the upper right, a few sparks lifting from it",
      "the fire descending — rivulets of molten orange light running down the dark slopes, sparks streaming upward from them in flocks",
      "fire from the mountain — the whole mountainside threaded with glowing rivers of orange fire while vast swarms of sparks lift into the night sky and wheel like birds in flight, heat-shimmer everywhere, the brightest flow left of center",
      "the fire glowing steady along the slopes, sparks rising in slow calm currents",
      "the rivers cooling to dark red, sparks thinning in the cooling air",
      "DARK BACKGROUND — the mountain dark, one ember seam still glowing faintly, a last spark rising",
    ],
  },

  // ── REDWOODS SWAY — lyric: "wandering feet, they trace the sky ...
  //    paints their mighty arms, a quiet glow, forest charm, echoes hum
  //    in the wood tonight".
  "Redwoods Sway 2": {
    why: "F Major, opens at its peak (95465745), gentle sway thereafter, lyric of a quiet glowing forest at night — the redwood grove under silver night light, swaying crowns, fireflies",
    palette: { primary: "#c89078", secondary: "#080605", accent: "#a0c8a8", glow: "#f8e0c8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "ballad", mood: "dreamy",
    micro: "the deeply furrowed red-brown bark of a giant tree, lit by drifting golden fireflies",
    abstract: "towering trunks rising into swaying crowns seen straight up from the forest floor, silver light between them",
    phases: [
      "DARK BACKGROUND — looking straight up a colossal redwood trunk into swaying crowns at night, silver light painting the edges of its mighty limbs, a few golden fireflies drifting near the bark",
      "the grove glowing — looking straight up as several great trunks rise around the view, crowns swaying slowly against the silver-lit sky, fireflies multiplying in the dark air between",
      "the whole forest humming — looking straight up the trunks of an immense grove of giant redwoods, crowns swaying in a slow wide circle against a luminous silver sky, thousands of golden fireflies drifting through the vast vertical spaces, the brightest gap in the canopy right of center",
      "the sway calm and steady, fireflies settling along the bark, silver light quiet in the crowns",
      "the night deepening, crowns stilling, fireflies dimming one by one",
      "DARK BACKGROUND — one great trunk in darkness, a single firefly glowing against its bark",
    ],
  },

  // ── RISE 1 — a Suno take distinct from the album's "Rise".
  "Rise 1": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "F Major, sparse (16.5 n/s), high plateau with mid peak (87698878), lyric hum — a slow steady ascent: sparks and warm motes rising out of a dark valley at dawn",
    palette: { primary: "#f0a868", secondary: "#0c0706", accent: "#c8a8d8", glow: "#ffd8b0" },
    cats: ["Visionary", "Elemental"], ambient: "sacred", voice: "fable", mood: "transcendent",
    micro: "a single warm spark climbing through dark air, a faint trail of light beneath it",
    abstract: "countless warm motes rising in long vertical columns through deep violet air",
    phases: [
      "DARK BACKGROUND — a deep dark valley at night, a single warm spark lifting from the valley floor in the lower left, the air violet-black",
      "the rising — warm motes lifting from the valley in slow streams, the rising mist beginning to glow violet",
      "the great rise — the whole valley releasing drifting clouds of warm golden motes and lit mist that climb through vast violet lit mist, everything ascending together, the densest cloud of motes rising right of center",
      "the ascent steady and calm, motes drifting high in warm light",
      "the motes thinning as they climb out of sight, the valley settling",
      "DARK BACKGROUND — the valley in soft dark, one last warm spark rising alone into violet air",
    ],
  },

  // ── ROLL AWAY — lyric: "climb to the top of the mountain and look down
  //    over the valley. Build a campfire ... get lost with me".
  "Roll Away 8": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "A Major, short (1:39), high register (63), builds to an ecstatic late plateau (65689999) — the lyric's mountaintop at night: a valley of lights far below and a sky of wishing trails above",
    palette: { primary: "#e8b878", secondary: "#060810", accent: "#90b0e0", glow: "#fff0d0" },
    cats: ["Cosmic", "Elemental"], ambient: "desert", voice: "fable", mood: "transcendent",
    micro: "warm sparks spiraling up out of a hollow in dark summit rock",
    abstract: "long luminous trails arcing across a deep blue mountain sky over a valley of mist",
    phases: [
      "DARK BACKGROUND — a dark mountaintop at night looking down over a misty valley, a few warm sparks spiraling up out of a hollow in the dark summit rock at the lower edge",
      "the view opening — the valley far below filling with silver mist, distant ridges layered blue, warm sparks spiraling up into a sky beginning to show long faint trails",
      "lost in the mountains — from the summit, an immense panorama of misty valleys and blue ridges under a sky streaked with long luminous arcing trails, warm sparks rising from the summit rocks to meet them, the brightest trail sweeping across the upper right",
      "the night wide and calm, trails fading slowly overhead, the mist glowing in the valley",
      "the sparks thinning, the sky quieting, ridges darkening",
      "DARK BACKGROUND — dark summit rock, one last trail of light crossing the dark sky",
    ],
  },

  // ── SANCERRE CRY — lyric: "you was a church for me ... light and light".
  "Sancerre Cry 4": {
    why: "C Minor, LOW register (43), long (4:00), late peak with high sustain (88998897), huge harmonic vocabulary (166), lyric 'you was a church for me ... light and light' — a sanctuary made only of light: fractured shafts through a vast dark arching grove",
    palette: { primary: "#d8b8e8", secondary: "#08060a", accent: "#e8c888", glow: "#f8eaff" },
    cats: ["Visionary", "Geometry"], ambient: "sacred", voice: "sage", mood: "mystical",
    micro: "a shaft of light breaking into prismatic fragments as it falls through dark leaves",
    abstract: "intersecting shafts of violet and gold light forming an arched lattice in darkness",
    phases: [
      "DARK BACKGROUND — a tall dark grove of straight trunks whose high branches arch together overhead, one fractured shaft of pale violet light slanting down in the upper left",
      "the sanctuary lighting — more shafts breaking through the high canopy, each splitting into prismatic violet and gold fragments, the arching boughs closing into a high darkness",
      "light and light — close among the high arching branches, countless fractured shafts of violet and gold crossing between the leaves in a vast luminous lattice, every leaf edge glowing, light pouring and breaking everywhere, the brightest crossing just left of center",
      "the shafts steady and softened, prismatic glow resting in the leaves",
      "the light withdrawing upward, shafts thinning to single threads",
      "DARK BACKGROUND — the arching grove dark, one last pale violet shaft standing in the gloom",
    ],
  },

  // ── SINGULAR — one.
  "Singular 4": {
    why: "C Major, very short (1:47), the DENSEST track (41 n/s) yet the SMALLEST chord vocabulary (30), opens at its peak (96697654) — one intense thing: a single brilliant point of light in vast darkness, everything orbiting it",
    palette: { primary: "#f0e0c0", secondary: "#060606", accent: "#a8c0e8", glow: "#fffaf0" },
    cats: ["Cosmic", "Geometry"], ambient: "abyss", voice: "shimmer", mood: "hypnotic",
    micro: "one tiny intensely bright point of light with fine rays radiating from it",
    abstract: "a single brilliant point of light at the center of fine concentric drifting dust",
    phases: [
      "DARK BACKGROUND — vast darkness and one single brilliant point of light already blazing in it just left of center, fine pale dust drifting slowly around it",
      "the one and its field — dust and faint motes gathering into slow currents around the single point, all motion bending toward it",
      "the singular at full intensity — one point of white-gold light at the heart of an immense slowly turning field of luminous dust, every mote in the darkness drawn toward it in long curving streams, overwhelming focus",
      "the field calm, dust drifting in wide gentle curves around the steady point",
      "the dust dispersing outward into darkness, the point remaining",
      "DARK BACKGROUND — darkness, and the one point of light, smaller now, still there",
    ],
  },

  // ── SURROUNDED BY LIGHT 3 / 19 — the SBL album = abstract radiance,
  //    March Light = forest corona, SBL 6 = drowned light. Two more
  //    distinct domains of being surrounded.
  "Surrounded by Light 3": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "A Major, dense (30 n/s), early peak (31%) then a long fall (47976352), lyric 'surrounded by light ... as I was falling ... I light your soul' — FALLING into light: a descent through ring after ring of luminous cloud",
    palette: { primary: "#f0d8a8", secondary: "#0a0806", accent: "#a8c8e8", glow: "#fff4dc" },
    cats: ["Visionary", "Cosmic"], ambient: "sacred", voice: "fable", mood: "transcendent",
    micro: "soft luminous vapor curling at the edge of a cloud ring, lit gold from within",
    abstract: "concentric rings of glowing cloud seen from above, their walls glowing from within",
    phases: [
      "DARK BACKGROUND — inside a deep shaft of dark cloud, its walls faintly warm-lit, the depth below soft grey",
      "falling inward — descending past walls of cloud that glow brighter as the fall continues, warm gold light living inside the vapor",
      "surrounded — in the middle of the fall, enclosed on every side by luminous gold and pale blue vapor glowing evenly like lit fog, billows passing close on all sides, light everywhere and nowhere in particular, held",
      "the fall slowing into a gentle drift, the rings of light wide and soft all around",
      "the cloud thinning, light diffusing into a warm pale haze",
      "DARK BACKGROUND — a dim soft dark with one wide faint ring of gold still encircling the view",
    ],
  },
  "Surrounded by Light 19": {
    why: "A Major, dense (32 n/s), climbs to a mid peak and returns (44698466), lyric 'surrounded by light ... take me by ... you gave me pain' — an embrace with an ache in it: a forest pool in rain-light, ripples of light surrounding a still centre",
    palette: { primary: "#e0c8a0", secondary: "#08090a", accent: "#90b8c0", glow: "#fff0d8" },
    cats: ["Elemental", "Visionary"], ambient: "forest", voice: "ballad", mood: "transcendent",
    micro: "a single water drop striking a dark pool, a ring of light spreading from it",
    abstract: "hundreds of overlapping rings of light spreading across a dark still surface",
    phases: [
      "DARK BACKGROUND — a still dark forest pool, one drop falling and a single ring of warm light spreading across its surface",
      "the light arriving — drops falling everywhere on the pool, rings of gold and pale teal spreading and overlapping, the dark trees around reflected and trembling",
      "surrounded by light — the whole pool alive with countless interlocking rings of light, every ripple glowing, the surface a vast shimmering mandala of warmth enclosing one perfectly still dark centre right of middle",
      "the drops slowing, broad soft rings drifting across the glowing pool",
      "the surface settling, rings fading at their edges",
      "DARK BACKGROUND — the pool still and dark, one last ring of light widening to the edge",
    ],
  },

  // ── THE OTHER SIDE 9 — 10 owns the black-water mirror; 9 (G minor,
  //    peak at 44%) crosses through a veil of mist instead.
  "The Other Side 9": {
    why: "G Minor, mid-piece peak then a long slow fade (67897743), sustained hum — the crossing through a curtain of mist into a dim luminous far shore",
    palette: { primary: "#a8b8d8", secondary: "#08080e", accent: "#d8b8a0", glow: "#e8eeff" },
    cats: ["Visionary", "Elemental"], ambient: "abyss", voice: "shimmer", mood: "mystical",
    micro: "a curtain of fine drifting mist glowing faintly from light behind it",
    abstract: "layers of luminous mist curtains receding one behind another into soft light",
    phases: [
      "DARK BACKGROUND — seen from far across a wide dark lake, a towering hanging curtain of mist on the far water, faintly glowing from something behind it",
      "the veil brightening — the mist curtain towering and luminous, soft light seeping through its folds, the water reflecting its glow",
      "the crossing — the view drifting into the curtain itself above the water, layer upon layer of glowing mist parting ahead, a pale luminous far shore emerging beyond in blue and rose light, the veil's brightest opening right of center",
      "the far side — calm luminous mist lying over quiet water, the light soft and sourceless",
      "the mist closing gently behind, its glow dimming",
      "DARK BACKGROUND — dark water and the faint glowing curtain of mist, the other side kept within it",
    ],
  },

  // ── TORRAINE — lyric: "tell me your name, so I can call it true ...
  //    tell me your favorite color, your favorite truth". Naming the
  //    stars: a sky being called into being point by point.
  "Torraine 5": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "C Major, dense (32 n/s), long (3:55), wavering build to a late peak (46736966), lyric 'tell me your name so I can call it true' — a night sky whose stars light up one by one as they are named, joined by threads of light",
    palette: { primary: "#c8d0f0", secondary: "#05060c", accent: "#f0d098", glow: "#f0f4ff" },
    cats: ["Cosmic", "Geometry"], ambient: "sacred", voice: "fable", mood: "mystical",
    micro: "one star brightening as a fine thread of light reaches it from another",
    abstract: "a web of stars joined by delicate luminous threads across a deep blue sky",
    phases: [
      "DARK BACKGROUND — a deep blue night sky over dark rolling hills of vines, one star brightening in the upper left as if just named",
      "the naming — star after star kindling across the sky, fine threads of light joining each new star to the last",
      "every name called true — the entire sky a vast luminous web of named stars joined by delicate threads of gold and silver light above dark rolling hills of vines, patterns forming everywhere, the brightest knot of threads right of center",
      "the web steady and quiet, threads softly glowing, stars calm",
      "the threads fading, stars remaining as scattered points",
      "DARK BACKGROUND — the dark hills and a few named stars, one thin thread of light between two of them",
    ],
  },
  "Torraine 6": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "D# Minor, soft velocity (47), early peak then wavering (55986696), 147 chords, lyric 'tell me your favorite color, tell me your favorite truth' — the names become COLORS: a river valley at dusk where each named star drops its color into the water",
    palette: { primary: "#e0a8c8", secondary: "#08060c", accent: "#98d0d8", glow: "#ffe8f4" },
    cats: ["Cosmic", "Elemental"], ambient: "sacred", voice: "shimmer", mood: "dreamy",
    micro: "a single colored point of light reflected as a long trembling streak in dark water",
    abstract: "streaks of rose, teal and gold light reflected in long lines across a dark river",
    phases: [
      "DARK BACKGROUND — a wide dark river deep in the night, one rose-colored star above it and its reflection trembling in the water",
      "colors called — new stars appearing each in its own color, rose, teal, gold, violet, each dropping a long trembling reflection into the river",
      "the favorite truths — the sky above the broad river filled with stars of every color joined by faint threads, the water below a vast shimmering field of colored reflections streaming toward the viewer, the richest colors crossing left of center",
      "the colors calm, reflections lengthening and softening in the slow current",
      "the colors fading back to silver, reflections thinning",
      "DARK BACKGROUND — dark river, one rose star and its long quiet reflection",
    ],
  },
  "Torraine 7": {
    why: "C Major, very dense (38 n/s), high register (60), widest Torraine harmony (175), late peak (67746977), lyric 'tell me your name ... so I can call it true' — the name answered: a single pair of stars joined by a thread over a vast quiet plain, recognition",
    palette: { primary: "#d0c8f0", secondary: "#050508", accent: "#f0c8a0", glow: "#f4f0ff" },
    cats: ["Cosmic", "Visionary"], ambient: "abyss", voice: "sage", mood: "mystical",
    micro: "two stars close together joined by a fine bright thread of light",
    abstract: "a single long curved arc of fine light connecting two distant stars across a night sky",
    phases: [
      "DARK BACKGROUND — seen from high above a sea of dark night clouds that fills the lower frame, two faint stars on opposite sides of the frame",
      "high above a sea of night cloud, the call — a fine thread of light beginning to reach from one star toward the other across the sky, other stars waking softly",
      "called true — a long gently curved arc of fine gold light bowing across the entire sky from one star to the other like a rainbow drawn in thread, the cloud sea below glowing faintly in its light, the sky around filled with quiet answering stars",
      "the arc steady and soft, the two stars bright at its ends",
      "the arc thinning to a hair of light, the cloud sea darkening",
      "DARK BACKGROUND — two stars over the dark cloud sea, the faintest curved thread still between them",
    ],
  },

  // ── TRANQUILITY — eleven takes, one family: STILLNESS, each held in a
  //    different medium (water, air, earth, light), chosen by the take's
  //    register, density and arc. All B Major except 33 (F# Major).
  "Tranquility 3": {
    why: "B Major, LOWEST Tranquility register (44), sparsest (16 n/s), gentle mid arch — stillness at depth: a black mirror mountain tarn at dusk breathing mist",
    palette: { primary: "#8fa8b8", secondary: "#05070a", accent: "#d8b898", glow: "#d8e8f0" },
    cats: ["Elemental", "Visionary"], ambient: "abyss", voice: "sage", mood: "mystical",
    micro: "the mirror-still edge of dark water holding a faint breath of mist",
    abstract: "a perfectly still black water surface reflecting soft layered mist and dusk light",
    phases: [
      "DARK BACKGROUND — a small mountain tarn at deep dusk, its water black and perfectly still, a thin breath of mist lying on the surface in the lower left",
      "the stillness widening — the tarn mirroring the darkening ridges and a pale band of dusk, mist drifting slowly in a single layer",
      "perfect stillness — the whole dark tarn a flawless mirror of the dusk sky and the surrounding dark ridges, a soft luminous band of mist floating at mid-height across it, nothing moving but the mist, the brightest reflection right of center",
      "the mirror calm, dusk light resting long on the water",
      "the light fading from the reflection, mist sinking to the surface",
      "DARK BACKGROUND — black still water, one faint pale streak of reflected sky",
    ],
  },
  "Tranquility 8": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, sparse (16 n/s), softest velocity (49), quiet start swelling mid-piece then settling (24795454) — a sea of cloud seen from above at dawn, a slow swell of rose light",
    palette: { primary: "#e8b8b0", secondary: "#0a080c", accent: "#a8b8e0", glow: "#fff0ec" },
    cats: ["Cosmic", "Visionary"], ambient: "sacred", voice: "shimmer", mood: "dreamy",
    micro: "the soft rolling crest of a cloud billow catching rose light",
    abstract: "an endless soft sea of cloud billows from above, rose and lavender light across their tops",
    phases: [
      "DARK BACKGROUND — high above a sea of cloud before morning, the billows dark grey-blue, the faintest rose tint on their tops",
      "the cloud sea warming — rose light spreading across the tops of the slow billows, deep lavender in the hollows",
      "the dawn swell — an endless ocean of soft cloud from high above glowing rose and gold, slow billows rolling in long calm waves across the whole frame, peaceful immensity, the brightest crests left of center",
      "the cloud sea calm in full soft light, billows barely moving",
      "the rose light fading to pearl, the billows flattening",
      "DARK BACKGROUND — a pale-grey sea of cloud in dim light, one last rose crest",
    ],
  },
  "Tranquility 11": {
    why: "B Major, the DENSEST Tranquility (36 n/s), a clean crescendo then decay (56789531) — stillness that shimmers: warm lagoon water netting light across pale sand",
    palette: { primary: "#90d8d0", secondary: "#050c0c", accent: "#f0d8a0", glow: "#e0fff8" },
    cats: ["Elemental", "Organic"], ambient: "abyss", voice: "echo", mood: "hypnotic",
    micro: "a net of rippling light patterns on pale sand under clear shallow water",
    abstract: "shimmering caustic light nets spreading across a pale sandy floor in teal water",
    phases: [
      "DARK BACKGROUND — clear shallow water at late evening, a single small net of rippling light dancing on the pale sand in the lower right",
      "the light nets spreading — shimmering caustic patterns rippling across the sandy floor, the water turning luminous teal",
      "the lagoon alive with light — an immense warm shallow lagoon seen from high directly above, the whole sandy floor covered in rippling golden-teal nets of light, calm and shimmering everywhere, the brightest pattern right of center",
      "the shimmer calm and slow, nets of light drifting softly over the sand",
      "the light lowering, the patterns fading into deeper teal",
      "DARK BACKGROUND — dark water over dim sand, one last faint ripple of light",
    ],
  },
  "Tranquility 17": {
    why: "B Major, early peak (19%) and a high bright plateau (79788687), the most purely major (9% minor) — green-gold calm: a moss and fern forest floor in sunlit haze",
    palette: { primary: "#b8d878", secondary: "#070a05", accent: "#f0d890", glow: "#f4ffd8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "fable", mood: "dreamy",
    micro: "a single fern frond uncurling on deep green moss in a soft beam of light",
    abstract: "a carpet of moss and ferns glowing green-gold under drifting sunlit haze",
    phases: [
      "DARK BACKGROUND — a dim forest floor of deep moss, one shaft of green-gold light already resting on a single fern in the lower left",
      "the haze glowing — soft beams spreading across the moss, fern fronds catching light, warm motes hanging in the still air",
      "green-gold stillness — a vast forest floor carpeted in glowing moss and ferns under a canopy of soft sunlit haze, beams of warm light everywhere, motes floating motionless, the brightest clearing upper right",
      "the light steady and calm, haze resting over the moss",
      "the beams fading, green deepening, motes settling",
      "DARK BACKGROUND — dim moss, one small fern still lit by a thread of light",
    ],
  },
  "Tranquility 21": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, low-mid register (49), late peak (69%), lyric 'I'll sit at home in my darkness ... I'll see a way for me' — calm darkness that opens a way: a canyon at night with a slow glowing river of mist leading out to dawn",
    palette: { primary: "#c8a8e0", secondary: "#07050a", accent: "#f0c890", glow: "#f4e8ff" },
    cats: ["Visionary", "Elemental"], ambient: "abyss", voice: "ballad", mood: "mystical",
    micro: "a slow tendril of glowing mist drifting along the dark floor of a canyon",
    abstract: "a winding river of soft luminous mist between dark canyon walls leading toward glowing walls",
    phases: [
      "DARK BACKGROUND — the floor of a deep dark canyon at night, calm and quiet, one faint tendril of glowing mist drifting along the bottom",
      "the way appearing — the mist gathering into a slow luminous river winding between the dark walls, a pale violet glow on the far walls",
      "a way for me — the canyon from above, a long winding river of softly glowing mist flowing calmly between the towering dark walls out toward the canyon's far end where the walls glow warm gold and violet, the way unmistakable, the brightest walls right of center",
      "the mist river steady and calm, the dawn glow softly filling the canyon",
      "the glow settling, the mist thinning to a quiet stream",
      "DARK BACKGROUND — the dark canyon, a thin luminous thread of mist still showing the way",
    ],
  },
  "Tranquility 30": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, opens at full strength and stays there (99989487), widest Tranquility harmony (161) — calm on the largest scale: an open ocean horizon at golden hour, long slow swells",
    palette: { primary: "#f0c890", secondary: "#080808", accent: "#90b8d0", glow: "#fff0d8" },
    cats: ["Elemental", "Cosmic"], ambient: "abyss", voice: "fable", mood: "transcendent",
    micro: "the glassy back of a slow swell catching long golden light",
    abstract: "long parallel golden swells rolling slowly across an immense calm ocean",
    phases: [
      "DARK BACKGROUND — an immense calm ocean in warm dusk light, long slow swells already glowing gold along their backs, a low band of haze at the horizon",
      "the swells rolling — wide glassy waves lifting and lowering in slow rhythm, golden light lying long across them",
      "the great calm — an endless open ocean seen from above in warm evening light, long slow swells catching gold and amber in parallel bands across the whole frame, vast peace in motion, the brightest swell left of center",
      "the swells easing, gold softening to honey on the water",
      "the light lowering, swells darkening to pewter",
      "DARK BACKGROUND — the dark ocean, one long swell still holding a line of gold",
    ],
  },
  "Tranquility 33": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "F# Major (the one Tranquility not in B), low-mid register (49), broad mid plateau (68889765) — a different key, a different calm: valley fog at blue hour with ridges floating as soft islands",
    palette: { primary: "#98a8d8", secondary: "#05060c", accent: "#e8b8a8", glow: "#e0e8ff" },
    cats: ["Elemental", "Cosmic"], ambient: "desert", voice: "sage", mood: "dreamy",
    micro: "the soft edge of a fog bank lapping against a dark ridge",
    abstract: "layer upon layer of blue ridges floating in a still sea of fog",
    phases: [
      "DARK BACKGROUND — a deep valley filled with fog at blue hour, one dark ridge rising from it like an island in the lower left",
      "the layers revealing — more ridges emerging from the still fog in receding blue layers, a soft rose glow resting on the fog",
      "the floating world — an immense landscape of blue ridges floating as soft islands in a motionless sea of fog seen from above, layered in deepening blues, rose light resting on the fog, the brightest fog right of center",
      "the fog calm, ridges quiet in the blue light",
      "the blue deepening, fog darkening around the ridges",
      "DARK BACKGROUND — dark fog, one faint ridge line against the last blue",
    ],
  },
  "Tranquility 34": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, higher register (58), sparse (19 n/s), plateau then clean fade (68899524), lyric 'but I'm never going away' — calm that stays: an autumn pool where amber leaves turn slowly on still water",
    palette: { primary: "#e8a860", secondary: "#0a0705", accent: "#90a8b8", glow: "#ffe0b8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "ballad", mood: "dreamy",
    micro: "a single amber leaf floating on dark still water, its reflection beneath it",
    abstract: "amber leaves slowly turning on a dark mirror pool seen from above",
    phases: [
      "DARK BACKGROUND — a dark still forest pool, one amber leaf resting on the surface in the lower right with its reflection",
      "leaves arriving — more amber and copper leaves settling on the still water, turning slowly, soft light filtering through the trees above",
      "the staying calm — the whole pool from above covered in slowly turning amber, copper and gold leaves on dark mirror water reflecting a canopy of warm autumn light, peaceful and unchanging, the brightest leaves left of center",
      "the leaves barely moving, warm light steady on the pool",
      "the light dimming, leaves darkening to bronze",
      "DARK BACKGROUND — the dark pool, one amber leaf still floating, never going away",
    ],
  },
  "Tranquility 35": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, higher register (58), dense (28 n/s), the longest Tranquility (3:50) with a mid plateau and long fade (77789555) — calm across great distance: high mesas under slowly drifting cloud shadows in late afternoon",
    palette: { primary: "#e0a878", secondary: "#0a0706", accent: "#90b0d0", glow: "#ffe4c8" },
    cats: ["Elemental", "Cosmic"], ambient: "desert", voice: "sage", mood: "transcendent",
    micro: "the edge of a cloud shadow sliding slowly over warm ochre ground",
    abstract: "slow-drifting cloud shadows patterning a vast warm ochre plateau from above",
    phases: [
      "DARK BACKGROUND — a high desert plateau at late afternoon, warm ochre mesas in shadow, one patch of soft light sliding across the ground in the lower left",
      "the shadows drifting — slow cloud shadows moving across the mesas, warm light opening between them",
      "vast calm distance — an immense landscape of ochre mesas and plateaus stretching to the horizon under a sky of slow drifting clouds, their soft shadows gliding across the land in patterns of light and shade, the brightest plateau right of center",
      "the drift slowing, warm light lying long across the mesas",
      "the shadows lengthening, the land deepening to rust",
      "DARK BACKGROUND — the dark plateau, one distant mesa edge still lit warm",
    ],
  },
  "Tranquility 36": {
    aerial: true, // samples 2026-10-01: horizon framings summoned sun discs twice — look DOWN, no horizon in frame
    why: "B Major, latest Tranquility peak (81%), lyric 'here's a power of shadow ... the bed is waking' — calm that wakes: long shadows withdrawing as warm dawn light spreads over rolling grass hills",
    palette: { primary: "#f0c080", secondary: "#08070a", accent: "#a8a8d8", glow: "#fff0d0" },
    cats: ["Elemental", "Visionary"], ambient: "forest", voice: "fable", mood: "transcendent",
    micro: "dew-wet grass blades catching the first warm light as a shadow edge retreats",
    abstract: "long blue shadows and warm gold light dividing rolling hills in soft bands",
    phases: [
      "DARK BACKGROUND — rolling grass hills under a high sealed ceiling of pale cloud, deep blue shadow over everything, a single line of warm light touching one crest in the upper right",
      "the waking — warm light spreading slowly over the hills, long shadows withdrawing down the slopes, dew glinting",
      "the power of shadow and light — immense rolling hills under an even pale cloud ceiling, striped with long sweeping shadows and bands of warm gold light, mist lifting from the hollows, the whole land waking, the brightest crest left of center",
      "the morning calm and full, light resting on the hills, shadows short and soft",
      "the light softening, mist settling in the hollows",
      "DARK BACKGROUND — dim hills, one crest still holding a line of warm light",
    ],
  },
  "Tranquility 38": {
    why: "B Major, a slow steady climb to a late peak (45568976), mid register — the cosmic member of the family: calm deep space, slow drifting veils of rose and blue starlight dust",
    palette: { primary: "#c8a8d8", secondary: "#04040a", accent: "#90b8e0", glow: "#f0e8ff" },
    cats: ["Cosmic", "Visionary"], ambient: "abyss", voice: "shimmer", mood: "transcendent",
    micro: "a fine veil of rose starlight dust drifting slowly in deep space",
    abstract: "vast soft veils of rose and blue luminous dust drifting in calm deep space",
    phases: [
      "DARK BACKGROUND — deep calm space, one faint veil of rose dust drifting in the lower left among sparse stars",
      "the veils gathering — soft clouds of rose and blue starlight dust drifting slowly into view, layered at different depths",
      "the calm cosmos — vast slow-drifting veils of rose, violet and blue luminous dust filling deep space in soft layers, countless faint stars glowing within them, immense and peaceful, the densest veil right of center",
      "the veils barely moving, light steady and soft",
      "the dust thinning, stars showing through the fading veils",
      "DARK BACKGROUND — deep space, one faint rose veil and a few quiet stars",
    ],
  },

  // ── VELVET TEARS — soft sorrow.
  "Velvet Tears 1": {
    why: "G# Minor, low register (47), longest take (4:00), soft broad arch peaking mid-piece (57798755) — soft luminous drops falling slowly through deep velvet darkness onto dark petals",
    palette: { primary: "#c8a0b8", secondary: "#0a060a", accent: "#a0b8d0", glow: "#f4e0ec" },
    cats: ["Organic", "Visionary"], ambient: "sacred", voice: "ballad", mood: "dreamy",
    micro: "one luminous drop resting on a deep plum velvet petal",
    abstract: "soft glowing drops suspended in slow fall through plum-dark velvet space",
    phases: [
      "DARK BACKGROUND — deep plum-black velvet darkness, a single luminous drop falling slowly in the upper right",
      "the falling — soft glowing drops descending slowly through the velvet dark, landing on dark rose petals and spreading into gentle light",
      "velvet tears — a vast slow rain of soft luminous drops falling through plum and rose darkness onto a field of deep velvet petals, each landing blooming into a soft halo of light, tender and enormous, the brightest bloom left of center",
      "the drops slowing, petals glowing softly where they landed",
      "the last drops falling, the glow on the petals fading",
      "DARK BACKGROUND — velvet darkness, one drop of light resting on a dark petal",
    ],
  },

  // ── YELLOW BIRD 3 / 6 — Suno takes distinct from the album's "Yellow
  //    Bird". Lyric (3): "little bird singing ... fly me home".
  "Yellow Bird 3": {
    sealSky: true, // samples 2026-10-01 summoned sun/orb discs — light sources sealed behind cloud
    why: "F Major, early peak (31%) with a high sustained flight (78968988), lyric 'little bird singing ... fly me home' — flight homeward at golden evening: a flock of light streaming across a warm sky toward a lit valley",
    palette: { primary: "#f0d060", secondary: "#0c0a04", accent: "#90b8d8", glow: "#fff4c0" },
    cats: ["Elemental", "Visionary"], ambient: "forest", voice: "fable", mood: "flowing",
    micro: "a single golden feather of light drifting in warm evening air",
    abstract: "a long flowing ribbon of golden light-points streaming across a warm sky like a flock",
    phases: [
      "DARK BACKGROUND — a dark evening sky filling the whole frame with soft layered cloud, a single small point of golden light drifting across the lower left",
      "the flock gathering — more golden points joining in a flowing ribbon across the warming sky, sweeping and turning together",
      "fly me home — a vast shimmering murmuration of golden light streaming across a warm amber evening sky toward a glowing valley far below, the ribbon folding and unfolding in huge graceful curves, the densest swirl right of center",
      "the flock settling into a long calm stream of gold over the valley",
      "the points descending toward the valley, the sky dimming to rose",
      "DARK BACKGROUND — dusk over the hills, one golden point of light drifting down through dusky cloud",
    ],
  },
  "Yellow Bird 6": {
    why: "G Major, early peak (19%) and a long bright plateau (59987875), wordless hum — the morning version: yellow light waking in a meadow, small bright points rising from the grass into a pale sky",
    palette: { primary: "#f8e078", secondary: "#0a0a06", accent: "#a8d0a0", glow: "#fffbd8" },
    cats: ["Organic", "Elemental"], ambient: "forest", voice: "shimmer", mood: "dreamy",
    micro: "a blade of meadow grass with a tiny point of yellow light perched on its tip",
    abstract: "countless small yellow points rising from a dark meadow into pale sky in curving flights",
    phases: [
      "DARK BACKGROUND — a dark meadow before dawn, one small point of yellow light perched on a grass tip in the lower right",
      "waking — yellow points lifting from the grass in small curving flights, the sky beginning to pale",
      "the meadow in flight — thousands of small yellow lights rising from the whole meadow and wheeling together in great curving flights against a pale gold morning mist, the brightest swirl upper left of the mist",
      "the flights calm, yellow points drifting over the meadow in the soft light",
      "the points settling back into the grass, the light quieting",
      "DARK BACKGROUND — the dim meadow, one small yellow light on a grass tip",
    ],
  },
};
