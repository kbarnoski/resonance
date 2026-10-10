// Expansion batch 3 — Journey Archetype shot lists (2026-10-09), modelled on
// the approved expansion-sample.mjs (Tranquility 21, Sancerre Cry 4, The
// Other Side 9). Setlist positions 18-26: Tranquility 3, Night Wind 4,
// Torraine 7, Tranquility 36, Yellow Bird 6, Redwoods Sway 2, Tranquility 33,
// Cabin Soul 6.
//
// Phase ids, bounds and intensities are the journeys' CURRENT ones (v2
// measured arcs from the 2026-10-05 re-theme); `music` names the
// deep-analysis sections each phase holds. Each journey keeps its
// analysis-derived world (theme.worldRationale + palette), deepened with the
// v2 sections and TRANSFIGURED per law L. One sparse phase per journey at the
// music's real interior valley. Applied by scripts/mv-rollout/apply-shotlists.mjs.

export const SET = { key: "expansion-batch-3", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "666436a4-eabf-4b0a-b6bc-665520daa687",
    name: "Tranquility 3",
    world: "C# major at 64 BPM, the lowest and sparsest Tranquility, one tonal field slowly lit from different angles and ending on the same bare open fifth it found at 0:10 — a black mirror of still water seen from directly above, one breath of mist over it: a tide of lit mist reaching further and held back, the Lydian plateau igniting the whole mirror champagne-white, a walking afterglow of small rings, and two quiet points of light left open",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:10 Clouded Threshold (haze, the bass foothold at 0:10)", [
        S("sparse", "DARK BACKGROUND — a single thin breath of luminous silver mist curling just above a black mirror in the lower right of vast darkness, one faint low tone of champagne light caught inside it, the rest of the frame open black"),
        S("micro", "extreme macro — the breath of mist at closest range above the black mirror, countless suspended droplets glowing pale silver and amber at different depths, impossible stillness, each droplet holding a tiny reflection of the dark"),
        S("aerial", "looking straight down from high above at an immense black mirror of still water filling the frame edge to edge, one faint thread of luminous mist drawn across it, the camera beginning to descend toward it"),
      ]),
      P("expansion", 0.05, 0.51, 0.62, "expansion", "0:10-1:44 Clouded Threshold → Suspended Questions (0:24) → Mediant Pedal Bloom (0:46) → Rising Tide, Held Back (1:09)", [
        S("interior", "within the slow layers of mist lifting off the black mirror, translucent sheets of silver light passing close on every side, amber glow catching each layer without breaking through, the camera gliding forward between them"),
        S("micro", "macro — a still pool of warm amber light spreading across the dark mirror surface, its hue shifting slowly from umber to gold to dusky rose while the surface stays perfectly still, fine particles of mist suspended above it"),
        S("aerial", "from directly above, long slow swells of luminous mist creeping across the black mirror one after another, each reaching a little further than the last, then a held band of glassy stillness before the next, filling the frame edge to edge"),
      ]),
      P("transcendence", 0.51, 0.644, 1, "transcendence", "1:44-2:12 Lydian Plateau (climax 1:52, the brightest, widest moment)", [
        S("cosmic", "cosmic — the whole black mirror igniting at once from edge to edge, pale champagne-white light pouring across it in broad luminous bands, the reflection opening into a vast starfield beneath the surface, infinite and weightless, the camera rising and widening to reveal it"),
        S("micro", "extreme macro at the height of the light — the mirror surface at closest range, a fine shimmer of rose and champagne light trembling across it in prismatic threads, tiny suspended motes blazing above"),
        S("abstract", "abstract — wide level ribbons of champagne gold and dusky rose light stacked across darkness, opening slowly sideways like a held chord, luminous and weightless, their edges dissolving into mist"),
      ]),
      P("illumination", 0.644, 0.704, 0.45, "integration", "2:12-2:24 Descending Bass, Softened (the afterglow: a tender walking bass under a held tonic) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ring of warm afterglow spreading slowly across a black mirror in the upper left of immense darkness, a faint curl of lit mist above it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single drop of champagne light falling toward the black mirror, a fine ring of light waiting where it will land, translucent mist hanging motionless above"),
        S("aerial", "from high above, a slow line of small rings of light stepping across the dark mirror one after another at walking pace, each fading as the next appears, the camera drifting with them"),
      ], { sparse: true }),
      P("return", 0.704, 0.867, 0.47, "return", "2:24-2:58 Descending Bass, Softened → Open-Fifth Lullaby (2:49, rocking I-IV)", [
        S("abstract", "abstract — fine vertical strands of lit mist swaying slowly side to side across darkness in a gentle rocking rhythm, gold fading toward pale blue along their length, translucent and dissolving"),
        S("intimate", "close — the mist thinning to faint translucent threads over the black mirror, the last gold in them cooling to slate blue, impossible stillness beneath"),
        S("aerial", "rising slowly away while looking straight down, the black mirror shrinking far below to a dark oval rimmed with a thin line of pale blue light, wisps of luminous mist curling off its edge"),
      ]),
      P("integration", 0.867, 1, 0.32, "integration", "2:58-3:25 Open-Fifth Lullaby (ends on the bare C# fifth of 0:10, at peace, still open)", [
        S("cosmic", "cosmic — from immense height the black mirror becomes one small dark pool in a vast quiet starfield, two faint points of light resting on it like an open fifth, slate blue and gold, rocking gently"),
        S("micro", "extreme macro — two tiny droplets of light side by side on the black mirror, one gold and one slate blue, luminous mist breathing over them, calm and unresolved"),
        S("sparse", "DARK BACKGROUND — a single thin breath of luminous silver mist curling just above a black mirror in the lower right of vast darkness, the bookend of the first light, left open"),
      ]),
    ],
    morphs: [
      "the camera descends toward the faint thread of mist until it is gliding inside the slow lifting layers of silver light",
      "the held band of stillness breaks and the camera rises and widens as the whole mirror ignites champagne-white",
      "the ribbons of light dim and the camera settles close on one small ring of afterglow alone on the dark mirror",
      "the stepping rings soften into strands of mist and the camera drifts with them as they begin to rock side to side",
      "the camera keeps rising until the dark mirror is one small pool holding two faint points of light among the stars",
    ],
  },
  {
    id: "87009cf3-8c07-48eb-88d8-e7acb6a14e41",
    name: "Night Wind 4",
    world: "C# major nocturne at 67 BPM, Lydian IV glow, plagal and circling, peaking as a lift at 1:28 then clouding over in minor eddies and fading on a bare fifth — the wind made visible on a night canopy: silver undersides of leaves turning in waves, a crest that streams into the stars, a heavy undertow beneath the glitter, circling eddies, and one last leaf going still under cold starlight",
    phases: [
      P("threshold", 0, 0.105, 0.59, "threshold", "0:00-0:22 Gathering Breath (stirring out of near-silence, the Lydian IV glimpsed at 0:07)", [
        S("sparse", "DARK BACKGROUND — a single small cluster of leaves turning their silver undersides to a first breath of night air, low in the lower left of deep indigo darkness, edges catching a faint amber-silver light, the rest of the frame open black"),
        S("micro", "extreme macro — the pale underside of one leaf at closest range, fine veins glowing silver like threads of moonlight, tiny beads of night dew trembling as the air begins to stir"),
        S("aerial", "from high above, looking straight down on a dark night canopy, a first faint wave of luminous silver passing across it where the leaves turn, the camera descending toward it"),
      ]),
      P("expansion", 0.105, 0.21, 0.83, "expansion", "0:22-0:44 Wind Rising (the I-ii-IV-I loop swells toward G#7sus4 at 0:42)", [
        S("interior", "riding inside a rising current of night air, countless leaves of silver light streaming past on every side, warm amber glowing faintly beneath them, each gust carrying them higher"),
        S("abstract", "abstract — long parallel waves of silver light rolling diagonally across indigo darkness, each crest a little higher and brighter than the last, fine luminous particles shed from every crest"),
        S("micro", "macro — a spray of tiny silver-green motes torn from the edge of one turning leaf, glittering as they lift into the dark, the amber undertone glowing through them"),
      ]),
      P("transcendence", 0.21, 0.491, 0.96, "transcendence", "0:44-1:43 Lydian Plateau (F#maj9#11, the warmest passage) → Crest of the Gust (summit 1:29)", [
        S("aerial", "looking straight down on an immense night canopy filling the frame edge to edge like a moving sea of luminous texture, broad soft bands of silver-gold rolling all one way across it in a steady unbroken current, the camera gliding with the wind"),
        S("cosmic", "cosmic — the crest of the gust: the whole canopy flashing silver at once and lifting into a vast streaming nebula of leaf-light swept across the starfield, pale silver and warm amber, infinite indigo depth around it, the camera soaring up through it"),
        S("micro", "extreme macro at the height of the gust — a single silver leaf edge blazing with moonlight, fine filaments of light streaming off it into the dark like sparks"),
      ]),
      P("illumination", 0.491, 0.749, 0.94, "illumination", "1:43-2:37 Undertow (low C# and A# pedals, the relative minor clouds the light) → Minor Eddies (D#m11 held at 2:17)", [
        S("interior", "beneath the surface of the canopy, a deep slow undertow of indigo shadow rolling heavily in the dark while the roof above still glitters with scattered silver points, the camera sinking through it"),
        S("abstract", "abstract — a slow spiral of luminous leaf-light circling in shifting eddies over black, the light fragmenting into rings and crescents, a brooding violet shade at its heart"),
        S("aerial", "from high above, several eddies of silver light turning over the dark canopy at once, their spirals crossing and folding into one another, slate and pewter shadow between them"),
      ]),
      P("return", 0.749, 0.892, 0.76, "integration", "2:37-3:07 Drifting to F# (the energy drains, the wind changing direction as it fades) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small silver leaf of light settling slowly in a loose spiral in the upper right of immense indigo darkness, a faint trail of motes behind it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single bead of dew on the tip of a dark leaf, holding a tiny reflection of a clearing heaven of stars, the air around it going still"),
        S("aerial", "rising slowly above the canopy while looking straight down, the silver waves fading to a soft grey-green drift, the last eddies loosening into calm, translucent mist settling over them"),
      ], { sparse: true }),
      P("integration", 0.892, 1, 0.37, "integration", "3:07-3:30 Unresolved Stillness (dwindles to a whisper, ends on a bare F#-C# fifth)", [
        S("cosmic", "cosmic — from immense height the dark canopy becomes a faint grey-green band beneath a cold wide starfield, one last breath of silver crossing it and fading, unresolved"),
        S("sparse", "DARK BACKGROUND — a single small cluster of leaves turning silver in the lower left of deep indigo darkness, still swaying faintly, the bookend of the first breath"),
        S("micro", "extreme macro — one thin silver vein of light on a dark leaf, trembling once and going still, cold starlight beaded along it"),
      ]),
    ],
    morphs: [
      "the camera descends into the passing wave of silver until it is riding inside the rising current of leaf-light",
      "the lifted motes scatter and the camera pulls back high above the canopy as the steady current of silver-gold rolls beneath",
      "the streaming leaf-light falls back and the camera sinks beneath the glittering roof into the slow indigo undertow",
      "the eddies loosen and the camera settles close on one small silver leaf of light spiralling down alone",
      "the canopy calms and the camera keeps rising until it is a faint grey-green band under a cold starfield",
    ],
  },
  {
    id: "9d0ad58d-e490-4cc3-b24d-7c97d1fa3c0d",
    name: "Torraine 7",
    world: "C major, rubato, a circle-of-fifths ascent to a suspended summit at 1:06, an open-fifth stillness, an add9 bloom, then a bass that steps down until home lands one step aside in F; lyric 'tell me your name ... so I can call it true' — looking straight up into deep space: two stars joined by one thread of light, the call turning a ring of twelve lights, the thread arcing across the heavens, and the far end quietly settling on a neighbouring star",
    phases: [
      P("threshold", 0, 0.05, 0.5, "threshold", "0:00-0:12 Minor-Key Threshold (circling toward home from the relative minor)", [
        S("sparse", "DARK BACKGROUND — two small points of warm light close together in the lower right of immense darkness, joined by one fine thread of pale gold light, the rest of the frame open black"),
        S("micro", "extreme macro — the fine thread of light at closest range, a strand of pale gold filaments beaded with tiny glowing motes, soft violet darkness all around it"),
        S("cosmic", "cosmic — looking straight up into deep space, a scatter of faint stars beginning to wake around the two bright points, the thread between them glimmering, the camera drifting up toward them"),
      ]),
      P("expansion", 0.05, 0.55, 0.67, "expansion", "0:12-2:07 Minor-Key Threshold → Circle of Fifths Ascent (0:25) → Suspended Summit (peak 1:06, F/G) → Clouded Descent (1:17) → Open-Fifth Stillness (1:43)", [
        S("abstract", "abstract — a slow ring of twelve points of light turning in deep darkness, a fine curved thread reaching from each to the next around the circle, colour climbing from slate to warm gold as it turns, off-centre in the upper left"),
        S("cosmic", "cosmic — the summit: a long gently curved thread of gold light spanning immense deep space between two bright stars, countless stars around it held motionless like a suspended breath, ivory haze glowing along its arc, the camera rising toward the crest"),
        S("interior", "inside a thin veil of drifting violet mist passing across the thread of light, the gold dimming behind it to a soft blur, fine particles of haze sliding past the camera"),
      ]),
      P("transcendence", 0.55, 0.72, 1, "integration", "2:07-2:47 Open-Fifth Stillness (bare C fifths, A-flat shadows passing) → Add-Nine Bloom (2:26) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small star of pale rose light alone in the upper left of vast darkness, a faint glow slowly rising around it, nearly the entire frame empty"),
        S("micro", "extreme macro — a fine haze of warm amber dust at closest range, countless tiny glowing grains drifting at different depths through darkness, soft and translucent, the glow widening like a chord left to bloom"),
        S("aerial", "from high above, looking down across a quiet plane of drifting amber dust lit from one side, the motes turning slowly in long shafts of low light, the camera descending through them"),
      ], { sparse: true }),
      P("illumination", 0.72, 0.84, 0.95, "transcendence", "2:47-3:15 Add-Nine Bloom (Cmaj7#5) → Flat-Seven Pedal (the bass steps C, B-flat, A)", [
        S("cosmic", "cosmic — called true: looking straight up into deep space, one immense curved thread of gold light now arcing across the whole starfield from edge to edge, the two stars blazing at its ends, nebula haze of rose and violet gathered along it"),
        S("micro", "macro — the point where the thread meets one star, a knot of brilliant gold filaments flaring into prismatic sparks against the dark"),
        S("abstract", "abstract — the curved thread of light echoed outward into dozens of fine parallel arcs, a luminous fan of gold and violet lines sweeping across black, the camera traveling along them"),
      ]),
      P("return", 0.84, 0.92, 0.98, "return", "3:15-3:33 Flat-Seven Pedal → Landing in F (the diminished doorway at 3:19 leads not to C but to F)", [
        S("interior", "riding along the thread of light as it slowly bends aside, gold strands streaming past on every side toward a new softer star waiting just off its old course, violet twilight deepening"),
        S("intimate", "close — the thread thinning to a single hair of pale light, stepping gently from one star to a neighbouring one, a faint ember glow at its new end"),
        S("aerial", "from high above, the thread of light seen as a faint luminous curve across dark space, its far end quietly settling on a different star, ember violet around it"),
      ]),
      P("integration", 0.92, 1, 0.55, "integration", "3:33-3:52 Landing in F (hushed F add9, home one step to the side)", [
        S("cosmic", "cosmic — a deep starfield in violet-ember dusk, two stars and the faintest curved thread between them, one star a step aside from where it began, the glow lingering at peace"),
        S("sparse", "DARK BACKGROUND — two small points of warm light joined by one fine thread in the lower right of vast darkness, the bookend of the first call, glowing softly"),
        S("micro", "extreme macro — the last bead of ember light resting at the end of the thread, holding a tiny reflection of the whole star-filled night"),
      ]),
    ],
    morphs: [
      "the two stars drift apart and the camera pulls back as more points of light wake and begin to turn in a slow ring",
      "a violet veil passes across the thread and the camera settles close on one small rose star alone in the dark",
      "the amber dust gathers and the camera rises until a single curved thread of gold arcs across the whole starfield",
      "the fan of arcs narrows to one thread and the camera rides along it as it bends gently aside",
      "the camera pulls back from the settling thread until two stars and the faintest curve rest in a deep violet starfield",
    ],
  },
  {
    id: "4fda2ae1-d3a7-4e23-b5ca-8f696b537ad1",
    name: "Tranquility 36",
    world: "C# major at 63 BPM, almost all consonance, held chords that breathe by inner-voice steps (C#, C#+, C#6), a long G#13sus4 that finally releases, one F# chord in many colours at 2:50; lyric 'here's a power of shadow ... the bed is waking' — calm that wakes: long shadow bands withdrawing as luminous dawn light breathes across rolling grass, a turning band at the exhale, a full chord of light, and one crest holding the last line of gold",
    phases: [
      P("threshold", 0, 0.05, 0.56, "threshold", "0:00-0:10 Hushed Threshold (near-stillness, home landmarks laid out)", [
        S("sparse", "DARK BACKGROUND — a single dew-wet blade of grass in the lower right of vast darkness, a thin edge of luminous gold light just reaching its tip as a shadow withdraws, the rest of the frame open black"),
        S("micro", "extreme macro — a dewdrop on a grass blade at closest range, a tiny luminous world inside it where gold light and blue shadow trade places, glowing pale dawn silver"),
        S("aerial", "from high above, looking straight down on rolling land covered in luminous grass, long blue shadow bands lying across it and withdrawing slowly into the hollows, the camera descending toward the first warm glow"),
      ]),
      P("expansion", 0.05, 0.55, 0.81, "expansion", "0:10-1:53 Hushed Threshold → Questioning Turn (0:37) → Pedal Gathering (1:09) → Suspended Arrival (G#13sus4 1:32, release 1:41)", [
        S("interior", "inside a warm glow spreading through the grass like breath, luminous blades rising past on every side, shadows retreating ahead of the camera into the dark hollows"),
        S("abstract", "abstract — long sweeping bands of deep shadow and honeyed light alternating across black, each band of light breathing a little wider by tiny steps, sage and gold, weighted to the lower left"),
        S("micro", "macro — the edge of one shadow line sliding across luminous grass blades, the lit side glowing gold, the dark side cool lavender, dew glittering exactly on the border"),
      ]),
      P("transcendence", 0.55, 0.72, 0.87, "integration", "1:53-2:27 Suspended Arrival (home at 2:00) → Turning Toward F# (the exhale, the centre turning at 2:16) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small pool of warm light resting alone in the upper left of immense darkness, its edge softly breathing, nearly the entire frame empty"),
        S("micro", "extreme macro — a single droplet of honeyed light trembling on the tip of a dark blade, a faint lavender glint inside it, the air changing direction around it"),
        S("aerial", "looking straight down as one slow band of late gold light turns across a dark rolling land of luminous grass, the shadow following it like a tide changing course, the camera drifting with it"),
      ], { sparse: true }),
      P("illumination", 0.72, 0.84, 1, "transcendence", "2:27-2:52 Open-Field Climax (one F# chord in many colours, rolling low, peak 2:50)", [
        S("cosmic", "cosmic — the power of light: an immense rolling land of luminous grass seen from far above, swept in long golden waves edge to edge, the waves turning into spiralling currents of light that lift off into a vast radiant haze, infinite and weightless, the camera rising"),
        S("micro", "macro at the height of the light — countless tips of grass blazing gold at once, each one shedding fine particles of light into the warm air"),
        S("abstract", "abstract — one chord of light in many colours: broad rolling bands of gold, amber, sage and honeyed white layered low across darkness, swelling and folding into one another"),
      ]),
      P("return", 0.84, 0.92, 0.97, "return", "2:52-3:08 Open-Field Climax → Glowing Return (3:01, back to C#)", [
        S("interior", "within the warm wind of light, long ribbons of gold and sage streaming low across the frame, slowing as they pass, the brightness beginning to soften to amber"),
        S("intimate", "close — a last wave of gold light settling into the luminous grass, its tips glowing amber as dusk blue gathers in the hollows"),
        S("aerial", "from high above, the rolling land dimming to dusk blue, one crest still holding a long line of warm light, luminous mist settling in the hollows, the camera rising away"),
      ]),
      P("integration", 0.92, 1, 0.38, "integration", "3:08-3:25 Glowing Return (a held, slightly ambiguous C#, the door kept open)", [
        S("cosmic", "cosmic — from immense height the dim land becomes a dark curve beneath a vast quiet starfield, one thin line of warm gold still resting along a single crest, glowing rather than resolving"),
        S("sparse", "DARK BACKGROUND — a single dew-wet blade in the lower right of vast darkness, its tip holding the last edge of luminous gold light, the bookend of the waking"),
        S("micro", "extreme macro — one last dewdrop of amber light resting on a blade tip, holding a tiny reflection of the whole sleeping land"),
      ]),
    ],
    morphs: [
      "the camera descends toward the first warm glow until it is moving inside the luminous grass as the shadows retreat",
      "the shadow line slides away and the camera settles close on one small pool of warm light alone in the dark",
      "the turning band of gold swells and the camera rises as the whole land rolls into waves of light lifting into radiant haze",
      "the bands of colour stream into low ribbons and the camera glides with them as they slow toward amber",
      "the camera keeps rising until the land is a dark curve under the stars with one thin line of gold on a crest",
    ],
  },
  {
    id: "aeb508d6-6447-4fb5-8468-636924520f82",
    name: "Yellow Bird 6",
    world: "F major at 60 BPM, a small warm family of chords, a long Bb plateau with a shining #11, an open-fifth summit at 1:23, one borrowed Bbm shadow at the quietest point, ending unresolved on Bb — the morning version of the wordless hum: points of butter-yellow light waking on dark blades and lifting in curving flights, a wheeling swarm, a golden galaxy of motes at the summit, one light under a lavender shade, and a last small light left glowing",
    phases: [
      P("threshold", 0, 0.05, 0.38, "threshold", "0:00-0:07 First Light (near-silence on F/A)", [
        S("sparse", "DARK BACKGROUND — a single tiny point of butter-yellow light perched on the tip of a dark blade in the lower left of vast darkness, a faint luminous haze around it, the rest of the frame open black"),
        S("micro", "extreme macro — the point of yellow light at closest range, a glowing grain of pollen-light wrapped in fine radiant filaments, dew beads around it catching the first pale dawn"),
        S("aerial", "from high above, looking straight down on a dark dew-covered meadow, colours emerging one patch at a time as tiny yellow points wake in the luminous grass, the camera descending"),
      ]),
      P("expansion", 0.05, 0.185, 0.47, "expansion", "0:07-0:25 First Light (the chord family gathering one at a time)", [
        S("interior", "within the waking grass, tiny points of yellow light lifting from the luminous blades on every side in small curving flights, the dark slowly paling to cream around them, the camera rising with them"),
        S("micro", "macro — one yellow mote lifting off a blade tip, a fine spiral trail of glittering particles curling behind it in the dawn air"),
        S("abstract", "abstract — dozens of small curving arcs of yellow light traced across darkness, each arc a single flight, overlapping in a loose spiral pattern, sage-green haze behind them"),
      ]),
      P("transcendence", 0.185, 0.328, 1, "illumination", "0:25-0:44 Bb Plateau, Minor Shade (the shining #11, then a reflective turn toward D minor)", [
        S("aerial", "looking straight down as thousands of small yellow lights rise from the whole dark land and wheel together in great curving flights, a luminous swirl of points across a pale gold haze"),
        S("micro", "extreme macro — warm gold patches of light resting on deep green moss in shadow, a few yellow motes settling into them, translucent and glowing"),
        S("interior", "inside a slow wheeling swarm of yellow light-points, a cool lavender shade passing through them for a moment, the points dimming to honey and then brightening again, the camera turning with them"),
      ]),
      P("illumination", 0.328, 0.84, 0.66, "transcendence", "0:44-1:52 Rising Into Light (the F homecoming 1:03) → Open-Fifth Summit (climax 1:23, C11/F into F6) → Unfinished Return", [
        S("cosmic", "cosmic — the summit: the flights of yellow light spiralling up into a vast golden galaxy of motes spread across infinite pale-gold space, long slow waves rolling through it, warm and open-hearted, the camera soaring up into it"),
        S("micro", "macro at the height of the light — one blade tip blazing with yellow light, a burst of pollen-light sparks streaming off it into the warm air"),
        S("aerial", "from directly above, a wide sloping land of luminous grass flooded with yellow light, long slow waves of gold moving through it edge to edge, curving trails of light-points wheeling over it"),
      ]),
      P("return", 0.84, 0.92, 0.57, "integration", "1:52-2:02 Unfinished Return (Bbm6/9 at 1:49 passes like a shadow at the quietest point of the descent) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small yellow light drifting alone in the upper right of immense dark violet space, a faint lavender shade passing over it, nearly the entire frame empty"),
        S("aerial", "from high above, a few yellow points settling back into the dark luminous grass, their glow quieting to amber as the lavender shade spreads"),
        S("abstract", "abstract — fine ribbons of amber and lavender light drifting slowly downward across darkness, the curving flights loosening into calm lines"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.3, "integration", "2:02-2:13 Unfinished Return (lands on Bb6, contentment rather than conclusion)", [
        S("sparse", "DARK BACKGROUND — a single small yellow light resting on a dark blade tip in the lower left of vast violet darkness, glowing softly, the bookend of the first light, the last phrase left hanging"),
        S("cosmic", "cosmic — from immense height the dark land fading into soft violet dusk under a scatter of faint stars, a few yellow points still glowing, unfinished and calm"),
        S("micro", "extreme macro — one grain of yellow light at rest on a dew bead, holding a tiny reflection of the whole golden morning"),
      ]),
    ],
    morphs: [
      "the camera descends into the waking grass and rises with the first yellow points as they lift in curving flights",
      "the arcs of light multiply and the camera pulls back high above as thousands of yellow lights wheel together",
      "the wheeling swarm brightens and the camera soars up as the flights spiral into a vast golden galaxy of motes",
      "the waves of gold fade and the camera settles close on one small yellow light under a lavender shade",
      "the ribbons of light settle and the camera drifts down to one small yellow light resting on a dark blade tip",
    ],
  },
  {
    id: "99b7ad2c-a212-440e-85fa-0c670c1e4296",
    name: "Redwoods Sway 2",
    world: "G major at 57 BPM, a pendulum between I and IV over pedal bass, one arch to a crown at 1:30 touched by a tender relative-minor shading, ending on an open G/E — the redwood grove under silver night light: a rise from one firefly on furrowed bark up the immense trunks to crowns swaying in a slow circle against the stars, a cooling grey-green shade at the summit, and a settling descent back to one ember of light",
    phases: [
      P("threshold", 0, 0.05, 1, "threshold", "0:00-0:07 Rooted Opening (a ringing G add9, still and rooted)", [
        S("sparse", "DARK BACKGROUND — a single firefly of gold light resting on deeply furrowed red-brown bark in the lower right of vast darkness, its glow catching the fibres around it, the rest of the frame open black"),
        S("micro", "extreme macro — the furrows of ancient bark at closest range, a whole world of rust-red ridges lit by one drifting mote of gold, fine dust of light suspended in the grooves"),
        S("interior", "within the dark hollow of the grove, looking straight up as great trunks of luminous red bark rise around the view into silver night haze, fireflies of gold drifting up their length, the camera beginning to rise"),
      ]),
      P("expansion", 0.05, 0.55, 0.42, "expansion", "0:07-1:16 Rooted Opening → Opening Canopy (0:27, the space opens upward) → Deepening Sway (0:58, the pendulum gains weight)", [
        S("abstract", "abstract — tall vertical shafts of silver light falling through darkness between great red-brown trunks, drifting motes of gold turning slowly inside each shaft, a luminous lattice of light"),
        S("micro", "macro — a single fern frond unfurling at the foot of a giant trunk, each tiny leaflet beaded with gold firefly light, translucent and glowing"),
        S("aerial", "from high above, looking straight down into a ring of swaying crowns, silver light pooling in the dark gap between them, fireflies of gold multiplying in the depths below, the camera descending into it"),
      ]),
      P("transcendence", 0.55, 0.715, 0.51, "transcendence", "1:16-1:39 Crown in the Wind (Cmaj13 bloom, climax 1:30-1:35, the tender E minor shading)", [
        S("cosmic", "cosmic — the whole grove humming: looking straight up as the crowns of immense luminous trunks sway together in one slow wide circle against a vast starfield, fireflies spiralling up into the stars, gold flickering and cooling to grey-green, the camera rising"),
        S("micro", "extreme macro at the height of the wind — a single needle tip trembling with silver light, fine particles of gold shaken loose into the dark"),
        S("abstract", "abstract — a slow spiral of gold firefly light winding around a dark vertical axis, widening as it climbs, a passing cool grey-green shade crossing its turns"),
      ]),
      P("illumination", 0.715, 0.775, 0.39, "return", "1:39-1:47 Crown in the Wind → Settling Roots (major warmth returns, the energy recedes)", [
        S("aerial", "from high above, looking straight down as the swaying crowns settle, warm gold returning to the canopy, the fireflies beginning a slow descent toward the floor, the camera sinking with them"),
        S("micro", "macro — fireflies settling along a ridge of rough bark, each one a small gold ember, the fibres between them glowing faintly"),
        S("interior", "within the deep stillness below the canopy, faint shafts of silver light thinning, the great trunks dimming to deep red shadow, a few luminous motes falling slowly"),
      ]),
      P("return", 0.775, 0.899, 0.3, "integration", "1:47-2:05 Settling Roots (the G/A hover returns like a memory at 1:55) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small firefly glowing alone in the upper left of immense darkness, a faint ring of warm amber around it, nearly the entire frame empty"),
        S("cosmic", "cosmic — from far below, the stilled crowns become dark shapes against a deep quiet starfield, a few fireflies drifting slowly up to join the stars"),
        S("micro", "extreme macro — a single dimming ember of firefly light caught in a groove of bark, its glow going from gold to dusky amber, fine dust of light around it"),
      ], { sparse: true }),
      P("integration", 0.899, 1, 0.3, "integration", "2:05-2:18 Settling Roots (one last swell on C, a long quiet IV, an open G/E)", [
        S("sparse", "DARK BACKGROUND — a single firefly of gold light resting on furrowed red-brown bark in the lower right of vast darkness, one last swell of warmth in its glow, the bookend of the first light, unfinished"),
        S("aerial", "rising away while looking straight down at the crowns, a quiet dark canopy with a few gold points still glowing deep inside it, silver haze settling over all"),
        S("micro", "extreme macro — one last ember of firefly light on a dark fibre of bark, holding a tiny reflection of the whole swaying crown"),
      ]),
    ],
    morphs: [
      "the camera rises up the luminous trunks until the silver haze breaks into tall shafts of light full of drifting gold",
      "the camera rises out of the ring of crowns and turns to look straight up as they sway together against the stars",
      "the spiral of gold slows and the camera sinks with the descending fireflies toward the settling canopy",
      "the silver shafts thin away and the camera settles close on one small firefly glowing alone in the dark",
      "the ember dims and the camera drifts down onto one firefly of gold resting on the furrowed bark where the journey began",
    ],
  },
  {
    id: "7b39db5e-68fa-4915-8ff1-83078c18edac",
    name: "Tranquility 33",
    world: "F# major, the one Tranquility not in B, hovering on a C# dominant pedal at the threshold, a borrowed minor shadow, suspended dominants holding the light back, a homecoming crest at 1:50, pedal breathing, and a low F# benediction — valley fog at blue hour with ridges floating as soft islands: gold held behind a ridge line, a flood of light across the floating world, a lone crest breathing in the valley, and amber drawn down into the earth",
    phases: [
      P("threshold", 0, 0.05, 0.39, "threshold", "0:00-0:10 Threshold on C# (the third flickering between E# and E)", [
        S("sparse", "DARK BACKGROUND — a single soft edge of luminous fog lapping against one dark ridge line in the lower right of vast blue-black darkness, a faint pale glow flickering behind it, the rest of the frame open black"),
        S("micro", "extreme macro — the edge of the fog at closest range, countless suspended droplets glowing grey-blue and rose, drifting at different depths, weightless"),
        S("aerial", "from high above, looking straight down on a luminous sea of still fog with one dark ridge breaking through it, a pale band of dawn light brightening and dimming across its surface, the camera descending"),
      ]),
      P("expansion", 0.05, 0.447, 0.76, "expansion", "0:10-1:32 Threshold on C# → Borrowed Shadow (0:37, Bm/F#) → Suspensions over G# (1:00) → The Long Approach (1:25)", [
        S("abstract", "abstract — receding layers of blue ridge lines stacked across darkness, each a translucent band paler than the last, a soft rose glow resting on the fog between them"),
        S("interior", "within the drifting fog, long horizontal veils of luminous haze lit rose and slate blue filling the frame edge to edge, a slow grey-blue shadow sweeping across them and cooling every colour, the camera gliding forward through them"),
        S("micro", "macro — bands of gold light held just behind the dark edge of one ridge, its rim glowing as if lit from inside, fine particles of fog catching the gold"),
      ]),
      P("transcendence", 0.447, 0.57, 1, "transcendence", "1:32-1:57 The Long Approach (G#13sus4 → C# → F#) → Homecoming Crest (1:50, A#5 singing over F#)", [
        S("cosmic", "cosmic — the homecoming crest: an immense world of blue ridges floating as soft islands in a motionless luminous sea of fog, flooded at once with gold light from one side, the fog rippling gold to its far edges, infinite and weightless, the camera lifting high above"),
        S("micro", "extreme macro at the height of the light — the gold-lit surface of the fog at closest range, fine ripples of light running across it, tiny droplets blazing"),
        S("aerial", "from directly above, the gold flood rippling outward across the whole fog in long slow waves, dark ridge crests standing in it like soft floating islands, the camera rising"),
      ]),
      P("illumination", 0.57, 0.84, 0.65, "integration", "1:57-2:53 Homecoming Crest exhales (F#Madd9 2:05) → Pedal Breathing (2:14, the music breathes in place) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ridge crest of soft blue light floating alone in the upper left of immense darkness, a thin glow of fog breathing around it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single droplet of fog-light rising and falling slowly over a dark surface, a faint reflection of a ridge trembling inside it"),
        S("aerial", "looking straight down on a quiet basin of luminous fog, slow swells lifting and lowering its surface, the reflection of one dark ridge breathing in it, the camera drifting"),
      ], { sparse: true }),
      P("return", 0.84, 0.92, 0.56, "return", "2:53-3:10 Low F# Benediction (sinks into the bass, swells once at 3:05)", [
        S("abstract", "abstract — warm amber light drawing down in long soft bands toward the bottom of the frame, one last swell of gold rising through them and settling, blue fading in above"),
        S("intimate", "close — the fog darkening around a single ridge line, the last amber glow drawing down into it, translucent and dissolving"),
        S("aerial", "rising slowly away while looking straight down, the layered ridges sinking into dark fog, only a faint amber line remaining along the lowest one"),
      ]),
      P("integration", 0.92, 1, 0.35, "integration", "3:10-3:26 Low F# Benediction (dissolves into an open F#5, home and quiet)", [
        S("cosmic", "cosmic — from immense height the dark fog becomes a quiet pale veil across deep blue space scattered with faint stars, one faint ridge line beneath it, settled and at rest"),
        S("sparse", "DARK BACKGROUND — a single soft edge of luminous fog resting against one dark ridge line in the lower right of vast darkness, a low amber glow along it, the bookend of the first light"),
        S("micro", "extreme macro — one last droplet of amber light suspended above dark fog, holding a tiny reflection of the whole floating world"),
      ]),
    ],
    morphs: [
      "the camera descends toward the pale band of light and pulls level as the ridges recede into layered translucent blue",
      "the gold held behind the ridge breaks free and the camera lifts high above as the whole floating world floods with light",
      "the gold flood ebbs and the camera settles close on one small ridge crest of soft blue light alone in the dark",
      "the breathing basin dims and the camera drifts as amber light draws down in long soft bands",
      "the camera keeps rising until the fog is a quiet pale veil across deep blue space with one faint ridge beneath",
    ],
  },
  {
    id: "112c3e16-3c98-43ca-902e-a9c2b510ee3d",
    name: "Cabin Soul 6",
    world: "F minor at 89 BPM over an unmoving F pedal, flickering toward F major, a dense rolling middle, a gathering storm cresting at 1:38, a sudden major flash at 1:53, and embers settling into an F add9 Picardy brightening; lyric 'the night sky' — intimacy that opens upward: one hearth ember under dark pine crowns, waves of wind and driving snow-light, the whole night opening into a star-river, two currents of cold and warm folding together, and the ember left glowing",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:08 Hearthside Statement (low-lit F minor, the bass holding F and Eb)", [
        S("sparse", "DARK BACKGROUND — a single small ember glow at the lower edge of vast darkness, its warm orange light catching the needles of one dark pine bough in the lower left, the rest of the frame open black"),
        S("micro", "extreme macro — one glowing ember at closest range, a cracked world of orange light and charcoal grain breathing slowly, tiny sparks lifting off it into the dark"),
        S("interior", "inside a ring of dark pine crowns, looking straight up past them as the first few stars wake in deep blue, a warm glow rising from below, the camera beginning to lift"),
      ]),
      P("expansion", 0.05, 0.532, 0.46, "expansion", "0:08-1:22 Hearthside Statement → Subdominant Undertow (0:29, register opens, motion doubles) → Gathering Storm (1:08)", [
        S("abstract", "abstract — dark pine crowns swaying in rhythmic waves around a ring of deep blue, their tips tracing slow arcs of amber light, a repeating pattern of motion and glow"),
        S("micro", "macro — motes of snow-light driving sideways past a dark bough in gusting surges, each flake a tiny glowing crystal of amber and slate blue"),
        S("aerial", "from high above, looking straight down on a dark ridge of swaying pines with gusts of luminous snow sweeping across it in rhythmic surges, one warm glow holding steady low in the frame, the camera descending through the drift"),
      ]),
      P("transcendence", 0.532, 0.72, 1, "transcendence", "1:22-1:51 Gathering Storm (F+add#9, Lydian Db) → Full-Hearted Peak (crest 1:38-1:40, Fm11 and Abmaj9)", [
        S("cosmic", "cosmic — the whole night opening: a vast star-river arching across deep space through a ring of dark pine crowns, dense luminous galaxy dust and countless stars, one band of pale gold light sweeping across it, the camera rising up into it"),
        S("micro", "extreme macro at the height of the storm — one snow crystal of light blazing gold and violet as it spins past, prismatic sparks shed from its arms"),
        S("aerial", "from high above, a wide valley of luminous snow under heavy dark vapor, one break in the vapor letting a broad band of pale gold light sweep across the slopes, the camera gliding with it"),
      ]),
      P("illumination", 0.72, 0.84, 0.73, "illumination", "1:51-2:10 Full-Hearted Peak (the sudden F major at 1:53: warmth was always beneath the minor)", [
        S("interior", "within the sweep of gold light as it breaks across the snow, the gusting motes turning warm all at once, ember orange and pale gold streaming past on every side"),
        S("intimate", "close — the dark pine crowns stilling against deep blue, the star-river above them softening to a luminous haze, a warm glow rising steady from below"),
        S("abstract", "abstract — two currents of light circling one another, cold slate blue and warm amber, churning in a slow ache and then folding into one glowing spiral"),
      ]),
      P("return", 0.84, 0.92, 0.57, "integration", "2:10-2:22 Embers Settling (everything slows and sinks, Eb sus chords holding the breath) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember glowing alone in the upper right of immense darkness, a few slow motes of snow-light settling silently past it, nearly the entire frame empty"),
        S("micro", "extreme macro — the last embers in a heap of charcoal at closest range, orange light dimming grain by grain, faint luminous smoke curling away"),
        S("aerial", "from high above, the dark land gone quiet under settling luminous snow, one tiny warm glow far below, the camera drifting slowly down toward it"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.3, "integration", "2:22-2:34 Embers Settling (F major arrives softly at 2:15 and fades, Eb sus2 → F add9)", [
        S("cosmic", "cosmic — from immense height a quiet starfield over dark pine crowns, one small warm ember glow at the lower edge brightening softly once, the night held close"),
        S("sparse", "DARK BACKGROUND — a single small ember glow at the lower edge of vast darkness catching the needles of one dark pine bough, warm and fragile, the bookend of the hearth"),
        S("micro", "extreme macro — one last spark of orange light resting on a grain of charcoal, holding a tiny reflection of the whole luminous night of stars"),
      ]),
    ],
    morphs: [
      "the camera lifts out of the ring of pine crowns as they begin to sway in rhythmic waves around the deepening blue",
      "the driving snow-light swirls upward and the camera rises through it as the whole night opens into a star-river",
      "the band of gold sweeps closer and the camera glides inside it as the gusting motes turn warm",
      "the folding spiral dims and the camera settles close on one small ember glowing alone in the dark",
      "the camera rises away from the ember until it is one small warm glow at the edge of a quiet starfield",
    ],
  },
];
