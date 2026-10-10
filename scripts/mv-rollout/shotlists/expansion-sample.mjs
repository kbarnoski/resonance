// Expansion — Snowflake Standard SAMPLE (2026-10-09): Tranquility 21,
// Sancerre Cry 4, The Other Side 9. Karel watches these three before the
// Expansion is batched (sample-before-batch law).
//
// Same format as vigil.mjs (apply-shotlists.mjs / harvest-stills.mjs /
// pick-stills.mjs / install.mjs). Differences, all deliberate:
//  - Phase bounds and intensities are the journeys' CURRENT ones (the v2
//    measured arcs from the 2026-10-05 re-theme, already aligned to the
//    deep-analysis sections); `music` names the sections each phase holds.
//  - Each journey keeps its analysis-derived world (theme.worldRationale)
//    and palette, TRANSFIGURED (made of light, impossible stillness,
//    particles) per law L.
//  - `shaders`: the phase-owned cast (Expansion casts live in the phase
//    rows + scripts/expansion-recast.json, not in JOURNEY_CASTS). Lead kept
//    from the 10-05 recast (Karel has watched it); supports from the vetted
//    pool, one phase each (two adjacent at most), no shader shared with a
//    setlist neighbour, sparse phases on dark shaders.
//  - `shaderOpacity`: per-phase arc in Snowflake's range (0.45-0.65 there;
//    Realized 0.58-0.85). Image opacity = 1 - shaderOpacity (ai-image-layer
//    clamps 0.12-0.65), so imagery swells at the peak and recedes in the
//    sparse valley and the cosmic close.

