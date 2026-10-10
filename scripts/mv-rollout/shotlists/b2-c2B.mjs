// Surrounded by Light, batch 2 part c2B — Journey Archetype shot lists
// (2026-10-10): Message, Grace, Complete, Held, Sway, Mystic.
// Modelled on expansion-sample.mjs, welcome-home-title.mjs (hint, never
// literal) and rise-above-A/B (same format, minus shaders/opacity).
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones;
//    `music` names the deep-analysis sections each phase holds.
//  - Album thread: "surrounded by light" — every journey carries one
//    spirit-energy beat as a formless light-presence (a current / veil /
//    halo of glow that attends, surrounds, passes) — never a figure.
//  - The staged data carries no lyric text for these six, so the themes
//    are woven from the deep analysis (harmony, sections, imagery cues,
//    emotional narrative) plus each journey's existing motif identity.
//  - Message and Complete both own rings: Message = signals and replies
//    (pulses, interference, a standing crest, an open fifth left
//    unanswered); Complete = one circle closing (a gap, orbits, growth
//    rings, the gap finally closing at the root-position D).

export const SET = { key: "b2-c2B", presenting: "Surrounded by Light" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "dd2ed3c9-67e9-4450-a9ca-c1426087fa9a",
    name: "Message",
    world: "C-centred modal loop (Gm7, Fmaj7/A, borrowed Abmaj7/Fm9) restated patiently in a pedal-blurred low register, pressing harder, one dominant crest at 1:17, told plainly in major, then lifting upward to a thirdless open-fifth signoff — a message as light: one teal pulse sent into the dark, calls and replies crossing as interference rings, a single standing crest of light hanging for a breath, long strips of pale gold carrying it plainly, the glow lifting away as mist, and two unjoined lights left open among silver stars",
    phases: [
      P("threshold", 0, 0.2, 0.88, "threshold", "0:00-0:35 The Question Posed (Gm7 rising to F/A, sinking through Fm9/Ab and Abmaj7 to Cm/G, walking down into an open C5 — a question in dusky colours)", [
        S("sparse", "DARK BACKGROUND — a single small pulse of teal light travelling through black depth in the lower left of the frame, a faint wake of luminous plankton igniting behind it like a heartbeat made visible, nearly the entire frame empty"),
        S("micro", "extreme macro — one plankton mote at the pulse's edge at closest range, flaring teal and pale gold as the signal arrives and passes on, translucent and weightless, slate-blue darkness beyond"),
        S("aerial", "looking straight down on dark slow swells of indigo mist filling the frame edge to edge, one thin line of teal light unspooling across them from the lower right toward the open dark, the first message sent, the camera drifting lower"),
      ]),
      P("expansion", 0.2, 0.405, 1, "expansion", "0:35-1:11 Pressing the Point (the loop louder and fuller, the dominant darkened to G7♭6, a shimmering sus2/sus4 aside at 0:56)", [
        S("abstract", "abstract — interference of expanding rings of teal and muted amber light crossing in moiré blooms across a dark luminous surface, calls entering from one edge, replies rising from another, the brightest knot in the upper right"),
        S("interior", "inside a deep current of indigo light folding over itself without breaking, translucent walls of soft teal glow passing through the viewpoint one after another, the camera carried forward on the steady swell"),
        S("micro", "macro — the point where two rings of light cross at closest range, their edges braiding into one brighter thread of pale gold for a breath, fine particles of teal shaken loose into the dark"),
      ]),
      P("transcendence", 0.405, 0.553, 0.92, "transcendence", "1:11-1:37 Dominant Crest (the dominant stretched into the piece's single crest at 1:17, released onto a deep C5 at 1:21)", [
        S("cosmic", "cosmic — one immense standing crest of teal and pale gold light rising across infinite dark space and hanging for a breath before it folds, a warm break of amber opening behind it, the camera rising through its glowing spray of particles"),
        S("micro", "extreme macro — the crest's lip at closest range, a curl of translucent teal light suspended weightless, beads of gold hanging in the instant before release, dusky rose glow beneath"),
        S("aerial", "from high above, the release: a vast ring of muted amber light spreading outward across a dark rolling surface after the crest has folded, the deep low note settling into slow concentric luminous waves, the camera pulling back"),
      ]),
      P("illumination", 0.553, 0.713, 0.83, "illumination", "1:37-2:05 Restated Plainly (Abmaj7 steps straight to G major, the minor colours compressed into one altered chord at 1:47 — major takes over, the tension eases)", [
        S("aerial", "looking straight down on a broad slow current of dark indigo light, long strips of pale gold lying across its surface like a message told plainly, luminous and calm, the camera gliding along them"),
        S("intimate", "a single strip of pale gold light at close range resting on dark translucent depth, its edge rippling softly in time with a slow swell, dusky rose glow beneath it, generous dark above"),
        S("abstract", "abstract — long gold and teal light-threads laid in parallel across darkness, one thread bending to meet another and running on together, quiet agreement, slate blue between them, weighted to the lower left"),
      ]),
      P("return", 0.713, 0.856, 0.67, "integration", "2:05-2:30 Lifting Away (a clean dominant, the longest C of the piece at 2:17 hovering in Csus2/Csus4 as the hands drift upward) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small plume of pale gold mist lifting upward in the upper right of vast slate-blue darkness, rising slowly off a faint glowing surface below, nearly the entire frame empty"),
        S("interior", "within the lifting mist, soft veils of pale gold and silver light thinning around the viewpoint as it tilts slowly upward, a quiet presence of warmth surrounding it, formless and weightless"),
        S("micro", "macro — one bead of silver light hovering at closest range above a dark luminous surface, neither falling nor rising, held like a long suspended chord, a faint halo of teal around it"),
      ], { sparse: true }),
      P("integration", 0.856, 1, 0.37, "integration", "2:30-2:55 Open-Fifth Signoff (a whisper in the treble, one glance at Cm/G, a soft G7, the message left open on a thirdless C5)", [
        S("cosmic", "cosmic — from far above the thinning silver twilight, faint teal rings still widening across infinite dark space among the first quiet stars, the signal outliving the voice, the camera rising slowly"),
        S("abstract", "abstract — two small points of silver light hanging apart in deep darkness, an open interval of faint teal arc between them that never closes, the open fifth left unanswered, off-centre in the lower left"),
        S("sparse", "DARK BACKGROUND — a single small pulse of teal light glowing once in the lower left of vast darkness, a faint wake of luminous motes behind it, the first message still travelling, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends through the dark until the line of teal light breaks into sparse rings crossing in slow blooms",
      "the braided thread of light swells and the camera rises with it as one standing crest of teal and gold lifts into open dark",
      "the crest folds into widening amber rings and the camera glides low over long strips of pale gold light in the dark",
      "the threads of light thin and the camera tilts upward with one small plume of gold mist rising alone in the dark",
      "the bead of silver light lifts and the camera rises with it until faint teal rings widen among sparse stars",
    ],
  },
  {
    id: "4ca8d765-71a2-401a-85eb-eb02c2780bc3",
    name: "Grace",
    world: "D major hymn on one six-chord loop (G – D – Dmaj7 – Cmaj7#11 – Bm – A) returning six times, swelling toward the ♭VII glow and sighing back, the C blooming into the climax at 1:08, a violet A7♭9 ache at 1:42, then patient acceptance and a quiet cadence onto D — grace as light that falls gently: one ember descending, the heavens filled with slow gold trails at the bloom, a violet veil crossing the settled light, one ring of amber spreading on black glass, a warm light-presence passing low, and one ember kept at the end",
    phases: [
      P("threshold", 0, 0.217, 1, "threshold", "0:00-0:39 First Blessing (the G chord unfolding maj7 → 9 → 13, leaning toward the C-major glow at 0:15, turning back to G at 0:28 — the prayer begins again)", [
        S("sparse", "DARK BACKGROUND — a single small ember of soft gold light descending slowly in the upper right of vast violet-black darkness, a faint trail of honey motes drifting behind it, falling gentler than a leaf, nearly the entire frame empty"),
        S("micro", "extreme macro — the ember at closest range, a soft seed of gold light with no hard edge unfolding layer by layer like a chord opening, tiny sparks of ivory orbiting it, translucent and weightless"),
        S("aerial", "looking straight down from high above on a dark undulating expanse of luminous haze filling the frame edge to edge, a few gold embers settling into it and blooming as soft rings of warm light, the camera descending with them"),
      ]),
      P("expansion", 0.217, 0.383, 0.98, "transcendence", "0:39-1:09 Reaching Upward (the loop gathers urgency, textures fuller, until the C chord at 1:05-1:08 blooms into the climax)", [
        S("cosmic", "cosmic — the entire heavens filled with descending trails of gold and ivory light, thousands of embers falling through infinite violet space in slow parallel arcs, a broad band of radiance blooming across them at the crest, the camera rising up through the fall"),
        S("micro", "macro — one falling ember at the instant of the bloom, flaring from gold to brilliant ivory, a halo of rose-pink particles bursting outward from it in slow motion against deep dark"),
        S("abstract", "abstract — a wide golden band of light sweeping diagonally across darkness from the lower left, layered veils of honey and pale sky-blue unfolding outward from it in a slow swell, generosity arriving everywhere"),
      ]),
      P("transcendence", 0.383, 0.6, 0.91, "illumination", "1:09-1:48 Shadowed Turn (the light lingers on C's #11 shimmer, then darkens — the A7♭9 minor-ninth ache at 1:42 slides to G instead of home)", [
        S("interior", "inside a slow drift of embers suspended in dusky lavender haze, the gold shimmer still lingering around the viewpoint as a cool violet veil begins to cross the light from one side"),
        S("aerial", "from high above, a soft veil of violet-grey shadow sliding across a vast expanse of settled gold light points on dark ground, the far edge still glowing honey, surreal and slow"),
        S("micro", "extreme macro — one ember dimmed to dusky rose at closest range, a faint lavender ache flickering at its core, fine threads of gold still clinging to its edge in the dark"),
      ]),
      P("illumination", 0.6, 0.716, 0.77, "integration", "1:48-2:09 Quiet Return (the cycle returns more patiently, Gsus2 and Dsus4 colours, long holds on G and D — the reaching has become acceptance) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small ring of warm amber light resting on black glassy stillness in the lower left, spreading slowly outward and fading, nearly the entire frame empty"),
        S("abstract", "abstract — two soft drifting veils of colored mist side by side in deep indigo, one honey, one pale sky-blue, their edges dissolving into particles, held long and weightless"),
        S("micro", "macro — a thin ridge of amber light moving across a dark rippled surface at closest range, a few gold motes riding over it and settling behind, translucent"),
      ], { sparse: true }),
      P("return", 0.716, 0.827, 0.77, "return", "2:09-2:29 Quiet Return (smaller swells, the cycle no longer needing to resolve)", [
        S("intimate", "a single soft veil of warm light drifting low through deep darkness, gathering into a gentle presence of glow without form, pausing as if listening, petals of gold motes settling around its passage, the camera following it"),
        S("aerial", "looking straight down on dark ground veined with faint settled gold, the veil's trail of luminous warmth threading slowly across it, rose glow where it lingered"),
        S("cosmic", "cosmic — the settled embers from immense height forming a slow constellation of gold across infinite indigo, one cluster pulsing gently, the light at rest among the stars"),
      ]),
      P("integration", 0.827, 1, 0.37, "integration", "2:29-3:00 Benediction (everything a whisper; C shimmers once more, the A7♭9 moves through Asus4 to D at 2:49, the final D breathing between open fifth and triad)", [
        S("abstract", "abstract — one last shimmer of honey and lavender light blooming softly across darkness in a slow wide arc and fading toward slate blue, the ache resolving into calm, the camera pulling back"),
        S("cosmic", "cosmic — from far above the night, faint gold veins of fallen light still readable across a dark world among sharp quiet stars, the fall finished, the keeping begun"),
        S("sparse", "DARK BACKGROUND — a single small ember of gold light resting in the lower right of vast darkness, pulsing softly, a few tiny sparks orbiting it slowly, the bookend of the first falling light, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends with sparse gold embers until the falling light fills the dark in slow parallel trails",
      "the golden band softens and the camera glides into a drift of embers as a violet veil slides across the light",
      "the dimmed ember sinks and the camera settles close on one ring of amber light spreading alone in the dark",
      "the ring's rim fades and the camera follows a soft veil of warm light drifting low through open darkness",
      "the constellation of embers brightens once and the camera pulls back as a last shimmer of honey light blooms and fades",
    ],
  },
  {
    id: "01a395f7-04d6-4ff9-aecf-f8dacdcae0b1",
    name: "Complete",
    world: "D major free-time meditation turning one three-chord cycle (Bm7 → D/A → Gmaj9#11) over and over, the tonic kept unstable over its fifth, full-voiced at 0:23, a high glint at 1:15, settled only at 1:53 when D finally stands in root position — completion as one circle closing: a thin ring of amber almost closed, rings widening at full voice, slow orbits and growth rings of light in the turning cycle, a halo-presence at the glint, and the last small gap closing in the dark",
    phases: [
      P("threshold", 0, 0.185, 0.75, "threshold", "0:00-0:23 Gathering Breath (a suspended gesture settling on B minor; D/A at 0:11 and the glowing Gmaj9#11 at 0:17 — home seen but not yet reached)", [
        S("sparse", "DARK BACKGROUND — a single thin ring of soft amber light floating in the lower left of vast darkness, almost closed, one small gap left open in its arc, nearly the entire frame empty"),
        S("micro", "extreme macro — the gap in the ring at closest range, two glowing tips of rose-gold light facing each other across a sliver of dark, fine lavender motes drifting between them, translucent and weightless"),
        S("aerial", "looking straight down through thinning violet haze on a dark still mirror filling the frame edge to edge, faint shapes of luminous light emerging one by one as the glow thickens, the camera descending slowly"),
      ]),
      P("expansion", 0.185, 0.33, 1, "transcendence", "0:23-0:41 Full Voice (the cycle at full voice, the longing stated with warmth; the G–F# rocking at 0:35 — a heart leaning toward something)", [
        S("cosmic", "cosmic — rings of warm amber and pale gold light widening outward across infinite dark space from one unseen touch, overlapping circles glowing to the edges of the frame, the brightest ring right of centre, the camera rising through them"),
        S("micro", "macro — two rings of light meeting at closest range, their rose-gold rims rocking gently against each other, leaning together and apart, sparks of honey light where they touch"),
        S("abstract", "abstract — concentric orbits of lavender and amber light circling slowly through darkness at many depths, each orbit tilted differently, a warm glow spreading wide from the lower right"),
      ]),
      P("transcendence", 0.33, 0.451, 0.83, "integration", "0:41-0:56 Turning Cycle (two patient cycles that reflect rather than push, added 6ths and 9ths as small new tendernesses) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ring of pale lavender light turning slowly on its edge in the upper right of vast darkness, a faint second ring circling behind it like a remembered cycle, nearly the entire frame empty"),
        S("micro", "extreme macro — growth rings of light at closest range, thin gold threads curving through a dark translucent grain, one ring glowing brighter than the rest, the cycle at the scale of years"),
        S("interior", "within the turning cycle, slow arcs of muted sage and amber light curving around the viewpoint as it orbits gently, each pass leaving a fainter echo behind, weightless"),
      ], { sparse: true }),
      P("illumination", 0.451, 0.572, 0.83, "expansion", "0:56-1:11 Turning Cycle (the IV re-coloured again, a soft exhale around 1:05)", [
        S("aerial", "from high above, slow ripples of warm honey light circling outward across a dark luminous surface, each new ring overlapping the last, a soft exhale of mist drifting across them, the camera gliding in a gentle orbit"),
        S("abstract", "abstract — a slow spiral of rose-gold and pale lavender light coiling toward the centre of a dark expanse and opening outward again, the cycle turned over and over, weighted to the left"),
        S("micro", "macro — one bead of honey light riding the rim of a ring at closest range, carried around and around, a faint trail of amber glowing behind it against deep dark"),
      ]),
      P("return", 0.572, 0.717, 0.83, "illumination", "1:11-1:29 High Glint (open fifths and a high glint lift the light — a sense that the answer is near)", [
        S("cosmic", "cosmic — a shaft of high silver-gold light glinting across infinite dark space as a veil of violet haze drifts aside, scattered rings of light catching it like distant orbits, the camera rising toward the glint"),
        S("intimate", "a single soft halo of pale light hovering in dark air at close range, breathing slowly, a gentle presence gathering in its glow, its faint reflection completing a second circle below"),
        S("aerial", "looking straight down on a dark mirror where reflected star-arcs and rings of amber light share one slow geometry, impossibly still, the outermost arc leaving the frame"),
      ]),
      P("integration", 0.717, 1, 0.37, "integration", "1:29-2:04 Arrival at D (the IV lovingly re-coloured, the bass walking G–F#–D, D in root position at 1:53 for the first time, Dadd9 sighing into an open D5)", [
        S("abstract", "abstract — a ring of soft amber light closing its last small gap in slow motion, the two glowing tips meeting in a quiet flare of rose-gold, deep darkness all around, off-centre in the lower left"),
        S("cosmic", "cosmic — the completed circle seen from immense height, one thin unbroken ring of light resting among faint stars in infinite violet dark, the other faint arcs around it settling still, the camera pulling back"),
        S("sparse", "DARK BACKGROUND — a single thin unbroken ring of soft amber light resting in the lower left of vast darkness, calm and whole, the bookend of the almost-closed first ring, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends toward the glowing gap until rings of amber light begin widening outward through the dark",
      "the orbits of light slow and the camera pulls back until one small lavender ring turns alone in the dark",
      "the arcs of light settle and the camera rises to orbit above slow rings of honey light circling outward",
      "the bead of light lifts off the ring and the camera rises with it toward a high silver-gold glint in open dark",
      "the reflected arcs fade and the camera glides close as one ring of amber light closes its last small gap",
    ],
  },
  {
    id: "549719aa-4a15-4981-8a9a-34ee66fca156",
    name: "Held",
    world: "D major hymn-like strophe over a nearly constant low D pedal (I–IV–I–V, Gmaj9/D, a Lydian C♯ on the IV), said again louder, blooming into Gmaj9(#11) at 1:30, then letting go into a cool blue dusk — being held by light: one warm ember breathing honey haze into the dark, a hollow of amber drawing the eye in, a copper-and-honey nebula, a fold of land lit from within and an enfolding presence of glow at the bloom, one suspended bead above a fading glow, and the ember still held at the end",
    phases: [
      P("threshold", 0, 0.268, 0.64, "threshold", "0:00-0:35 Ground of D (a long D chord rocking over a D2 pedal, the G major 9 never lifting the bass; the A chord's C♯ lingering over the arriving D at 0:31)", [
        S("sparse", "DARK BACKGROUND — a single small ember of warm amber light glowing low in the lower right of vast darkness, a faint breath of honey haze curling up from it and cooling to blue as it rises, nearly the entire frame empty"),
        S("micro", "extreme macro — the ember's surface at closest range, slow currents of copper and gold light moving beneath a translucent skin of glow, steady as a held low note, soft dark beyond"),
        S("aerial", "looking straight down on a dark folded expanse at dusk filling the frame edge to edge, one warm hollow of amber light glowing in its lower corner, slow luminous mist drifting out of it, the camera descending toward the warmth"),
      ]),
      P("expansion", 0.268, 0.399, 0.97, "expansion", "0:35-0:52 Fuller Second Pass (the same home said again, louder and higher, reaching E5 — an affirmation rather than a development)", [
        S("interior", "inside a warm hollow of honey light, layered haze deepening from blue-grey to amber around the viewpoint, the glow strengthening ahead, the camera drawn gently in"),
        S("micro", "macro — one bead of light falling slowly through amber air at closest range, glowing from within, its warmth sliding over soft dark curves as it passes, translucent and weightless"),
        S("abstract", "abstract — broad slow waves of amber and cream light rocking through darkness in a steady sway, each wave a little higher than the last, a shaft of brighter gold widening across them diagonally"),
      ]),
      P("transcendence", 0.399, 0.529, 0.97, "illumination", "0:52-1:09 Fuller Second Pass (the second half of the affirmation; at 1:09 the weight shifts onto G)", [
        S("cosmic", "cosmic — a vast warm nebula of copper and honey light opening slowly in infinite darkness, a wider shaft of gold pouring through its folds, the glow enveloping and kind, the camera rising into it"),
        S("micro", "extreme macro — warm light caught in the facets of a glowing geode at closest range, each tiny facet holding one point of gold, the amber deepening toward rose"),
        S("interior", "within the amber glow, slow convection of brighter threads rising through darker gold like heat made visible, held without touch, weightless and patient"),
      ]),
      P("illumination", 0.529, 0.805, 1, "transcendence", "1:09-1:45 Subdominant Bloom (the IV gains its Lydian C♯ at 1:14; the full Gmaj9(#11) bloom at 1:30 with the highest notes — gratitude opening wide)", [
        S("aerial", "from high above, golden light flooding a vast dark fold of land as low mist parts, the whole expanse lit from within like an ember, luminous and impossibly still, the camera rising higher as the bloom spreads"),
        S("cosmic", "cosmic — the bloom at its height, a radiant spiral of honey gold and soft mint-green light unfolding across infinite dark space, the brightest notes scattered as sparks at its upper rim, the camera soaring along its arm"),
        S("abstract", "abstract — an enfolding current of paler glow circling slowly inside layered amber light, gathering into a gentle formless presence that surrounds without touching, then loosening into warmth again"),
      ]),
      P("return", 0.805, 0.905, 0.37, "integration", "1:45-1:58 Letting Go (folding back, opening on G once more, one last A–D cadence with the suspension laid bare — D/E/C♯ at 1:58) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small bead of pale mint light hanging just above one faint amber glow in the upper left of vast darkness, suspended, not yet settled, nearly the entire frame empty"),
        S("micro", "extreme macro — the last ember-light at closest range dimming from copper to rose, a thin veil of cool blue dusk creeping over its edge, tiny sparks lifting off and fading"),
        S("aerial", "looking straight down on dark folded land cooling into blue dusk, a few warm points of luminous amber still glowing in the hollows, the camera slowly pulling back"),
      ], { sparse: true }),
      P("integration", 0.905, 1, 0.37, "integration", "1:58-2:10 Letting Go (D tinged first with a C♮, then an open add9, fading to its quietest at 2:05 — still held, still home)", [
        S("sparse", "DARK BACKGROUND — a single small ember of warm amber light resting low in the lower right of vast blue-black darkness, steady and quiet, held in a faint halo of its own glow, the bookend of the first warmth, nearly the entire frame empty"),
        S("cosmic", "cosmic — from immense height one warm point of light held in a dark folded world under sharp quiet stars, the held light still holding, the camera rising away"),
        S("micro", "macro — a slow amber heartbeat glowing beneath a translucent surface of warm dark at closest range, all edges lost, the pulse slowing"),
      ]),
    ],
    morphs: [
      "the camera descends into the warm hollow as sparse haze deepens from blue-grey to amber around it",
      "the waves of amber light widen and the camera rises with them into an opening nebula of copper and honey glow",
      "the threads of rising gold part and the camera lifts high above as golden light blooms through the open dark",
      "the warm current loosens and the camera settles close on one small bead of mint light hanging alone above a faint glow",
      "the last sparks fade and the camera drifts to one small ember of amber light resting quietly in the dark",
    ],
  },
  {
    id: "a5de2004-f606-4277-a4cb-032c35e56c43",
    name: "Sway",
    world: "F minor rocking ostinato (Fm – Bbm9 – Eb7 – Ab → Eb/G → Fm) at 92 BPM, three times reaching toward the relative major and stepping back down, cresting at 0:57 on Ab5 and hollow Bb fifths, then laying down one long fading F minor — a pendulum of light: one emerald ribbon nudged into its first lean, a point of amber swinging in widening arcs, a slow forest of luminous ribbons rocking as one with a pale light-presence weaving through, bioluminescent bands folding like a galaxy, an emerald sheet flashing gold at the crest, and the ribbon settling upright with its ember dimming",
    phases: [
      P("threshold", 0, 0.119, 0.74, "threshold", "0:00-0:11 Gathering Sway (a single bare F fifth opening into a long-held F minor — a breath taken before moving)", [
        S("sparse", "DARK BACKGROUND — a single slender ribbon of emerald light hanging in the lower left of vast black-green darkness, beginning one slow lean like a pendulum nudged once, teal glow only along its edge, nearly the entire frame empty"),
        S("micro", "extreme macro — the anchored root of the ribbon of light at closest range, fine filaments of teal glow gripping dark stone, the first slow strain of the sway readable in them"),
        S("aerial", "looking straight down through dark green depth on a slow forest of luminous ribbons beginning to lean together, each tip catching faint violet light, the camera sinking toward them"),
      ]),
      P("expansion", 0.119, 0.238, 0.74, "expansion", "0:11-0:22 Gathering Sway (the cycle set swinging: Bbm9 rocks, Eb13sus and Eb7 lean forward, the right hand leaping as if testing the space)", [
        S("abstract", "abstract — a point of amber light swinging on a long invisible arc through black-green darkness, its path traced as a fading pendulum curve of luminous gold, each swing a little wider, off-centre to the right"),
        S("micro", "macro — a slender blade of emerald light arcing through the frame at closest range, tiny beads of light sliding along its surface with each sway and returning, translucent and weightless"),
        S("interior", "within the swaying ribbons, blades of green light crossing the viewpoint from both sides in alternation, the dark breathing open and closed in a steady rocking rhythm"),
      ]),
      P("transcendence", 0.238, 0.422, 0.92, "expansion", "0:22-0:39 Rocking Cycle (the sway fully established: Fm → Bbm → Eb7 climbing toward Ab, stepping down Ab–G–F back into minor)", [
        S("interior", "inside a slow underwater forest of luminous emerald ribbons all swaying as one, a warm shaft of amber light slanting down and rocking across them and withdrawing, the camera riding the sway"),
        S("micro", "extreme macro — one bead of light on a swaying blade at closest range, sliding toward a warm glint and gently sliding back each time, the whole rhythm in a millimetre of travel"),
        S("aerial", "from high above, a pale ribbon of luminous light weaving between dark swaying forms with gentle intention, a formless presence of soft glow brushing each as it passes, violet traces left in its wake"),
      ]),
      P("illumination", 0.422, 0.595, 0.92, "illumination", "0:39-0:55 Rocking Cycle (three reaches toward the warmth of Ab major, three gentle returns to minor)", [
        S("cosmic", "cosmic — vast slow bands of bioluminescent emerald and violet light folding across an infinite dark swell like a galaxy rocking, green and violet trading places along each fold, the camera gliding along them"),
        S("micro", "macro — the edge of a fold of light at closest range, emerald glow tipping toward warm gold for a breath and sinking back to violet, fine particles suspended in the turn"),
        S("abstract", "abstract — three rising arcs of amber light reaching upward through dark green, each one bending back down before it touches the bright band above, the reach and the letting go"),
      ]),
      P("return", 0.595, 0.768, 1, "transcendence", "0:55-1:11 Crest of the Swell (the tonic at its loudest at 0:57, the melody touching Ab5, hollow Bb fifths; the last reach Eb7 → Ab at 1:01-1:05, a held Bb5 at 1:09)", [
        S("cosmic", "cosmic — the crest: an immense sheet of emerald and violet light lifting across infinite dark space all at once, its upper edge flashing gold for one breath, a spray of luminous particles thrown upward, the camera rising through it"),
        S("micro", "extreme macro — one tip of light at the very top of the swell at closest range, flaring brief gold, suspended weightless before the fall, violet dark beyond"),
        S("abstract", "abstract — two hollow parallel arcs of pale lavender light hanging open in darkness after the crest, an empty interval between them, the question left in the air, weighted to the left"),
      ]),
      P("integration", 0.768, 1, 0.37, "integration", "1:11-1:32 Settling Into Stillness (the familiar descent once more, one F minor chord held eleven seconds and fading on Fm/Ab — acceptance, not resolution) — the sparse valley (the piece's only real valley is its close)", [
        S("sparse", "DARK BACKGROUND — a single slender ribbon of emerald light settling upright in the lower left of vast black-green darkness, the last small arc of its sway remembered in its curve, one faint ember of amber at its tip dimming, nearly the entire frame empty"),
        S("cosmic", "cosmic — from immense height the dark swell at total rest, the bloom dimmed to faint emerald veins across infinite black, the pendulum at the bottom of its arc, the camera pulling slowly away"),
        S("micro", "macro — the amber ember at the ribbon's tip at closest range, its glow slowing to a faint pulse and settling into dusky violet, a few motes drifting down in the stillness"),
      ], { sparse: true }),
    ],
    morphs: [
      "the camera follows the leaning ribbon of light as a point of amber begins to swing in slow arcs through the dark",
      "the blade of light sways past and the camera glides into sparse emerald ribbons rocking as one in open dark",
      "the pale ribbon of light rises and the camera rises with it until slow bands of emerald and violet light fold across the dark",
      "the arcs of amber reach higher and the camera rises with them as a sheet of emerald light lifts and flashes gold",
      "the hollow arcs of lavender fade and the camera descends to one ribbon of emerald light settling still in the dark",
    ],
  },
  {
    id: "c110af67-40be-4a06-9878-eeec2a22bb3d",
    name: "Mystic",
    world: "C# major reverie swaying I ↔ Lydian F#maj9 over a C# pedal, wide leaping calls, two chromatic bridges (0:19, 0:46) that point toward a minor place never visited, the climax at 0:51, bare F#5 shells, a plagal amen — sacred geometry remembered in light: one iridescent line drawing a circle, two circles breathing through each other, gold bands breaking through violet mist, a mandala opening ring within ring at the climax, two open arcs and a formless current of seafoam in the spacious vamp, and an incomplete circle resting among stars, the mystery intact",
    phases: [
      P("threshold", 0, 0.173, 0.94, "threshold", "0:00-0:16 Opening Sway (a warm C# chord over its own pedal, the melody answering in wide leaps like calls sent into open space; I–IV breathing with F#maj9)", [
        S("sparse", "DARK BACKGROUND — a single thin line of iridescent seafoam light drawing a slow wavering S-curve in the lower right of vast indigo darkness, fine particles trailing from it, nearly the entire frame empty"),
        S("micro", "extreme macro — the drawing point at closest range, iridescent violet and seafoam light condensing out of darkness at the line's growing tip, the geometry arriving rather than being made"),
        S("cosmic", "cosmic — wide leaps of pale light arcing across infinite dark space from one faint point to distant others, each arc a call sent out and fading, a soft violet glow rising behind them, the camera drifting forward"),
      ]),
      P("expansion", 0.173, 0.335, 0.94, "expansion", "0:16-0:31 Opening Sway → first bridge (0:19 turns inward through D#m6 to an E#7 that hangs unresolved at 0:30, then a common-tone slide home)", [
        S("abstract", "abstract — two interlocking circles of iridescent light breathing slowly in and out of each other in deep indigo, the overlap glowing seafoam, a violet veil tinting one side as the geometry turns inward"),
        S("interior", "inside a veil of rose-violet mist, thin lines of light bending toward a point they never reach, hanging suspended in the luminous haze, the camera drifting slowly through"),
        S("micro", "macro — the intersection of two luminous lines at closest range, a small knot of pearl-white light pulsing where they cross, fine seafoam particles streaming off it into the dark"),
      ]),
      P("transcendence", 0.335, 0.486, 1, "illumination", "0:31-0:45 Deepening Return (the sway resumes with more fullness; mist rising as light breaks fully through into broad gold bands)", [
        S("aerial", "looking straight down on a vast dark expanse of lifting mist made of light, broad bands of warm amber gold breaking through it and refracting into seafoam and violet, the camera descending through the layers"),
        S("cosmic", "cosmic — a log-spiral nebula of violet and pale gold unfurling across deep space, fine geometric forms condensing along its arms like dew on a web, the mathematics visible in its grace"),
        S("micro", "extreme macro — one bead of condensed light on the spiral's arm at closest range, its translucent surface engraved with a faint iridescent pattern of circles within circles"),
      ]),
      P("illumination", 0.486, 0.627, 1, "transcendence", "0:45-0:58 Deepening Return → second bridge (a radiant F#maj9#11 climbing to the climax at 0:51, E#9 and G#13 pulling hardest, then slipping home to C# at 0:58)", [
        S("abstract", "abstract — infinite recursion: a mandala of iridescent geometry and soft prismatic light where every ring opens into finer, brighter rings forever, violet, seafoam and pale gold interleaved at every depth, the camera descending through layer after layer"),
        S("cosmic", "cosmic — the climax seen from beyond: the whole mandala blazing as one radiant spiral across infinite dark space, its strongest pull at the rim, then a soft slip of light back toward its quiet heart"),
        S("micro", "macro — the boundary between two layers of the mandala at closest range, the coarser geometry dissolving into the finer like surf into sand, gold threads carrying across"),
      ]),
      P("return", 0.627, 0.832, 0.92, "integration", "0:58-1:17 Lifted Vamp (only the open I–IV oscillation remains, spread wider and higher in bare F#5 shells — acceptance and spaciousness) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — two small open arcs of pale pearl light hanging apart in the upper left of vast indigo darkness, gently swaying toward each other and away, nearly the entire frame empty"),
        S("interior", "within the open dark, a slender current of seafoam light moving slowly and formless, tracing the faint outline of a circle as it passes, a gentle presence of glow leaving a soft afterlight behind it"),
        S("aerial", "from high above, a wide dark calm under faint high veils of luminous violet haze, a few thin arcs of light resting far apart across it, spacious and still"),
      ], { sparse: true }),
      P("integration", 0.832, 1, 0.37, "integration", "1:17-1:33 Suspended Amen (the IV's colours hovering over the tonic, a plagal amen fading to silence, the mystery intact)", [
        S("cosmic", "cosmic — a star field of quiet sharp stars where the geometry has dissolved, one incomplete circle of faint iridescence low in the frame, the mystery intact, the camera slowly pulling back"),
        S("micro", "macro — the open ends of an incomplete circle of faint light at closest range against black, both tips still softly bright, neither reaching for the other, a breath of violet between them"),
        S("sparse", "DARK BACKGROUND — a single thin line of iridescent seafoam light resting in the lower right of vast darkness, the first arc of the circle again, open, ready to begin, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera pushes in on the growing line until two circles of iridescent light breathe in and out of each other",
      "the knot of pearl light brightens and the camera rises through it into broad bands of gold breaking through violet mist",
      "the engraved circles widen and the camera descends into them as the mandala opens ring within ring",
      "the mandala's light slips home and the camera pulls back until two small open arcs of pearl light sway alone in the dark",
      "the arcs drift apart and the camera rises slowly into a quiet star field holding one incomplete circle",
    ],
  },
];
