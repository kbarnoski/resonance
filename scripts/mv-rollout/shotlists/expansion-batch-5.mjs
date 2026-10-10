// Expansion — Archetype shot lists, batch 5 (2026-10-09): Tranquility 38,
// Night Wind 11, Horses 1, No question 8, Velvet Tears 1, Tranquility 11,
// Northern Plane 3, Torraine 5.
//
// Same format as expansion-sample.mjs (the approved model) minus shaders /
// shaderOpacity. Phase ids, bounds and intensities are the journeys' CURRENT
// ones (the v2 measured arcs from the 2026-10-05 re-theme); `music` names the
// deep-analysis sections each phase holds. Each journey keeps its
// analysis-derived world and palette, TRANSFIGURED (law L), with its own
// motif family (no sibling re-skins). ONE sparse phase per journey at the
// music's real interior valley.
//
// Horses 1 (Karel approved 2026-10-09): keeps the copper-dust dusk-steppe
// world plus exactly FOUR horse TRACE shots, worded after the passing
// animal-test prompts (#01 lone dust-horse far away, #02 mane macro as copper
// filament) and the hoofprints trail: threshold #1 ("horse"), expansion #2
// ("mane"), return #2 ("hoofprints"), integration #2 ("mane"). No horse as a
// main subject at mid/close range, no hooves/legs, no herd, no eyes or faces.