export const SET = { key: "expansion-sample", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shaders, shaderOpacity, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shaders, shaderOpacity, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "4922ecbd-d1ab-4eec-a13d-735dcdc655da",
    name: "Tranquility 21",
    world: "C# major, free time, warm rocking between home and IV; lyric 'I'll sit at home in my darkness ... I'll see a way for me' — a night gorge seen from above where one thread of lavender mist gathers into a luminous way, floods gold at the summit, dissolves into Lydian haze, rolls as a tide of light in the ostinato, and is left open as a single thread",
    phases: [
      P("threshold", 0, 0.05, 0.73, "threshold", "0:00-0:11 Opening Breath (sparse, near-silence)", ["pendulum-dust", "nadir"], 0.62, [
        S("sparse", "DARK BACKGROUND — a single thread of luminous lavender mist curling low in the lower right of vast darkness, a few tiny motes of warm gold light caught inside it, the rest of the frame open black"),
        S("micro", "extreme macro — the edge of that thread of mist at closest range, countless suspended droplets of light glowing lavender and pale gold, drifting at different depths in soft darkness"),
        S("aerial", "from high above, looking straight down, the thread of glowing mist winding faintly along the floor of a deep dark gorge that fills the frame edge to edge, a slow line of light drawn across black land, the camera beginning to descend toward it"),
      ]),
      P("expansion", 0.05, 0.55, 0.79, "expansion", "0:11-2:01 Opening Breath → Subdominant Bloom (0:45 warmth floods) → Plagal Shadow → Suspended Summit (1:53)", ["nadir", "r3-sleepingbloom", "r-mercury", "ember", "magma"], 0.55, [
        S("interior", "gliding inside the luminous mist as it gathers, soft lavender billows of light passing close on every side and filling the frame, warm gold glowing up through them from below"),
        S("micro", "macro — slow concentric ripples spreading across a dark mirror of water beneath the mist, each crest traced in warm amber light, impossible stillness between them"),
        S("aerial", "looking straight down as soft gold and lavender light glows within the winding stream of mist, the dark gorge widening around it and filling the frame edge to edge, a long translucent road of pale light drawn through the night, the camera rising with it"),
      ]),
      P("transcendence", 0.55, 0.72, 1, "integration", "2:01-2:38 Lydian Haze (outlines blur, the breath after the summit) — the sparse valley", ["will-o-wisp", "r3-fairyglow"], 0.6, [
        S("sparse", "DARK BACKGROUND — one small curl of glowing gold mist suspended alone in the upper left of immense darkness, a few fine motes drifting away from it, nearly the entire frame empty"),
        S("abstract", "abstract — a soft haze of light dissolving every outline, slow drifting bands of gold, rose and slate blue blurring into one another across the dark, floating and weightless"),
        S("micro", "extreme macro inside the haze, countless suspended droplets glowing lavender and gold at different depths, shallow focus, the light slowly gathering toward one side"),
      ], { sparse: true }),
      P("illumination", 0.72, 0.78, 0.89, "transcendence", "2:38-2:52 Rocking Ostinato begins (2:45, the fullest energy)", ["ripple", "r2-pixie", "iron-forge"], 0.46, [
        S("cosmic", "cosmic — the stream of mist becomes a vast slow tide of light rolling in long even swells across infinite darkness, gold and rose sparks scattered over its surface like a galaxy turning, seen from far above"),
        S("micro", "macro at the height of the light — the crest of one swell of luminous mist breaking into a spray of tiny gold and lavender sparks, blazing against the dark"),
        S("aerial", "from directly above, the tide of light filling the whole gorge and the frame edge to edge, rose and gold rippling outward in slow rocking waves, the camera pulling back to reveal it"),
      ]),
      P("return", 0.78, 0.901, 0.67, "return", "2:52-3:18 Rocking Ostinato → recedes (3:12)", ["ripple", "r2-pixie", "fracture-light"], 0.52, [
        S("abstract", "abstract — rocking ribbons of gold and lavender light swaying back and forth in a slow pattern across black, the rhythm easing"),
        S("intimate", "close — a last warm line of light trembling across a dark mirror of still water, the mist above it thinning to translucent wisps"),
        S("aerial", "rising slowly away from the gorge while looking straight down, the luminous stream narrowing far below to a single thread of gold, darkness folding back over the land"),
      ]),
      P("integration", 0.901, 1, 0.55, "integration", "3:18-3:40 Unresolved Homecoming (ends on F#add9 over C#, the door left open)", ["fracture-light", "drift"], 0.62, [
        S("cosmic", "cosmic — from immense height the thread of light becomes a faint luminous line across infinite darkness, scattered points of light around it like a quiet star field, the way still open"),
        S("sparse", "DARK BACKGROUND — a single thread of warm gold mist resting in the lower right of vast darkness, its end left open and drifting, the bookend of the first light"),
        S("micro", "extreme macro — one last droplet of gold light suspended at the tip of the thread, holding a tiny reflection of the whole way"),
      ]),
    ],
    morphs: [
      "the camera descends toward the faint line of light until it is gliding inside the mist as it gathers into a flowing stream",
      "the camera rises and the gold road of mist dims, settling close on one small curl of gold light alone in the dark",
      "the haze droplets gather and the camera pulls back as the stream swells into a vast slow tide of light",
      "the swells ease and the camera drifts down as the tide breaks into slow rocking ribbons of gold and lavender",
      "the camera keeps rising until the thread of gold is a faint luminous line across infinite darkness",
    ],
  },
  {
    id: "4ef43223-42cf-4ce8-9088-7578569f7de6",
    name: "Sancerre Cry 4",
    world: "C minor lament, low register, lyric 'you was a church for me ... light and light' — a sanctuary made of light seen from above a vast dark canopy: violet and gold columns rising through it, swelling toward a cry (one shaft of gold that breaks and is withheld), brooding plum undertow, warmth returning, then the benediction (one small band of warm light) and a consoled cosmic stillness",
    phases: [
      P("threshold", 0, 0.05, 0.48, "threshold", "0:00-0:12 Clustered Awakening (blurred cluster, the bass names C minor at 0:08)", ["parsec"], 0.63, [
        S("sparse", "DARK BACKGROUND — a single thread of pale violet light rising past the edge of one dark leaf in the lower left of immense darkness, faint mist around it, almost nothing else"),
        S("micro", "extreme macro — dew beads along the veins of a dark leaf, each bead holding a tiny point of violet light, mist breathing between them"),
        S("aerial", "from high above a vast dark canopy at night, slow sheets of luminous mist lifting off its roof, one soft plume of violet lit mist rising through a gap, the camera drifting down toward it"),
      ]),
      P("expansion", 0.05, 0.271, 0.84, "expansion", "0:12-1:05 Clustered Awakening → Lifted Questions (two-third doubt, Ab as a door)", ["parsec", "dusk", "astral"], 0.56, [
        S("interior", "inside a slow rising plume of violet lit mist, countless motes of pale gold drifting upward past dark leaf edges, the light leaning and searching"),
        S("abstract", "abstract — two and then three soft plumes of violet and gold lit mist drifting toward each other, their edges diffusing prismatically into particles, wide dark space between"),
        S("micro", "macro — velvet moss on a high dark branch lit from beneath by a narrow beam of violet light, fine particles of mist turning slowly through the beam"),
      ]),
      P("transcendence", 0.271, 0.407, 1, "illumination", "1:05-1:38 Brightening Current (Fm9, flow and light, longing)", ["r-stardust", "astral", "rose-window"], 0.5, [
        S("aerial", "looking straight down at a dark winding current of luminous water threading beneath the canopy, bands of brighter violet and gold light catching on it as the camera glides along"),
        S("micro", "macro — the surface of dark moving water carrying broken reflections of violet and gold light, fine ripples splitting every color into prismatic threads"),
        S("abstract", "abstract at the largest scale — seen from high above, dozens of soft plumes of violet and gold lit mist rising from the dark canopy and leaning into one another, a luminous fractal web of light woven over the treetops, the camera rising through them"),
      ]),
      P("illumination", 0.407, 0.84, 0.88, "transcendence", "1:38-3:21 The Cry (1:48, brightness breaks and is denied) → Settling onto A-flat → Pressing Undertow → Dominant Reckoning", ["r-stardust", "r2-spiralgal", "mandorla", "dark-tide", "volcanic"], 0.46, [
        S("cosmic", "cosmic — the cry, seen from above: one immense shaft of gold light pouring down through heavy dark vapor onto the dark canopy, the light spreading across the leafy roof in a blazing gold wash for one moment, infinite violet darkness all around"),
        S("interior", "within the deep shadow beneath the canopy, slow plum and wine-dark mist pooling and churning like an undertow, a faint amber line of light moving through it, dissolving"),
        S("aerial", "from high above the light returning, warm low gold breaking across the dark canopy from one side, long plumes of rose and gold lit mist rising again and softening into a glowing haze, the camera pulling back"),
      ]),
      P("return", 0.84, 0.92, 0.72, "integration", "3:21-3:41 Fading Benediction (bell-like Ab/C, the cry let go) — the sparse valley", ["will-o-wisp", "nadir"], 0.6, [
        S("sparse", "DARK BACKGROUND — one small band of warm gold light resting low in the right third of vast blue-black darkness, a few fine motes drifting from it, nearly the entire frame empty"),
        S("micro", "extreme macro — the last thread of pale gold light lying across a single dark leaf, tiny droplets along it glowing like embers of light"),
        S("intimate", "a few small threads of violet light withdrawing slowly down into the dark canopy one by one, mist closing over them"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.55, "integration", "3:41-4:00 the long-held C major — a quiet consolation", ["seraph", "plankton"], 0.62, [
        S("cosmic", "cosmic — from immense height the dark canopy becomes a deep quiet field beneath drifting luminous mist, one last soft plume of warm lit mist rising into a vast star field, consoled and still"),
        S("intimate", "DARK BACKGROUND — a single small plume of warm gold lit mist hanging alone in the lower left of immense darkness, gently glowing, the bookend of the first thread of light"),
        S("micro", "extreme macro — one bead of warm light at the tip of a dark leaf, holding a tiny reflection of the whole sanctuary of light"),
      ]),
    ],
    morphs: [
      "the camera drifts down through the gap in the canopy and into the rising column of violet light",
      "the moss-lit beam widens and the camera rises above the canopy to follow a luminous current winding beneath it",
      "the columns of light converge and the camera pulls back as one immense shaft of gold breaks through the dark vapor",
      "the gold haze withdraws and the camera settles close on one small band of warm light in the dark",
      "the last threads sink away and the camera rises until the canopy is a deep quiet field under a star field",
    ],
  },
  {
    id: "24101852-61ee-4ac9-8fd7-da2ae19ab0a3",
    name: "The Other Side 9",
    world: "F minor reverie, steady breathing pulse, open voicings that swell twice toward light — the crossing: luminous fog lying as weather over black water, a first gold glimpse, the shadow's return, the Bb-minor summit as a vast sea of fog flaring blue and rose, a descent into a sheltered dark stillness, a high open plateau of light, and an unresolved violet close held in suspension",
    phases: [
      P("threshold", 0, 0.05, 0.47, "threshold", "0:00-0:10 Threshold in the Dark", ["flagella"], 0.64, [
        S("sparse", "DARK BACKGROUND — a single low wisp of luminous fog drifting just above black water in the lower right, faint cold blue light inside it, the rest of the frame vast darkness"),
        S("micro", "extreme macro — tiny suspended droplets of fog glowing pale blue and rose above a black mirror of water, drifting at different depths, luminous and weightless"),
        S("aerial", "from high above, a dark expanse of still water with one low bank of luminous fog lying across it, the camera drifting down toward the glow"),
      ]),
      P("expansion", 0.05, 0.425, 0.7, "expansion", "0:10-1:25 Threshold → First Glimpse of Light (0:25) → Return to the Shadow (0:50)", ["flagella", "drift", "chrysalis", "r2-portalrim"], 0.56, [
        S("interior", "inside the bank of glowing fog, soft billows of pale blue light passing close on every side and filling the frame, a first warm gold glow seeping up through them from below"),
        S("aerial", "looking straight down on layered bands of luminous fog over black water, pale gold light sliding across them and then dimming to slate as shadow drifts back over, the camera gliding along"),
        S("micro", "macro — one slow ring spreading across black water beneath the fog, its crest traced in a thin line of cold silver light, impossible stillness around it"),
      ]),
      P("transcendence", 0.425, 0.545, 1, "transcendence", "1:25-1:49 Bb Minor Summit (crest 1:31)", ["orbit-weaver", "binary-stars", "astral"], 0.46, [
        S("cosmic", "cosmic — breaking through the last billows into a vast luminous sea of fog seen from above, cold blue and rose light flaring across it in drifting nebula-like swirls, infinite violet darkness at its edges"),
        S("micro", "macro at the height of the light — the crest of one billow of fog blazing silver-white and rose, fine droplets glittering against darkness"),
        S("abstract", "abstract — luminous fog streaming across the frame in long diagonal bands of silver, rose and cold blue light, dissolving into one another"),
      ]),
      P("illumination", 0.545, 0.738, 0.6, "integration", "1:49-2:28 Descent and Stillness (the trough) — the sparse valley", ["meteor-rain", "r2-thermal"], 0.6, [
        S("sparse", "DARK BACKGROUND — one small wisp of glowing fog suspended alone in the upper left of immense darkness, a few pale motes drifting from it, nearly the entire frame empty"),
        S("interior", "within the fog, a sheltered hollow of darkness where a quiet thread of luminous water winds slowly, faint violet glow lying on it, the camera descending"),
        S("micro", "extreme macro — a single drop of light falling toward black still water, a faint luminous ring of pale blue light waiting where it will land"),
      ], { sparse: true }),
      P("return", 0.738, 0.882, 0.3, "illumination", "2:28-2:56 High Open Plateau (bright, thirdless, vast)", ["flame", "ribbon-of-light", "firefly-field"], 0.52, [
        S("aerial", "rising high above the fog and looking straight down on a vast plateau of luminous cloud that fills the frame, wind combing long silver ripples across its surface"),
        S("intimate", "close — the surface of the fog sea combed into fine silver ripples of light, cold blue shadow between them, translucent and weightless"),
        S("abstract", "abstract — long parallel ribbons of silver and pale gold light streaming across darkness toward a distant bright edge, the camera traveling with them"),
      ]),
      P("integration", 0.882, 1, 0.3, "integration", "2:56-3:20 Unresolved Horizon (fades on Bb5 over F)", ["ribbon-of-light", "firefly-field"], 0.62, [
        S("cosmic", "cosmic — from immense height the fog-covered water becomes a faint pale band across deep violet darkness scattered with a quiet star field, suspended and unresolved"),
        S("micro", "extreme macro — the last violet light lying on a single drop of still black water, fog closing gently over it, translucent and dissolving"),
        S("sparse", "DARK BACKGROUND — a single low wisp of luminous fog drifting above black water in the lower right of vast darkness, the bookend of the first light, left open"),
      ]),
    ],
    morphs: [
      "the camera drifts down into the bank of fog until pale blue billows pass close on every side",
      "the silver ring widens and the camera pushes through the last billows into a vast luminous sea of fog",
      "the bands of light dissolve and the camera settles close on one small wisp of fog alone in the dark",
      "the falling drop lands in a ring of light and the camera rises high above the fog into wide open light",
      "the ribbons of light stream away and the camera keeps rising until the water is a faint pale band among the stars",
    ],
  },
];
