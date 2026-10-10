// Batch 2, part c2A — Journey Archetype shot lists (2026-10-10) for the
// "Surrounded by Light" album: Rise, Surrender, Openings, Surrounded By Light,
// Drift, Self.
// Modelled on the Karel-approved expansion-sample.mjs, welcome-home-title.mjs
// (hint, never literal) and rise-above-A/B.mjs (same format, minus
// shaders/opacity).
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones;
//    `music` names the deep-analysis sections each phase holds.
//  - Each journey keeps its identity (current shot motifs + palette +
//    worldRationale), TRANSFIGURED (made of light, particles, impossible
//    stillness) per law 10a; one sparse phase at the music's real valley.
//  - Album thread: spirit energy as an abstract light-presence (half-gathered,
//    translucent, featureless, made only of light) — one shot per journey,
//    never a figure. No humans, no animals, no wings/flight.
//  - Drift has no interior valley (arousal climbs 0.2 → 0.75 without a dip);
//    its sparse phase is the abrupt 3:10 collapse, which the close phase
//    starts on (189 s) — the music's only real valley.

export const SET = { key: "b2-c2A", presenting: "Surrounded by Light" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "b583c8d2-b3c3-4df8-9c51-9b035be2d3e1",
    name: "Rise",
    world: "Bb major on a hovering pedal whose bass climbs G–A–Bb–C twice — a hopeful reach that stops short at 0:33, a hush on the pedal, full voice at 1:09, then a bare open fifth left unsealed — amber filaments of light rising out of dark stone, a single hovering updraft of pale light in the pedal's lull, the second climb tearing a dark ocean of vapor open from within, strata of dusk, and one bead of amber light holding the risen morning",
    phases: [
      P("threshold", 0, 0.172, 0.71, "threshold", "0:00-0:18 First Ascent (a softened Bb tonic in sus2/add9, the right hand leaping upward, testing the air)", [
        S("sparse", "DARK BACKGROUND — a single hair-thin filament of amber light rising out of black stone in the lower right of vast darkness, one glowing junction along it like a held breath, the rest of the frame open black"),
        S("micro", "extreme macro — the glowing junction at closest range, amber light branching into finer threads that climb upward in small stepwise leaps, tiny sparks of pale sky blue testing the dark air above each tip, luminous and weightless"),
        S("aerial", "looking straight down on a dark ridge of stone filling the frame edge to edge, dozens of thin amber filaments of light standing up out of it like first sparks of fire, faint mist drifting between them, the camera beginning to descend"),
      ]),
      P("expansion", 0.172, 0.334, 0.71, "expansion", "0:18-0:35 First Ascent (the first climb Gm9 → Dm7/A → Ebmaj7/Bb → F/C, bass G–A–Bb–C; the reach stops short on Dm7/A at 0:33)", [
        S("interior", "rising inside a narrow updraft of luminous gold dust, four bright motes climbing one above another in a stepwise ascent, the highest one pausing just short of the top of the frame, warm side-light leaning in from the left, deep indigo all around"),
        S("aerial", "from high above, a dark branching network of gorges veined with rising amber light like a luminous root map filling the frame edge to edge, the glow brightening in one modest wave toward the upper left, the camera rising with it"),
        S("micro", "macro — the rim of dark stone where a first thin edge of warm light arrives low across the frame, fine particles of gold lifting off it into the updraft, slate-violet shadow pooled beneath"),
      ]),
      P("transcendence", 0.334, 0.525, 0.64, "integration", "0:35-0:55 Pedal Return (the hovering Bb pedal, calm and almost entirely major, gathering resolve without changing chords) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of pale luminous air hovering alone in the upper left of immense darkness, a few gold motes orbiting it slowly, nearly the entire frame empty"),
        S("abstract", "abstract — within the hovering current, pale light half-gathers into a presence made only of light, translucent and featureless, rising without effort and loosening back into drifting motes of honey gold and pale sky blue"),
        S("micro", "extreme macro — a single gold particle spinning slowly inside the hovering air, its facets flashing the whole coming dawn back in miniature, soft violet darkness beyond"),
      ], { sparse: true }),
      P("illumination", 0.525, 0.745, 1, "transcendence", "0:55-1:18 Summit Climb (the climb taken twice, louder and wider; crest on F/A at 1:09, the arrival denied at 0:33 granted at 1:17)", [
        S("cosmic", "cosmic — an immense ocean of dark vapor torn open from within, seen from far above, vast waves of gold light flooding up through the tear and breaking across its ridges in successive bands, each brighter than the last, infinite indigo beyond"),
        S("micro", "macro at the height of the light — the crest of one wave of luminous vapor breaking into a spray of tiny gold and rose sparks, blazing against the dark"),
        S("aerial", "rising straight up through the tear while looking down, the glowing rift widening below in a long diagonal of honey-gold fire across dark vapor that fills the frame edge to edge, the camera climbing with the second ascent"),
      ]),
      P("return", 0.745, 0.879, 0.37, "return", "1:18-1:32 Open-Fifth Afterglow (a hush; the opening vamp replayed in miniature, plagal Eb/Bb sighs at 1:24)", [
        S("abstract", "abstract — the day's colors as slow strata of light, honey gold through rose to deep evening indigo, drifting past one another in long translucent bands across black, the camera gliding with them"),
        S("aerial", "from high above, the torn vapor closing gently, its ridges rimmed with fading gold, long blue shadows streaming off each crest of luminous mist, a first few points of light appearing in the indigo"),
        S("micro", "extreme macro — a last gold mote drifting down through cooling blue air, a faint ring of amber light trailing it, dissolving"),
      ]),
      P("integration", 0.879, 1, 0.37, "integration", "1:32-1:45 Open-Fifth Afterglow (a last plagal sigh, one clear Bb triad at 1:39, then a bare open fifth)", [
        S("sparse", "DARK BACKGROUND — a single bead of amber light resting on dark stone in the lower right of vast darkness, one thin filament rising from it and left open, the bookend of the first filament, the risen morning held inside it"),
        S("cosmic", "cosmic — from immense height the dark plateau becomes a quiet field under a first star field, one point of amber light glowing in the lower left, open and unresolved"),
        S("micro", "extreme macro — inside a single dewdrop on dark stone, the gold flood replaying in miniature, tiny luminous vapor tearing open around a point of light, kept and weightless"),
      ]),
    ],
    morphs: [
      "the camera descends toward one glowing filament and rises inside the narrow updraft of gold dust",
      "the gold particles lift off the stone rim and the camera settles close on one small curl of hovering light in the dark",
      "the spinning particle flares and the camera pulls back as the dark vapor tears open from within",
      "the rift's gold cools and the camera drifts back as the light lies down into slow strata of dusk",
      "the last mote settles and the camera comes to rest close on one bead of amber light on dark stone",
    ],
  },
  {
    id: "db22c975-8f03-487b-ae44-437f7f153ac1",
    name: "Surrender",
    world: "Bb major hymn over a tonic pedal, two waves cresting at 0:36 and 1:35, an inward bridge that hangs on F/A like an unspoken question, one Ebm shadow at 2:00, and a thirdless open fifth — surrender as release of grip, not defeat: one drop of teal light rejoining still water, silt unfurling into a slow nebula, a single mote sinking into the deep, a delta letting go into a luminous sea, crossing shafts of light at the fullest bridge, and stillness on a lit seafloor",
    phases: [
      P("threshold", 0, 0.125, 0.53, "threshold", "0:00-0:20 Pedal-Tone Invocation (settling onto Bb over a held pedal, leaning toward Ebmaj9)", [
        S("sparse", "DARK BACKGROUND — a single drop of pale teal light falling toward a black mirror of still water in the lower left of vast darkness, one faint luminous ring already waiting where it will land, nearly the entire frame empty"),
        S("micro", "extreme macro — the drop meeting the surface, its crown of light suspended at millimeter scale, rings of pale teal and warm amber widening outward, impossible stillness between them"),
        S("aerial", "looking straight down at dark still water filling the frame edge to edge, one slow luminous ring spreading in the lower left, a faint honey-gold warmth seeping into it from one side, the camera drifting down toward it"),
      ]),
      P("expansion", 0.125, 0.276, 0.96, "illumination", "0:20-0:44 First Swell (melodic leaps climbing to the luminous Bbmaj7 peak at 0:36, then softening onto Eb/G)", [
        S("cosmic", "cosmic — beneath the surface the drifting silt becomes a slow nebula of teal and gold light turning through tilted shafts of warm radiance, spiral arms loosening as they glow, the camera sinking gently through it"),
        S("micro", "macro — one bubble of light wobbling upward at closest range, amber shafts bending through its translucent skin, its path relaxing from struggle into drift"),
        S("aerial", "from high above at the first crest, a broad band of warm gold light spreading slowly across a dark expanse of luminous water that fills the frame edge to edge, rings of teal widening into it"),
      ]),
      P("transcendence", 0.276, 0.483, 0.8, "integration", "0:44-1:17 Dominant Bridge (F9, F/A, C11 searching without arriving; a long-held F/A like an unspoken question) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small mote of pale teal light hanging alone in the upper right of immense darkness, a faint thread of amber trailing beneath it like an unspoken question, nearly the entire frame empty"),
        S("abstract", "abstract — slow patches of filtered light shifting across deep moss-green darkness, soft-edged pools of teal and honey drifting and fading as if beneath a high canopy, weightless, searching without arriving"),
        S("micro", "extreme macro — a single droplet of light descending through darkening water, a soft teal spark welcomed downward by the deep, fine particles glowing around it in shallow focus"),
      ], { sparse: true }),
      P("illumination", 0.483, 0.634, 0.88, "expansion", "1:17-1:41 Theme Returns (the same words with deeper certainty, peak at 1:36)", [
        S("aerial", "looking straight down from great height at a dark delta dissolving into a luminous ocean, fresh and salt water interleaving in vast glowing turquoise fractals, fuller honey-gold light lying on every branch, the camera gliding along"),
        S("interior", "beneath the surface at the mixing line, two clarities of light folding into one another in slow marbled veils, teal into deep blue, translucent, every boundary softening"),
        S("micro", "macro — one branch of the delta at closest range, a dark thread of water releasing into glowing turquoise particles, each grain of light letting go of the next"),
      ]),
      P("return", 0.634, 0.765, 1, "transcendence", "1:41-2:02 Fullest Bridge (the inward question at full voice, the most sustained intensity; a fleeting Ebm/Gb at 2:00)", [
        S("cosmic", "cosmic — suspended in the boundless deep, colossal shafts of light crossing at slow angles through infinite teal darkness, motes glittering along every beam, the whole deep glowing like a nebula, the camera drifting through"),
        S("abstract", "abstract — between the crossing shafts, the lit water half-gathers into a drifting presence made only of light, translucent and featureless, carried without resisting, dissolving through each beam it meets"),
        S("micro", "macro — a single mote drifting along a beam at closest range, flaring as it enters the light and dimming as it leaves, a fleeting rose shadow passing over it"),
      ]),
      P("integration", 0.765, 1, 0.37, "integration", "2:02-2:39 Open-Fifth Release (the familiar harmonies once more, thinning; a bare Bb fifth held seven seconds)", [
        S("aerial", "looking straight down at a dark luminous seafloor of rippled sand in perfect rest, one soft distant shaft of blue-white light lying across it in the lower right, the camera slowly settling"),
        S("cosmic", "cosmic — the deep from far above at night, one pale shaft of light standing in it like a quiet flame, glowing particles drifting outward like a faint star field, stillness to every edge"),
        S("sparse", "DARK BACKGROUND — a single drop of pale teal light resting on black still water in the lower left of vast darkness, one faint luminous ring around it, the bookend of the first drop, let go"),
      ]),
    ],
    morphs: [
      "the rings widen and the camera sinks beneath the surface into slowly turning silt lit teal and gold",
      "the band of gold thins and the camera settles close on one small mote of teal light alone in the dark",
      "the falling spark slows and the camera rises far above as a dark delta dissolves into a luminous sea",
      "the marbled veils part and the camera drifts into the deep where colossal shafts of light cross",
      "the beams soften and the camera descends to rest above a rippled seafloor under one distant shaft of light",
    ],
  },
  {
    id: "f24cc5d9-66cd-4fae-a03a-14dda1698566",
    name: "Openings",
    world: "Eb major with no dominant at all — plagal IV–I rocking over a Bb pedal, sus2 and open fifths, swelling to a warm tonic plateau at 0:49, the opening cell returning slowly at 1:10, a Lydian #11 flare of silver-gold at 1:50, and a bare fifth left unsealed — openings as light escaping dark stone: one hairline seam, a slot of rust-and-violet ribbons, a geode blazing amethyst and citrine, a vein-map breathing, and the seam at galactic scale",
    phases: [
      P("threshold", 0, 0.145, 0.37, "threshold", "0:00-0:18 Open Fifths Awakening (a bare Ab fifth, a hesitant IV–I rocking with no thirds, a seam being tested)", [
        S("sparse", "DARK BACKGROUND — a single hairline seam glowing warm amber in a dark stone surface in the lower right of vast darkness, light escaping along its length like a breath being tested, nearly the entire frame black"),
        S("micro", "extreme macro — pressed close to the seam, a sliver of the world inside visible through it, a warm cavern of honey-gold air beyond the cold stone, fine particles of light drifting out through the gap"),
        S("aerial", "from high above, a dark plateau at night filling the frame edge to edge, a few faint seams of amber light opening across it one by one, the camera drifting down toward the brightest"),
      ]),
      P("expansion", 0.145, 0.394, 0.87, "expansion", "0:18-0:49 Gathering Tide (the cell gathers momentum, texture thickens at 0:22, Fm11 shadows pass at 0:27, a new Abmaj9 ↔ Cm7/Bb sway at 0:39)", [
        S("interior", "inside the widening seam, sweeping rock sculpted into flowing ribbons of rust and violet glowing from within, warm dust rising toward a bright jagged ribbon of luminous light far above, the camera gliding forward through it"),
        S("abstract", "abstract — a long shallow tide of amber light rolling across darkness in slow swells, each surge reaching a little further toward the right edge of the frame, violet shadow folding back between them, translucent"),
        S("micro", "macro — the strata of dark stone at closest range, rust and violet bands flowing like wood grain, one thin band glowing warmer than stone should, pale gold particles seeping out of it"),
      ]),
      P("transcendence", 0.394, 0.563, 1, "transcendence", "0:49-1:10 Tonic Plateau (a shimmering Ebmaj7 over the Bb pedal, the sway enriched to Abmaj13 — fully arrived inside a warm bright space)", [
        S("cosmic", "cosmic — a colossal geode split open across the diagonal and floating in infinite darkness, its dark shell peeling back from blazing amethyst and citrine chambers, prismatic shafts of light erupting outward like a newborn nebula, the camera pulling back"),
        S("interior", "inside the geode's largest chamber, violet and honey-gold radiance bouncing between faceted planes at every angle, glittering mineral dust falling slowly as weather of light, warm and fully arrived"),
        S("micro", "macro — one amethyst facet at closest range, citrine light bending through its violet planes into prismatic bands, motes turning in broad steady beams"),
      ]),
      P("illumination", 0.563, 0.732, 0.87, "integration", "1:10-1:31 Return of the Cell (the opening cell returns more slowly and spaciously, a reflective look back) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small seam of warm gold light glowing alone in the upper left of immense darkness, a few motes drifting slowly out of it, nearly the entire frame empty, the opening cell remembered"),
        S("aerial", "looking straight down from great height at a dark ground netted with faint glowing fissures, a luminous vein-map of amber and violet, every crack breathing gently brighter then dimmer, the camera hovering"),
        S("micro", "extreme macro — warm air rising visibly out of one glowing crack, gold dust motes climbing lit into violet darkness at closest range, slow and spacious"),
      ], { sparse: true }),
      P("return", 0.732, 0.868, 0.69, "illumination", "1:31-1:48 Lydian Lift (the sway pressed once more, reaching upward into Abmaj9#11)", [
        S("abstract", "abstract — slow sways of light rocking between amber and violet, a curved veil of pale gold opening wider with each swing, prismatic edges dissolving into darkness, the camera rising through the widening gap"),
        S("aerial", "from high above, a slow veil of pale gold light drifting across a dark plateau, half-gathered into a soft presence made only of light, translucent and featureless, holding a moment before thinning into the violet air"),
        S("micro", "macro — the edge of one seam at closest range, its light shifting from honey to clear silver, fine particles lifting upward out of it, weightless"),
      ]),
      P("integration", 0.868, 1, 0.69, "integration", "1:48-2:04 Lydian Lift, Open Close (the climax at 1:50 is light more than force; root Eb at 1:55, then an open Eb fifth mirroring the opening)", [
        S("cosmic", "cosmic — the seam motif at galactic scale, a dark nebula splitting open along one luminous diagonal, clear silver-gold light escaping into infinite space, the brightest instant, the camera drawn toward it"),
        S("sparse", "DARK BACKGROUND — a single hairline seam of quiet amber light in dark stone in the lower right of vast darkness, the first opening again, its glow softened, left unsealed"),
        S("micro", "extreme macro — the last warm thread of light inside the seam, tiny particles of gold drifting out of it and fading into blue darkness"),
      ]),
    ],
    morphs: [
      "the camera descends toward the brightest seam and glides inside it between ribbons of glowing rust and violet",
      "the glowing strata split along the diagonal and the camera pulls back as a colossal geode blazes open",
      "the prismatic beams withdraw and the camera settles close on one small seam of gold light in the dark",
      "the warm motes climb and the camera rises with them into slow swaying veils of amber and violet",
      "the silver light at the seam's edge widens until the camera is drawn into a nebula splitting along a luminous seam",
    ],
  },
  {
    id: "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3",
    name: "Surrounded By Light",
    world: "Eb major hymn rocking I–IV over a Bb pedal so home floats as a 6/4, swelling in waves (1:30, 2:25, 2:54) with a rose Cm/Fm shading, a sudden quieting at 1:32, a loud yet weightless Lydian plateau — the moment of being fully surrounded — and a root-position Eb at last: one prismatic beam on black, spectral light swaying through a prism, a fan of rays at the first swell, a silver edge in the regathering, a horizonless expanse of luminous vapor glowing from within at the crest, and one thread of kept light",
    phases: [
      P("threshold", 0, 0.109, 0.37, "threshold", "0:00-0:27 First Light (a hushed invocation, the tonic floating as Eb/Bb, Abmaj9 and Fm11 touched — first light on water)", [
        S("sparse", "DARK BACKGROUND — a single thin prismatic beam crossing black space low in the lower right, splitting into faint spectral bands of pale gold and rose that dissolve before the far edge, nearly the entire frame empty"),
        S("micro", "extreme macro — dust igniting into tiny rainbow sparks only inside the beam at closest range, each speck a brief colored star, absolute dark a hair outside the light"),
        S("aerial", "from high above, a dark mirror of still water under luminous mist filling the frame edge to edge, the beam's faint spectrum laid across the drifting haze like a first band of dawn, the camera descending slowly toward it"),
      ]),
      P("expansion", 0.109, 0.254, 0.5, "expansion", "0:27-1:03 Rocking Pillars (contented two-bar rocking between Eb and a richly coloured Ab, the most purely major stretch, ending on IV)", [
        S("interior", "inside a vast prism of light, a soft white glow entering and parting into slow rivers of color along its internal planes, honey and cyan rocking gently back and forth, translucent and calm"),
        S("abstract", "abstract — tall swaying beams of honey-gold light leaning slowly left then right across darkness on an eight-second breath, their edges fringed with faint spectral color, weightless"),
        S("micro", "macro — the far edge of the prism at closest range, one spectral ribbon pouring out into darkness as a slow cascade of separated color, rose peeling from violet as it falls"),
      ]),
      P("transcendence", 0.254, 0.371, 0.74, "illumination", "1:03-1:32 First Swell (the bass deepens to Eb2, the tonic opens into Eb5/Ebsus2, cresting at 1:30 with hopeful longing)", [
        S("aerial", "from high above, a widening fan of prismatic rays breaking through a dark bank of luminous vapor and spilling across the frame in bands of gold, rose and cyan, the camera rising with the swell"),
        S("interior", "flying within the fan of rays, spectral light sweeping past on every side, crossing points flaring white as they pass, the light breathing wider and narrower with the rocking"),
        S("micro", "extreme macro — a single crossing point of two rays at closest range, a bloom of white light opening where the colors agree, tiny spectral particles spinning outward from it"),
      ]),
      P("illumination", 0.371, 0.54, 0.62, "integration", "1:32-2:14 Gathered Breath (a sudden quieting, a reflective regathering, Cm7/Bb's gentle shadow, the first Lydian Abmaj9#11 at 2:06) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small silver edge of light glowing alone along the rim of a dark veil of vapor in the upper left of immense darkness, a few rose motes drifting from it, nearly the entire frame empty"),
        S("abstract", "abstract — horizontal strata of faint prismatic haze lying in slow shelves across black, rose and cyan and gold dimmed and breathing, one band growing quietly brighter, translucent"),
        S("micro", "extreme macro — a single drop of light hanging inside dark haze, a glint of clear Lydian silver catching on its edge, a brighter world folded inside it in miniature"),
      ], { sparse: true }),
      P("return", 0.54, 0.863, 0.98, "transcendence", "2:14-3:34 Shadowed Radiance (the full outpouring, bittersweet Cm7/Bb and Fm11, F11 → C7#9 at 2:44, climax 2:54) → Suspended Glow (Absus2 and Lydian colour, loud yet weightless — fully surrounded)", [
        S("cosmic", "cosmic — surrounded by light on every side, an endless horizonless expanse of luminous vapor glowing white and rose from within, diffuse brilliance in every direction, a vast slow spiral of spectral color turning through it, the camera suspended inside"),
        S("abstract", "abstract — crossing wave-fields of rose and amber color pulsing where they agree and going dark where they cancel, and at one bright meeting point the radiance half-gathers into a presence made only of light, translucent and featureless, dissolving into spectra"),
        S("aerial", "looking straight down at spectral caustic nets of rose, amber and gold sweeping across a dark ground that fills the frame edge to edge, interference patterns drifting and crossing at vast scale like stained light pouring through haze"),
      ]),
      P("integration", 0.863, 1, 0.41, "integration", "3:34-4:08 Homeward Dusk (the light recedes, the rocking I–IV returns softly, the tonic rests on a root-position Eb as the sound fades)", [
        S("micro", "extreme macro — a single thread of light on black velvet, thin as wire, every color of the journey alive inside its length, one warm amber bloom where it bends"),
        S("cosmic", "cosmic — from immense height the luminous expanse folding away into deep dusk blue, its last amber glow narrowing to one faint line across infinite darkness, a quiet star field gathering around it, the camera slowly descending"),
        S("sparse", "DARK BACKGROUND — a single thin thread of warm amber light resting low in the lower right of vast darkness, at rest at last, the bookend of the first prismatic beam"),
      ]),
    ],
    morphs: [
      "the camera descends into the band of spectral haze and passes inside a vast prism of slow color",
      "the cascade of color widens and the camera rises as a fan of prismatic rays breaks through dark vapor",
      "the white bloom fades and the camera settles close on one small silver edge of light in the dark",
      "the quiet strata brighten together until the camera is suspended in a horizonless expanse of glowing light",
      "the caustic nets gather inward and the camera comes close on a single thread of light on black velvet",
    ],
  },
  {
    id: "8b163c8b-cda5-4d7d-995b-41dd68fdd059",
    name: "Drift",
    world: "F major rocking I–IV–Vsus over an F pedal, the tempo creeping 72 → 84 in one patient arch, a Mixolydian Eb shadow at 2:00, full bloom on FMadd9 at 2:58, an abrupt fall to hollow fifths at 3:10 and an unresolved F/G/A shimmer — drift as luminous sand and haze sliding in one direction: a single stream of light-grains over a dune crest, swaying bands, silver sheets gliding over tidal sand, veils lifting, the boundless sliding bands at the bloom, and one still ripple",
    phases: [
      P("threshold", 0, 0.112, 0.42, "threshold", "0:00-0:26 Settling Pedal (a quiet F pedal finding its FMadd9 / Bbmaj9 / C13sus4 sway)", [
        S("sparse", "DARK BACKGROUND — a single thin stream of luminous pale-gold particles sliding across the crest of a dark dune in the lower right of vast darkness, faint mist trailing from it, the rest of the frame open black"),
        S("micro", "extreme macro — sand grains streaming sideways over the crest in laminar flow at closest range, each grain a tiny glowing particle of warm light, rocking gently with the breeze, deep slate darkness behind"),
        S("aerial", "looking straight down at a dark ripple-field of sand filling the frame edge to edge, faint lines of pearl light lying along each crest, the camera slowly descending as a soft luminous sway passes across them"),
      ]),
      P("expansion", 0.112, 0.228, 0.59, "expansion", "0:26-0:53 Gathering Sway (the cycle gathers momentum and warmth, Bb chords lingering with a first touch of longing)", [
        S("abstract", "abstract — slow bands of luminous sand-haze sliding across the frame in one direction, each band swaying a little and bending in unison, pale gold and soft sky blue, translucent and weightless"),
        S("aerial", "from directly above, endless dunes filling the frame, ridgelines migrating slowly with warm reflected light along their crests, streams of glowing particles braiding between shadowed troughs, the camera gliding along"),
        S("micro", "macro — the sheltered slope of one dune at closest range, a fine avalanche of light-grains slipping downward in a slow pendulum rhythm, amber glints flaring as they tumble"),
      ]),
      P("transcendence", 0.228, 0.362, 0.8, "illumination", "0:53-1:24 Suspended Glow (long C13sus4 and C11 suspensions over the tonic, a glowing ache that never quite resolves)", [
        S("aerial", "looking straight down at thin sheets of silver-gold luminous water gliding across dark tidal sand that fills the frame, wet ripples emerging and dissolving, thick golden side-light lying over everything, the camera drifting with the flow"),
        S("interior", "within the warm haze above the sand, suspended motes of honey light hanging almost motionless, a soft glowing ache held without resolving, slow drifting veils passing close on every side"),
        S("micro", "extreme macro — a single droplet of silver light resting between two sand grains, holding a curved reflection of the whole golden haze, impossible stillness"),
      ]),
      P("illumination", 0.362, 0.512, 0.88, "illumination", "1:24-1:59 Brightening Ascent (the brightest stretch, the melody rising to C6, F/A freshening the cadences into open-hearted lift)", [
        S("aerial", "rising high above layered veils of pale luminous fog sliding over black water, thin streaks of light combed across the dark in slow parallel lines, everything brightening and lifting, the camera soaring upward"),
        S("abstract", "abstract — long parallel ribbons of pearl and pale gold light streaming diagonally upward across darkness, and among them a soft plume half-gathers into a presence made only of light, translucent and featureless, drifting upward with them"),
        S("micro", "macro — the edge of one fog veil at closest range, countless suspended droplets glowing pearl and soft blue, drifting apart as the light rises through them"),
      ]),
      P("return", 0.512, 0.814, 0.98, "transcendence", "1:59-3:09 Mixolydian Shadow (the bass sinks to Eb, bVII and bare fifths, louder yet less certain) → Full Bloom (Gm9/F → C13sus4/F, ringing FMadd9 at 2:57-3:00)", [
        S("cosmic", "cosmic — the boundless sliding bands seen from immense height, alternating streams of luminous sand-veil and indigo haze crossing infinite darkness like the arms of a slow galaxy, full gold bloom flooding along them, the camera pulling back"),
        S("abstract", "abstract — a vast slate-grey veil of haze sliding across bands of gold light, long shadows racing over them, the glow pressing through from beneath, louder yet uncertain, translucent edges dissolving"),
        S("aerial", "from high above at full bloom, gold light cresting a dark ridge of dunes and flooding the whole wide expanse at once, mist burning off in luminous plumes that fill the frame edge to edge"),
      ]),
      P("integration", 0.814, 1, 0.37, "integration", "3:09-3:52 Dissolving Echo (the sound falls away abruptly to hollow fifths, the opening sway echoed, a D-major flicker at 3:23, ending on a soft F/G/A cluster) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small point of pale gold light coming to rest on a single dark ripple of sand in the lower left of immense darkness, nearly the entire frame empty"),
        S("micro", "extreme macro — the crest of that ripple at closest range, wet sand turned to glass, the last rose-tinted dusk light lying along it in a faint luminous line, flattening into stillness"),
        S("cosmic", "cosmic — from far above the dark expanse dissolving into soft dusk blue, a faint scatter of light-particles drifting like a quiet star field, settled yet suspended, still drifting"),
      ], { sparse: true }),
    ],
    morphs: [
      "the camera descends toward the lit ripples until the bands of sand-haze slide past in one direction",
      "the falling light-grains glint and the camera rises over tidal sand where silver sheets of light glide",
      "the reflection in the droplet brightens and the camera soars up through layered veils of luminous fog",
      "the droplets part and the camera keeps rising until the sliding bands cross infinite darkness like a galaxy",
      "the bloom falls away and the camera drops close to one small point of light resting on a dark ripple",
    ],
  },
  {
    id: "89ff944d-f242-4f77-9b95-7cb1d3dc0af6",
    name: "Self",
    world: "Bb major almost never leaving its home chord — the self heard through changing colour, not changing harmony: a bare Bb/F fifth taking on add9/maj9/maj13, G-minor shading to a peak at 1:35-1:43 answered by an open fifth, a high D6 glint and one Eb at 2:26, a 4-second Bbmaj9 of acceptance at 3:15, and the bare fifth it began with — self-similarity as light: a peak fused with its reflection, ferns repeating at every scale, a fractal canyon, the shared logarithmic spiral, a mist-ribbon moving with its double, and one dewdrop holding everything",
    phases: [
      P("threshold", 0, 0.153, 0.61, "threshold", "0:00-0:35 Open Fifth Awakening (a bare Bb fifth slowly taking on add9, maj9 and maj13 colour, a self coming into view)", [
        S("sparse", "DARK BACKGROUND — a single small diamond of faint teal light floating in the lower right of vast darkness, a mountain peak and its reflection fused into one symmetric luminous form, nearly the entire frame empty"),
        S("micro", "extreme macro — the seam where the form meets its reflection at closest range, stone glinting against its inverted twin along a join thinner than a hair, teal and amber light bleeding along it"),
        S("cosmic", "cosmic — pulling back to reveal a dark space hung with luminous mirror-diamonds at different depths, each a peak fused with its own reflection, a quiet gallery of selves drifting in infinite darkness"),
      ]),
      P("expansion", 0.153, 0.31, 0.92, "expansion", "0:35-1:11 Unfolding Major Sevenths (voicings rising into the middle register, filling with major-seventh warmth; one leading-tone rub at 0:53)", [
        S("aerial", "from high above, a dark slope of unfurling ferns filling the frame edge to edge, every frond a copy of the same luminous curve at its own size, honey-gold light warming them one after another, the camera descending"),
        S("micro", "extreme macro — a fern frond unfurling against dark glass, each branch sprouting smaller identical branches at every scale, gold backlight glowing on the newest tips, fractal and translucent"),
        S("abstract", "abstract — the frond's curve repeated in light at a dozen scales, nested spirals of teal and warm amber layered through darkness, each one opening into the next, weightless"),
      ]),
      P("transcendence", 0.31, 0.484, 1, "transcendence", "1:11-1:51 Relative Shadow, Peak (G-minor shading over the Bb bass, rocking suspended dominants building to the peak at 1:35-1:43, answered by an emphatic open fifth)", [
        S("cosmic", "cosmic — a fractal canyon seen from immense height, coastlines within coastlines within coastlines glowing amber at every magnitude across a dark ground that fills the frame, a passing shadow of dusky rose sliding over it, the camera rising"),
        S("interior", "inside the canyon, terraced teal-grey stone repeating below exactly as above, warm amber light arriving from both directions at once, vertigo rendered serene, the camera descending through endless smaller canyons"),
        S("micro", "macro — one terrace edge at closest range, its rim carved into the same tiny canyon pattern again, a single bead of amber light sitting in the smallest fold, impossible depth beneath it"),
      ]),
      P("illumination", 0.484, 0.628, 0.89, "illumination", "1:51-2:24 Fifths Reassert (the pace quickens to 71 BPM while the harmony keeps returning to bare fifths — the current quicker, the bed constant)", [
        S("aerial", "looking straight down at a dark branching delta of luminous line-work where nautilus spiral, fern coil and winding channels ghost through one another, the shared curve flaring gold where they agree, the camera gliding along"),
        S("abstract", "abstract — one golden logarithmic spiral drawn in light on darkness, growing without changing, the self's signature placed low in the left third, fine particles tracing the curve outward"),
        S("micro", "macro — a nautilus fragment on dark sand at closest range, its spiral chambers catching teal light, a fern-shaped shadow falling across it along the identical curve, translucent"),
      ]),
      P("return", 0.628, 0.899, 0.94, "integration", "2:24-3:26 High Bells, E-flat Glimpse (the line climbs to D6, one Eb at 2:26, a look upward and outward) → Suspended Plateau (Cm11 and C7sus4 over Bb dissolving into a 4-second Bbmaj9 at 3:15, acceptance) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small cold glint of frost-white light appearing high in the upper left of immense darkness, a second fainter glint below it, nearly the entire frame empty"),
        S("interior", "within the dark above a still mirror, a slow ribbon of pale luminous mist half-gathers into a presence made only of light, translucent and featureless, its reflection moving in perfect unison beneath, two that are one"),
        S("micro", "extreme macro — warm dust motes hanging motionless in a shaft of late amber light at closest range, each mote a tiny sphere of honey glow, the stillness of acceptance"),
      ], { sparse: true }),
      P("integration", 0.899, 1, 0.37, "integration", "3:26-3:49 Bare Fifth Homecoming (withdrawing to the bare Bb fifth it began with, ending on Bb5/F without the third)", [
        S("cosmic", "cosmic — from immense height the mirror world folding into infinite darkness beneath frost-lit stars, one ember-red point of light glowing in the lower right, the self in its simplest form"),
        S("micro", "extreme macro — one dewdrop on black moss holding the whole luminous mirror world curved inside its sphere, a single ember of gold light alive at its heart"),
        S("sparse", "DARK BACKGROUND — a single small point of ember light resting in the lower right of vast darkness, the bookend of the first diamond of light, complete and still open"),
      ]),
    ],
    morphs: [
      "the gallery of mirrored forms drifts apart and the camera descends over a dark slope of unfurling luminous ferns",
      "the nested spirals widen and the camera rises far above until they become a fractal canyon glowing amber",
      "the smallest fold of light opens and the camera glides above a delta of luminous line-work",
      "the spiral on the nautilus dims and the camera settles close on one small cold glint of light in the dark",
      "the hanging motes drift apart and the camera rises until the mirror world folds into infinite darkness",
    ],
  },
];
