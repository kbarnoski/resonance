// Expansion — Journey Archetype shot lists, batch 6 (2026-10-09):
// Tranquility 35, Night Wind 9, Rattler 2, Amboise 2, Singular 4,
// Yellow Bird 3. Same format and craft as expansion-sample.mjs (the
// three Karel approved on the kiosk), minus shaders/opacity.
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones
//    (the v2 measured arcs from the 2026-10-05 re-theme); `music` names
//    the deep-analysis sections each phase holds.
//  - Each keeps its analysis-derived world (theme.worldRationale) and
//    palette, TRANSFIGURED (made of light, particles, impossible
//    stillness) per law L; the sparse valley sits where the music thins.

export const SET = { key: "expansion-batch-6", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "e181df12-049b-4199-8a1b-4bc1c3edd8e7",
    name: "Tranquility 35",
    world: "C# major, 63 BPM, pedal-anchored contentment shadowed by one rubbing D-natural; the longest Tranquility, a single arch to an F#maj13 bloom — calm across great distance: a high tableland of mesas made of warm luminous strata under drifting veils of lit shadow, one hairline violet shadow always present, a rose-gold flood at the bloom, an evening haze, and a last ember line left open on blue",
    phases: [
      P("threshold", 0, 0.05, 0.62, "threshold", "0:00-0:11 Pedal Dawn (chromatic smudge resolving to C#, the D-natural shadow already there)", [
        S("sparse", "DARK BACKGROUND — a single sliver of warm amber light lying along the rim of one dark mesa in the lower left of vast darkness, a hairline violet shadow resting against it, a few motes of honey light drifting above, nearly the entire frame empty"),
        S("micro", "extreme macro — the rim of that dark stone at closest range, fine grains of luminous amber dust glowing along its edge, a thin violet shadow line beside them, tiny motes of light lifting slowly upward into the dark"),
        S("aerial", "from high above, looking straight down on a dark high tableland of slate mesas filling the frame edge to edge, slow veils of translucent shadow drifting across their flat summits, pale honey light seeping between them, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.396, 0.75, "expansion", "0:11-1:31 Pedal Dawn → First Leaning Dominant (0:27, the melody reaching, C#maj9 at 0:42) → Altered Shadows (1:07-1:30, a thought clouding over)", [
        S("interior", "drifting inside a slow veil of lit mist as it slides across a mesa summit, soft amber and pale silver billows of light passing close on every side and filling the frame, the warm stone glowing faintly through them from below"),
        S("micro", "macro — a shallow pool of still water cupped in sun-warmed stone, each slow ring on its surface traced in honey-gold light, a violet shadow sliding across it, luminous and weightless, impossible stillness between the rings"),
        S("abstract", "abstract — soft overlapping veils of amber and slate-blue light drifting across black in long layered bands like strata made of glowing mist, dimming and returning in a slow breathing pattern, the camera gliding with them"),
      ]),
      P("transcendence", 0.396, 0.625, 1, "transcendence", "1:31-2:24 Gathering Ascent (mist lifting in layers) → Major-Thirteenth Bloom (1:53, full brightness; peak 2:17, the F#mM9 thread of melancholy)", [
        S("cosmic", "cosmic — rising through the lifting haze until the whole tableland lies far below as an immense field of luminous gold strata, rose-gold light flooding every mesa like a galaxy unfolding across infinite darkness, one long violet shadow lying at its crest"),
        S("micro", "macro at the height of the bloom — the edge of one mesa blazing rose-gold, countless particles of light lifting off the warm stone in a slow glittering plume against the dark, a single violet thread woven through the gold"),
        S("aerial", "looking straight down as layer after layer of glowing mist peels away from the terraced mesas, each revealed step of stone brighter gold than the last, the frame filled edge to edge, the camera pulling back to reveal the full expanse"),
      ]),
      P("illumination", 0.625, 0.685, 0.45, "illumination", "2:24-2:37 Neapolitan Afterglow begins (remembering rather than celebrating)", [
        S("abstract", "abstract — long slanting bands of warm amber light cooling to violet at their edges, drawn diagonally across darkness like strands of luminous silk, one thread of melancholy blue woven through the gold"),
        S("intimate", "close — tall blades of translucent light standing along a mesa rim, each blade lit amber along one edge and violet along the other, fine particles drifting slowly between them in the slanting glow"),
        S("aerial", "from directly above, the slanting light stretching long violet shadows across the mesas, the warmth draining slowly westward over the strata, the camera drifting higher"),
      ]),
      P("return", 0.685, 0.858, 0.38, "integration", "2:37-3:17 Neapolitan Afterglow → Bare Fifths Return (3:04, simpler and darker) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of amber light resting alone on the flat summit of a dark mesa in the upper right of immense darkness, a faint violet glow beside it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single drop of light falling toward a shallow dark pool cupped in the stone, the flat dim surface waiting to hold a low band of glow, translucent and perfectly still"),
        S("interior", "within the thin evening haze settling over the mesas, slow slate-blue mist folding back over the stone, a last line of rose light fading through it, the camera descending softly"),
      ], { sparse: true }),
      P("integration", 0.858, 1, 0.38, "integration", "3:17-3:50 Bare Fifths Return → Open-Fifth Farewell (the D-natural echoed, rest on an open C#-G#)", [
        S("cosmic", "cosmic — from immense height the tableland becomes a faint ember line of gold across deep blue darkness, a quiet star field opening around it, the open fifth held and still, the rest reached and the way left open"),
        S("micro", "extreme macro — the last grains of amber light lying along the stone rim, a hairline violet shadow beside them, glowing softly and dissolving into blue night"),
        S("sparse", "DARK BACKGROUND — a single sliver of warm amber light along the rim of one dark mesa in the lower left of vast darkness, the faint violet shadow still beside it, the bookend of the first light, left softly open"),
      ]),
    ],
    morphs: [
      "the camera descends toward the drifting veils until it is gliding inside the lit mist sliding across a mesa summit",
      "the shadows lift and the camera rises through the thinning haze until the whole tableland blooms rose-gold far below",
      "the gold expanse slants and cools as the camera pulls back across long violet bands of light",
      "the slanting light drains away and the camera settles close on one small ember resting on a dark mesa",
      "the evening haze closes and the camera keeps rising until the mesas are a faint ember line beneath the stars",
    ],
  },
  {
    id: "85124aed-c3b4-42e2-870a-b14bc5425b72",
    name: "Night Wind 9",
    world: "C# major nocturne at 65 BPM, warm and wakeful, a churning low undertow that becomes a full gale crowned on Lydian F#M13#11, then an ebb and a hushed treble coda left as a question — one warm amber glint over a night sea of long swells made of liquid silver light, the wind combing them into plumes of lit spray at the peak only, ebbing until the scattered reflection gathers again, and a frost-white glint left in the air",
    phases: [
      P("threshold", 0, 0.157, 0.53, "threshold", "0:00-0:33 Lantern Opening (a lit point in darkness, the melody leaping outward to test the air)", [
        S("sparse", "DARK BACKGROUND — a single warm amber glint floating just above a dark swell in the lower right of vast darkness, a few fine beads of spray lifting from it like a first breath, nearly the entire frame empty"),
        S("micro", "extreme macro — fine spray lifting off the crest of a dark swell, each suspended bead lit warm amber on one side and silver on the other, drifting upward at different depths, luminous and weightless"),
        S("aerial", "from high above, looking straight down on long slow swells of dark luminous water filling the frame edge to edge, one warm glint of amber riding a crest, faint silver light lying in the troughs, the camera drifting down toward it"),
      ]),
      P("expansion", 0.157, 0.272, 0.85, "expansion", "0:33-0:57 Undertow Rising (the floor drops to F#1, a churning current, sus chords kept aloft)", [
        S("interior", "beneath the surface of the dark swells, riding a churning undertow of deep indigo light, long silver currents twisting past on every side, fine bubbles of light streaming upward toward a trembling ceiling of glow"),
        S("abstract", "abstract — low rocking waves of indigo and silver light rolling under one another across black, suspended and unresolved, the whole pattern lifting and falling with the wind like a held breath"),
        S("micro", "macro — a ridge of dark water drawn up by the wind, its edge combed into fine threads of silver light, prismatic sparks caught along it, spray peeling away into the night"),
      ]),
      P("transcendence", 0.272, 0.577, 0.95, "illumination", "0:57-2:01 Open Tide (wide bright I-IV-vi sweep) → Shadowed Ascent (1:40 D#m darkens, 1:49 held fifth, gathering to the 1:57 crown)", [
        S("aerial", "looking straight down at a wide open expanse of long glowing swells filling the frame edge to edge, warm silver and pale gold light racing across their backs in shifting bands, the camera gliding fast with the wind"),
        S("intimate", "close — one long swell rising out of the dark, its whole crest drawn into a thin luminous ribbon of silver light, spray streaming off it in slow translucent veils, amber glinting at its edge"),
        S("abstract", "abstract — for a breath the light dims to slate, bands of deep blue shadow passing over silver swells, then a flood of pale gold breaking across the whole rolling pattern, the camera rising through it"),
      ]),
      P("illumination", 0.577, 0.682, 1, "transcendence", "2:01-2:23 Full Gale (the one dominant drive summoned and refused, ecstatic and open)", [
        S("cosmic", "cosmic — the night wind at its height seen from immense height, great rolling swells of liquid light streaming luminous plumes of spray across infinite darkness, silver and pale gold sparks blown outward like a turning galaxy"),
        S("micro", "macro at the height of the gale — one plume of spray torn off a crest and exploding into thousands of glittering silver particles against black, every bead blazing"),
        S("aerial", "from directly above, the whole expanse combed by the gale into long parallel shimmering ridges of silver light running edge to edge, the camera soaring along them at speed"),
      ]),
      P("return", 0.682, 0.83, 0.75, "integration", "2:23-2:54 Ebbing Current (long holds on vi, IV, I; the reflection reassembling) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of silver spray suspended alone in the upper left of immense darkness, a few glints drifting slowly down from it, nearly the entire frame empty"),
        S("micro", "extreme macro — the last fine glints of spray settling onto dark water, each one opening a tiny ring of pale silver light, translucent and slow, the rings widening into one another"),
        S("abstract", "abstract — scattered fragments of reflected silver light drifting slowly together across black, gathering back into one long trembling band, the motion easing toward stillness"),
      ], { sparse: true }),
      P("integration", 0.83, 1, 0.37, "integration", "2:54-3:30 High Moon Coda (the treble hushed and glinting, a G-natural-tinged tonic, the question left in the air)", [
        S("cosmic", "cosmic — rising slowly away from the calm black swells until they are a faint band of pale silver beneath a quiet star field, a few frost-white glints scattered across the dark, the wind gone"),
        S("micro", "extreme macro — one last bead of spray hanging in the still air, frost-white and faintly amber, holding a tiny reflection of the whole night of swells"),
        S("sparse", "DARK BACKGROUND — a single warm amber glint resting above calm black water in the lower right of vast darkness, luminous and still, the bookend of the first light, its question left in the air"),
      ]),
    ],
    morphs: [
      "the camera drops beneath the dark swell and is pulled down into a churning undertow of indigo light",
      "the undertow lifts the camera up through the surface and high over a wide expanse of glowing swells",
      "the swells gather and the camera rises with the wind until the whole night of light streams across infinite darkness",
      "the gale drops away and the camera settles close on one small curl of spray alone in the dark",
      "the band of light steadies and the camera keeps rising until the calm swells are a faint silver line beneath the stars",
    ],
  },
  {
    id: "3814f116-5c54-499c-9d9b-355201700fdc",
    name: "Rattler 2",
    world: "A minor pedal-driven and coiled, rising to the D-minor summit at 1:33, sinking into a harmonic-minor shadow, striking with grinding chromatic power chords and then vanishing into a distant Eb hush; lyric 'I am fire from the mountain ... I'm a bird' — rivulets of fire-light pouring down a dark basalt mountainside, heat shimmer rocking with the ostinato, a summit of embers spreading like a galaxy, a dusk-blue gorge, the strike, and the last sparks lifting into cold stars",
    phases: [
      P("threshold", 0, 0.05, 0.69, "threshold", "0:00-0:12 Pedal Awakening (D colour over an A pedal, every phrase hanging on A13sus4)", [
        S("sparse", "DARK BACKGROUND — a single thin stream of bright sparks lifting from one glowing ember seam on dark basalt in the lower left of vast darkness, heat shimmer bending the black around it, nearly the entire frame empty"),
        S("micro", "extreme macro — the surface of a glowing ember at closest range, cracked dark crust over molten orange light, tiny sparks breaking free and rising, the air above trembling with ochre heat"),
        S("aerial", "from high above, looking straight down on a dark slope of basalt filling the frame edge to edge, the first thin seams of orange fire-light opening across it in branching lines, the camera descending toward them"),
      ]),
      P("expansion", 0.05, 0.321, 0.88, "expansion", "0:12-1:15 Pedal Awakening → Suspended Ostinato (0:26, the motor engages) → Dorian Haze (0:50, Am9 glow, chromatic jolts at 1:00-1:11)", [
        S("interior", "riding inside a rivulet of molten orange light as it runs down the dark slope, glowing walls of liquid fire sliding past on every side, sparks streaming upward overhead in rocking loops"),
        S("abstract", "abstract — rippling bands of heat shimmer in ochre, rust and pale gold rocking back and forth across black, the air itself pulsing with the ostinato, sparks looping and never settling"),
        S("micro", "macro — loops of glowing rust-red dust skittering across cracked dark stone, each grain lit like a tiny ember, circling and lifting, a sudden violet jolt of light flickering through them"),
      ]),
      P("transcendence", 0.321, 0.441, 1, "transcendence", "1:15-1:44 D-Minor Summit (the Dm69-G9 surge, the most impassioned climax at 1:33-1:35)", [
        S("cosmic", "cosmic — fire from the mountain at full height, the whole dark slope threaded with blazing rivers of orange light while vast swarms of sparks pour upward into infinite darkness, spreading like a galaxy of embers"),
        S("micro", "macro at the summit — one jet of molten light bursting from a seam in the basalt, shattering into thousands of white-gold sparks against black, each spark trailing a fine thread of heat"),
        S("aerial", "from directly above, dark plumes of smoke parting over the burning slopes and one bright shaft of gold light striking down onto the rivers of fire, the camera pulling back to reveal them"),
      ]),
      P("illumination", 0.441, 0.8, 0.76, "integration", "1:44-3:08 Settling Back (the exhale to A) → Harmonic-Minor Shadow (2:09-2:34, the lowest, darkest passage) → Gathering Drive (2:34, bare fifths winding the spring) → Chromatic Surge strikes (2:56) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember glowing alone in the upper right of immense darkness, a thin thread of rust-red light rising from it and curling away, nearly the entire frame empty"),
        S("interior", "inside a narrow cleft of dark basalt, dusk-blue shadow pooling at its floor like still smoke, one last thread of rust-red fire-light drawn along the rim far above, the camera descending slowly into the shadow"),
        S("aerial", "looking straight down on long ridges of dark ash raked by low firelight, hard parallel shadows pulsing between glowing orange crests, filling the frame edge to edge, the camera gliding faster and lower"),
      ], { sparse: true }),
      P("return", 0.8, 0.91, 0.3, "return", "3:08-3:34 Chromatic Surge (grinding Bb5-Ab5-A5, the loudest) → everything vanishes (3:25)", [
        S("micro", "macro — a cascade of glowing rust and charcoal embers tumbling down a dark slope in a hard low glare, grinding sparks thrown sideways, churning dust lit orange from within"),
        S("abstract", "abstract — the fire's light shattering into jagged chromatic shards of orange, rust and violet across black, then dissolving all at once into darkness"),
        S("intimate", "close — the last red seam of fire cooling to dull ember on the dark stone, a faint plume of sparks thinning in the cold air above it"),
      ]),
      P("integration", 0.91, 1, 0.3, "integration", "3:34-3:55 Distant Eb Coda (a tritone from home, ending on a whispered A/C)", [
        S("cosmic", "cosmic — the mountain gone dark far below, a few last sparks rising slowly and becoming cold blue-white stars in a vast quiet star field, drifting upward in the shape of a lifting wing of light, distant and open"),
        S("micro", "extreme macro — one last spark hanging in cold dark air, its warm orange core cooling to blue-white at the edges, a whisper of light fading"),
        S("sparse", "DARK BACKGROUND — a single thin stream of pale sparks lifting from one faint ember seam in the lower left of vast darkness, the bookend of the first fire, cooled to blue-white, a question left open"),
      ]),
    ],
    morphs: [
      "the camera descends onto the glowing seams and is swept into a rivulet of molten light running down the slope",
      "the heat shimmer flares and the camera rises with the swarms of sparks until the whole slope blazes below",
      "the fire exhales and the camera settles close on one small ember alone in the dark",
      "the raked ridges break loose and the camera plunges low into a cascade of tumbling embers",
      "the last ember cools and the camera rises with the final sparks until they become cold stars",
    ],
  },
  {
    id: "4d17da19-6834-4005-a944-34c27a88a320",
    name: "Amboise 2",
    world: "G major at 102 BPM, a low drone that lifts — suspensions that hover, a glittering chromatic bloom, an eleven-second held inhale before the Gsus crest, a warm draining descent and the first plain arrival home — Leonardo's flight studies as vast slow currents of air made visible by amber-lit dust, spiralling thermals over a dark river of light and pale limestone terraces, cresting in luminous fractal swirls, settling to one curl of dust over still water",
    phases: [
      P("threshold", 0, 0.05, 0.96, "threshold", "0:00-0:10 Ground of G (a low drone, tentative leaps)", [
        S("sparse", "DARK BACKGROUND — a single faint curl of warm amber dust rising on a slow thermal in the lower right of vast darkness, every mote lit gold, a thin spiral just beginning to turn, nearly the entire frame empty"),
        S("micro", "extreme macro — motes of dust riding the rising air at closest range, each grain glowing honey-gold, tracing tiny spiral streamlines through the dark like a study of moving air"),
        S("aerial", "from high above, looking straight down on a dark winding river of faint luminous light far below, pale limestone terraces glowing softly beside it, a first thermal of gold dust lifting toward the camera"),
      ]),
      P("expansion", 0.05, 0.231, 0.76, "expansion", "0:10-0:47 Ground of G → Suspended Awakening (0:25, Gsus2 and G11 hovering, the light rising)", [
        S("interior", "inside a slow rising thermal, curved currents of amber-lit dust climbing on every side in a great spiral, pale blue haze lifting away beneath, the camera rising with them"),
        S("abstract", "abstract — long curved streamlines of pale gold light drawn across black like a study of moving air, eddies curling off them in delicate spirals, suspended and hovering without settling"),
        S("micro", "macro — a veil of fine mist lifting off dark luminous water, droplets of light peeling upward into the warm air in slow translucent threads of cream and blue-grey"),
      ]),
      P("transcendence", 0.231, 0.46, 1, "illumination", "0:47-1:33 Chromatic Bloom (0:50, a glittering melody, sparks off the water) → Subdominant Plateau (1:12-1:33, Cmaj13 broadening)", [
        S("cosmic", "cosmic — the full ascent of air, colossal sweeping arcs of amber-lit wind arching across infinite darkness, glittering chromatic sparks scattered along every current like stars in a turning galaxy"),
        S("micro", "macro at the height of the bloom — sparks of light scattering off fast-moving water in a spray of honey-gold and pale rose glints, prismatic against black, each glint trailing a fine curve of air"),
        S("aerial", "from directly above, a broad slow bend of luminous river opening beneath wide streamlines of warm air, the whole frame flowing edge to edge in gold and sage, the camera gliding level along them"),
      ]),
      P("illumination", 0.46, 0.84, 0.69, "transcendence", "1:33-2:49 the deliberate breath (1:35) → Radiant Crest (G/A held 1:39-1:50, cresting on Gsus2/4 at 2:04) → Gentle Descent (2:13, relative minor, the bass stepping down)", [
        S("abstract", "abstract — a long held breath of light, one vast suspended vortex of gold dust turning slowly in place across black, every streamline drawn taut and shimmering, waiting"),
        S("cosmic", "cosmic — full radiance at the crest, pale limestone terraces far below blazing cream and gold as the currents of air above them burn into luminous fractal swirls reaching up into infinite darkness"),
        S("aerial", "looking straight down as long slanting threads of amber light lengthen across dark terraced stone, drifting motes sinking slowly through them, the warmth draining softly away, the camera descending"),
      ]),
      P("return", 0.84, 0.92, 0.8, "integration", "2:49-3:05 Lifted Homecoming (the drone lifts, Em7-Em11 over a B pedal) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curve of amber dust hanging alone in the upper left of immense darkness, a few motes drifting down from it, nearly the entire frame empty"),
        S("micro", "extreme macro — a few last motes settling through the cooling air, each holding a tiny ember of rose-amber light, their spiral streamlines loosening into the dark, weightless and slow"),
        S("interior", "within the warm dusk haze gathering over the dark water, slow folds of rose and blue-grey light closing softly together, translucent, the camera drifting downward"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.3, "integration", "3:05-3:21 Lifted Homecoming → the last chromatic glint (3:10) → an unsuspended G major (3:15), the first plain arrival home", [
        S("cosmic", "cosmic — from immense height the river becomes a faint thread of warm gold across deep darkness, the last current of air curling upward into a quiet star field, arrived at last, plain and warm"),
        S("sparse", "DARK BACKGROUND — a single faint curl of amber dust resting low over still luminous water in the lower right of vast darkness, the bookend of the first thermal, warmly settled"),
        S("micro", "extreme macro — one last mote of honey-gold light suspended above a black mirror, its tiny reflection glowing beneath it, a thin curl of warm air still turning around it, perfectly still"),
      ]),
    ],
    morphs: [
      "the camera rises off the dark river into the thermal until amber-lit dust spirals past on every side",
      "the spiral widens and the camera soars up with the currents until vast arcs of lit air sweep across the dark",
      "the camera levels and holds its breath as the streamlines gather into one slowly turning vortex",
      "the slanting threads dim and the camera settles close on one small curve of dust alone in the dark",
      "the dusk haze parts and the camera rises until the river is a faint thread of gold beneath the stars",
    ],
  },
  {
    id: "8ca69280-944c-4ccb-9f7f-692f3f7f7a6f",
    name: "Singular 4",
    world: "C major, the densest track with the smallest chord vocabulary, opening inside a glowing Lydian Fmaj7 and blooming on F rather than home, a passing Dm9 shadow, an unfinished amen on C/G — one intense thing: a single brilliant point of white-gold light in vast darkness with everything orbiting it, dust swaying in rocking two-chord currents, a galaxy-scale crest, a lavender veil passing, the field dispersing, and the point still there",
    phases: [
      P("threshold", 0, 0.05, 1, "threshold", "0:00-0:05 Lydian Dawn (inside a glowing Fmaj7, floating before any home)", [
        S("sparse", "DARK BACKGROUND — a single tiny intensely bright point of white-gold light in the lower left of vast darkness, fine rays radiating from it, a few motes beginning to turn around it, nearly the entire frame empty"),
        S("micro", "extreme macro — the point of light at closest range, a blazing core of ivory light wrapped in fine trembling threads of honey gold, shimmering at its edges"),
        S("abstract", "abstract — fine rays of ivory light fanning out from one bright point across the dark in a slow Lydian shimmer, each ray trembling between gold and pale blue, the camera drifting toward the core"),
      ]),
      P("expansion", 0.05, 0.39, 0.54, "expansion", "0:05-0:41 Lydian Dawn (C found at 0:08) → Rocking Ninths (0:17, the two-chord sway deepening)", [
        S("interior", "inside the slow current of dust circling the point of light, motes of warm amber drifting past on every side in long rocking curves, the bright core glowing ahead through them"),
        S("micro", "macro — grains of luminous dust caught in the light's pull, swaying back and forth in a fine ripple, each grain glinting gold then silver as it turns"),
        S("aerial", "from high above, looking straight down on a wide dark swirl of drifting dust slowly turning around one brilliant point, its rings brightening with every turn, the camera descending toward it"),
      ]),
      P("transcendence", 0.39, 0.549, 0.81, "transcendence", "0:41-0:58 Radiant Crest (the light breaks open at 0:40, the climax blooming on Fmaj7 at 0:50 — longing, not triumph)", [
        S("cosmic", "cosmic — the singular at full intensity, one point of white-gold light blazing at the heart of an immense slowly turning field of luminous dust, spiral arms of ivory and honey light reaching across infinite darkness like a galaxy being born"),
        S("micro", "macro at the height of the light — the core flaring open into a burst of ivory sparks, fine rays streaming out in every direction against black"),
        S("abstract", "abstract — concentric waves of pale gold and sky-blue light pulsing outward from one bright point, interference shimmering where they cross, the camera pulling back"),
      ]),
      P("illumination", 0.549, 0.746, 0.5, "illumination", "0:58-1:19 Shadowed Sway (fullness held, the F-pedal Dm9/F shadow at 1:06-1:11)", [
        S("aerial", "looking straight down as soft lavender shadows slide slowly across the turning luminous field of gold dust, the light dimming and returning around the steady point, the camera gliding with them"),
        S("intimate", "close — a passing veil of dusky lavender mist drifting across the bright point, its glow softened to a warm ember behind the veil, translucent and bittersweet"),
        S("micro", "extreme macro — fine dust drifting in wide gentle curves, each mote half gold and half lavender, the bright point holding steady beyond them as a soft blur of warm light"),
      ]),
      P("return", 0.746, 0.886, 0.3, "integration", "1:19-1:34 Unfinished Amen (the energy falls away, the F chord replaying its colours like a memory) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small glow of pale gold light alone in the upper right of immense darkness, a few motes dispersing outward from it, nearly the entire frame empty"),
        S("abstract", "abstract — faint rings of gold, lavender and silver light replaying one by one around the point and fading outward into darkness like a memory"),
        S("micro", "extreme macro — the last motes drifting away from the point of light, a silver glow lying along their edges, the gaps of darkness between them widening, slow and weightless"),
      ], { sparse: true }),
      P("integration", 0.886, 1, 0.3, "integration", "1:34-1:46 Unfinished Amen → plain C (1:37, 1:40) → C over G (1:44), lingering rather than closing", [
        S("sparse", "DARK BACKGROUND — darkness, and the single point of white-gold light, smaller now, resting in the lower left of vast darkness, still there, the bookend of the first light, warmly unfinished"),
        S("cosmic", "cosmic — from immense distance the point of light becomes one quiet star in an infinite dark field, a faint ring of golden dust still turning around it"),
        S("micro", "extreme macro — the point of light at rest, a soft glow of honey gold around its core, a faint ring of drifting motes slowing to stillness beside it, utterly still"),
      ]),
    ],
    morphs: [
      "the camera drifts toward the bright core until it is carried inside the current of dust circling it",
      "the swirl tightens and the camera pulls back as the field blooms into vast spiral arms of light",
      "the waves of light settle and the camera glides over the turning field as lavender shadows pass",
      "the field disperses and the camera settles close on one small glow of gold alone in the dark",
      "the last rings fade and the camera holds on the single point of light, smaller now, still there",
    ],
  },
  {
    id: "6cb979ce-3b76-4851-a0ba-3f100fddfcb3",
    name: "Yellow Bird 3",
    world: "E minor shadow rising to G major at 60 BPM, a first crest with a Lydian glimpse, a consoled rest on the tonic, the Cmaj7 flood to the GM summit and plagal amens; lyric 'little bird singing ... fly me home' — flight homeward as a flock of small golden lights streaming through deep night, rising from slate-green mist into a great ribbon, resting, wheeling into a galaxy-scale spiral at the summit, and drifting home as one warm point",
    phases: [
      P("threshold", 0, 0.05, 0.6, "threshold", "0:00-0:07 Low Awakening (near-darkness, G and Em over an E pedal, tentative leaps)", [
        S("sparse", "DARK BACKGROUND — a single small point of golden light drifting with a short faint trail in the lower right of vast blue-black darkness, a thin veil of slate-green mist around it, nearly the entire frame empty"),
        S("micro", "extreme macro — the point of light at closest range, a warm buttery core trailing a fine stream of pale gold motes like pollen of light, cool blue mist beading around it"),
        S("aerial", "from high above, looking straight down through layers of cool blue-grey mist, a few faint golden points beginning to rise out of the darkness below, the camera drifting down toward them"),
      ]),
      P("expansion", 0.05, 0.25, 0.82, "expansion", "0:07-0:37 Low Awakening → Minor-Mode Rising (0:22, the longing voiced, Em7 held at 0:30, the E7 pang at 0:37)", [
        S("interior", "within the rising mist, golden points of light streaming past on every side in a flowing ribbon, slate-green and misty blue haze parting around them, the camera flying with the stream"),
        S("abstract", "abstract — dozens of golden light-points tracing long curved trails across black, sweeping and turning together in one flowing pattern, a cool slate-green haze behind them, wistful and searching"),
        S("micro", "macro — two golden points passing close in the dark, their faint trails crossing in a tiny braid of ochre and cream light, a sharp silver glint where they touch"),
      ]),
      P("transcendence", 0.25, 0.393, 1, "transcendence", "0:37-0:57 Minor-Mode Rising → the first crest (0:45-0:50) → the Lydian glimpse (C69#11, 0:52) → turning toward G", [
        S("cosmic", "cosmic — flying homeward: a vast shimmering flock of golden light-points streaming across a deep starlit night in one great curving ribbon, a sudden opening of Lydian brightness spilling through the stars, infinite darkness around"),
        S("micro", "macro at the crest — one golden point blazing bright, its trail fanning into a spray of cream-white sparks and luminous particles against black, a flash of pale Lydian blue at its edge"),
        S("aerial", "from high above, looking down on the great ribbon of gold light curving away below like a luminous river of sparks through the dark, the camera soaring over it"),
      ]),
      P("illumination", 0.393, 0.84, 0.87, "illumination", "0:57-2:03 Turning Toward G (rest on the tonic 0:57-1:05, the shadow returning 1:17-1:28) → Cmaj7 Summit (1:29 the flood, GM climax 1:50-1:52) — the sparse valley opens on the consoled rest", [
        S("sparse", "DARK BACKGROUND — one small golden point of light hovering alone in the upper left of immense darkness, its trail curled in a slow resting loop, nearly the entire frame empty"),
        S("abstract", "abstract — a field of warm honey-gold light flooding across the dark, thousands of points spreading into wide luminous waves, buttery yellow and cream rising in long slow swells, the camera rising through them"),
        S("cosmic", "cosmic — the summit: the whole flock become a vast spiral of golden light wheeling through a galaxy of stars, honey-gold and cream-white blazing across infinite darkness, wide open and bright"),
      ], { sparse: true }),
      P("return", 0.84, 0.92, 0.98, "return", "2:03-2:15 Plagal Homecoming (repeated C→G amens, arriving home)", [
        S("aerial", "looking straight down as the long stream of golden points drifts slowly downward through the dark in gentle settling curves, a mellow late-gold glow along its length, the camera descending with it"),
        S("micro", "extreme macro — a few golden points thinning and slowing, each trail softening to a mellow amber glow, fine motes of light settling from them, suspended in the warm dark"),
        S("intimate", "close — a pair of golden points gliding side by side through the dark, their trails weaving gently and settling, warm and content"),
      ]),
      P("integration", 0.92, 1, 0.84, "integration", "2:15-2:26 Plagal Homecoming → the close on G/B (content, gently open)", [
        S("cosmic", "cosmic — a single golden point of light drifting homeward through the deep night in the lower left of vast darkness, its warm trail still glowing, a quiet star field far beyond it, the bookend of the first light"),
        S("micro", "extreme macro — the last golden point at closest range, a warm cream-white core holding a tiny reflection of the whole flock, its fine trail of pale gold motes settling into the dark"),
        S("sparse", "DARK BACKGROUND — one small golden point of light resting in the lower right of vast darkness, its trail curled softly, arrived and gently open"),
      ]),
    ],
    morphs: [
      "the camera drifts down through the blue mist and is swept into the rising ribbon of golden points",
      "the braid of trails widens and the camera soars up until the whole flock streams across the starlit night",
      "the ribbon slows and the camera settles close on one small golden point resting alone in the dark",
      "the spiral unwinds and the camera descends with the stream of gold as it drifts gently downward",
      "the trails settle and the camera follows one golden point drifting home through the deep night",
    ],
  },
];
