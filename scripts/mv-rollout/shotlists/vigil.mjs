// Vigil — Snowflake Standard shot lists (Karel approved the rollout
// 2026-10-05). Each journey: six phases bounded by its v2 deep-analysis
// sections (Supabase analyses.summary), intensities from the measured
// dynamics curve, ONE authored sparse phase at the music's real valley,
// three POV shots per phase (register first, camera hand-off last), and
// five travel-morph camera moves (phase N's last shot -> N+1's first).
// Worlds keep each track's analysis-derived motif family but are
// TRANSFIGURED (Karel: "visionary and surreal ... not literal").
// Applied by scripts/mv-rollout/apply-shotlists.mjs.

export const SET = { key: "vigil", presenting: "Vigil" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "01c987f6-17de-469b-b155-000922b479a1",
    name: "Vespers 3",
    world: "seeds of light (the thistle-down family) drifting through an evening ether: one seed → a swarm spiralling like a repeated hymn → a nebula of seed-light → the borrowed-minor shadow dims one seed to lilac → the radiant return ignites the whole sky gold → one seed at rest",
    phases: [
      P("threshold", 0, 0.15, 0.4, "threshold", "0:00-0:18 Wavering Invocation (opening)", [
        S("sparse", "DARK BACKGROUND — a single seed of luminous down drifting low in the right third of deep indigo darkness, its fine filaments a tiny starburst of amber light, vast open dark above and to the left"),
        S("micro", "extreme macro — the filaments of one seed of light at closest range, each strand a thread of honey light beaded with tiny glowing droplets, soft violet darkness beyond"),
        S("intimate", "a few seeds of light drifting together on a slow diagonal current through dusky violet air, each trailing a faint wake of gold particles"),
      ]),
      P("expansion", 0.15, 0.3, 0.65, "expansion", "0:18-0:36 Invocation gathering (0.69-0.78)", [
        S("abstract", "hundreds of glowing seeds of light swirling in a slow fibonacci spiral of warm air, amber at the core fading to violet at the edges, weighted to the lower left"),
        S("interior", "inside the drifting swarm, seeds of light passing close on every side in soft focus, a deeper golden brightness gathering ahead"),
        S("aerial", "from high above, the swarm of light-seeds spread across dark space like a slow river of amber stars curving out of frame"),
      ]),
      P("transcendence", 0.3, 0.515, 0.8, "expansion", "0:36-1:01 Pedal-Tone Hymn (0.83, steady)", [
        S("cosmic", "a vast slowly turning nebula made of countless seeds of light, honey and rose in its arms, the drift steady and even like a repeated hymn, its core off-center in the upper right"),
        S("micro", "extreme macro — the heart of one seed of light, hundreds of fine glowing filaments radiating from a tiny gold star, dust of light drifting between them in violet darkness"),
        S("aerial", "looking straight down onto a slow luminous drift of seed-light filling the lower frame, every mote glowing warm amber, deep violet darkness above"),
      ]),
      P("illumination", 0.515, 0.685, 0.5, "integration", "1:01-1:21 Borrowed Shadow (the minor valley; dip 0.72)", [
        S("sparse", "DARK BACKGROUND — one seed of light dimmed to cool lilac, small in the upper left of deep violet-grey darkness, a single cold glint at its tip"),
        S("abstract", "a slow violet-grey veil of mist drifting through deep dark space across a scatter of seed-lights, dimming them to slate, one high cold glint of light above"),
        S("micro", "extreme macro — a single filament holding a bead of cold silver light, trembling, violet shadow all around"),
      ], { sparse: true }),
      P("return", 0.685, 0.855, 1.0, "transcendence", "1:21-1:41 Radiant Return (climax 1:36, 0.88)", [
        S("cosmic", "the violet veil parting and every seed of light igniting gold at once, a vast spiral galaxy made entirely of glowing seed-filaments in deep space, kaleidoscopic depth, its core in the lower right"),
        S("abstract", "a radial bloom of golden filaments of light unfolding outward at galactic scale from an open dark center, fine particles streaming from every tip, violet space beyond"),
        S("interior", "inside the glowing swarm of seed-light, countless golden filaments streaming past on every side toward a bright distant core, kaleidoscopic depth, deep violet space between them"),
      ]),
      P("integration", 0.855, 1, 0.3, "integration", "1:41-1:58 Evening Dissolve (0.56 → 0.16)", [
        S("cosmic", "the golden spiral of seed-light drifting away into deep blue darkness as a small distant nebula in the left third"),
        S("intimate", "DARK BACKGROUND — the last few seeds of light settling slowly downward through deep blue darkness, a faint amber glow on each"),
        S("sparse", "DARK BACKGROUND — one single seed of light at rest in the lower right of vast indigo darkness, its filaments barely glowing"),
      ]),
    ],
    morphs: [
      "the few drifting seeds of light gather and begin to turn, the camera following them as they wind into a slow golden spiral",
      "the camera pulls back and up until the river of seed-light becomes the arm of a vast slowly turning nebula",
      "the warm drift dims and recedes as a violet veil passes, the camera settling close on one small cool seed of light",
      "the cold silver bead flares and the camera pulls back as the whole sky of seeds ignites gold into a radiant spiral",
      "the camera rises out of the golden core and drifts back as the spiral recedes into deep blue darkness",
    ],
  },
  {
    id: "4413b320-e6b5-471e-9163-10d1c496a67d",
    name: "Vespers 2",
    world: "an evening prayer held inside a sky of slate-violet vapor — the open G fifth is two low threads of gold light, the major/minor thirds an amber seam against violet shadow, the Lydian burst a fractal bloom of gold opening in the vapor (prototype approved for rollout)",
    phases: [
      P("threshold", 0, 0.246, 0.45, "threshold", "0:00-0:42 Shadowed Invocation → First Warmth", [
        S("sparse", "DARK BACKGROUND — two tiny parallel threads of low gold light hanging in deep indigo emptiness at the lower left, held perfectly still like a sustained chord, a few violet motes drifting high above them, vast open darkness filling the upper right"),
        S("micro", "extreme macro — inside a single thread of gold light, a slow river of amber particles flowing between faint violet filaments of vapor, each particle a tiny glowing bead, the edges of the river dissolving into dark"),
        S("interior", "a warm amber hollow of light opening inside folds of slate-violet vapor, its soft luminous walls breathing, gold particles spilling from it into the surrounding dusk, the vapor fractal and translucent at its edges"),
      ]),
      P("expansion", 0.246, 0.393, 0.45, "integration", "0:42-1:07 Descent to Dominant — the valley (0.58 at 1:00)", [
        S("sparse", "DARK BACKGROUND — one small curl of violet vapor holding a single ember spark at its heart, low in the right third, everything else deep black silence"),
        S("interior", "descending through soft horizontal veils of slate and violet vapor floating in open space, the veils sliding upward past the view, one dim seam of amber light far above, deep blue-black emptiness below"),
        S("abstract", "the curl of vapor tightening into a slow fibonacci spiral of violet and slate particles, the ember at its center brightening to gold, faint radial lines of light beginning to reach outward through the dark"),
      ], { sparse: true }),
      P("transcendence", 0.393, 0.557, 1.0, "transcendence", "1:07-1:35 Lydian Ascent — climax 1:25 (0.92)", [
        S("interior", "rising up through billowing violet vapor that parts on every side around the view, a vast open blaze of gold light above, luminous fractal folds swirling past, particles swept upward"),
        S("cosmic", "the whole vapor sea seen from far above as a vast slowly turning galaxy of violet mist with a burning gold core, kaleidoscopic radial arms of particles, the core placed high in the upper right, deep space around it"),
        S("abstract", "a radial fractal bloom of gold and violet light unfolding in layers like the petals of a cosmic flower, each petal made of drifting particles, its center an open point of dark, weighted to the left third"),
      ]),
      P("illumination", 0.557, 0.685, 0.9, "illumination", "1:35-1:57 Major Benediction (second crest)", [
        S("aerial", "looking straight down into a vast field of honey-gold vapor folds glowing from within, the folds curling into soft fractal spirals with violet shadow in their depths, fine luminous particles rising out of them toward the view, the gold weighted to the lower right"),
        S("micro", "macro — beads of gold light suspended in warm vapor, each bead holding a tiny reflected bloom of the whole sky inside it, worlds within worlds, soft violet darkness between them"),
        S("cosmic", "a vast slow halo of gold particles circling an open dark center, light lying broad and calm, the ring offset low and left with violet dusk above"),
      ]),
      P("return", 0.685, 0.861, 0.65, "return", "1:57-2:27 Evening Recedes", [
        S("aerial", "pulling back and up from the gold vapor folds as they gather into a soft spiral, blue-grey dusk spreading across them, the last warm seams glowing along their curves"),
        S("cosmic", "the spiral drifting away into indigo space as a small distant nebula of violet and fading amber in the left third, the rest of the frame open deep blue darkness"),
        S("intimate", "a few last amber motes falling slowly through deep blue vapor, each trailing a faint thread of light"),
      ]),
      P("integration", 0.861, 1, 0.3, "integration", "2:27-2:51 Vanishing Fifth (0.14)", [
        S("sparse", "DARK BACKGROUND — the two tiny parallel threads of gold light again, small at the lower right, one slowly dimming, a single violet mote resting between them, enormous dark above"),
        S("micro", "closest view of a single fading ember particle, faint concentric rings of warm light around it dissolving into black"),
        S("sparse", "DARK BACKGROUND — near-black indigo emptiness with one faint hair-thin thread of gold light drifting across the lower third, a few violet motes, almost nothing against everything"),
      ]),
    ],
    morphs: [
      "the warm amber hollow closes and dims as the camera sinks, leaving one small curl of violet vapor with an ember at its heart",
      "the single ember spark in the small violet curl grows brighter and the view draws back and up until the curl is revealed as the gold core of a vast slowly turning galaxy of violet vapor",
      "the camera drifts down out of the gold bloom into a field of honey-gold vapor folds glowing from within",
      "the camera pulls back and up from the halo of gold particles as the folds below gather into a soft spiral under blue-grey dusk",
      "the falling amber motes thin out and settle until only two tiny parallel threads of gold light remain in the dark",
    ],
  },
  {
    id: "910e6b62-abb8-40d1-bd31-ccdf6038f122",
    name: "Lantern",
    world: "husks of light (the physalis family) that breathe: one ember kindles inside a veined husk → husks multiply along a spiral stem of light → a winding trail, half dimming to lace skeletons in the borrowed shadow → one lace skeleton rekindles an ember → a constellation of husks rises into an indigo infinity → one lace skeleton still glowing",
    phases: [
      P("threshold", 0, 0.081, 0.4, "threshold", "0:00-0:25 Kindling (0.42-0.58)", [
        S("sparse", "DARK BACKGROUND — one tiny ember of amber light kindling inside a translucent veined husk, small in the lower left of deep indigo darkness, a few sparks drifting upward"),
        S("micro", "extreme macro — the veins of a glowing husk at closest range, a lace of fine luminous threads with amber light breathing behind them"),
        S("intimate", "the single husk of light swelling and dimming slowly like a breath, its glow spreading in soft rings across the dark"),
      ]),
      P("expansion", 0.081, 0.28, 0.7, "expansion", "0:25-1:26 Gathering Warmth → Clear Glow (0.72)", [
        S("abstract", "many small husks of amber light multiplying along a slow spiral stem of light, each glowing at a different brightness, dusky violet space around them"),
        S("interior", "inside a floating cluster of translucent lace shells of amber light, their luminous veined walls curving overhead, sparks drifting between them, indigo space beyond"),
        S("micro", "macro — a husk's papery skin turning clear as glass, its seed-heart a tiny glowing pearl of honey light floating inside"),
      ]),
      P("transcendence", 0.28, 0.45, 0.8, "expansion", "1:26-2:19 First Crest, then the first shadow (A♭m6, C♭)", [
        S("aerial", "from high above, a winding trail of hundreds of glowing amber husks curving through dark space like a slow river of light"),
        S("abstract", "a wave of dusky violet shadow passing through the trail, half the husks dimming to their veined lace skeletons of light, the rest still glowing"),
        S("micro", "extreme macro — a dimmed lace skeleton of light, its empty luminous veins holding faint violet glints"),
      ]),
      P("illumination", 0.45, 0.703, 0.55, "integration", "2:19-3:37 Turning Toward A♭ → Deep Ember (valley 0.41 at 3:05)", [
        S("sparse", "DARK BACKGROUND — one small fragile shell of luminous lace veins floating in the upper right of vast indigo darkness, a single deep orange ember glowing inside it"),
        S("micro", "macro — the ember inside the lace brightening with each slow breath, sparks spiralling up through the luminous veins"),
        S("abstract", "a slow spiral of small violet-tinged lace shells of light floating in dark space, each one rekindling amber in turn"),
      ], { sparse: true }),
      P("return", 0.703, 0.907, 1.0, "transcendence", "3:37-4:40 Lantern Raised → Steady Flame (climax 3:41, 0.85)", [
        S("cosmic", "a vast constellation of thousands of small glowing lace shells of light rising through indigo infinity at many depths, the brightest cluster weighted to the upper right, kaleidoscopic depth"),
        S("cosmic", "the rising husks forming the arms of a slow golden galaxy of light, amber and violet, weighted to the lower left"),
        S("abstract", "a radial mandala of glowing veined husks of light arranged in widening rings around an open dark center, honey gold at full radiance"),
      ]),
      P("integration", 0.907, 1, 0.3, "integration", "4:40-5:09 Glow Into Night (0.1)", [
        S("cosmic", "the constellation of husks drifting away into deep blue darkness, a small distant cluster of amber light in the right third"),
        S("intimate", "DARK BACKGROUND — a few last glowing husks of light sinking slowly through blue darkness, their glow softening"),
        S("sparse", "DARK BACKGROUND — one single lace skeleton of light still glowing softly amber in the lower left of deep blue darkness, faint dust of light around it"),
      ]),
    ],
    morphs: [
      "the single breathing shell of veined amber light divides and multiplies, the camera drifting back as small glowing lace shells bloom one by one along a slow spiral of light in empty indigo space",
      "the camera rises and pulls back until the cluster of husks becomes one bend in a winding trail of hundreds of glowing husks",
      "the violet shadow deepens and the camera drifts close to one lace skeleton of light as a single deep orange ember wakes inside it",
      "the rekindled lace skeletons lift and rise, the camera pulling back as they become a vast constellation climbing into indigo infinity",
      "the camera drifts back from the radiant mandala as the whole constellation recedes into deep blue darkness",
    ],
  },
  {
    id: "bd748991-a67b-41dc-af94-ac3f612a27c4",
    name: "Open Jam",
    world: "a resonant sea made of dark light: the E drone is a faint green glow far below → black liquid-glass swells veined with verdigris-green that never break → in the C-major clearing one small shaft of gold → the plateau's tarnished-gold pool → the E7♯9 storm as a towering nebula veined with ember-red light, the Phrygian lament as ember seams in black glass → a last great wave of light, then the drone again",
    phases: [
      P("threshold", 0, 0.116, 0.3, "threshold", "0:00-0:39 Drone Awakening (0.14 → 0.46)", [
        S("sparse", "DARK BACKGROUND — one faint grey-green glow reaching up from infinite black depth, a single thread of pale light in the right third, everything else silent dark"),
        S("micro", "extreme macro — a single slow ripple of dark liquid light at closest range, its crest edged with tiny pale green particles"),
        S("interior", "deep inside a vast dark resonant space, faint concentric ripples of grey-green particles spreading slowly outward from far below like a held low tone"),
      ]),
      P("expansion", 0.116, 0.274, 0.75, "expansion", "0:39-1:32 Suspended Swell → Eleventh Hour (0.84)", [
        S("abstract", "an immense slow arc of verdigris-green luminous particles sweeping upward across the deep black frame like a held breath, translucent filaments of light inside it, vast darkness around"),
        S("aerial", "from high above, an infinite dark field of slow luminous undulations made of fine green and slate particles, long lines of pale light tracing each crest"),
        S("micro", "macro — a fine edge of verdigris-green light dissolving into suspended particles of slate and green in black space, like spray made of starlight"),
      ]),
      P("transcendence", 0.274, 0.354, 0.4, "integration", "1:32-1:59 C Major Clearing (valley 0.41)", [
        S("sparse", "DARK BACKGROUND — one small shaft of warm gold light falling through dark haze in the upper left, a few motes turning gold inside it, everything else deep black"),
        S("micro", "extreme macro — golden motes suspended in the shaft of light, each one a tiny prism, dark haze beyond"),
        S("intimate", "the gold shaft widening softly, pale haze glowing around it, the dark swells beneath catching a single line of warm light"),
      ], { sparse: true }),
      P("illumination", 0.354, 0.527, 0.75, "expansion", "1:59-2:57 Return to the Drone → Relative Major Plateau (0.86)", [
        S("interior", "sinking down through layered translucent veils of indigo and verdigris-green haze floating in open black space, one thin seam of gold far above"),
        S("aerial", "a wide still expanse of dark liquid light holding a pool of tarnished gold, long luminous reflections stretching across it, haze above"),
        S("abstract", "the gold pool fracturing into a slow fractal pattern of light across the dark surface, ripples of green and gold interlocking"),
      ]),
      P("return", 0.527, 0.853, 1.0, "transcendence", "2:57-4:47 E7♯9 Storm → Chromatic Descent → Phrygian Lament (0.86-0.88)", [
        S("cosmic", "towering dark nebula-clouds lit from within by branching veins of white and ember-red light, an infinite churning darkness beneath them, immense and turbulent"),
        S("abstract", "the storm as a vast kaleidoscopic vortex of indigo and ember-red currents spiralling around a dark eye, lightning-like filaments of light tracing its arms"),
        S("micro", "extreme macro — ember-red seams of light glowing across an expanse of black glass-like darkness, flaring with each slow pulse, droplets of light draining along them"),
      ]),
      P("integration", 0.853, 1, 0.6, "return", "4:47-5:37 Final Crest (climax 4:52, 0.90), then the fade", [
        S("cosmic", "a last great curling arc of ember and gold particles sweeping across deep space, its leading edge blazing, fragments of light scattering outward into the dark"),
        S("intimate", "DARK BACKGROUND — scattered red and gold sparks of light floating slowly downward through infinite black depth, dimming one by one"),
        S("sparse", "DARK BACKGROUND — one faint grey-green glow far below in infinite darkness, a single ember-red spark above it"),
      ]),
    ],
    morphs: [
      "the pulsing rings of grey-green light swell upward, the camera lifting with them until a vast swell of black liquid glass rises across the frame",
      "the green particles settle and fade as the camera drifts slowly upward into calm empty darkness where one small soft shaft of warm gold light appears",
      "the gold shaft narrows and the camera sinks back down through layered indigo and verdigris-green veils",
      "the fractal ripples of gold darken and lift into towering nebula-clouds veined with ember-red light, the camera pulling back to reveal their scale",
      "the ember-red seams flare and gather into a last great curling wave of dark light, the camera drawing back as it rises",
    ],
  },
  {
    id: "dc8d9705-785a-485e-b91f-a12c85bf7b92",
    name: "Testimony 3",
    world: "amber as light kept and then spoken: one bead of glowing amber holding a spark → worlds held inside drops of honey light → a galaxy-scale cascade of amber at the E♭ radiance → the minor-iv shadow dims one drop to umber and rose → every seam ignites into a radiant web at the declaration → one drop at rest",
    phases: [
      P("threshold", 0, 0.116, 0.4, "threshold", "0:00-0:21 Pedal-Tone Invocation (0.29 → 0.68)", [
        S("sparse", "DARK BACKGROUND — a single bead of glowing amber light floating weightless in the lower right of deep umber darkness, a tiny spark held motionless inside it"),
        S("micro", "extreme macro — inside the bead of amber light, a suspended miniature world of golden dust and fine filaments held mid-drift, worlds within worlds"),
        S("intimate", "more beads of amber light waking one by one along a slow curving seam of light in the dark, each holding its own small glow"),
      ]),
      P("expansion", 0.116, 0.32, 0.7, "expansion", "0:21-0:58 Gathering Statement (0.68-0.83)", [
        S("abstract", "honey-gold light flowing slowly along branching fractal channels through dark space, beads of light swelling where the channels meet, motes rising in widening shafts"),
        S("interior", "inside a vast drop of amber light, warm translucent depths curving around the view, suspended golden particles drifting past"),
        S("aerial", "from high above, a slow river of molten amber light branching across deep umber darkness, rose-tinted at its edges"),
      ]),
      P("transcendence", 0.32, 0.49, 0.9, "illumination", "0:58-1:29 E♭ Radiance (0.89)", [
        S("cosmic", "a vast glowing cascade of amber light pouring across infinite dark space like a galaxy made of honey, translucent and lit from within, weighted to the upper left"),
        S("micro", "macro — light passing through layered amber, revealing tiny suspended stars and fine golden filaments held inside"),
        S("abstract", "a kaleidoscopic mandala of translucent amber light-shards and fine honey filaments arranged in radiating fractal layers around an open dark center, rose at the edges"),
      ]),
      P("illumination", 0.49, 0.62, 0.5, "integration", "1:29-1:52 Shadow and Ascent (minor iv at 1:32; dip 0.74)", [
        S("sparse", "DARK BACKGROUND — one small drop of amber dimmed to deep umber and dusty rose, alone in the upper left of vast darkness, a faint glow at its core"),
        S("micro", "extreme macro — a shadow crossing the inside of the dimmed drop, its suspended particles turning slate and rose"),
        S("interior", "rising up through dark layered amber toward a bright seam of gold above, the shadow falling away beneath"),
      ], { sparse: true }),
      P("return", 0.62, 0.855, 1.0, "transcendence", "1:52-2:35 Climax and Return (1:55, 0.94)", [
        S("cosmic", "the declaration — every seam of amber light in the dark igniting at once into a radiant web of honey gold spanning infinite space, kaleidoscopic depth"),
        S("abstract", "a vast radial burst of golden light streaming outward from translucent amber layers around an open dark center, rays of rose and gold through drifting particles, offset to the lower left"),
        S("aerial", "looking down onto a vast slowly glowing expanse of amber light easing toward deeper gold and dusty rose, warm particles settling"),
      ]),
      P("integration", 0.855, 1, 0.3, "integration", "2:35-3:01 Low Amen (0.24 → 0.11)", [
        S("intimate", "DARK BACKGROUND — a few small beads of amber light drifting slowly downward through muted indigo darkness, each trailing faint gold dust"),
        S("micro", "extreme macro — the last floating bead of amber light at closest range, a faint warm spark and fine golden dust suspended inside it, worlds within worlds"),
        S("sparse", "DARK BACKGROUND — a single tiny bead of amber light floating in the lower left of deep indigo emptiness, one last warm glint, faint dust of light around it"),
      ]),
    ],
    morphs: [
      "the waking beads of amber light swell and join, the camera following as their seam branches into fractal channels of flowing honey-gold light",
      "the camera pulls back and up from the branching amber river until it pours across infinite space as a galaxy-scale cascade of amber light",
      "the radiant amber bloom dims and contracts, the camera drifting close to one small drop gone umber and rose in the dark",
      "the camera rises through the dark amber toward the gold seam, which ignites into a radiant web of honey light spanning the dark",
      "the warm expanse of amber light gathers into a few glowing drops that sink slowly into indigo dusk as the camera settles",
    ],
  },
  {
    id: "d92c2d3a-4283-4300-abc3-d71ed7c6848d",
    name: "Calling",
    world: "a call as a pulse of light sent across luminous distance: one honey pulse → a blue pulse answers → waves of light interleave through glowing mist → the plateau's long ridges of gold → in the breath one faint ring hangs alone → at the summit countless rings converge from every direction → the call recedes to one rose ring",
    phases: [
      P("threshold", 0, 0.164, 0.35, "threshold", "0:00-0:21 Opening Calls (0.32 → 0.71)", [
        S("sparse", "DARK BACKGROUND — a single small pulse of honey light sent out from the lower left into vast dark haze, one faint ring of light expanding from it"),
        S("micro", "extreme macro — the leading edge of the pulse at closest range, a thin arc of gold particles pushing through soft luminous mist"),
        S("intimate", "seen from above in dark haze, two wide soft ripples of particles, one gold and one pale blue, spreading toward each other from opposite corners of the frame"),
      ]),
      P("expansion", 0.164, 0.32, 0.7, "expansion", "0:21-0:41 Widening Answer (0.87)", [
        S("abstract", "concentric waves of gold and sky-blue light travelling across luminous mist and interweaving where they meet, an interference of soft rings"),
        S("aerial", "from high above, waves of light rolling across an endless expanse of glowing mist, the crests catching honey gold"),
        S("micro", "macro — where two waves of light cross, a bright knot of gold and blue particles blooming in the mist"),
      ]),
      P("transcendence", 0.32, 0.468, 0.75, "expansion", "0:41-1:00 Plateau of the Fourth (0.84)", [
        S("aerial", "drifting slowly above a vast plateau of glowing mist, long ridges of gold light rippling through it in a warm breeze of particles"),
        S("cosmic", "the ripples of light seen from far away as a vast interference pattern of gold and pale blue particles drifting across a dark nebula of mist, weighted to the lower left"),
        S("interior", "inside the luminous mist, soft veils of honey light passing close on every side, faint rings travelling through them"),
      ]),
      P("illumination", 0.468, 0.553, 0.45, "integration", "1:00-1:11 the breath before the summit (dip 0.64)", [
        S("sparse", "DARK BACKGROUND — one faint soft ripple of pale gold particles drifting alone in the upper right of deep blue darkness, held"),
        S("micro", "macro — the thin ring at closest range, fine motes of light orbiting along it"),
        S("abstract", "the ring beginning to multiply into a slow spiral of rings of light rising through the dark"),
      ], { sparse: true }),
      P("return", 0.553, 0.75, 1.0, "transcendence", "1:11-1:36 Full-Voiced Summit (climax 1:31, 0.91)", [
        S("cosmic", "the summit — countless concentric ripples of golden light particles converging from every direction through a vast nebula of luminous mist that fills the whole frame, every crest glowing at once, kaleidoscopic depth"),
        S("abstract", "a radiant mandala of interlocking rings of gold and sky-blue light around an open dark center, weighted to the upper left"),
        S("aerial", "sweeping across an endless expanse of glowing gold mist, the waves of light lifting and travelling on toward the edge of the frame"),
      ]),
      P("integration", 0.75, 1, 0.3, "integration", "1:36-2:08 Receding Echo (0.13)", [
        S("cosmic", "the ripples of light receding into deep dark space as a small faint swirl of gold and blue particles in the left third"),
        S("intimate", "DARK BACKGROUND — the last soft ripples of rose-gold particles thinning slowly into dark blue mist"),
        S("sparse", "DARK BACKGROUND — one small fading ripple of rose-gold particles, almost gone, low in the right third of vast darkness"),
      ]),
    ],
    morphs: [
      "the two small rings of light expand until they meet, the camera rising as their waves interleave across the luminous mist",
      "the camera glides forward over the crossing waves until long ridges of gold light ripple across a vast plateau of glowing mist",
      "the glowing mist thins and dissolves completely into empty black space, the camera settling on one faint ring of pale gold light hanging alone in the dark",
      "the spiral of rings rises and multiplies, the camera pulling back as countless rings of golden light converge from every direction",
      "the camera drifts back and away as the waves of light settle and recede into deep dusk",
    ],
  },
  {
    id: "87e106f9-4d74-4886-b944-fd625a827b02",
    name: "First Light",
    world: "light arriving low and slow, reflected (the estuary family transfigured): a grey-blue seam under an infinite dark mirror-plane → thin threads of light trickle and branch → in the suspended questions one high band hangs over the dark → at the subdominant dawn the whole plane ignites into a delta of gold channels → an even milky afterglow → the seam again",
    phases: [
      P("threshold", 0, 0.16, 0.35, "threshold", "0:00-0:24 Low Embers Waking (0.28 → 0.72)", [
        S("sparse", "DARK BACKGROUND — the faintest seam of grey-blue light pressing up along the lower edge of an infinite dark mirror-plane, one tiny thread of pale gold in the right third"),
        S("micro", "extreme macro — a dark mirror surface at closest range, rippled into fine ridges, each ridge holding a single pewter glint of light"),
        S("intimate", "thin pale threads of light beginning to trickle across the dark mirror-plane, branching slowly, their tips glowing ochre"),
      ]),
      P("expansion", 0.16, 0.4, 0.7, "expansion", "0:24-1:00 Plagal Tide (0.71-0.78)", [
        S("aerial", "seen from very high above, a vast soft delta of slate-blue light threads spreading slowly across an infinite dark mirror-plane, calm and glowing gently, deep black between them"),
        S("abstract", "slow swells of soft light sliding across the dark plane and drawing back, leaving fractal patterns of glowing threads"),
        S("micro", "macro — one channel of light at closest range, pewter and ochre particles flowing through it like a slow tide of light"),
      ]),
      P("transcendence", 0.4, 0.54, 0.45, "integration", "1:00-1:21 Suspended Questions (dip 0.65)", [
        S("sparse", "DARK BACKGROUND — one single high band of pale light hanging across the upper third of vast darkness, everything below still and black"),
        S("micro", "extreme macro — a thread of pale light breaking into tiny suspended droplets of rose and silver light, held still"),
        S("abstract", "the thread of light slowly splitting into a fan of thinner threads reaching down into the dark"),
      ], { sparse: true }),
      P("illumination", 0.54, 0.787, 1.0, "transcendence", "1:21-1:58 Subdominant Dawn (climax 1:57, 0.83)", [
        S("cosmic", "the whole dark plane igniting at once — thousands of branching channels of warm gold light seen from far above like a vast luminous delta, kaleidoscopic depth"),
        S("aerial", "a dense fractal web of branching channels of gold light filling the frame seen from directly above, soft luminous mist hovering over them, deep black between the channels, abstract"),
        S("abstract", "a radiant fractal of gold, ochre and rose channels of light spreading outward from one open dark point in the lower right"),
      ]),
      P("return", 0.787, 0.9, 0.5, "return", "1:58-2:15 Lydian Afterglow", [
        S("aerial", "looking straight down onto the dark mirror-plane as its gold channels soften into an even pale milky glow of fine particles"),
        S("micro", "macro — fine pale mist lifting off a channel of light, particles of milky white rising slowly"),
        S("intimate", "a few soft threads of light drifting apart across the dark"),
      ]),
      P("integration", 0.9, 1, 0.3, "integration", "2:15-2:30 the exhale (0.22)", [
        S("cosmic", "the web of light channels seen from very far away, a small pale glowing fractal shape adrift in the left third of deep dark space"),
        S("intimate", "DARK BACKGROUND — one thread of warm light lying still in the darkness"),
        S("sparse", "DARK BACKGROUND — the faintest seam of warm light along the lower edge of infinite darkness, at rest"),
      ]),
    ],
    morphs: [
      "the trickling threads of light branch and spread, the camera rising until they become channels of slate-blue light veining an infinite dark plane",
      "the fractal threads draw back into the dark and the camera lifts until only one high band of pale light hangs above the black",
      "the fan of threads reaches the plane and the camera pulls up and back as thousands of channels ignite gold at once",
      "the radiant channels soften and the camera drifts down as the gold settles into an even milky glow",
      "the drifting threads thin and the camera draws back until the plane of light is a small pale shape in the dark",
    ],
  },
];
