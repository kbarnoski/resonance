// Batch 2, chunk c1A — March Light album — Journey Archetype shot lists
// (2026-10-10): Dad's Song II, Spectre, Surrounded By Light, Mexican Boy,
// Love Again.
// Modelled on the Karel-approved expansion-sample.mjs, welcome-home-title.mjs
// (hint, never literal) and rise-above-A/B (same format, minus
// shaders/opacity).
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones;
//    `music` names the deep-analysis sections each phase holds.
//  - Each journey keeps its identity (current shot motifs + palette),
//    TRANSFIGURED (made of light, particles, impossible stillness) per law
//    10a; one sparse phase at the music's real valley; March Light's spirit
//    energy (law 8) as one half-gathered almost-presence where it fits; no
//    humans, no animals, no houses/rooms/roads.
//  - Spectre has no interior valley (0.35 → 0.55 → 0.6 → 0.6 → 0.75 → 0.15):
//    its sparse phase is the coda, where the music drops ~23 dB.
//  - Morphs are camera moves between sparse luminous forms in open dark space.

export const SET = { key: "b2-c1A", presenting: "March Light" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "9d901645-b8dd-4a62-b3e2-2613ccd64335",
    name: "Dad's Song II",
    world: "C# major hymn over a held tonic pedal, plagal and almost dominant-free, a slow suspension resolving home every ~14 s like a refrain, a 6/4 bloom of pride and gratitude at 1:01, a bare-fifth breath at 1:12, a last rest on plain C# at 1:47 and a brief minor shadow in the dusk coda — honey-amber light in warm timber: a low shaft of gold with turning motes, the rings of a tree's years as the returning refrain, the rings become a galaxy at the crest, one curl of light on a still dark mirror, the glow draining to slate, and the shaft again, dimmer and blue at the end",
    phases: [
      P("threshold", 0, 0.157, 0.87, "threshold", "0:00-0:21 Homeward Refrain (bare open fifths clearing a space; the first C#sus4 → C#maj7(add11) homecoming at 0:18)", [
        S("sparse", "DARK BACKGROUND — a single thin shaft of low honey-amber light falling in the lower left of vast darkness, a few dust motes turning gold in its beam, one warm curl of light resting at its foot, nearly the entire frame empty"),
        S("micro", "extreme macro — warm wood grain at closest range transfigured into slow luminous currents of honey and ochre, a beam of light lying across them like a held chord, motes of gold settling into the channels, deep umber shadow beyond"),
        S("aerial", "looking straight down from high above on an immense plane of dark timber filling the frame edge to edge, its whorls winding like slow luminous rivers of amber in low afternoon light, one long diagonal beam lying across it, the camera beginning to descend"),
      ]),
      P("expansion", 0.157, 0.306, 0.87, "expansion", "0:21-0:41 Homeward Refrain (the phrase keeps ending on the same suspended homecoming, 0:32 and 0:40 — a familiar memory revisited)", [
        S("interior", "inside the rings of an ancient tree's years, concentric bands of honey and rose-gold light nested one within another like a hymn returning to its first note, the newest ring glowing brightest, the camera gliding slowly through them toward the warm heart"),
        S("micro", "macro — a bead of amber resin at closest range on dark timber, tiny bubbles of ancient air held weightless inside it, low golden light bending through and casting a small luminous halo onto the wood around it"),
        S("abstract", "abstract — slow refrains of warm light: the same soft curve of ivory and amber drawn again and again across darkness, each return a little brighter than the last, the curves settling into a gentle spiral that circles home in the upper right"),
      ]),
      P("transcendence", 0.306, 0.538, 1, "transcendence", "0:41-1:12 Full-Hearted Crest (major chords in full voice, the bass lifting to G#, the luminous 6/4 bloom at 1:01 — pride and gratitude more than triumph)", [
        S("cosmic", "cosmic — a vast spiral of honey-amber and rose-gold light wheeling slowly through infinite dark like the rings of an ancient tree become a galaxy, its warm core blooming wider at the crest, ivory haze drifting across its arms, the camera rising through"),
        S("aerial", "from high above, a wide dreamlike land of rolling amber ridges flooded with low golden light filling the frame edge to edge, every surface glowing honey-warm, long soft shadows all lying in one direction, surreal and utterly still"),
        S("abstract", "abstract — rings of warm light spreading outward from the lower right through dark air, each ring textured like timber whorls, overlapping in slow chords of ochre and rose-gold, a luminous bloom where they meet"),
      ]),
      P("illumination", 0.538, 0.687, 0.87, "integration", "1:12-1:32 Open-Fifth Breath (the music pauses on bare fifths, an inward breath, near-stillness 1:17-1:22, then gathers through F#maj9 / D#m11 over the pedal) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of luminous honey light resting on still black water in the upper right of vast darkness, a single long ripple of gold drawing slowly away from it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single drop of amber light at closest range suspended just above a dark mirror, its reflection gathering beneath it, the whole golden hour curved inside its translucent sphere"),
        S("aerial", "looking straight down on a wide dark mirror where reflected light slowly re-forms after a long ripple, broken bands of ochre and ivory drifting back together into one luminous shape, the camera hovering high above"),
      ], { sparse: true }),
      P("return", 0.687, 0.851, 0.85, "return", "1:32-1:54 Settled Homecoming (the cadence resolves for the last time, three full seconds of plain C# at 1:47, the A#m/C# tilt of the light at 1:52)", [
        S("intimate", "close — a soft pool of amber light resting on dark timber whorls, warm and unmoving like a held major chord, its edge beginning to tilt toward rose and slate, luminous dust hanging weightless above it, the camera drifting nearer"),
        S("aerial", "from high above, a broad dark land of rolling ridges holding the last of the light, warm glow draining slowly into slate blue along their crests, one long golden fold still lit in the lower left, dreamlike and calm"),
        S("micro", "macro — a single fleck of gold dust at closest range turning slowly in the last beam, its tiny facets catching ochre then rose then slate, deep shadow behind it, weightless"),
      ]),
      P("integration", 0.851, 1, 0.37, "integration", "1:54-2:14 Dusk Farewell Coda (sinking into the low register, the Mixolydian ache at 1:59, home at 2:02, the A#m7b5 / C#m shadow at 2:07, fading to near-silence)", [
        S("cosmic", "cosmic — the spiral of ring-light seen from immense distance, dimmed to a faint warm thread winding through deep slate-blue space, a few amber motes still turning at its heart, a brief violet shadow crossing it, the camera slowly pulling back"),
        S("sparse", "DARK BACKGROUND — a single thin shaft of honey light, dimmer now and tinged with slate blue, resting in the lower left of vast darkness, a few gold motes settling inside it, the bookend of the first light, nearly the entire frame empty"),
        S("micro", "extreme macro — one last mote of amber light at closest range drifting down into deep blue darkness, a tiny warm reflection of the whole afternoon held inside it, dissolving softly at its edges"),
      ]),
    ],
    morphs: [
      "the camera descends into the lit timber until the warm currents open into nested rings of honey light",
      "the spiral of returning light widens and the camera rises through it into a slow galaxy of amber rings in the dark",
      "the rings of light thin out and the camera settles low as one small curl of honey light rests on a still dark mirror",
      "the reflected light re-forms and the camera drifts closer to a soft pool of amber resting in the dark",
      "the last gold fleck turns and the camera pulls back until the ring-light hangs as a faint warm spiral in deep slate-blue space",
    ],
  },
  {
    id: "800ed3f9-08d4-4b73-8a32-86ed8370e752",
    name: "Spectre",
    world: "G major reverie on a diatonic loop that keeps leaning on the IV chord like a held breath, warm and 74 % major, haunted only at the edges — a chromatic shadow over a C pedal at 1:10, the fullest bloom at 2:02 left hanging on D7sus4, and a coda that drops ~23 dB onto an ambiguous smear — a warm familiar place visited by pale wisps of light: one wisp in morning dust, a slow luminous current, sheer veils of lit mist crossed by a cool shadow, the veils gathering into a half-present presence at the bloom, and a last violet wisp smearing into the dark",
    phases: [
      P("threshold", 0, 0.171, 0.62, "threshold", "0:00-0:28 Opening Glimmer (open leaping gestures over G, Bm7, Cadd9, Em, D; every phrase settling onto a long C — tender questioning)", [
        S("sparse", "DARK BACKGROUND — a single pale wisp of soft light drifting in the upper right of vast darkness, silver-blue at its edges and warm honey at its heart, a few dust motes glinting around it, nearly the entire frame empty"),
        S("micro", "extreme macro — dust motes at closest range hanging in a thin beam of pale morning gold, each mote a tiny luminous sphere with a faint violet rim, soft charcoal darkness beyond"),
        S("aerial", "looking straight down through layers of drifting morning mist lit pale gold from one side, faint silver wisps of light hovering at different depths within it like questions left open, the camera sinking slowly toward them"),
      ]),
      P("expansion", 0.171, 0.477, 0.79, "expansion", "0:28-1:18 Settling Current (a solid G grounds the loop, sus2/add9 warmth, the longest tonic hold at 0:57) → Shadow Passes (1:10-1:17 altered dominants crowd a fixed C bass, G#7b9 slides back home)", [
        S("interior", "inside a slow current of luminous mist flowing steadily past the camera, ribbons of pale aqua and honey light gliding at every depth, one faint wisp of silver keeping pace within it, translucent and weightless"),
        S("aerial", "from high above, a wide band of soft silver-grey light winding slowly across dark ground filling the frame edge to edge, glinting pale gold at its bends, one long violet shadow sweeping across it from the upper left"),
        S("micro", "macro — a sheer veil of lit mist at closest range, its fine translucent folds catching pale gold and lilac, a cool chromatic shadow passing across one corner and turning the light silver for a breath"),
      ]),
      P("transcendence", 0.477, 0.587, 0.83, "illumination", "1:18-1:36 Rekindled Light (relief — the IV chord blooms in maj9 and maj13, the melody reaching its highest note)", [
        S("aerial", "looking straight down on rolling layers of luminous haze as warm light breaks through them in slow widening waves, honey amber spreading further with each pass, pale silver wisps rising out of the glow, surreal and calm"),
        S("micro", "extreme macro — a single bead of mist at closest range catching the rekindled light, a tiny warm world of honey and lilac curved inside it, a pale wisp reflected crossing its surface"),
        S("abstract", "abstract — slow overlapping veils of honey and pale aqua light unfolding outward from the lower left in widening arcs, each pass brighter than the last, faint violet at their edges, weightless"),
      ]),
      P("illumination", 0.587, 0.697, 0.83, "expansion", "1:36-1:54 Rekindled Light (successive swells gathering toward the climax, the light spreading wider with each slow pass)", [
        S("interior", "inside drifting banks of luminous mist filling the frame, pale gold light pouring through them from below, slow silver wisps curling and dissolving into particles, abstract and weightless, the camera drifting through"),
        S("cosmic", "cosmic — countless pale wisps of light rising out of the dark into a slow star field, drawing together into a soft nebula of honey and lilac in the upper left, the camera rising with them"),
        S("micro", "macro — the hem of a veil of light at closest range where it touches a dark still surface, pale luminous streaks bleeding into it, small rings carrying the glow outward"),
      ]),
      P("return", 0.697, 0.826, 1, "transcendence", "1:54-2:15 Full Bloom (the theme at its fullest, cresting on D at 2:02, left hanging on D7sus4 at 2:14 instead of coming home)", [
        S("cosmic", "cosmic — a great bloom of warm light opening across infinite darkness, honey gold and pale aqua flooding outward in every direction at once, thousands of pale wisps wheeling through it like a galaxy breathing, one cool violet edge sliding across its side"),
        S("abstract", "abstract — the brightest veil of light half-gathering into a tall almost-presence, translucent and featureless, made only of pale gold and silver mist, dissolving at its edges as it drifts past, ancient and tender"),
        S("micro", "extreme macro — a single mote at the heart of the bloom at closest range, blazing pale gold, its edge beginning to soften as a faint lilac shade passes over it, suspended and unresolved"),
      ]),
      P("integration", 0.826, 1, 0.37, "integration", "2:15-2:44 Fading Apparition (sidestep to C, ~23 dB down into the low register; the D–Eb flicker, augmented tonic, borrowed Cm and F; dissolving on an ambiguous smear at 2:41) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single faint wisp of violet light hovering in the lower right of immense charcoal darkness, its edges smearing softly into the black, nearly the entire frame empty"),
        S("aerial", "looking straight down on a dark still surface at dusk, one last pale sheen of lilac light crossing it slowly and fading, a faint luminous reflection trembling beneath it, the camera slowly pulling back"),
        S("cosmic", "cosmic — the wisps seen from immense distance as a few dim pale points scattered through deep violet space, one flickering softly in the upper left, the bookend of the first glimmer, left open and unresolved"),
      ], { sparse: true }),
    ],
    morphs: [
      "the camera sinks through the lit mist and is carried into a slow current of luminous ribbons",
      "the cool shadow passes and the camera rises as the drifting veils part into widening waves of warm light",
      "the arcs of light gather and the camera pushes into a vast sheer veil glowing from behind",
      "the camera rises with the wisps as they draw together and bloom open into a great field of warm light",
      "the bloom softens and the camera pulls back until one faint violet wisp hovers alone in the dark",
    ],
  },
  {
    id: "f7b01537-af1b-4ade-b788-f21c6565b057",
    name: "Surrounded By Light",
    world: "Eb major pedal-washed meditation of add9, 6/9 and sus colours circling the tonic with almost no dominant pull, a first wave cresting on the relative minor at 1:45, a quiet interlude, a radiant but suspended summit at 2:54, a high silvery afterglow and a last swell at 4:05, fading onto an unresolved Bbsus — light arriving in waves around a dark clearing: one early ray in low mist, dew beads breathing, a rolling surge between dark trunks, a wheel of white fire on a web, the full crown of converging shafts at the summit, a warm current circling the hub, and the ray again, ember-dim and left hanging",
    phases: [
      P("threshold", 0, 0.277, 0.71, "threshold", "0:00-1:26 First Light (Eb rocking against Ab/Eb, the first full breath on Ebadd9 at 0:25) → Pedal Reflection (inward over an F pedal, Lydian Abmaj13#11 at 1:03, Bb7 falling to Cm7 at 1:25 — longing)", [
        S("sparse", "DARK BACKGROUND — a single thin early ray of pale champagne light touching a low drift of mist in the lower left of vast darkness, the mist glowing gold along one fine line, nearly the entire frame empty"),
        S("aerial", "from high above in the blue hour, a dark canopy filling the frame edge to edge with low luminous mist pooled between the crowns, one slow wave of pale gold passing across it and cooling to slate blue, the camera descending"),
        S("micro", "extreme macro — a dew bead at closest range on a dark strand, the first light breathing inside it in slow pulses of rose and champagne, slate-blue shadow wrapped around its lower edge"),
      ]),
      P("expansion", 0.277, 0.361, 0.92, "expansion", "1:26-1:52 First Swell (Ab–Eb–Bbsus surging to C minor, cresting at 1:45 — bright but aching)", [
        S("interior", "inside a surge of light sweeping between dark trunks, long bright shafts of amber gold rushing forward through glowing mist in one rolling wave, the camera carried along with it"),
        S("micro", "macro — a web strand at closest range igniting bead by bead as the wave of light reaches it, each dew bead flaring white-gold, a faint rose ache at the edge of the glow"),
        S("abstract", "abstract — a wheel of white fire hung in darkness, spokes of luminous dew radiating from a hub in the upper right, one arc burning brighter with a rose-tinted ache, the rest of the frame deep and dark"),
      ]),
      P("transcendence", 0.361, 0.503, 0.68, "integration", "1:52-2:36 Quiet Interlude (back to Ebadd9 and the opening's I–IV rocking, gathering breath) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small dew bead holding a soft warm glow in the upper right of immense darkness, hanging still on an unseen strand, nearly the entire frame empty"),
        S("aerial", "looking straight down on slow banks of luminous haze drifting low between dark crowns in late warm light, soft amber resting on their upper edges, the whole expanse breathing quietly, the camera hovering high above"),
        S("micro", "extreme macro — lichen frills on dark bark at closest range, each frill rim-lit gold by a resting beam, fine particles of light drifting past them in the still air"),
      ], { sparse: true }),
      P("illumination", 0.503, 0.587, 1, "transcendence", "2:36-3:02 Suspended Summit (a long Abadd9 rise into F7sus4 against Csus4/Eb at 2:54 — radiant, all-enveloping, still suspended)", [
        S("cosmic", "cosmic — a full crown of converging light shafts pouring in from every side across infinite darkness, champagne gold and rose blazing where they cross, glowing mist swirling through the spokes like a galaxy of light held open and unresolved, the camera rising through"),
        S("interior", "inside the crossing-point of the shafts, gold beams converging from all sides into a soft blinding core in the upper left third, slow luminous mist turning through the spokes, weightless"),
        S("aerial", "from directly above, a radiant wheel of crossed light set in a dark canopy filling the frame, its hub burning white-gold just off-centre in the lower right, spokes of luminous mist reaching outward"),
      ]),
      P("return", 0.587, 0.884, 0.87, "illumination", "3:02-4:34 High Shimmer (the summit replayed higher and lighter, settling on Eb6/9, Bb7 at 3:39 calling for one more ascent) → Second Ascent (the warmest arrival on Eb6/9 at 4:05, then receding)", [
        S("abstract", "abstract — a slow warm current of light circling the hub of the shafts with quiet intention, half-gathered into a soft almost-presence, translucent and featureless, ancient and gentle, dissolving at its edges into scattered silver"),
        S("micro", "extreme macro — dust motes at closest range orbiting in lit rings, a miniature solar system of gold specks turning in the crossed light, silver glints scattered between them"),
        S("aerial", "looking straight down at thin layers of high luminous haze glittering silver and gold after the summit, long low golden light sliding across them toward the lower right, the camera gliding slowly over"),
      ]),
      P("integration", 0.884, 1, 0.37, "integration", "4:34-5:10 Fading Glow (Eb6/9 and Cm11 blurring in the low register, fading onto an unresolved Bbsus4 at 5:06 — the light left hanging)", [
        S("micro", "macro — the web at dusk at closest range, its fire gone, one last dew bead holding a violet spark of the leaving light, deep indigo darkness beyond"),
        S("cosmic", "cosmic — the dark canopy from immense height under deep indigo space, the clearing faintly warmer than the dark around it, one soft ember glow left hanging in the air, the camera slowly pulling back"),
        S("sparse", "DARK BACKGROUND — a single thin ray of fading ember light resting along a low drift of mist in the lower left of vast indigo darkness, the bookend of the first light, left hanging, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends into a breathing dew bead and is swept forward with a rolling wave of light through the dark",
      "the wheel of white fire dims and the camera settles close on one small dew bead glowing alone in the dark",
      "the drifting particles of light gather and the camera rises through them into a crown of converging shafts",
      "the radiant wheel softens and the camera drifts into a slow warm current circling its hub",
      "the high shimmer lowers and the camera descends to the web at dusk, one last violet spark held in a bead",
    ],
  },
  {
    id: "a985d483-a948-4e3b-bad3-841a68f9992f",
    name: "Mexican Boy",
    world: "Eb major six-minute meditation where nearly every chord sits over a low Eb pedal — home always audible in the bass — warming from songful extended major into a bluesy Ab7 sway, a white-gold Dominant Blaze at 2:30, an inward sus4 heartbeat and quartal drone, an aching C-minor ascent to the cathartic Eb7#9 at 4:39, and a hushed coda that never quite re-enters home — marigold remembrance on red earth: one petal-ember on dark clay, petals rising on warm updrafts through slanted ochre dust, a galaxy of marigold fire at the blaze, one ember pulsing alone in violet dusk, a spiral of petal-light climbing to the catharsis, and a last petal on a dark mirror under the first stars",
    phases: [
      P("threshold", 0, 0.087, 0.8, "threshold", "0:00-0:32 Home Pedal Awakening (the low Eb pedal laid down, Fm11 and Abmaj9 blooming above, warm and inviting)", [
        S("sparse", "DARK BACKGROUND — a single marigold petal made of warm light resting on dark red earth in the lower right of vast darkness, its edge glowing orange and peach like an ember, nearly the entire frame empty"),
        S("micro", "extreme macro — inside the petal backlit like stained glass, luminous veins branching in fire-orange and rose through its translucent cells, warm colour seeping slowly outward"),
        S("aerial", "looking straight down at first light on a wide expanse of dry red clay filling the frame edge to edge, warm colour seeping into the cracked ground in luminous veins of ochre, one scatter of orange petals glowing in the lower left, the camera descending"),
      ]),
      P("expansion", 0.087, 0.407, 0.9, "expansion", "0:32-2:30 Song in Full Voice (ending on an earthier Eb9) → Ab7 Blues Turn (1:06, soulful and swaying) → Minor Shadow Climb (1:53, Fm9b5 shadows, a walking bass reaching the highest note)", [
        S("interior", "inside a slow rising updraft of marigold petals, each petal an ember of orange and magenta light turning as it climbs through warm dusty air, slanted ochre beams crossing behind them, the camera rising with the swirl"),
        S("aerial", "from high above, a broad terracotta land in full mid-morning glare, long shadows of drifting cloud racing across it, heat shimmer rising in luminous waves, a winding seam of orange petals glowing along its folds"),
        S("micro", "macro — dust motes hanging in a slanted shaft of ochre light at closest range, each mote a tiny glowing speck of red clay, a single petal swaying through the beam in slow bluesy arcs"),
      ]),
      P("transcendence", 0.407, 0.478, 1, "transcendence", "2:30-2:56 Dominant Blaze (Eb9 and Ab7 burning at full volume, the tonic flipping briefly to Eb minor and a borrowed Gb — white-gold glare)", [
        S("cosmic", "cosmic — a spiral galaxy made entirely of marigold fire wheeling through black space, arms of orange and magenta petal-dust blazing white-gold toward its core, heat shimmer rippling across it, the camera soaring along one arm"),
        S("abstract", "abstract — a radiant bloom of concentric petal rings unfolding in white-gold, orange and magenta, blossom opening inside blossom, the outer rings bleaching to pure glare in the upper left, kaleidoscopic"),
        S("interior", "inside one blazing arm of petal-light, embers streaming past at every depth like a solar wind, rose-tinted haze beyond, a dark shadow of Eb minor flickering through for an instant"),
      ]),
      P("illumination", 0.478, 0.646, 0.78, "integration", "2:56-3:58 Sus4 Heartbeat (suddenly inward, a low sus4 pulse) → Suspended Drone (a hovering quartal drone, patient and almost static) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small point of warm orange light pulsing slowly in the lower left of immense dusk-violet darkness, like a single ember heartbeat, nearly the entire frame empty"),
        S("aerial", "looking straight down on a vast dark plain at dusk filling the frame edge to edge, low warm air moving over it in faint luminous ripples of violet and amber, the camera hovering perfectly still"),
        S("micro", "extreme macro — a single ember-petal at closest range glowing and dimming in a slow steady pulse, its curled edge flickering peach, fine ash-light drifting from it into the violet dark"),
      ], { sparse: true }),
      P("return", 0.646, 0.86, 0.83, "illumination", "3:58-5:17 Relative Minor Ascent (the pedal lifts, C minor speaks for the first time and climbs) → Climax and Release (the cathartic Eb7#9–Eb9 at 4:39-4:45, sighing into Cm7)", [
        S("abstract", "abstract — a slow ascending spiral of petal-light climbing out of dusk-blue darkness toward a glowing crest, each turn of orange and magenta brighter than the last, the camera rising with it"),
        S("cosmic", "cosmic — the cathartic blaze: braided streams of glowing petals pouring across infinite dark space toward one radiant amber bloom in the upper right, magenta embers scattering outward like newborn stars"),
        S("aerial", "from high above, a darkening red-rock land as one last flare of evening light sweeps across a sheer cliff, the glow draining into cool violet shadow, luminous orange petals drifting down through it"),
      ]),
      P("integration", 0.86, 1, 0.37, "integration", "5:17-6:09 Suspended Farewell (open fifths fading to a whisper, a borrowed Cb and an unresolved Db13 — home remembered but never quite re-entered)", [
        S("micro", "macro — one marigold petal of light drifting down onto still black water at closest range, its ember glow doubled in the reflection, fine luminous rings spreading"),
        S("cosmic", "cosmic — from immense height the dark land under deep blue twilight and the first cold stars, one warm orange point fading in the lower right, the celebration banked to a single ember, the camera slowly pulling back"),
        S("sparse", "DARK BACKGROUND — a single marigold petal of faint warm light resting on dark earth in the lower right of vast blue darkness, the bookend of the first ember, remembered but unresolved, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends to the glowing petals and is lifted with them into a rising updraft of ember light",
      "the petal-dust thickens and the camera soars upward until it wheels as a galaxy of marigold fire",
      "the blaze collapses and the camera pulls far back until one small ember pulses alone in violet dark",
      "the pulse quickens and the camera rises with a spiral of petal-light climbing toward a glowing crest",
      "the evening flare drains and the camera follows one last petal of light as it drifts down onto a still dark mirror",
    ],
  },
  {
    id: "46216435-4340-4ad4-9033-101e66fb29e7",
    name: "Love Again",
    world: "E minor rubato meditation swinging on one axis — Cmaj7/add9 warmth against Em/G longing over an E pedal, suspension over resolution, 76 % major in sound — the remembered love flooding back at the 0:38 Lydian crest, reaching its highest note at 1:10, turning restless at 1:35, collapsing into a hushed interior at 2:00, warming again through G at 2:40 and fading on C rather than home — life returning to a burned grove: one green shoot glowing in char, the black canopy erupting into rose blossom as a wheeling galaxy at the crest, a fern unrolling, one rose petal on slate water under the first stars, gold mist lifting off the recovering land, and the old fire's last embers beside a new shoot",
    phases: [
      P("threshold", 0, 0.112, 0.99, "threshold", "0:00-0:25 Threshold Vamp (one question posed again and again — Cadd9 or Em/G — the melody leaping upward)", [
        S("sparse", "DARK BACKGROUND — a single small green shoot glowing softly from within in the lower right of vast charred darkness, a faint warm column of rose light leaning toward it, nearly the entire frame empty"),
        S("micro", "extreme macro — rain beads on carbonized bark at closest range, each bead holding a tiny green and rose reflection of the shoot below, black glitter all around the small hope"),
        S("aerial", "looking straight down on dark ash filling the frame edge to edge, fine black strokes of char across it, a slow arc of rose and mint light sweeping across it like a pendulum, luminous and quiet, the camera descending"),
      ]),
      P("expansion", 0.112, 0.268, 1, "transcendence", "0:25-1:00 Lydian Swell (bass accents at 0:28 and 0:43 framing D9/C and C69#11; the colour-saturated crest at 0:38 — the remembered love at full strength)", [
        S("cosmic", "cosmic — a vast spiral of rose and white blossoms of light wheeling through infinite dark space, mint-green sparks streaming along its arms, its heart blooming open all at once, the camera rising through"),
        S("interior", "inside a slow drift of pale rose petals of light sifting down through shafts of golden light, fine black ash flakes turning among them, luminous and weightless, deep darkness all around"),
        S("micro", "macro — one blossom breaking out of cracked char at closest range, its petals shouldering the burnt crust aside, rose glowing translucent against absolute black"),
      ]),
      P("transcendence", 0.268, 0.531, 0.95, "illumination", "1:00-1:59 Reaching Upward (more minor shading, the highest note A5, the held C(#11) at 1:10 — warmth tinged with ache) → Restless Turning (1:35, the pulse quickens, a single D# of doubt)", [
        S("intimate", "a single high charred branch catching the last rose light above a darkening burned grove, its new leaves of translucent green trembling, the camera drifting upward toward its tip"),
        S("abstract", "abstract — restless rings of rose and mint light crossing and recrossing over dark still water, interference patterns flickering as each ring passes through the others, turning faster"),
        S("micro", "extreme macro — a curled fern head unrolling at closest range, a spiral of soft green light opening out of darkness, rain beads glinting along the frond"),
      ]),
      P("illumination", 0.531, 0.714, 0.54, "integration", "1:59-2:40 Hushed Interior (the energy collapses, the familiar harmony whispered, thinned to a bare fifth at 2:36) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single rose petal of faint light resting on dark slate water in the upper left of vast dusk, a soft luminous ring spreading slowly from it, nearly the entire frame empty"),
        S("cosmic", "cosmic — above the burned land a slate-blue dusk slowly filling with new pale stars, one appearing at a time, faint green constellations forming where there was nothing, the camera slowly tilting upward"),
        S("micro", "extreme macro — the tip of a new green leaf at closest range, a single bead of dusk gathered on it holding one tiny pale star, slate darkness all around, utterly still"),
      ], { sparse: true }),
      P("return", 0.714, 0.83, 0.73, "return", "2:40-3:06 Returning Warmth (the relative major — G6 to Cmaj9, Cmaj13 at 3:00 — quieter but more accepting)", [
        S("aerial", "from high above, luminous morning mist lifting off the recovering land in slow gold sheets, green undergrowth glowing through the black rows of char beneath, rose light catching the ridges"),
        S("abstract", "abstract — a gentle drift of pale rose light moving among new blossoms, pausing at the newest one, half-gathered into a soft almost-presence, translucent and featureless, ancient and tender, dissolving at its edges"),
        S("micro", "macro — the newest bud opening at closest range where the rose light lingered, its petals carrying a faint luminance of their own, morning gold at their edges"),
      ]),
      P("integration", 0.83, 1, 0.37, "integration", "3:06-3:44 Dissolving Pendulum (C ↔ Em/G rocked to rest, fading on C rather than the E-minor tonic — felt again, left open)", [
        S("intimate", "close — the old fire's last embers glowing softly in dark char, rose and amber pulsing slower and slower, a thin green shoot rising beside them, the camera drawing gently nearer"),
        S("cosmic", "cosmic — the burned land from immense height years hence, the old wound written entirely in faint green and rose light across the dark, glowing like a quiet galaxy, the camera slowly pulling back into warm haze"),
        S("sparse", "DARK BACKGROUND — a single small green shoot glowing faintly in the lower right of vast warm darkness, one rose ember resting beside it, the bookend of the first light, left open, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends toward the swinging rose light and plunges through it into a wheeling spiral of blossom in deep space",
      "the sifting petals thin and the camera glides up toward one high branch catching the last rose light",
      "the restless rings slow and the camera settles close on one rose petal of light alone on dark water",
      "the camera rises from the dark surface as luminous gold mist lifts across the recovering land",
      "the bud's glow warms and the camera drifts down to the old fire's last embers beside a new shoot",
    ],
  },
];