export const SET = { key: "expansion-batch-5", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "9662fec9-04fa-4202-9859-8f01cd287aad",
    name: "Tranquility 38",
    world: "C# major pedal meditation at 64 BPM that grows in one patient wave to a warm plagal summit at 2:50 and keeps glancing at its own minor reflection — the cosmic member of the family: calm veils of rose and blue stardust in which slow rings of light spread from somewhere unseen, a honey beam of subdominant warmth, slate shadows passing on the climb, the veils lit gold all at once at the summit, then one veil and one ring left ringing",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:11 Opening Stillness (near-silence, open fifths over a low G# pedal)", [
        S("sparse", "DARK BACKGROUND — a single fine veil of rose stardust drifting low in the lower left of vast darkness, barely lit, one faint ring of light spreading slowly outward through it from somewhere unseen, the rest of the frame open black"),
        S("micro", "extreme macro — the grains of that veil at closest range, countless particles of rose and pale blue light suspended at different depths, a slow concentric ripple passing through them like a breath"),
        S("aerial", "from high above, looking straight down on a calm dark mirror where two faint veils of rose stardust lie reflected in one another, luminous and still, the camera drifting slowly down toward them"),
      ]),
      P("expansion", 0.05, 0.505, 0.47, "integration", "0:11-1:51 Opening Stillness (quietest 0:38) → Subdominant Warmth (0:43, 'this is home') → Shadowed Ascent (C#m glances 1:20-1:28) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of rose stardust suspended alone in the upper right of immense darkness, a few motes of honey light drifting away from it, nearly the entire frame empty"),
        S("interior", "inside a slow river of honey-gold stardust curving across infinite darkness, motes of rose light turning weightless within it, soft blue haze at its edges, the camera gliding along its current"),
        S("abstract", "abstract — layered veils of rose and pale blue stardust sliding across one another at different depths, a slow slate shadow passing over them and lifting again, the veils climbing gently toward the upper left"),
      ], { sparse: true }),
      P("transcendence", 0.505, 0.72, 1, "illumination", "1:51-2:38 Gathering Light (first wholehearted arrival 2:03-2:09) → Open Sky (2:10-2:39, highest and brightest space)", [
        S("cosmic", "cosmic — rising through the veils as they open into a vast calm reach of deep space, countless faint stars glowing within slow drifts of rose, violet and blue luminous dust, the brightest veil gathered in the right third"),
        S("micro", "macro — one crest of stardust catching pale gold light, fine glittering particles combed into long parallel bands, deep blue darkness beneath them"),
        S("aerial", "looking straight down across an immense luminous plane of blue stardust stretching edge to edge, gold light glinting across it in widening bands, the camera rising higher and higher"),
      ]),
      P("illumination", 0.72, 0.84, 0.8, "transcendence", "2:38-3:05 Subdominant Summit (climax 2:50 on a warm plagal F#; second glowing wave 3:05)", [
        S("cosmic", "cosmic — the summit: every veil of stardust lit at once into a vast warm nebula of honey gold and rose, glowing evenly from edge to edge, a fullness rather than a blaze, the camera pulling back to hold it all, its densest light in the lower left"),
        S("abstract", "abstract — a slow second wave of golden light rolling through the luminous dust in broad concentric rings, shimmering warmth spreading outward across black"),
        S("micro", "extreme macro — the heart of one glowing mote of stardust, honey light with a faint rose halo, fine particles turning slowly around it"),
      ]),
      P("return", 0.84, 0.92, 0.62, "return", "3:05-3:22 summit's second wave → Homeward Exhale (3:15, the sound recedes quickly, one last look at the minor)", [
        S("aerial", "from high above, the golden nebula thinning into long translucent veils of rose dust, faint stars showing through the gaps as the light recedes, the camera beginning to descend"),
        S("intimate", "close — one veil of stardust cooling from gold to slate blue as it drifts aside, a last glance at the minor, a few warm motes still glowing along its edge"),
        S("interior", "within the thinning dust, slow rings of pale amber light passing outward and fading, calm darkness gathering behind them"),
      ]),
      P("integration", 0.92, 1, 0.55, "integration", "3:22-3:40 Homeward Exhale (tonic with its third still ringing)", [
        S("cosmic", "cosmic — deep space at rest, one faint rose veil of stardust lying across a quiet star field, warm amber light lingering inside it, still and windless"),
        S("sparse", "DARK BACKGROUND — a single fine veil of rose stardust in the lower left of vast darkness, one last faint ring of light spreading through it, the bookend of the first stillness"),
        S("micro", "extreme macro — one mote of warm amber light resting in the dust, its glow still ringing softly outward into the dark, translucent and weightless"),
      ]),
    ],
    morphs: [
      "the camera drifts down into the reflected veils and settles close on one small curl of rose dust alone in the dark",
      "the veils climb and part and the camera rises through them into a vast calm reach of stars and luminous dust",
      "the gold bands brighten and the camera pulls back as every veil ignites at once into one warm nebula",
      "the glowing mote expands and the camera rises as the nebula thins into translucent veils of rose dust",
      "the rings of amber fade and the camera keeps drifting back until one rose veil lies across a quiet star field",
    ],
  },
  {
    id: "e4658610-336d-452f-a4f8-7b652b339db6",
    name: "Night Wind 11",
    world: "C# major at 66 BPM with a rolling, air-like surface, suspensions outnumbering resolutions — a moonlit night of wind drawn as smooth silver ribbons of luminous cloud: a first breath lifting seed-heads of light, a Lydian undertow breathing low across the dark, gusts braiding streamers into a restless lattice, the wind dropping into crisp frost-clear calm, the storm of suspensions as one great galactic sweep, and a single small warm glow at the close",
    phases: [
      P("threshold", 0, 0.142, 0.37, "threshold", "0:00-0:29 Tonic Pedal Awakening (a question asked softly, D#m7sus2 0:25)", [
        S("sparse", "DARK BACKGROUND — a single fine wisp of pale cloud drawn out by a first breath of wind into silky strands in the lower right of vast indigo darkness, its edges luminous with moonlit silver, the rest of the frame open black"),
        S("aerial", "from high above, looking straight down on dark rolling land at dusk where a first breath of air lifts a scatter of luminous seed-heads in a slow spiral, silver motes rising and settling again, the camera drifting down"),
        S("micro", "extreme macro — one luminous seed-head lifted on the air, its fine silver strands trembling, tiny droplets of moonlight beaded along them against deep indigo"),
      ]),
      P("expansion", 0.142, 0.255, 0.75, "expansion", "0:29-0:52 Lydian Undertow (F#maj9#11 blooms, the ground seems to breathe)", [
        S("abstract", "abstract — long rolling waves of silver light moving low across darkness in slow parallel swells, as though the ground itself were breathing, a warm amber bloom rising beneath them at the left"),
        S("interior", "gliding inside a low current of luminous air, translucent ribbons of silver and pale violet vapor streaming past on every side, a warm amber glow far beneath them"),
        S("aerial", "looking straight down as long luminous ribbons of cloud unspool over dark rolling hills, their silver edges glowing, warm air lifting them in slow weightless curves"),
      ]),
      P("transcendence", 0.255, 0.373, 0.85, "illumination", "0:52-1:16 Gusts Over F (first true gust, ~6 attacks/s, silver flashes)", [
        S("interior", "inside the first great gust, streamers of luminous cloud tearing sideways past on every side in silver bands, braiding and unbraiding at different depths, a flash of moonlit silver breaking through them"),
        S("micro", "macro — fine leaves of silver light streaming sideways in the gust, each edge flickering with tiny sparks of moonlight, motion-streaked against indigo darkness"),
        S("abstract", "abstract — dozens of silver streamers crossing the frame at different heights in a restless lattice of light, braiding over one another, slate grey vapor drifting between"),
      ]),
      P("illumination", 0.373, 0.702, 0.7, "integration", "1:16-2:23 Clearing Sky (the wind drops, glassy and still 1:20-1:45) → Cadence of Return (clearest cadence 2:12) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small glint of frost light suspended alone in the upper left of immense clear darkness, a single thin luminous ribbon resting far above it, nearly the entire frame empty"),
        S("micro", "extreme macro — fine feathers of frost unfurling at closest range across black glass, each filament catching cold silver light in tiny prismatic sparks, still air all around"),
        S("cosmic", "cosmic — the vapor parted into a wide calm night of crisp stars, a few thin luminous ribbons resting high and still, the camera slowly rising toward them as the wind gathers again at the lower edge"),
      ], { sparse: true }),
      P("return", 0.702, 0.864, 1, "transcendence", "2:23-2:56 Storm of Suspensions (climax 2:31, I-vi-ii-IV cycles at full force)", [
        S("cosmic", "cosmic — the whole night alive with one great smooth sweep of luminous cloud ribbons streaming across infinite darkness like the arm of a galaxy, silver and pale violet, the sweep rising from the lower left"),
        S("aerial", "from high above, vast silver sheets of wind-flattened luminous light rolling across dark moorland in long waves, fast vapor racing over them, the camera sweeping with the wind"),
        S("micro", "macro at the height of the wind — a torrent of silver particles streaming past in long motion-streaked lines, each a tiny bright spark against black"),
      ]),
      P("integration", 0.864, 1, 0.37, "integration", "2:56-3:24 Stillness at the Door (the wind dies away, plagal close on C#maj7)", [
        S("abstract", "abstract — the last silver ribbons slowing and settling into gentle curves across darkness, the wind dying away, faint violet haze drifting between them"),
        S("intimate", "close — a few luminous seed filaments drifting slowly downward through still dark air, translucent and silver, their glow fading as they settle"),
        S("sparse", "DARK BACKGROUND — a single small warm amber glow resting low in the right third of vast indigo darkness, one fading luminous ribbon of pale cloud above it, the bookend of the first breath"),
      ]),
    ],
    morphs: [
      "the seed-head's strands stretch into light and the camera sinks low into rolling waves of silver breathing across the dark",
      "the ribbons quicken and the camera is swept inside the first gust as the streamers tear sideways",
      "the lattice of streamers falls away and the camera settles close on one small glint of frost light in clear darkness",
      "the resting ribbons stir and the camera rises as the whole night gathers into one great galactic sweep",
      "the torrent of sparks slows and the camera drifts down as the last ribbons settle into gentle curves",
    ],
  },
  {
    id: "c7a0c1c2-c5d2-487b-8c54-73b134e6f09a",
    name: "Horses 1",
    world: "G minor canter at 94 BPM, never leaving its tonic pedal, cresting at 1:38 and 3:05 and resting on a bare open fifth — a dusk steppe of racing copper dust and torn storm vapor where the horses exist only as traces: one tiny dust-horse far off at the start, a mane streaming as copper filament, hoofprints of embers where the gallop has passed, the full stride as a galactic river of lit dust, a shadowed current with one ember, and the dust rising into the first stars",
    phases: [
      P("threshold", 0, 0.05, 0.81, "threshold", "0:00-0:12 Opening Gait (Gmadd9 over a low G sets the rolling pulse)", [
        S("sparse", "DARK BACKGROUND — a single thin plume of copper dust rising in the lower right of vast darkness, holding the faint outline of one small running horse made of drifting dust and light, luminous along its back, dissolving at its edges, the rest of the frame open black"),
        S("micro", "extreme macro — fine grains of copper dust lifting off dry dark ground, each grain lit like a spark, drifting upward at different depths in soft darkness"),
        S("aerial", "from high above, looking straight down at dim rolling ground where a pale winding line of luminous dust is drawn across the dark land, mist lifting in slow bands, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.16, 1, "expansion", "0:12-0:38 Opening Gait → Rocking Theme (confident i-iv rocking 0:23-0:35)", [
        S("abstract", "abstract — long rocking waves of copper light rippling across darkness in a rolling three-beat rhythm, wind-driven dust combed into luminous streaks, slate grey mist drifting between the crests"),
        S("micro", "extreme macro — the tip of a streaming mane at closest range, each strand a filament of copper light trailing glowing dust grains, drifting at different depths in soft darkness"),
        S("aerial", "looking straight down on a broad dark slope where wind-flattened grass made of light glows in regular bronze waves, low slate vapor tearing past at the upper edge, the camera racing along above"),
      ]),
      P("transcendence", 0.16, 0.336, 0.91, "illumination", "0:38-1:20 Rocking Theme (the third drains to hollow G5 at 0:43) → Open-Fifth Ground (a shaft of light at 1:12) → Gathering Surge", [
        S("interior", "inside a racing storm of lit copper dust and torn slate vapor filling the frame edge to edge, luminous particles streaking past in long diagonal motion trails, abstract and weightless, the camera carried through it"),
        S("intimate", "close — a single shaft of pale bronze light crossing dark stony ground and vanishing, a thin veil of copper dust glittering in the beam, the rest of the frame in shadow"),
        S("abstract", "abstract — torn streamers of storm vapor and copper dust spiralling slowly around an open dark centre, bronze light flickering at their edges, the storm gathering but never breaking"),
      ]),
      P("illumination", 0.336, 0.84, 0.78, "transcendence", "1:20-3:21 Gathering Surge → Full Stride (climax 1:38) → Shadowed Hollow (2:05-2:47) → Tonic Pedal Drive (flare 3:05)", [
        S("cosmic", "cosmic — the full stride seen from immense height, a vast river of luminous copper dust sweeping across infinite darkness like the arm of a galaxy, bronze light blazing along its crest, violet nebula haze trailing in its wake, the camera rising with it"),
        S("intimate", "a single ember of copper light drifting above a slow dark current in deep shade, a faint wisp of mist trailing from it, the current stirring beneath with an unseen pull, vast darkness all around"),
        S("micro", "extreme macro — fine copper dust and sparks flung upward in a rolling rhythm, each grain a tiny ember trailing a motion streak through darkness, translucent smoke curling between them"),
      ]),
      P("return", 0.84, 0.92, 0.86, "integration", "3:21-3:40 Homeward Cadences (true dominants arrive, the drive thins to 0.33) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of copper dust drifting alone in the upper left of immense darkness, a faint violet haze far beneath it, nearly the entire frame empty"),
        S("aerial", "looking straight down at dark earth at nightfall, a long winding trail of hoofprints where the run has long since passed, each print holding a fading ember of copper light, luminous dust settling slowly over them, the camera drifting along above"),
        S("abstract", "abstract — slow cadences of copper light settling in descending curves across darkness, each one dimmer than the last, violet dusk gathering between them"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.37, "integration", "3:40-3:59 Homeward Cadences → the bare G open fifth (3:50)", [
        S("cosmic", "cosmic — the last copper dust rising and dispersing into a slow faint nebula of copper and violet among the first stars, the camera pulling back into infinite darkness, still and unresolved"),
        S("micro", "extreme macro — the last strand of a streaming mane at closest range, a single filament of copper light trailing a few glowing dust grains into soft darkness, the bookend of the first light"),
        S("sparse", "DARK BACKGROUND — a single thin plume of copper dust settling in the lower right of vast darkness, faintly luminous, an open fifth left hanging in the still air"),
      ]),
    ],
    morphs: [
      "the plume of dust streams sideways and the camera drops low until it is riding the rocking waves of copper light",
      "the waves of dust rise into a wall and the camera is swept inside the racing copper storm",
      "the spiralling streamers lengthen and the camera rises until the whole stride is one galactic river of lit dust far below",
      "the flung sparks fade and the camera settles close on one small ember of copper dust alone in the dark",
      "the settling curves lift and the camera pulls back as the last dust rises into a slow nebula among the first stars",
    ],
  },
  {
    id: "6407bf5c-7862-49e8-883d-59754c4caf18",
    name: "No question 8",
    world: "C major chorale-meditation at 58 BPM, one plagal idea darkened by borrowed F minor, a late low resonant summit at 2:02 and a bare open fifth that leaves major or minor unasked — one line of certainty drawn in gold across black water under charcoal bands of vapor: it widens and rises as luminous mist, is pressed by umber shadow, becomes a broad radiant band on a heaving swell at the low summit, gentles to amber afterglow, and narrows back to a single thread left open",
    phases: [
      P("threshold", 0, 0.05, 0.56, "threshold", "0:00-0:09 Opening Statement (the whole argument in one breath)", [
        S("sparse", "DARK BACKGROUND — a single slender line of pale gold light lying across black still water in the lower left of vast darkness, luminous and exact, long charcoal bands of vapor resting far above, the rest of the frame open black"),
        S("micro", "extreme macro — the edge of that line of light at closest range, tiny ripples of ivory and gold particles trembling along it, soft darkness beyond"),
        S("aerial", "from high above, looking straight down on an immense dark mirror crossed by one thin luminous thread of gold, the camera descending slowly toward it"),
      ]),
      P("expansion", 0.05, 0.55, 0.77, "expansion", "0:09-1:36 Opening Statement → Leaning Toward F (mist thickens) → Minor Shadow (Cm 1:09, the most uncertain moment) → Suspended Ascent", [
        S("aerial", "looking straight down on dark water filling the frame, one thin line of gold light lying diagonally across it from corner to corner, translucent luminous mist rising off it, the camera gliding along it"),
        S("interior", "inside a thickening veil of luminous mist filling the frame edge to edge, long diagonal wisps of pale ivory and pewter light streaming past, translucent and weightless, the camera moving slowly through"),
        S("abstract", "abstract — shifting patches of umber and gold light pressing through slow bands of slate vapor, the warmth darkening and returning, a restless fractal weave of shadow across black"),
      ]),
      P("transcendence", 0.55, 0.72, 1, "transcendence", "1:36-2:06 Suspended Ascent → Low Summit (climax 2:02 on F minor over C, lowest and loudest register)", [
        S("cosmic", "cosmic — at the low summit the line of light becomes a broad radiant band of burnished umber and gold laid across a vast heaving swell, seen from immense height, slate darkness all around like deep space, the glow weighted to the lower right"),
        S("micro", "macro — the crest of one dark swell lifting under the weight of the summit, light glinting off its edge in a spray of amber particles, impossible slowness"),
        S("abstract", "abstract — deep resonant rings of umber and gold light spreading outward through darkness from one low point, like a bass string sounding, each ring dissolving into the next"),
      ]),
      P("illumination", 0.72, 0.84, 0.61, "illumination", "2:06-2:27 Resonant Consolation (the minor drains out, F major rings like an afterglow)", [
        S("aerial", "from high above, deep amber light lying low across dark water after the summit, the surface still heaving gently in long luminous swells, the camera pulling back"),
        S("intimate", "close — a soft band of honey light resting on slow dark water, its gold gentled, translucent vapor lifting from it in quiet curls"),
        S("micro", "extreme macro — a single droplet of amber light trembling on dark glassy water, rings of afterglow spreading from it, luminous"),
      ]),
      P("return", 0.84, 0.92, 0.54, "integration", "2:27-2:41 Unanswered Fifth (the opening returns at a whisper, last Fm69 2:32) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small fleck of pale gold light resting alone in the upper right of immense blue-grey darkness, nearly the entire frame empty, utterly still"),
        S("interior", "within the thinning dusk, the line of light narrowing back to its first slender clarity, ember-dim, cool vapor loosening above it, the camera drifting down"),
        S("micro", "macro — fine flakes of soft snow settling onto dark glassy water and dissolving, each catching the last blue-grey light, translucent"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.3, "integration", "2:41-2:55 Unanswered Fifth (Gsus4 → Cadd9, a bare C fifth)", [
        S("cosmic", "cosmic — from immense height the dark water becomes a vast quiet mirror of infinite night, one thin bright thread of gold still running across it among faint stars, neither warm nor cold, the question left open"),
        S("sparse", "DARK BACKGROUND — a single slender line of pale gold light across black water in the lower left of vast darkness, luminous, the bookend of the first statement"),
        S("micro", "extreme macro — one last bead of gold light resting on still black water, blue-grey silence around it, dissolving"),
      ]),
    ],
    morphs: [
      "the camera descends toward the thin thread of gold until it is gliding just above the widening line of light",
      "the shadowed weave parts and the camera pulls up and back as the line becomes a broad radiant band across a heaving swell",
      "the resonant rings settle and the camera rises over amber light lying low across the slow dark water",
      "the droplet's rings fade and the camera settles close on one small fleck of gold alone in the dusk",
      "the falling flakes dissolve and the camera keeps rising until the water is a quiet mirror of infinite night",
    ],
  },
  {
    id: "aadbf1d3-5db1-4f80-a60d-f6d0c4a6e7b6",
    name: "Velvet Tears 1",
    world: "E Aeolian lament on an E pedal at 93 BPM, the third flickering between G and G#, two long waves and a bare E5 ending — soft luminous drops falling through deep velvet darkness onto dark plum petals: one drop wavering rose and silver, the tears flowing as a slow rain of light, an unfallen drop in the hushed valley, mist lifting off a field of petals in the rising return, the Lydian height as rain-light spun into silver threads, and one drop at rest",
    phases: [
      P("threshold", 0, 0.05, 0.35, "threshold", "0:00-0:12 Pedal Awakening (lone E fifth, EM 0:08 / Em 0:11)", [
        S("sparse", "DARK BACKGROUND — one small luminous drop resting on the curve of a deep plum velvet petal in the lower right of vast darkness, its glow wavering between rose and pale silver, the rest of the frame open black"),
        S("micro", "extreme macro — the skin of that drop at closest range, a tiny world of rose and silver light held inside it, the velvet nap of the petal beneath like a dark expanse of filaments"),
        S("aerial", "from high above, looking straight down into velvet darkness where slow rings of faint silver light spread outward from a single point, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.461, 0.74, "expansion", "0:12-1:50 Major-Minor Flicker → Aeolian Descent (the tears flow, 0:45) → Altered Crest (flood crest 1:33-1:40, B7#9b13)", [
        S("interior", "inside a slow luminous rain of glowing tears falling through velvet darkness, soft drops of rose and silver light descending slowly on every side at different depths, dark petals far below catching their glow"),
        S("micro", "macro — a luminous drop landing on a black mirror of water and splashing into a crown of tiny glowing beads of plum and gold light, impossibly slow, deep darkness all around"),
        S("cosmic", "cosmic — the flood at its crest, a vast slow rain of luminous drops pouring diagonally across infinite darkness like a tilted galaxy of silver and rose light, the densest fall in the upper left"),
      ]),
      P("transcendence", 0.461, 0.581, 1, "integration", "1:50-2:19 Ebb (refuses to cadence; hushed valley of Dsus4 and G-shells 1:55-2:10) → Rising Return begins — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single drop of pale silver light suspended alone in the upper left of immense velvet darkness, unfalling, nearly the entire frame empty"),
        S("abstract", "abstract — slow receding curves of silver light drawing back across darkness like foam withdrawing over wet sand, dissolving into fine particles, rain-slate haze between them"),
        S("micro", "extreme macro — the tip of a dark petal holding one trembling bead of light, its glow dimmed to slate, suspended between falling and staying"),
      ], { sparse: true }),
      P("illumination", 0.581, 0.756, 0.6, "illumination", "2:19-3:01 Rising Return (the line climbs through G and A, the most major-tinted stretch)", [
        S("aerial", "rising slowly above a vast expanse of dark velvet petals while looking straight down, luminous mist lifting off them in pale layers, soft gold glow gathering in the drops that rest on each one"),
        S("intimate", "close — a slow curtain of luminous rain threads falling diagonally through velvet darkness, each thread beaded with pale gold light, translucent and silver at its edges"),
        S("abstract", "abstract — layered veils of translucent mist lifting through darkness in slow tiers, gold and silver light climbing between them toward the upper right"),
      ]),
      P("return", 0.756, 0.89, 0.48, "transcendence", "3:01-3:33 Lydian Height (highest point, Cmaj9#11, light through rain)", [
        S("cosmic", "cosmic — light breaking through a vast bank of luminous vapor and catching the falling drops into endless silver threads, a shimmering curtain of rain-light spanning infinite darkness, rose and gold at its heart, its brightest seam in the right third"),
        S("micro", "macro at the height — one falling drop splitting the light into prismatic threads of gold, rose and silver, glittering against velvet black"),
        S("aerial", "from high above, the whole expanse of dark petals glittering with countless drops of light scattered like stars on velvet, the camera pulling back"),
      ]),
      P("integration", 0.89, 1, 0.35, "integration", "3:33-4:00 Open-Fifth Farewell (a whisper, ends on a bare E5)", [
        S("abstract", "abstract — the last silver threads of rain-light thinning to a few slow vertical lines across darkness, rose and gold fading to blue-grey"),
        S("intimate", "close — the final drops falling more and more slowly onto dark petals, each glow fading as it lands, dim slate stillness around"),
        S("sparse", "DARK BACKGROUND — one small luminous drop resting on a dark velvet petal in the lower right of vast darkness, a last faint ring of light fading around it, the bookend of the first tear"),
      ]),
    ],
    morphs: [
      "the camera descends toward the spreading rings and begins to fall with the glowing drops through the velvet dark",
      "the flood thins and the camera settles close on one small drop of silver light hanging unfallen",
      "the bead lets go and the camera rises above a vast expanse of petals as mist lifts off them",
      "the climbing light breaks through and the camera pulls back into a curtain of rain-light spun into silver threads",
      "the glittering petals recede and the camera drifts down as the threads of rain-light thin to a few slow lines",
    ],
  },
  {
    id: "2ff26268-997a-438f-8dac-d280d50da3a1",
    name: "Tranquility 11",
    world: "C# major free-time exhale at 63 BPM, the densest Tranquility, swelling twice to a bittersweet F#7#9 summit at 1:49 and ending suspended on the subdominant — warm lagoon shallows where caustic nets of light weave across pale sand: a first net at dawn, the lattice blooming, the floor rocking with light, the whole lagoon blazing as a turning web, the light settling like embers into the sand, and one slow ring left unresolved",
    phases: [
      P("threshold", 0, 0.05, 0.31, "threshold", "0:00-0:09 Pedal Dawn (C# add9 pedal)", [
        S("sparse", "DARK BACKGROUND — a single small net of rippling light glowing on pale sand beneath clear shallow water in the lower right of vast teal-black darkness, luminous and trembling, the rest of the frame open black"),
        S("micro", "extreme macro — the bright lines of a caustic net at closest range, each thread of light trembling across fine grains of pale sand, amber and aqua"),
        S("aerial", "from high above, looking straight down on still shallows at first light, a faint lattice of luminous caustics beginning to spread across the sandy floor, the camera descending"),
      ]),
      P("expansion", 0.05, 0.37, 0.63, "expansion", "0:09-1:04 Pedal Dawn → First Swell (blooms on F#maj13 at 0:45, chromatic haze 0:55)", [
        S("abstract", "abstract — luminous caustic nets spreading and interlacing across a pale floor in slow shimmering patterns, gold and aqua light weaving into a living lattice, the brightest weave in the left third"),
        S("interior", "gliding beneath the surface of warm luminous shallows, sheets of rippling light passing overhead, pale sand glowing below, a soft rose haze drifting through"),
        S("micro", "macro — a single ripple bending the light into a ring of amber and rose, the caustic net below it swelling and blooming"),
      ]),
      P("transcendence", 0.37, 0.626, 1, "illumination", "1:04-1:48 Rocking Dominant (two-chord ostinati, augmented passing chord 1:10, hollow D#sus2)", [
        S("aerial", "looking straight down on an immense warm lagoon, the whole sandy floor alive with swaying nets of caustic light rocking back and forth in slow waves, translucent aqua edge to edge, the camera gliding along"),
        S("intimate", "close — two slender bands of golden light rocking slowly back and forth across pale sand, one passing over the other, a slate shadow drifting across them"),
        S("abstract", "abstract — a kaleidoscopic hexagonal web of aqua and gold light trembling in rhythm, its openings widening and narrowing like breath"),
      ]),
      P("illumination", 0.626, 0.707, 0.6, "transcendence", "1:48-2:01 Bittersweet Summit (climax 1:49 on F#7#9, ii-V7b9 home)", [
        S("cosmic", "cosmic — the whole lagoon blazing as one vast slowly turning web of golden light seen from immense height, caustic threads radiating outward like the arms of a galaxy, violet shadow at its edges, its core in the upper right"),
        S("micro", "macro at the height of the light — a crest of rippling shallows splitting the gold into prismatic threads of rose and amber, glittering against shadowed sand"),
        S("aerial", "from high above, gold light spilling across the shallows while half the floor still lies in violet shadow, the camera pulling back"),
      ]),
      P("return", 0.707, 0.868, 0.3, "integration", "2:01-2:29 Settling Embers (the energy collapses, home turned into a doorway to F#) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of caustic light glowing on dark sand in the upper left of immense teal-black darkness, nearly the entire frame empty"),
        S("interior", "within the deepening shallows, the last nets of light sinking slowly into teal shadow, warm points of amber settling into the sand like embers into ash, the camera drifting down"),
        S("micro", "extreme macro — a few grains of sand holding tiny points of ember light, their glow fading one by one into dark"),
      ], { sparse: true }),
      P("integration", 0.868, 1, 0.3, "integration", "2:29-2:52 Unresolved Stillness (murmured F#6 ostinato, never returns home)", [
        S("cosmic", "cosmic — from immense height the dark shallows at dusk become a quiet field of faint drifting lights like a calm star field, luminous mist settling over them, suspended and unresolved"),
        S("sparse", "DARK BACKGROUND — a single slow ring of light widening on dark translucent water in the lower right of vast darkness, a faint caustic net glowing beneath it, the bookend of the first light"),
        S("abstract", "abstract — a gentle repeating sway of two faint threads of violet light across darkness, never quite meeting"),
      ]),
    ],
    morphs: [
      "the camera descends into the shallows until the caustic nets spread and interlace across the whole floor",
      "the ring of light widens and the camera rises to look down on the whole lagoon rocking with light",
      "the rocking web brightens and the camera pulls far back as the lagoon blazes into one turning web of gold",
      "the gold drains away and the camera settles close on one small ember of caustic light in the dark",
      "the embers fade and the camera rises until the dusk shallows are a quiet field of drifting lights",
    ],
  },
  {
    id: "e9beec7a-6aa4-41bb-83f0-c827603ed51d",
    name: "Northern Plane 3",
    world: "C major over an unmoving C pedal, high register, tiny chord vocabulary, a bare uncertain fifth that clarifies into ringing major and thins to a whisper — the long northern twilight over a flat land of countless mirror pools: one pool holding a strip of silver, warmth seeping and retreating, a pendulum of gold swinging across a constellation of mirrors at the 1:03 crest, an even crystalline plateau, two tolling bell-fifths in blue dusk, and a faint green-violet afterglow at peace",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:09 Open Fifth Horizon (bare C5 / Csus2, an E-flat of doubt)", [
        S("sparse", "DARK BACKGROUND — a single small mirror pool holding a thin strip of faint silver light in the lower left of vast darkness, luminous and still, seen from high above, the rest of the frame open black"),
        S("micro", "extreme macro — the glassy rim of that pool at closest range, a fine film of new ice catching one thread of silver-blue light, tiny suspended particles of cold mist above it"),
        S("abstract", "abstract — two pale horizontal bands of silver light held one above the other across darkness like an open fifth, a faint violet flicker passing between them"),
      ]),
      P("expansion", 0.05, 0.327, 0.37, "expansion", "0:09-0:56 Open Fifth Horizon → First Warmth (light seeps and retreats) → Pendulum Ascent begins", [
        S("aerial", "looking straight down on a dark flat land scattered with dozens of small mirror pools, each catching a point of pale luminous light, thin warmth seeping across them and retreating, the camera drifting slowly sideways"),
        S("micro", "macro — the skin of one still mirror pool reflecting a slow sweep of pale gold light, fine crystals of frost along its edge glittering, translucent"),
        S("interior", "inside a low veil of luminous haze lying over the dark ground, pale silver-blue light glowing through it, a soft gold warmth swelling and fading at its far side, the camera gliding through"),
      ]),
      P("transcendence", 0.327, 0.447, 1, "transcendence", "0:56-1:17 Pendulum Ascent (crest 1:03, F-over-G lands on a glowing C6 at 1:12)", [
        S("cosmic", "cosmic — the land of mirrors from immense height, hundreds of pools all holding gold light at once like a vast constellation laid across the dark, a pendulum of brightness swinging wider across them, the brightest cluster in the upper right"),
        S("micro", "extreme macro — the trembling surface of a mirror pool at closest range, rings of molten gold light spreading across it, a haze of fine glittering particles drifting above"),
        S("abstract", "abstract — widening arcs of gold and ice-white light swinging back and forth across darkness like a slow pendulum, each pass brighter, leaving luminous trails"),
      ]),
      P("illumination", 0.447, 0.782, 0.59, "illumination", "1:17-2:15 Broad Plateau (plain major triads simply ring) → Bright Summit (G7sus4 1:54) → Low Bell Fifths begin (2:07)", [
        S("aerial", "from high above, looking straight down on countless small pools of liquid light scattered across a dark plain like a constellation, each glowing pale gold and green, the camera hovering almost still"),
        S("intimate", "close — fine feathers of frost spreading across a black mirror in branching fractal patterns, every filament throwing back brilliant white light in prismatic threads"),
        S("abstract", "abstract — an immense fractal lattice of crystalline light spreading across darkness, each node glinting gold and silver, perfectly still"),
      ]),
      P("return", 0.782, 0.902, 0.73, "integration", "2:15-2:36 Low Bell Fifths (two tolling six-second C fifths, the bare ground) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small mirror pool holding a dim pewter glow alone in the upper right of immense darkness, nearly the entire frame empty, utterly still"),
        S("abstract", "abstract — slow concentric rings of deep blue light tolling outward across darkness two at a time, each fading before the next, the camera sinking low"),
        S("micro", "extreme macro — long blue shadows lying across fine grains of wind-packed snow, a last glint of silver at one edge, translucent"),
      ], { sparse: true }),
      P("integration", 0.902, 1, 0.55, "integration", "2:36-2:53 Pentatonic Afterglow (climax colours in miniature, rests on the first open fifth, now peace)", [
        S("cosmic", "cosmic — a faint green-violet shimmer of aurora light rippling high over the dark still land, a quiet star field above it, the mirrors below catching it softly, the camera rising"),
        S("sparse", "DARK BACKGROUND — a single small mirror pool holding a thread of silver light in the lower left of vast darkness, the bookend of the first stillness, now at peace"),
        S("micro", "extreme macro — one bead of pale violet light at the edge of the frozen mirror, glowing faintly, weightless"),
      ]),
    ],
    morphs: [
      "the two bands of light pull apart and the camera rises to look down on dozens of small mirror pools",
      "the warmth swells and the camera pulls far back as every pool catches gold at once like a constellation",
      "the pendulum slows and the camera settles into a hover over a vast level expanse of luminous mirrors",
      "the lattice of light dims and the camera sinks close to one small pool holding a pewter glow",
      "the tolling rings fade and the camera rises as a faint green-violet shimmer ripples over the still land",
    ],
  },
  {
    id: "3f42929f-8b8e-4206-a3c8-057bf479d4e7",
    name: "Torraine 5",
    world: "C major reverie at 67 BPM that searches in A minor, swells to a held Dm7 at 0:57, dwells long on a C pedal under passing minor shadows and floats off unresolved on F; lyric 'tell me your name so I can call it true' — looking straight up into the night with no ground: stars kindling one by one as they are named and joined by threads of gold, a veil cooling one name to lilac, a single named star breathing in the still meditation, the whole heavens a woven constellation, and one thread left between two stars",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:12 Searching in A Minor (vi-ii-V reaching, unsettled)", [
        S("sparse", "DARK BACKGROUND — looking straight up into deep blue darkness, one small star brightening in the lower right as a fine thread of gold light reaches it from another unseen star, the rest of the frame open black"),
        S("micro", "extreme macro — the point where a fine thread of gold light touches a single star, a tiny burst of luminous particles at the join, soft blue darkness around"),
        S("abstract", "abstract — a few faint points of light drifting into a loose searching pattern across deep blue darkness, threads reaching between them and falling short"),
      ]),
      P("expansion", 0.05, 0.55, 0.59, "expansion", "0:12-2:09 Searching → Full-Hearted Swell (peak 0:57 on Dm7) → Shadowed Interlude (1:18-1:43, borrowed Fm/Ab) → Gathering on C", [
        S("cosmic", "cosmic — looking straight up as star after star kindles across the deep blue heavens, fine threads of gold light drawing between them as each is named, a warm broad glow swelling through the field, the brightest cluster in the upper left"),
        S("intimate", "close — a thin translucent veil of grey-violet vapor sliding diagonally across the frame like a slow river, a scatter of tiny gold stars glimmering through it, their light cooling to lilac, the threads beside them dimming"),
        S("abstract", "abstract — a slowly growing lattice of gold light-threads linking points of light, new lines drawn one at a time across the darkness, steady and patient, rising toward the upper right"),
      ]),
      P("transcendence", 0.55, 0.72, 1, "integration", "2:09-2:49 Gathering on C → Still Meditation (2:16-2:40, deep low stillness on home) → Sunlit Dwelling — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single named star glowing softly alone in the upper left of immense deep blue darkness, one short thread of light trailing from it, nearly the entire frame empty"),
        S("micro", "extreme macro — fine filaments of amber light curling around each other like glowing silk at closest range, tiny particles breathing along them, drifting off toward the right edge, utterly still"),
        S("interior", "within a calm haze of amber light overhead, a few quiet stars barely trembling, their threads of light resting slack between them, the camera drifting slowly upward"),
      ], { sparse: true }),
      P("illumination", 0.72, 0.837, 0.97, "transcendence", "2:49-3:17 Sunlit Dwelling (C major fully inhabited) → Last Rising Wave (3:04, rippling)", [
        S("cosmic", "cosmic — every name called true: looking straight up into a vast luminous net of golden threads spanning the whole frame edge to edge, countless small stars at its knots, golden threads joining all of them into one kaleidoscopic constellation, warm honey light pouring through it, its densest knot in the right third"),
        S("micro", "macro — dust of golden light drifting slowly along a single thread between two stars, each mote glowing like a tiny ember"),
        S("abstract", "abstract — a slow rippling wave of gold light travelling across the web of threads, each strand catching the crest and thinning after it passes, pale blue darkness between"),
      ]),
      P("return", 0.837, 0.92, 0.56, "return", "3:17-3:36 Last Rising Wave recedes (C and Cm flicker 3:20, Ab and Eb steer away from home)", [
        S("intimate", "close — a fine web of luminous gold threads loosening across deep space, its knots of light flickering between gold and cool violet and drifting apart into scattered particles"),
        S("cosmic", "cosmic — the threads fading one by one across the deep blue heavens, the stars remaining as scattered points drifting slowly apart, the camera rising toward them"),
        S("micro", "extreme macro — a fading thread of gold light breaking into a fine trail of glittering particles"),
      ]),
      P("integration", 0.92, 1, 0.55, "integration", "3:36-3:55 Floating on F (Bbmaj9, Dm7 — quiet, high, not home)", [
        S("abstract", "abstract — a pale high luminescence thinning to near-white at the top of the frame, a few faint points of light hanging weightless within it, somewhere peaceful beyond home"),
        S("sparse", "DARK BACKGROUND — looking straight up into deep blue darkness, a few named stars and one thin thread of light between two of them in the lower right, the bookend of the first naming"),
        S("micro", "extreme macro — the last glint at the end of a thread of light, a single star at rest, softly glowing"),
      ]),
    ],
    morphs: [
      "the searching threads find their stars and the camera tilts further up as star after star kindles across the heavens",
      "the lattice stops growing and the camera drifts close to one named star glowing alone in the deep blue",
      "the slack threads tighten and the camera pulls back as the whole heavens weave into one kaleidoscopic constellation",
      "the rippling wave passes and the camera settles close on two stars flickering between gold and violet",
      "the scattered points drift apart and the camera keeps rising into a pale high luminescence",
    ],
  },
];
