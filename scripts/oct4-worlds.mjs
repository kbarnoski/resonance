// Oct 4 2026 studio session — one world per piece (Karel 2026-10-05:
// "imaging based on song name but critical to ensure it is based off of
// your analysis of the music so how fast or slow, the major or minor
// chords, the in depth mood analysis").
//
// THEME LAW (law 0): world = f(v2 deep analysis, name). Every entry's
// `why` cites the measured facts that drove it (analyses.summary v2:
// tempo/pulse, mode balance, register, dynamics arc, section moods).
// phases[i] follows the MEASURED sections grouped into phase i by
// scripts/lib/phase-grouping.mjs — the comment on each line names them.
// Laws honoured: no figures/faces/people, no text, ice/frost/snow/
// crystal/aurora = Snowflake only, no drug language, no stone-chapel/
// castle clichés, no sun/moon discs (light arrives as glow, seams,
// reflections), negative space + asymmetric weight, particles welcome.
// Shape matches expansion2-worlds.mjs: palette, cats, ambient, voice,
// mood, micro + abstract (shots 2/3 of each 3-shot sequence), phases[6].

export const ORDER = ["First Light", "Calling", "Testimony 3", "Vespers 3", "Vespers 2", "Lantern", "Open Jam"];

export const WORLDS = {
  // ── FIRST LIGHT — 54 BPM, free time (steadiness 0.15), sparse 1.6
  //    attacks/s; C major (minor-weight 0.04) over a low C2 pedal, dark
  //    timbre (median C3, centroid ~300 Hz), Lydian #11 glints; one long
  //    wave cresting at 1:57 on the subdominant, then afterglow.
  "First Light": {
    world: "a tidal estuary at daybreak seen from above — braided water channels receiving the first light",
    why: "Very slow free time + sparse attacks + a low, dark C pedal = a flat, patient world close to the ground; pure major with Lydian glints = light that arrives as thin bright threads, never a blaze; the single long wave peaking on IV at 1:57 = the whole braid of channels lighting at once, then an even, shadowless afterglow. 'First Light' gives the dawn; the music says it is low, slow and reflected — so the light lives in water, seen from above.",
    subtitle: "the light arrives low and slow",
    palette: { primary: "#c9a46a", secondary: "#0b0e12", accent: "#8e9fb0", glow: "#f2dcae" },
    cats: ["Elemental", "Organic"], ambient: "desert", voice: "sage", mood: "dreamy",
    phaseMoods: ["mystical", "flowing", "dreamy", "transcendent", "dreamy", "mystical"],
    micro: "rippled wet sand on a tidal flat, every ripple crest holding a hair-thin line of pale reflected light",
    abstract: "braided ribbons of reflective water branching slowly across a dark plain, seen from directly above",
    phases: [
      // [0] Low Embers Waking 0:00–0:24 (I 0.10, hushed, grounded)
      "DARK BACKGROUND — a vast tidal estuary before dawn seen from high above, a dark plain of wet sand and mud cut by braided water channels, one single channel in the lower left holding the faintest pewter seam of reflected light, everything else unlit and still",
      // [1] Plagal Tide 0:24–1:00 (I 0.87, warm, rocking, settled)
      "the estuary at early grey-blue dawn from above, shallow tide sliding in and drawing back across the flats in slow overlapping sheets, the braided channels filling with soft slate and pewter reflections, a low mist lying in long bands across the sand",
      // [2] Suspended Questions 1:00–1:21 (I 0.79, searching, first Lydian glint)
      "thin pale streaks of light appearing along the edges of the water channels as the mist parts, a few channels suddenly bright as hairlines of silver-gold while the flats between stay dark, the braid half-revealed, searching",
      // [3] Subdominant Dawn 1:21–1:58 (I 1.00 PEAK, radiant, expansive, reverent)
      "the entire braided estuary lit at once from above, hundreds of branching channels glowing warm amber-gold across the dark sand like a vast living river-tree of light, low mist glowing from within along the water, the brightest confluence set right of center, morning arrived",
      // [4] Lydian Afterglow 1:58–2:14 (I 0.27, tender, weightless)
      "the flats under even pale morning light, the channels softened to milky rose and pearl, the last mist lifting off the water in slow transparent veils, no shadows anywhere",
      // [5] Lydian Afterglow → silence 2:14–2:30 (I 0.27, peaceful)
      "DARK BACKGROUND — the estuary settling toward stillness, the water channels dimmed to faint pearl threads on the dark sand, one last small pool holding a soft pale glow in the upper right",
    ],
  },

  // ── CALLING 3 — 85 BPM elastic rubato; C major, 79% major chords
  //    (minor-weight 0.07), almost no dominants: plagal F↔C rocking;
  //    wide melodic LEAPS "like calls across open space"; two crests
  //    (0:40 and the 1:31 summit, landing on a suspended Fmaj9/G — answered
  //    but open); register G1–A5, 40 dB range; dusk recession.
  "Calling": {
    world: "a mist-filled valley where every call travels as a widening wave of warm light through the haze",
    why: "Wide melodic leaps over plagal rocking = a call sent across distance and answered; pure major with no dominant pull = warm, unhurried longing rather than drama; the 40 dB arch with a suspended (unclosed) summit at 1:31 = the valley filling with converging waves of light that keep travelling; elastic 85 BPM = slow travelling pulses through mist. 'Calling' names the gesture; the music measures its warmth, distance and openness.",
    subtitle: "a call across the valley, answered in light",
    palette: { primary: "#e3b46e", secondary: "#0d0c10", accent: "#a9bcd0", glow: "#f6e3bf" },
    cats: ["Elemental", "Cosmic"], ambient: "forest", voice: "fable", mood: "flowing",
    phaseMoods: ["mystical", "dreamy", "flowing", "flowing", "transcendent", "dreamy"],
    micro: "a single bead of mist on a long grass blade trembling as a thin ring of warm light passes through it",
    abstract: "soft wavefronts of warm light travelling outward through layered translucent haze",
    phases: [
      // [0] Opening Calls 0:00–0:21 (I 0.10, searching, hushed)
      "DARK BACKGROUND — a deep valley filled with pale pre-dawn mist, one small soft wave of warm light leaving the lower left and spreading slowly through the haze, the far side of the valley still dark and waiting",
      // [1] Widening Answer 0:21–0:41 (I 0.76, yearning, bittersweet)
      "the valley mist alive with travelling waves of light, each call widening as a soft luminous arc through the haze and touching the slopes in rose-gold, an answering arc returning faintly from the far ridge, longing made visible",
      // [2] Plateau of the Fourth 0:41–0:56 (I 0.71, luminous, contemplative)
      "a broad hillside meadow under high open haze, slow wide arcs of honey light lingering over the grass instead of moving on, the air warm and suspended, everything held",
      // [3] Plateau, melody rising to C6 0:56–1:11 (I 0.71, warm, suspended)
      "the waves of light lifting from the meadow into the high mist above the valley, layered translucent veils glowing amber one above another, the valley breathing upward",
      // [4] Full-Voiced Summit 1:11–1:36 (I 1.00 PEAK, affirming, radiant)
      "the whole valley flooded — great converging wavefronts of warm gold light arriving from every ridge at once and crossing in the luminous mist, every slope glowing, the brightest crossing set left of center, the waves still travelling outward, answered and open",
      // [5] Receding Echo 1:36–2:08 (I 0.13, wistful, fading)
      "DARK BACKGROUND — a still lake on the valley floor at dusk, its surface a dark mirror, one last faint ring of warm light spreading slowly across the water in the lower right and fading into blue",
    ],
  },

  // ── TESTIMONY 3 — 80 BPM free time (felt half-time ~40); B♭ major
  //    hymn on an F dominant pedal (minor-weight 0.10); warm, sincere,
  //    held back; the E♭ radiance 0:58, a minor-iv shadow at 1:32, the
  //    declaration at 1:55 (loudest), a low B♭add9 amen (−47 dBFS).
  "Testimony 3": {
    world: "amber resin on ancient bark — light kept, preserved and finally declared",
    why: "A slow hymn held back by its own pedal = something that holds and preserves before it speaks; warm plagal major (E♭ radiance) = honey and amber light; one cloud of minor iv at 1:32 = a shadow passing over the resin; the arch to a 1:55 declaration then a whispered amen = the resin lit through at full voice, then one last drop at dusk. 'Testimony' = bearing witness — amber is the earth's own testimony, light and time kept inside it.",
    subtitle: "light kept, then spoken",
    palette: { primary: "#d79a4a", secondary: "#120c08", accent: "#c98f8a", glow: "#ffd9a0" },
    cats: ["Organic", "Elemental"], ambient: "sacred", voice: "ballad", mood: "transcendent",
    phaseMoods: ["mystical", "flowing", "transcendent", "melancholic", "transcendent", "dreamy"],
    micro: "a bead of golden amber resin on deeply furrowed dark bark, tiny suspended motes held inside it, lit from behind",
    abstract: "slow rivers of translucent honey-gold resin folding over one another, light glowing through their depth",
    phases: [
      // [0] Pedal-Tone Invocation 0:00–0:21 (I 0.43, hushed, expectant)
      "DARK BACKGROUND — the furrowed bark of an immense ancient tree in near darkness, a single seam of amber resin in the lower left catching the first low warm side-light, everything held and quiet",
      // [1] Gathering Statement 0:21–0:58 (I 0.78, earnest, building)
      "low warm side-light climbing the old bark, more seams of amber resin waking one after another in widening shafts of light, dust motes rising slowly through the beams, conviction gathering",
      // [2] E♭ Radiance 0:58–1:29 (I 1.00, radiant, grateful, full-hearted)
      "a vast cascade of amber resin glowing from within across the whole frame, translucent honey-gold folds lit through by warm light, tiny suspended motes shining inside it like held memories, the brightest fold set right of center, gratitude made visible",
      // [3] Shadow and Ascent 1:29–1:52 (I 0.94, yearning, poignant)
      "a cloud shadow passing over the resin, the gold dimming to deep umber and dusty rose, then light climbing back up the bark from below along a single rising seam toward brightness",
      // [4] Climax and Return 1:52–2:35 (I 0.88, affirming, glowing, settling)
      "the declaration — the great tree's resin seams all glowing at once in full warm light, then the light easing and turning amber as it settles, the bark warm and steady, everything said",
      // [5] Low Amen 2:35–3:01 (I 0.10, peaceful, intimate)
      "DARK BACKGROUND — a single drop of amber resin on dark bark at dusk, a faint warm glow inside it, deep muted indigo all around, the light kept",
    ],
  },

  // ── VESPERS 3 — 87 BPM, steadiest pulse of the session (0.91), a
  //    short hymn on G/D pedals; major-dominant (minor-weight 0.11) with
  //    ONE borrowed G-minor shadow (1:01–1:21); radiant G6/9–Cmaj9 return
  //    peaking 1:36; dissolve to an open, third-less G.
  "Vespers 3": {
    world: "evening seed-down drifting through golden air above a darkening meadow",
    why: "A steady, hymn-like 87 BPM sway in plain major = a calm, even drift; spacious attacks (2.4/s) and sus/add9 shells blurring into each other = soft floating particles rather than hard forms; the single borrowed-minor shadow then a radiant major return = one violet cloud passing over the drifting down before the air fills with gold; the open G5 ending = the last seeds settling. 'Vespers' sets it at evening; the music's steadiness makes it a gentle drift, not a storm.",
    subtitle: "an evening drift, one shadow passing",
    palette: { primary: "#e6b977", secondary: "#0e0b12", accent: "#9b8fb5", glow: "#fbe6c2" },
    cats: ["Organic", "Visionary"], ambient: "forest", voice: "shimmer", mood: "dreamy",
    phaseMoods: ["mystical", "flowing", "flowing", "melancholic", "transcendent", "dreamy"],
    micro: "a single seed of thistle-down floating in warm evening light, its fine silk filaments glowing at the edges",
    abstract: "countless glowing motes of seed-down drifting in slow diagonal currents of warm air",
    phases: [
      // [0] Wavering Invocation 0:00–0:36 (I 0.69, hesitant, ambivalent)
      "a darkening meadow at evening, the air above it holding a few drifting seeds of thistle-down that turn between pale gold and slate as thin cloud moves across the light, undecided",
      // [1] Pedal-Tone Hymn 0:36–0:49 (I 0.83, serene, reverent)
      "warm amber evening air thick with slowly drifting seed-down, each seed lit along its silk, all drifting the same gentle diagonal like a hymn repeated",
      // [2] Pedal-Tone Hymn 0:49–1:01 (I 0.83, warm, assured)
      "the drift steady and even across the whole meadow, long low light laying warm gold along the grasses below, the floating seeds glowing in calm unbroken procession",
      // [3] Borrowed Shadow 1:01–1:21 (I 0.85, yearning, aching)
      "a violet-grey cloud shadow sliding over the meadow, the drifting seed-down dimmed to cool lilac and slate, one high cold glint catching a few seeds at the top of the frame",
      // [4] Radiant Return 1:21–1:41 (I 1.00 PEAK, radiant, consoling)
      "the air suddenly full of light — thousands of seeds of down glowing gold as the cloud shadow lifts, a vast luminous drift filling the sky over the meadow toward a far horizon of warm haze, the densest glow set left of center, grace returning",
      // [5] Evening Dissolve 1:41–1:58 (I 0.10, still, lingering)
      "DARK BACKGROUND — deep blue dusk over the meadow, the last few seeds of down settling slowly with a faint warm glow, one single seed still drifting in the lower right",
    ],
  },

  // ── VESPERS 2 — 86 BPM elastic; G centre with major/minor THIRDS
  //    trading places throughout (minor 24%, valence ≈ 0.1, bittersweet);
  //    a low G–D fifth as the floor; heavy D7♭9 dominants, a Lydian burst
  //    at 1:25 tempered by sorrow, a major benediction 1:45–1:55; 35 dB
  //    arch ending in a bare G fifth.
  "Vespers 2": {
    world: "an evening cloud-sea seen from above — slate cloud filling the valleys, light breaking open inside it",
    why: "A low open-fifth floor under shifting major/minor thirds = a heavy, ambiguous evening layer; the D7♭9 weight and 'heavy slate cloud' sections = low cloud pressing down; the Lydian burst at 1:25 then a major benediction = light breaking open from inside the cloud and then lying broad and warm across it; the bare fifth ending = the cloud-sea gone indigo. 'Vespers' = evening prayer; the music's bittersweet thirds keep it shadowed, never simply golden.",
    subtitle: "evening prayer in the clouds",
    palette: { primary: "#b48a6a", secondary: "#0b0c14", accent: "#7d86b8", glow: "#f0cf9c" },
    cats: ["Cosmic", "Elemental"], ambient: "sacred", voice: "echo", mood: "mystical",
    phaseMoods: ["melancholic", "mystical", "transcendent", "transcendent", "dreamy", "melancholic"],
    micro: "the soft billowed edge of a slate-grey cloud, its folds faintly lit from within by warm amber",
    abstract: "layered banks of cloud seen from above, folding slowly, glowing faintly from inside",
    phases: [
      // [0] Shadowed Invocation 0:00–0:22 (I 0.66, veiled, solemn)
      "an evening sea of cloud seen from high above, slate and violet banks filling every valley edge to edge, a faint warm glow buried deep inside one bank in the lower left, veiled",
      // [1] First Warmth → Descent to Dominant 0:22–1:07 (I 0.75, consoling then brooding)
      "the cloud-sea seen from above at dusk, an amber glow opening inside the banks for a moment and then sinking again beneath heavy slate folds pressing low, the light and the weight trading places",
      // [2] Lydian Ascent 1:07–1:35 (I 1.00 PEAK, surging, radiant, aching)
      "the cloud-sea broken open from within — a great luminous rift of warm gold light pouring up between the slate banks seen from above, the cloud edges blazing amber around it, the brightest breach set right of center, then the light tempered by a violet hush along the folds",
      // [3] Major Benediction 1:35–1:57 (I 0.95, luminous, grateful, serene)
      "warm golden-hour light lying evenly across the entire cloud-sea from above, soft rolling billows glowing honey and rose, calm and wide, the blessing",
      // [4] Evening Recedes 1:57–2:27 (I 0.82, reflective, wistful)
      "the cloud-sea cooling, the warm glow withdrawing into the deep folds, blue-grey banks rolling slowly beneath, a few seams of amber still lit between them",
      // [5] Vanishing Fifth 2:27–2:51 (I 0.10, hushed, unresolved)
      "DARK BACKGROUND — the cloud-sea gone deep indigo from above, almost invisible, one last faint ember seam of warm light along a single fold in the lower left",
    ],
  },

  // ── LANTERN — 90 BPM free time, DENSE attacks (3.8/s, flowing
  //    arpeggio current) over an E♭ pedal; warm devotional major (minor-
  //    weight 0.12) with Mixolydian ♭7 and borrowed C♭/A♭m6 SHADOWS
  //    (2:00–2:03); three wave crests, summit on suspended D♭maj13 at
  //    3:41, a steady second crest at 4:30, unresolved E♭add9 fade.
  "Lantern": {
    world: "physalis lantern-husks — papery seed lanterns glowing from within against the dark",
    why: "A single warm point-source over an E♭ pedal, swelling and dimming in slow waves = a lantern glow that breathes; dense arpeggio flow = many small lights multiplying; borrowed C♭/A♭m6 shadows = husks dimming to their veined lace skeletons; the suspended D♭maj13 summit = a vast constellation of glowing lanterns rising into blue hour; the open E♭add9 ending = one lace lantern still glowing in the dark. 'Lantern' gives the object; the analysis makes it organic, devotional and wave-shaped — nature's own lanterns.",
    subtitle: "a small light, breathing",
    palette: { primary: "#e8913a", secondary: "#0a0b18", accent: "#7a5fa8", glow: "#ffd49a" },
    cats: ["Organic", "Visionary"], ambient: "sacred", voice: "nova", mood: "transcendent", fire: ["ember", "r-embers"], // ember cores only (Deep Ember section) — never forge/flame
    phaseMoods: ["mystical", "dreamy", "flowing", "melancholic", "transcendent", "dreamy"],
    micro: "a single physalis lantern-husk glowing deep orange from the berry inside, its papery veins lit like fine filament",
    abstract: "the veined lace skeleton of a seed lantern, glowing filigree of fine light against indigo darkness",
    phases: [
      // [0] Kindling 0:00–0:25 (I 0.49, hushed, expectant)
      "DARK BACKGROUND — one papery physalis lantern-husk hanging in deep darkness in the lower left, a first small amber glow kindling inside it and throwing soft unsteady warmth through its veins",
      // [1] Gathering Warmth 0:25–0:54 (I 0.88, yearning, warm)
      "a dark thicket of slender stems hung with physalis lanterns, their glow spreading from husk to husk in deepening amber gold, the light warm but tinged with longing at the violet edges",
      // [2] Clear Glow 0:54–1:26 (I 0.63, radiant, gentle, serene)
      "the lantern-husks glowing clear and clean, their papery skins translucent orange and honey, fine veins sharply lit, a calm steady radiance among the dark stems",
      // [3] First Crest → Shadows → Turning → Deep Ember 1:26–3:37 (I 0.75)
      "the glow cresting and then dimming as dusky violet shadow passes through, some husks fading to delicate veined lace skeletons, then warmth gathering again from below in deep ember-orange cores",
      // [4] Lantern Raised + Steady Flame 3:37–4:40 (I 0.98 PEAK, radiant, soaring, steadfast)
      "a vast constellation of glowing physalis lanterns rising slowly into an indigo blue-hour sky, hundreds of warm amber points blooming with soft halos, the brightest cluster set right of center, the whole dark lit by them, steadfast",
      // [5] Glow Into Night 4:40–5:09 (I 0.10, peaceful, open)
      "DARK BACKGROUND — a single lace-skeleton lantern still glowing softly in deep blue darkness, its amber heart small and steady, faint motes of light drifting far away",
    ],
  },

  // ── OPEN JAM — 79 BPM free time (pulse clarity 0.08), an E1 DRONE;
  //    E minor, minor-dominant (minor-weight 0.74, valence −0.2):
  //    brooding, restless; waves every 30–40 s with RISING crests; a C-
  //    major clearing (1:32), a G-major plateau (2:26), the E7#9 storm
  //    peak (2:57–3:31), a Phrygian lament (4:09), unresolved fade.
  "Open Jam": {
    world: "the black basalt storm coast — a sea cave, a heaving night ocean, smouldering rock",
    why: "A low E1 drone in free time = a cavernous, oceanic space that resonates; minor-dominant, brooding, with swells every 30–40 s and rising crests = a heaving night sea building toward a storm; the C- and G-major clearings = shafts of warm light through broken cloud; the E7#9 peak = the storm at full force; the Phrygian lament = ember-red seams glowing in wet black rock; the unresolved end = the tide drawing back into dark. 'Open Jam' = open-ended improvisation — the sea is the most open-ended thing there is.",
    subtitle: "a drone, a sea, a storm that never resolves",
    palette: { primary: "#6f8f8a", secondary: "#07090c", accent: "#c4553a", glow: "#d9c79a" },
    cats: ["Elemental", "Dark"], ambient: "abyss", voice: "onyx", mood: "intense", fire: ["molten-vein", "r-embers"], // ember-red basalt seams (Phrygian lament)
    phaseMoods: ["mystical", "melancholic", "dreamy", "intense", "melancholic", "melancholic"],
    micro: "wet black basalt glistening at the waterline, a thin ember-red seam glowing in a crack of the rock",
    abstract: "heavy dark swells of ocean water folding over one another, faint storm-green light inside the waves",
    phases: [
      // [0] Drone Awakening 0:00–0:39 (I 0.10, dark, cavernous)
      "DARK BACKGROUND — inside a black basalt sea cave looking out, a faint cold grey glow reaching the floor of still black water at the cave mouth in the lower right, the darkness enormous and resonant",
      // [1] Suspended Swell + Eleventh Hour 0:39–1:32 (I 0.75, yearning, brooding)
      "a heaving dark ocean under low storm cloud seen from the cave mouth, long heavy swells lifting and falling back without breaking, slate and storm-green light sliding along their backs, restless",
      // [2] C Major Clearing 1:32–1:59 (I 0.40 — the valley, luminous, wistful)
      "a gap opening in the storm cloud, a few soft shafts of warm gold light falling onto a calm patch of dark sea, pale haze glowing, a moment of respite in wide negative space",
      // [3] Return to the Drone → G plateau → E7#9 Storm 1:59–3:31 (I 0.84 PEAK, fierce, turbulent)
      "the storm at full force over the basalt coast, towering dark cloud lit from within by flickering electric violet-white light, the sea churning in great breaking swells against black rock, spray hanging in the air, the brightest cloud core set left of center, defiant",
      // [4] Chromatic Descent + Phrygian Lament 3:31–4:47 (I 0.75, ominous, grave)
      "wet black basalt cliffs streaming with draining seawater, deep ember-red seams glowing in the cracks of the rock and flaring as each wave withdraws, smouldering and mournful",
      // [5] Final Crest, Fade 4:47–5:37 (I 0.49, exhausted, unresolved)
      "DARK BACKGROUND — a last wave breaking on dark rocks in the lower left, then the tide drawing back into a black night sea, one faint ember seam still glowing in the rock, the question left open",
    ],
  },
};
