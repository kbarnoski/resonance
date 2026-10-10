// Batch 2, part c1B — Journey Archetype shot lists (2026-10-10) for two of
// the featured built-in journeys: The Ascension (the-ascension, 17th St 63)
// and The Bloom (the-bloom, Folsom St 9). Same format as
// expansion-sample.mjs / rise-above-B.mjs (no shaders/opacity — added at
// cast time).
//
// Phase ids/bounds/intensities are the built-ins' current ones; `music`
// names the deep-analysis sections each phase holds. Each keeps its
// built-in identity (Ascension: gold seed → amber membranes → sea of golden
// light → golden geometry → amber petals → a kept glow; Bloom: seed pod →
// fern coil → luminous vessels → floating meadow → dandelion → dew-lit bud)
// transfigured per law L, with no figures/presences (the old "spirit-hint"
// shots are gone).
// Sparse valleys: Ascension = Plagal Settling / Low Remembering (2:03-2:55,
// arousal 0.40-0.42, the lowest interior stretch); Bloom = Relative-Minor
// Turn / Widening Circle (0:23-1:13, arousal 0.38-0.45, the quietest
// interior music before the first great wave).

export const SET = { key: "b2-c1B", presenting: "the featured journeys" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "the-ascension",
    name: "The Ascension",
    world: "F major free-time reverie on a held F/C floor, Bbmaj9 and C11 shimmering over the pedal, slipping a semitone down into a brighter, one-shade-too-bright Lydian E major at 0:34, coming back warmer at 1:08, the Bb summit at 1:38 spilling into chromatic longing, then plagal settling, a low last glimpse of E at 2:29 and a bare F open fifth — a rise through golden light, remembered: one seed of gold light waking in the dark, the climb through amber membranes into a rose-gold sky, a sea of radiant golden mist, golden geometry blazing at the summit, petals of amber light settling like dust in a beam, and one small glow kept in the dark",
    phases: [
      P("threshold", 0, 0.12, 0.75, "threshold", "0:00-0:24 Pedal Hymn in F (held F2/C3 floor, Bbmaj9/F and C11/F rocking, a C minor shadow at 0:19)", [
        S("sparse", "DARK BACKGROUND — a single seed of golden light cracking open in the lower left of vast darkness, thin filaments of warm honey light reaching upward out of the split, a faint haze of gold dust lifting off it, nearly the entire frame empty"),
        S("micro", "extreme macro — inside the seed's split at closest range, translucent amber walls glowing like warm resin, single grains of gold dust rising slowly through a thin shaft of light, a gentle rocking shimmer passing across them"),
        S("aerial", "looking straight down on a dark plain of soft umber haze filling the frame edge to edge, one small gold glow waking in the lower right, its first thread of light rising toward the camera, a slow slate shadow drifting across it"),
      ]),
      P("expansion", 0.12, 0.299, 0.97, "expansion", "0:24-1:00 E-Major Window (the C minor opens into Bb; at 0:34 the floor drops a half-step into a brighter Lydian E — I–IV warmth, one shade too bright to be real)", [
        S("interior", "inside a vertical ascent through layered golden strata, rivers of luminous particles streaming straight upward past translucent amber membranes stacked sky above sky, the camera rising with the current as the next layer glows rose-gold, one shade too bright"),
        S("micro", "macro — one gold particle of the climb at closest range, its facets flashing amber below and rose-gold above as it spins in the updraft, a soft shift of colour sliding across its surface"),
        S("abstract", "abstract — a sideways slip of the whole light: two broad bands of honey amber and brighter rose-gold sliding past each other across darkness, the lower band dropping half a step as the upper one blooms, fine particles shed along the seam"),
      ]),
      P("transcendence", 0.299, 0.494, 0.75, "illumination", "1:00-1:39 Return Home (B7b9 slides onto F at 1:08; the opening hymn returns in deeper colours, F6add9, Bbmaj13, a held F5 at 1:28; the C minor swell from 1:34)", [
        S("aerial", "from high above a boundless sea of radiant golden mist, luminous vapour rolling in slow immense swells to every edge of the frame, deep wells opening where shafts of white-gold light pour down into amber depth, the camera drifting slowly over the crests"),
        S("micro", "extreme macro — motes of gold light suspended in one warm beam at closest range, each mote a tiny translucent sphere holding a reflection of the golden sea, turning weightless in still air, deep umber shadow filling the left side"),
        S("cosmic", "cosmic — the golden sea seen from immense height as a slow spiral of honey and rose light breathing in infinite darkness, a cool band of slate-blue swelling at its rim before the summit, the camera rising away"),
      ]),
      P("illumination", 0.494, 0.614, 1, "transcendence", "1:39-2:03 Chromatic Summit (the broad Bb climax at 1:38–1:40 spilling over into E major, chromatic planing, the aching A7b9 at 1:56)", [
        S("abstract", "abstract — weightless within an immense lattice of pure golden light, colossal ribs of radiant gold geometry curving in fibonacci spirals above and below, white brilliance blazing in the upper right, the light fracturing into shifting rose and violet colour along every curve"),
        S("cosmic", "cosmic — the golden geometry seen from far outside, a radiant fibonacci bloom of gold light hanging in the upper left of infinite dark space, its light pouring out through its own curves in long still rays, chromatic fringes of rose and violet planing across it"),
        S("micro", "macro — one rib of the golden lattice at closest range, light flowing inside it like warm sap, its edge fraying into prismatic motes of rose and violet, an aching held brightness, deep shadow below"),
      ]),
      P("return", 0.614, 0.873, 0.66, "integration", "2:03-2:55 Plagal Settling (E7b9 resolves up into Fadd9 at 2:13; long sus4 and Bb/F suspensions) → Low Remembering (a darker, low visit to E at 2:29, folded back through Fdim at 2:47) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small petal of amber light settling slowly downward in the upper right of immense darkness, a few high specks of gold still turning in the air above it, nearly the entire frame empty"),
        S("micro", "extreme macro — that petal of light at closest range as it turns over, rose iridescence sweeping across its translucent surface, fine veins of gold glowing faintly, soft dark all around"),
        S("aerial", "looking straight down through drifting layers of warm amber lit mist, each translucent layer thinning into particles as the camera descends toward a dim rose-gold glow in the lower left, the brighter place now far and dusky"),
      ], { sparse: true }),
      P("integration", 0.873, 1, 0.37, "integration", "2:55-3:20 Open-Fifth Farewell (the hymn thins until only a bare F open fifth remains at 3:16 — remembered and quietly let go)", [
        S("micro", "extreme macro — a slow gold pulse at closest range inside soft darkness, the last motes of light settling into it like dust after a long day, a faint halo of concentric amber rings breathing around it"),
        S("cosmic", "cosmic — from very far away a single warm gold point in vast dark space among faint stars, the whole ascent folded inside it, the camera pulling back into stillness"),
        S("sparse", "DARK BACKGROUND — a single small seed of amber light resting closed in the lower left of vast darkness, a faint glow kept inside it, the bookend of the first gold seed, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the gold thread rises toward the camera and the camera follows it up into layered amber membranes streaming with light",
      "the bands of light slide apart and the camera rises through the last membrane until a sea of radiant golden mist spreads below",
      "the spiral of honey light tightens and the camera plunges into its centre as golden geometry blazes open on every side",
      "the rib of light dims and the camera pulls back until one small petal of amber light settles alone in the dark",
      "the rose-gold glow below gathers and the camera descends close onto one slow gold pulse resting in the dark",
    ],
  },
  {
    id: "the-bloom",
    name: "The Bloom",
    world: "G major slow-burning reverie orbiting a low G pedal, suspended C and Mixolydian F/G colours blurring into one resonant cloud: a hushed opening, an E-minor turn of longing at 0:23, the first great wave at 1:13, a high clearing of almost pure major light, the massive plagal summit at 2:40, a sudden E-flat shadow, and an unresolved open fifth — when the earth remembers warmth: a seed pod splitting with green-gold light, a fern coil unfurling slowly in the dark, a ring of luminous vessels swelling with sap-light, a floating island of blooms blazing at the summit, a dandelion's seeds sown like a constellation under a violet shadow, and one closed bud holding a prismatic dewdrop",
    phases: [
      P("threshold", 0, 0.107, 0.45, "threshold", "0:00-0:23 Opening Pedal (hushed, finding G through suspended C colours, soft bass hits marking the ground)", [
        S("sparse", "DARK BACKGROUND — a single seed pod of dark bark-like shell cracking open along fibonacci spiral lines in the lower right of deep brown-black void, a thin seam of green-gold light leaking out of the split, nearly the entire frame empty"),
        S("micro", "extreme macro — the pod's split edge at closest range, translucent fibers parting one by one, green-gold light flooding out across the dark shell, fine luminous pollen lifting off into the void"),
        S("aerial", "looking straight down into the opened pod as into a tiny luminous world, a miniature silver stream winding through moss-soft green light far below, a mist of pale silver particles drifting over it, the camera slowly descending"),
      ]),
      P("expansion", 0.107, 0.339, 0.58, "integration", "0:23-1:13 Relative-Minor Turn (Em, Esus2 — a first longing, answered by C–D7–G at 0:42) → Widening Circle (F69#11/G Mixolydian colour, Am9–D9–G at 1:01, a contented resting G) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small fiddlehead coil of muted sage-green light curled tight in the upper left of deep green-black void, translucent hairs along its spiral glowing faintly gold, nearly the entire frame empty"),
        S("abstract", "abstract — the slow unfurling as a fibonacci spiral of pale gold and fog-blue light opening across darkness, each turn a little wider than the last, a lifting veil of luminous mist thinning at its outer edge"),
        S("micro", "macro — one frond-tip at closest range caught mid-turn, its translucent surface glowing sage and soft gold, a bead of light held in the curl with a tiny misty spring world curved inside it"),
      ], { sparse: true }),
      P("transcendence", 0.339, 0.617, 0.8, "illumination", "1:13-2:13 Low Tide Swell (the first great wave — low dense G7sus4–C/G rocking, cresting 1:30–1:45, landing on a ringing G6) → High Clearing (upper register, almost pure major light over a gently stepping bass)", [
        S("cosmic", "cosmic — a vast cross-section of luminous vascular rings at impossible scale in deep black-green space, circular vessels of green-gold bioluminescent light arranged like a slow galaxy, a heavy swell of bronze light rolling through them, the camera rising through the dark"),
        S("interior", "inside a translucent green stem at closest range, streams of green-gold sap-light flowing upward in a low rocking surge, tiny rose-lit cells glowing as they pass, abstract and luminous"),
        S("aerial", "from high above, a slow tide of luminous gold light rolling across a dark expanse of opened fronds filling the frame edge to edge, a high clearing of pale silver-gold glowing in the upper right, translucent and weightless"),
      ]),
      P("illumination", 0.617, 0.785, 1, "transcendence", "2:13-2:49 Summit on G (a massive plagal affirmation on the G pedal, G5 and CMadd9/G ringing at full force at 2:40)", [
        S("cosmic", "cosmic — a floating island of blooming meadow seen from far out in deep space, its flowers made of light in gold, crimson and deep blue blazing together, a vast spiral of pollen-light streaming off it like a galaxy arm across infinite darkness, the camera soaring back"),
        S("micro", "extreme macro — inside one poppy of glowing red light at closest range, petal walls blazing translucent amber and crimson, pollen grains like luminous gold boulders on its curved floor, sparks of light lifting off them"),
        S("abstract", "abstract — the summit as resonance: concentric rings of gold and sage light pulsing outward across darkness from the lower left, layer over layer ringing at full force, fine luminous pollen caught in each band"),
      ]),
      P("return", 0.785, 0.896, 0.81, "return", "2:49-3:13 E-flat Shadow (a sudden borrowed E♭/G cloud over the triumph, then a long bare G5 and a hovering suspended C)", [
        S("micro", "macro — a dandelion seed-head of fine silver-white light in the right third of deep blue-black void, each pappus a perfect radial star of luminous filaments, a fast violet shadow sweeping across half of the sphere"),
        S("cosmic", "cosmic — the seeds drifting free across the dark like a new constellation being sown, the dim seed-head at one edge of the frame, a band of violet shade passing over them and gold light returning, the camera drifting after them"),
        S("micro", "extreme macro — a single seed-parachute at closest range, its silver filaments a radial star of light, a faint violet glow fading from its tip as warm bronze light returns, weightless"),
      ]),
      P("integration", 0.896, 1, 0.37, "integration", "3:13-3:35 Open-Fifth Farewell (sinking to the lowest G, a last G7, an unresolved open fifth — the question left gently open)", [
        S("sparse", "DARK BACKGROUND — a single thin stem of muted olive light with one closed bud at its tip in the lower left of absolute black void, a tiny dewdrop of prismatic light resting on the bud, nearly the entire frame empty"),
        S("micro", "extreme macro — the dewdrop on the bud tip at closest range, a tiny living spectrum inside it, the folded petals a soft green-rose spiral behind the translucent drop, amber dusk fading"),
        S("cosmic", "cosmic — the small bud seen from far away as one point of prismatic light in vast dark space among faint stars, the whole spring kept folded inside it, the camera slowly pulling back, left open"),
      ]),
    ],
    morphs: [
      "the camera descends into the opened pod and drifts out through its green-gold light toward one small fern coil alone in the dark",
      "the frond's bead of light swells and the camera passes through it into a vast ring of luminous vessels",
      "the tide of gold light brightens and the camera soars back until the whole floating island of blooms blazes in deep space",
      "the rings of light fade and the camera pulls close as one dandelion seed-head of silver light drifts into view",
      "the seed-parachute settles and the camera descends onto one closed bud holding a prismatic dewdrop in the dark",
    ],
  },
];
