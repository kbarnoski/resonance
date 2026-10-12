// Kinetic Lab → Archetype (Karel 2026-10-11: "you need to upgrade them all.
// and stand 10 should be in ra set. it is a jazzy lounge groove"; "once
// upgraded no need for a kinetic lab set. all journeys will be up to par").
// Same format as the Karel-approved Expansion modules (expansion-batch-1.mjs).
//  - Phase bounds follow each track's deep-analysis sections (law 9) — the
//    protected sidecar scripts/deep-analysis-protected.json (their pack rows
//    are frozen); `music` names the sections each phase holds.
//  - One sparse phase at the music's real valley; the cosmic escape where it
//    peaks (S5); visionary, never literal (law 10a); no figures (law 6).
// Stand 10 = the sample — APPROVED by Karel 2026-10-11 ("i approve").
// Casts: per-phase `shaders` from the vetted pool (scripts/shader-vetting.json),
// none shared with RA neighbours, none of the retired lab leads, no plankton
// (Stand 10's stuttering opening, tour pass 5); sparse valley on dark shaders.

export const SET = { key: "kinetic-lab", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "84a82478-f0f2-4c49-b800-b4fe722f1df5",
    name: "Stand 10",
    world: "E minor circling reverie at 99 BPM, a floating Em9/Gmaj7 cloud over a bass rocking E–C, warm major-seventh light falling across a minor ground, cresting early (0:40) then turning the same chords over in shifting light until it dissolves unresolved — Karel's jazzy late-night lounge groove transfigured: slow curls of amber smoke-mist turning over still dark water at night, lit as if by low lamplight, swaying side to side with the rocking bass, widening into a vast warm bloom at the crest, clouding to slate and violet, thinning to a few glints over the water, and fading to one small point of amber in a large dark",
    phases: [
      P("threshold", 0, 0.12, 0.45, "threshold", "0:00-0:28 Rocking Pedal Opening (Em–Cmaj9#11 over an E pedal, building)", [
        S("sparse", "DARK BACKGROUND — a single slow curl of luminous amber smoke-mist hanging weightless over a black mirror of still water in the lower left of vast darkness, its faint reflection beneath it, nearly the entire frame empty"),
        S("micro", "extreme macro — the edge of that curl of mist, fine luminous threads of warm amber vapour turning slowly in the dark, tiny particles of light suspended inside it in impossible stillness"),
        S("aerial", "looking straight down on a black mirror of still water as two slow curls of luminous amber mist drift across it in a gentle side-to-side sway, their translucent reflections rocking beneath them, deep shadow at the edges of the frame, the camera descending slowly"),
      ], { shaders: ["r-smokerings", "ember"], shaderOpacity: 0.62 }),
      P("expansion", 0.12, 0.244, 1, "transcendence", "0:28-0:57 Widening Loop Crest (the loop opens to D and A; the most open moment at 0:40)", [
        S("cosmic", "cosmic — the curls of amber mist bloom into a vast slow warm nebula turning over an infinite dark mirror of water, soft moss green and gold light unfolding in wide circling arms, the camera rising through it as the glow widens"),
        S("interior", "drifting inside the warm luminous amber haze as it widens in slow spiral rings around the camera, translucent veils of honey light passing close on every side, the dark water glimmering far below"),
        S("micro", "macro — a single droplet of water suspended above the dark surface, holding the whole widening amber glow inside it, fine luminous ripples spreading outward beneath it"),
      ], { shaders: ["aureole", "dusk"], shaderOpacity: 0.5 }),
      P("transcendence", 0.244, 0.38, 0.8, "expansion", "0:57-1:29 Shadowed Inner Turn (minor chords take an equal share; B-suspensions left hanging)", [
        S("aerial", "from high above, slow bands of slate blue-grey shadow sliding across the luminous mist over the dark water, the amber retreating into scattered pools of glowing particles, one high silver glint remaining far off"),
        S("abstract", "abstract — two slow currents of mist circling each other above dark water, one warm amber and one cool violet, folding together and apart in a swaying rhythm"),
        S("intimate", "close — a thin veil of violet-grey mist drifting low across the black surface, its underside catching a faint amber light, translucent and weightless, the camera gliding beside it"),
      ], { shaders: ["dark-tide", "r-mercury", "drift"], shaderOpacity: 0.58 }),
      P("illumination", 0.38, 0.49, 0.6, "return", "1:29-1:55 Lingering on C (trying to rest in the warmth of C major)", [
        S("intimate", "close — one soft pool of luminous amber light resting weightless on the dark water, its trembling edge breathing slowly in and out, translucent warm mist lingering just above it"),
        S("micro", "extreme macro — slow beads of condensed mist gathering on the dark water's skin, each bead holding a tiny warm amber point of light, impossible stillness between them"),
        S("aerial", "looking down as the luminous pool of amber light lengthens across the black water in a slow spiral, a cool silver edge creeping in from one side as the ground shifts beneath it"),
      ], { shaders: ["r-embers", "pendulum-dust", "r-mercury"], shaderOpacity: 0.55 }),
      P("return", 0.49, 0.786, 0.35, "integration", "1:55-3:04 Thinning Reflection → Leading-Tone Glimmer (texture halves; small lights reappear at 2:31) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small wisp of luminous pale silver mist alone above black water in the upper right of immense darkness, a single faint ring spreading slowly beneath it, nearly the entire frame empty"),
        S("micro", "macro — a few thin luminous glints of cool light flickering on the dark water's surface, far apart, each one swelling and dissolving in slow turn"),
        S("interior", "within a quiet thinning translucent haze over the dark water, slow sparse particles of amber and silver light drifting past the camera far apart from each other, the dark opening wider between them"),
      ], { sparse: true, shaders: ["nadir", "starfield"], shaderOpacity: 0.68 }),
      P("integration", 0.786, 1, 0.3, "integration", "3:04-3:54 Brightening Recession → Dissolving Coda (a long decaying C, an unresolved E over D)", [
        S("aerial", "from high above, the last thin veils of mist lifting off the still water in slow turning spirals, a faint violet glow along the dark far edge, the camera pulling slowly back"),
        S("cosmic", "cosmic — from immense height the dark water becomes a vast mirror of night with one faint amber haze turning slowly on it, a quiet field of distant points of light around it, unresolved and open"),
        S("sparse", "DARK BACKGROUND — one small luminous point of amber light resting on still black water in the lower left of vast darkness, the last ripple ring dissolving around it, the bookend of the first curl of mist"),
      ], { shaders: ["cirrus", "parsec", "ember"], shaderOpacity: 0.6 }),
    ],
    morphs: [
      "the camera descends between the swaying curls of mist until the amber haze blooms around it into a vast turning glow",
      "the warm nebula cools and the camera drops toward the water as slate shadow slides across the mist",
      "the two circling currents of mist settle and the camera glides low toward one soft pool of amber light on the water",
      "the pool of light thins and the camera drifts up into the dark as one small wisp of silver mist hangs alone",
      "the sparse glints fade and the camera rises as the last veils of mist lift off the still water in slow spirals",
    ],
  },
  {
    id: "3ee9acf2-c89d-42b2-b9a3-d5fce97da2ac",
    name: "Cabin Soul 8",
    world: "F Phrygian over a held F pedal, warm upper-structure chords shadowed by the Gb half-step, a long steady churn that peaks at 1:29 and lets go on a suspended Eb — Karel's jazzy loungey groove (his RA take) transfigured: banked embers glowing along a dark river under slow falling snow, wood smoke curling low in umber and slate, the glow churning into a vast ember storm at the peak, then dimming to soft orange under pale blue twilight",
    phases: [
      P("threshold", 0, 0.136, 0.4, "threshold", "0:00-0:21 Db Major Invocation (pale gold gathering, building)", [
        S("sparse", "DARK BACKGROUND — a single banked ember glowing in the lower left of vast darkness, a thin curl of luminous wood smoke rising from it, a few weightless flakes of snow falling through its glow, nearly the entire frame empty"),
        S("micro", "extreme macro — the skin of that ember, fine cracks of glowing orange light breathing slowly in deep umber, tiny particles of ash lifting off it in impossible stillness"),
        S("aerial", "looking straight down on a dark river of liquid night as a few luminous embers drift on its surface, each one trailing a faint thread of smoke, slow snow falling into the frame, the camera descending"),
      ], { shaders: ["obsidian-flow", "r-embers"], shaderOpacity: 0.62 }),
      P("expansion", 0.136, 0.323, 0.7, "expansion", "0:21-0:50 Gathering Current (the river picks up speed, amber flickering)", [
        S("interior", "drifting low through wild untouched darkness as long luminous ripples of ember light stream across black water, slow snowflakes falling into the glow, translucent mist, no shore, only water, snow and light"),
        S("micro", "macro — a single snowflake landing on a glowing ember, dissolving into a tiny burst of luminous steam that curls away into the dark"),
        S("abstract", "abstract — currents of dark water and ribbons of ember light braiding past each other in a slow spiral, umber, slate and gold folding together"),
      ], { shaders: ["tide", "volcanic", "firefly-field"], shaderOpacity: 0.55 }),
      P("transcendence", 0.323, 0.575, 0.9, "expansion", "0:50-1:29 Phrygian Summit (ember-red pulse, the Gb rub against F)", [
        S("intimate", "close — a bank of embers pulsing deep red and orange beneath a drift of luminous snow, each pulse sending a slow wave of warm light across the dark, the camera holding beside it"),
        S("aerial", "from high above, long glowing seams of ember light running through a dark snow-dusted ridge like veins of molten amber, smoke drifting across them in slow diagonal bands"),
        S("micro", "extreme macro — the edge where snow meets ember, crystals of ice glowing amber and melting into translucent beads of light, impossible stillness between them"),
      ], { shaders: ["molten-vein"], shaderOpacity: 0.52 }),
      P("illumination", 0.575, 0.763, 1, "transcendence", "1:29-1:58 F Pedal Churn (the peak — a squall circling, lit from beneath)", [
        S("cosmic", "cosmic — the embers lift into a vast slow storm of glowing sparks circling above a dark ridge, an ember nebula churning in umber and gold across infinite darkness, lit from beneath, the camera rising through it"),
        S("interior", "inside the circling squall, luminous snow and sparks of ember light streaming past the camera in a slow spiral, the low glow pulsing in time"),
        S("abstract", "abstract — countless sparks of amber light orbiting a dark centre in a slow kaleidoscopic churn, smoke in slate and violet folding between them"),
      ], { shaders: ["furnace", "r3-plasmastorm", "kairos"], shaderOpacity: 0.5 }),
      P("return", 0.763, 0.9, 0.35, "integration", "1:58-2:19 Suspended Eb Farewell (embers dimming) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small dimming ember resting alone in the upper right of immense darkness, a faint luminous thread of smoke above it, nearly the entire frame empty"),
        S("micro", "macro — the last soft orange glow inside a cooling ember, its light breathing slower and slower, a few translucent snowflakes resting on its edge"),
        S("aerial", "looking straight down on dark snow as a few faint embers glow far apart from each other, pale blue twilight seeping in around them, the camera drifting slowly upward"),
      ], { sparse: true, shaders: ["dark-nebula", "singularity"], shaderOpacity: 0.68 }),
      P("integration", 0.9, 1, 0.3, "integration", "2:19-2:35 the farewell settles (Eb suspended, unresolved)", [
        S("cosmic", "cosmic — from immense height the dark river becomes a faint luminous thread across infinite blue twilight, a quiet field of distant embers scattered along it like stars"),
        S("intimate", "close — a last curl of wood smoke dissolving into pale blue air above the snow, weightless and slow, a faint warmth still glowing beneath it"),
        S("sparse", "DARK BACKGROUND — a single banked ember glowing in the lower left of vast darkness, one weightless flake of snow resting on it, the bookend of the first ember, left unresolved"),
      ], { shaders: ["torrent", "zenith"], shaderOpacity: 0.62 }),
    ],
    morphs: [
      "the camera descends to the dark river and glides low along it as the current gathers speed",
      "the braided currents slow and the camera settles close beside a bank of pulsing embers under the snow",
      "the embers lift and the camera rises into a vast circling storm of sparks above the ridge",
      "the storm of sparks thins and the camera drifts down toward one small dimming ember alone in the dark",
      "the last embers fade and the camera rises until the river becomes a faint thread of light across the twilight",
    ],
  },
  {
    id: "061528d4-e9a3-49c3-ad3c-f23cf9cf2251",
    name: "Rolling 2",
    world: "G major tidal meditation at 59 BPM — a slow pendulum between G and C under the pedal, two broad full-hearted swells (0:42 and 1:50) with a cool shaded valley between, ebbing into a wistful unresolved stillness — transfigured: slow rolling swells of luminous honey-gold light moving through a sea of sage-green grass-light like an ocean, cresting gold, cooling to shade, swelling again in evening light, then ebbing into scattered glints and a lavender-grey dusk",
    phases: [
      P("threshold", 0, 0.222, 0.4, "threshold", "0:00-0:42 Opening Pendulum (the G–C rocking, each swell a little taller)", [
        S("sparse", "DARK BACKGROUND — a single luminous swell of honey-gold light rising and falling in the lower right of vast darkness like a slow breath, nearly the entire frame empty"),
        S("micro", "extreme macro — fine blades of sage-green grass-light bending in a slow wave, each blade edged with luminous gold, tiny particles of pollen-light drifting between them"),
        S("aerial", "looking straight down on long low swells of luminous grass-light rolling across the dark like a slow ocean, each wave a little taller than the last, the camera descending gently"),
      ], { shaders: ["chinook", "pendulum-dust"], shaderOpacity: 0.62 }),
      P("expansion", 0.222, 0.392, 1, "transcendence", "0:42-1:14 First Swell (the crest — the whole world glowing gold)", [
        S("cosmic", "cosmic — the swell crests into a vast slow tide of honey-gold light sweeping across infinite darkness, luminous waves folding over each other like a breathing nebula, the camera rising with it"),
        S("interior", "inside the cresting wave of gold light, translucent curtains of warm honey glow rolling past the camera on every side, everything weightless"),
        S("abstract", "abstract — broad arcs of gold and sage light folding over each other in a slow rolling rhythm, a pendulum swing of luminous colour"),
      ], { shaders: ["aureole", "r3-heartwarmth", "jubilee"], shaderOpacity: 0.48 }),
      P("transcendence", 0.392, 0.582, 0.3, "integration", "1:14-1:50 Shaded Interlude (cool green, the ii chord darkening) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small hollow of cool green light resting alone in the upper left of immense darkness, a few weightless motes drifting in it, nearly the entire frame empty"),
        S("micro", "macro — a few translucent blades of grass-light barely moving in cool shade, a single bead of dew holding a tiny point of green light"),
        S("intimate", "close — a soft cool green haze of luminous grass-light resting in shade, translucent blades barely moving, the gold withdrawn, the stillness held"),
      ], { sparse: true, shaders: ["nadir", "ocean"], shaderOpacity: 0.7 }),
      P("illumination", 0.582, 0.735, 0.9, "expansion", "1:50-2:19 Second Swell (broad and heavy, holding its height)", [
        S("aerial", "from high above, a wide slow swell of luminous evening light lifting across the whole horizon of grass-light like an ocean, holding its height, amber haze resting on it"),
        S("interior", "riding the crest of the second swell, warm amber light rolling beneath the camera in long slow waves, translucent haze drifting past"),
        S("micro", "extreme macro — the shimmering crest of one luminous wave, countless particles of amber light suspended along its edge"),
      ], { shaders: ["r3-sleepingbloom", "r3-waveveil", "chinook"], shaderOpacity: 0.5 }),
      P("return", 0.735, 0.873, 0.4, "integration", "2:19-2:45 Ebbing Waters (scattered glints as dusk comes on)", [
        S("aerial", "looking down as small luminous ripples run across a still surface of light after the great swell has passed, the gold breaking into scattered glints"),
        S("micro", "macro — a few glints of dissolving gold light dancing on a dark rippling surface, far apart, each one fading in slow turn"),
        S("abstract", "abstract — concentric ripples of lavender and gold light widening slowly across darkness, overlapping and fading"),
      ], { shaders: ["ripple", "pelagic"], shaderOpacity: 0.58 }),
      P("integration", 0.873, 1, 0.25, "integration", "2:45-3:09 Hovering Coda (lavender-grey, not fully closing)", [
        S("cosmic", "cosmic — from immense height the rolling swells become a faint lavender-grey haze across infinite dusk, one last warm glint resting at its heart like a quiet star"),
        S("intimate", "close — a faint luminous mist rising slowly from still grass-light at dusk, the horizon dissolving into lavender-grey"),
        S("sparse", "DARK BACKGROUND — a single soft swell of honey-gold light resting in the lower right of vast darkness, breathing once, the bookend of the first swell, left open"),
      ], { shaders: ["dusk", "starfield"], shaderOpacity: 0.64 }),
    ],
    morphs: [
      "the rolling swells rise beneath the camera until one crests into a vast tide of honey-gold light",
      "the golden tide recedes and the camera settles low into a quiet hollow of cool green shade",
      "the shade lifts and the camera rises with a wide slow swell of amber evening light",
      "the great swell passes and the camera looks down as small ripples scatter the gold into glints",
      "the glints fade and the camera rises until the swells become a faint lavender haze at dusk",
    ],
  },
  {
    id: "b5247327-b1fd-45ce-a249-0a58a8a3c57e",
    name: "Cabin Soul 5",
    world: "F minor over a low F pedal, the bVI–bVII–i rise (Db–Eb–Fm) circling in patient waves, one pale-gold F-major flash, an insistent dense summit at 1:39, dissolving into an unresolved hush — transfigured: sparks lifting from a kindling glow into wood smoke beneath a snowy pine ridge, a brief shaft of pale gold breaking the clouds, smoke drifting through dusk, a storm-driven ember fire churning at the summit, then the last coals glowing under cold blue night",
    phases: [
      P("threshold", 0, 0.13, 0.4, "threshold", "0:00-0:20 Kindling on Db (embers catching, building)", [
        S("sparse", "DARK BACKGROUND — a single spark of amber light lifting in the lower left of vast darkness, a faint luminous trail of smoke behind it, nearly the entire frame empty"),
        S("micro", "extreme macro — a cluster of glowing kindling embers, threads of orange light creeping through charcoal grey, tiny sparks lifting off in impossible slowness"),
        S("aerial", "looking straight down on a low amber glow spreading slowly across dark ground, sparks leaping upward through the frame, deep shadow all around, the camera descending"),
      ], { shaders: ["ember", "nadir"], shaderOpacity: 0.62 }),
      P("expansion", 0.13, 0.253, 0.55, "expansion", "0:20-0:39 Kindling on Db (the glow widening)", [
        S("interior", "rising inside a slow column of luminous wood smoke, amber sparks drifting up past the camera on every side, the glow widening below"),
        S("abstract", "abstract — spirals of smoke and ember light turning slowly around each other, deep umber and banked-coal red folding together"),
        S("micro", "macro — a lone ember floating free in dark drifting smoke, a tiny translucent halo of heat shimmering around it"),
      ], { shaders: ["chinook", "r-smokerings"], shaderOpacity: 0.58 }),
      P("transcendence", 0.253, 0.486, 0.75, "expansion", "0:39-1:15 Lydian Swell (wind on a snowy ridge, a shaft of pale gold)", [
        S("aerial", "from high above, wind pressing luminous snow across a dark pine ridge, a gap in the clouds letting one shaft of pale gold light fall across the slope"),
        S("intimate", "close — a shaft of pale gold light standing in drifting snow, translucent and weightless, sparks of ember drifting through it from below"),
        S("micro", "extreme macro — snow crystals catching the shaft of pale gold, each crystal a tiny prism of luminous light"),
      ], { shaders: ["zenith", "covenant"], shaderOpacity: 0.55 }),
      P("illumination", 0.486, 0.641, 0.65, "return", "1:15-1:39 Shadowed Pedal (dusk smoke drifting low)", [
        S("intimate", "close — dusk smoke drifting low across dark snow, thin cold light catching its upper edge while the ground sinks into shadow"),
        S("aerial", "looking down on long veils of smoke sliding across a dark snowy ridge at dusk, the pines dissolving into smoky slate blue"),
        S("abstract", "abstract — slow layers of smoke and cold light sliding past each other in a deep slate rhythm, a single ember glow beneath them"),
      ], { shaders: ["dark-tide", "cascade-veil"], shaderOpacity: 0.58 }),
      P("return", 0.641, 0.771, 1, "transcendence", "1:39-1:59 Insistent Summit (a storm-driven fire, sparks churning)", [
        S("cosmic", "cosmic — a vast storm of ember sparks churning across infinite darkness, luminous orange and red swirling in a slow nebula of fire and smoke, the camera rising through it"),
        S("interior", "inside the storm-driven fire, streams of sparks and dark smoke rushing past the camera in a spiral, everything glowing"),
        S("abstract", "abstract — countless embers swirling in a dense kaleidoscopic vortex of orange light against charcoal darkness"),
      ], { shaders: ["volcanic", "r3-plasmastorm", "furnace"], shaderOpacity: 0.48 }),
      P("integration", 0.771, 1, 0.3, "integration", "1:59-2:34 Unresolved Embers (the last coals under cold blue night) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small cluster of orange coals glowing alone in the lower right of immense cold blue darkness, nearly the entire frame empty"),
        S("micro", "macro — the last coals breathing slow orange light, a few translucent snowflakes resting on them and dissolving"),
        S("cosmic", "cosmic — from immense height the last glow becomes one faint ember resting in infinite blue night, a quiet field of distant stars around it, unresolved"),
      ], { sparse: true, shaders: ["dark-nebula", "nadir"], shaderOpacity: 0.7 }),
    ],
    morphs: [
      "the sparks lift and the camera rises inside a slow column of luminous wood smoke",
      "the smoke opens and the camera rises over a snowy ridge as a shaft of pale gold breaks through",
      "the gold fades and the camera settles low as dusk smoke drifts across the dark snow",
      "the smoke ignites and the camera is swept up into a vast churning storm of sparks",
      "the storm subsides and the camera drifts down toward one small cluster of coals in the cold blue night",
    ],
  },
  {
    id: "9f7d1b51-aeac-4dfc-a39f-b00101a403f9",
    name: "Chemiluminescence 1",
    world: "F minor at 60 BPM, a hypnotic low F5–Cm7 ostinato with a chromatic E pressing on F, two relative-major blooms and a contained summit at 1:37, sinking back to the bare ostinato and fading unresolved — transfigured: a phosphorescent thread of light rising from the floor of a black pool, blooming from cold violet to soft amber, the whole dark basin lit from within and pulsing in time, a rose-gold flare at the summit sinking through layered translucent liquid, then the glow settling into a slow tidal pulse and fading beat by beat",
    phases: [
      P("threshold", 0, 0.232, 0.45, "threshold", "0:00-0:36 Ignition and Ostinato (a thread of light rising)", [
        S("sparse", "DARK BACKGROUND — a single thin thread of phosphorescent blue-green light rising from the lower left of vast darkness, nearly the entire frame empty"),
        S("micro", "extreme macro — fine suspended particles glowing phosphorescent blue-green inside dark translucent liquid, pulsing slowly in time"),
        S("aerial", "looking straight down into a black pool as a thin thread of light rises from its floor and blooms into a slow rhythmic glow, the camera descending"),
      ], { shaders: ["biofilm"], shaderOpacity: 0.62 }),
      P("expansion", 0.232, 0.394, 0.65, "expansion", "0:36-1:01 Relative-Major Bloom (cold violet turning soft amber)", [
        S("interior", "drifting inside the dark liquid as the glow spreads upward around the camera, cold violet light warming to soft amber, translucent veils pulsing slowly"),
        S("abstract", "abstract — clouds of violet and amber light unfolding like ink spreading through dark water in a slow pulsing rhythm, faint ripples blurring their edges"),
        S("micro", "macro — a cluster of luminous droplets glowing violet and amber, suspended in dark liquid in impossible stillness"),
      ], { shaders: ["r2-thermal", "diatom", "pelagic"], shaderOpacity: 0.56 }),
      P("transcendence", 0.394, 0.6, 0.85, "expansion", "1:01-1:33 Full Radiance (the whole basin lit from within)", [
        S("aerial", "from high above, a vast natural pool of black water among dark rocks lit from within, its surface pulsing in time, luminous violet-gold ripples spreading outward"),
        S("intimate", "close — rippling violet-gold light thrown across the curve of dark wet stone, pulsing slowly, translucent and weightless"),
        S("micro", "extreme macro — the pulsing surface of the luminous liquid, countless glowing particles rising in slow spirals"),
      ], { shaders: ["kelp", "mycelium"], shaderOpacity: 0.52 }),
      P("illumination", 0.6, 0.729, 1, "transcendence", "1:33-1:53 Summit and Descent (a rose-gold flare at full radius, sinking)", [
        S("cosmic", "cosmic — the glow flares to its fullest radius as a vast rose-gold nebula across infinite darkness, then begins to sink slowly through layered translucent depths, the camera following it"),
        S("interior", "sinking with the rose-amber glow through layered translucent liquid, slow veils of light passing the camera as it drops toward the floor"),
        S("abstract", "abstract — concentric shells of rose-gold and violet light expanding and contracting in a slow luminous pulse"),
      ], { shaders: ["supernova", "protostar", "r2-portalrim"], shaderOpacity: 0.48 }),
      P("return", 0.729, 0.871, 0.5, "return", "1:53-2:15 Afterglow Ostinato (a slow tidal pulse at the bottom of the pool)", [
        S("intimate", "close — a soft violet glow breathing far below the dark surface of the pool, faint chromatic shimmers drifting off it like dissolving trails"),
        S("micro", "macro — dissolving trails of violet light drifting away from the pulsing glow, each one fading into the dark liquid"),
        S("aerial", "looking straight down at a single slow pulse of light at the bottom of the black pool, ripples widening above it, the camera pulling back"),
      ], { shaders: ["ripple", "pelagic", "r-droplets"], shaderOpacity: 0.58 }),
      P("integration", 0.871, 1, 0.25, "integration", "2:15-2:35 Fading Embers (each pulse dimmer) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one last faint pulse of violet light at the bottom of a black pool in the lower right of immense darkness, nearly the entire frame empty"),
        S("micro", "extreme macro — a few final phosphorescent particles dimming one by one in dark liquid, dissolving into nothing"),
        S("cosmic", "cosmic — from immense height the black pool becomes one faint violet point in infinite darkness, a quiet field of distant glows around it, unresolved"),
      ], { sparse: true, shaders: ["dark-tide", "starfield"], shaderOpacity: 0.7 }),
    ],
    morphs: [
      "the camera descends into the black pool as the thread of light blooms into a spreading violet-amber glow",
      "the glow fills the basin and the camera rises to look down on the dark pool lit from within",
      "the radiance flares and the camera rises into a vast rose-gold nebula before it begins to sink",
      "the sinking glow comes to rest and the camera settles close on its slow tidal pulse at the bottom of the pool",
      "the pulse dims and the camera drifts back into the dark as one last faint violet point remains",
    ],
  },

];
