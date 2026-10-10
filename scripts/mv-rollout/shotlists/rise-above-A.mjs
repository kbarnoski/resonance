// Rise Above loop, batch 1 part A — Journey Archetype shot lists (2026-10-09):
// Grasshopper, Yellow Bird, The First (Expanded), Bath, Afterglow.
// Modelled on the Karel-approved expansion-sample.mjs, welcome-home-title.mjs
// (hint, never literal) and expansion-batch-1..6 (same format, minus
// shaders/opacity).
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones;
//    `music` names the deep-analysis sections each phase holds.
//  - Each journey keeps its identity (current shot motifs + palette),
//    TRANSFIGURED (made of light, particles, impossible stillness) per law
//    10a; one sparse phase at the music's real valley; no humans, no
//    animals (Yellow Bird's flight is leaves of gold light).
//  - Morphs are camera moves between sparse luminous forms in open dark
//    space (Yellow Bird, Bath and Afterglow morphs get rendered as travel
//    clips — no architecture, walls, frame-filling terrain or figures).

export const SET = { key: "rise-above-A", presenting: "Rise Above" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "fdc6470e-5c7e-43b4-968c-3e907f1fa88f",
    name: "Grasshopper",
    world: "E minor free-time meditation circling an open E pedal and a stepwise falling bass, suspension over resolution, a cooling flat-side shadow at 0:41, a held C-major clearing at 1:44, the light dropping onto a low B pedal with its swell at 2:28, ending on a bare open fifth — dew-lit blades bowed under single beads of light at dusk: loaded arcs, drops slipping in slow arcs, the dew-lights merging into a green-gold galaxy, a clearing of pale gold, and one bead resting on a bowed tip, accepted rather than solved",
    phases: [
      P("threshold", 0, 0.106, 0.83, "threshold", "0:00-0:21 Open-Fifth Awakening (a bare E fifth, the bass begins stepping E–D–C)", [
        S("sparse", "DARK BACKGROUND — a single slender blade of dusky olive light bowed in a slow loaded arc in the lower right of vast darkness, one bead of pale straw-gold light hanging at its tip, nearly the entire frame empty"),
        S("micro", "extreme macro — that bead of light at closest range, the whole dusk meadow curved upside down inside its translucent sphere, fine motes of amber drifting within it, the bent blade's fibers taut as glowing green cords"),
        S("aerial", "looking straight down on a dark expanse of bowed blades at deep dusk filling the frame edge to edge, each tip holding one faint luminous point of gold like a thousand drawn bows, the camera slowly descending toward them"),
      ]),
      P("expansion", 0.106, 0.207, 0.83, "expansion", "0:21-0:41 Open-Fifth Awakening (each descent opens a richer chord, Cmaj9/Am9, Gmaj7/F#; Emadd4 resolving to Em)", [
        S("micro", "extreme macro — the instant before release, a bead of light trembling at a blade tip, its reflections stretched into thin gold arcs, the whole dusk holding its breath, soft slate-blue darkness beyond"),
        S("abstract", "abstract — tension as geometry: curved arcs of olive and straw-gold light layered through darkness at every depth, each strung with a single luminous point, a slow stepwise cascade descending from the upper left"),
        S("aerial", "from high above, slow ripples of pale gold light spreading through a dark canopy of dew-lit blades where one drop has slipped free, overlapping luminous rings drifting outward across the dusk"),
      ]),
      P("transcendence", 0.207, 0.318, 1, "transcendence", "0:41-1:03 Shadowed Detour (the flat-side turn Dm, Bbmaj7, F — a cloud crosses the light) → Gmaj9/F#, the B pedal, a firm Em at 1:03", [
        S("cosmic", "cosmic — thousands of dew-lights seen from immense height merging into a slow galaxy of green-gold points spiralling across infinite darkness, a vast cool shadow of slate-blue sliding across one arm of it, the camera rising through the drifting lights"),
        S("micro", "macro — a drop of light slipping from a bowed blade in a slow arc, its trail a thin luminous thread of straw gold, the cool shadow passing over it turning the bead silver-blue for one breath"),
        S("abstract", "abstract — falling arcs of light crossing through deep olive darkness in slow diagonal curves, a band of slate-blue shade folding across them like a passing cloud, then gold returning along the lower edge, weightless"),
      ]),
      P("illumination", 0.318, 0.651, 0.98, "illumination", "1:03-2:09 Lydian Bloom (Cmaj13#11, the longest Em at 1:18, almost consoling) → C-Major Clearing (1:44, long Cadd9 plateaus, pausing on VI — a held breath)", [
        S("aerial", "from high above, a clearing of pale gold light opening in a dark expanse of tall luminous blades, the glow pooling in the lower left while the edges stay in soft olive shadow, the camera gliding slowly over it"),
        S("micro", "extreme macro — the tip of one blade catching the warm Lydian light, its fine fibers glowing amber and gold like filaments, a bead of light resting in the fold, deep shadow behind"),
        S("cosmic", "cosmic — the clearing seen from the edge of the heavens as a slow luminous spiral of straw gold and pale green light held open in infinite darkness, paused rather than resolved, motes drifting outward at its rim"),
      ]),
      P("return", 0.651, 0.838, 0.9, "integration", "2:09-2:46 Low Pedal Reckoning (the light drops onto a low B pedal; the Emadd4 now held unresolved; the strongest swell at 2:28 rises and recedes) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small bead of cooling amber light resting on a bent blade tip in the lower left of immense slate-blue darkness, a faint band of warmth fading beneath it, nearly the entire frame empty"),
        S("micro", "extreme macro — the suspended bead at closest range, unresolved and trembling, a tiny reflection of the last warm band flaring inside it and fading, fine olive fibers glowing faintly around it"),
        S("abstract", "abstract — one slow swell of amber and olive light rising in layered arcs from the lower edge of the frame and receding again, a low luminous band breathing beneath deep indigo darkness, the camera drawn toward it"),
      ], { sparse: true }),
      P("integration", 0.838, 1, 0.37, "integration", "2:46-3:18 Fading Fifth (everything sinks below B3, pianissimo; plain C, Em, D; a six-second open E fifth, neither major nor minor)", [
        S("aerial", "looking straight down at the dark expanse of blades at full night, dew re-forming along them in faint strings of luminous light, one tip glowing slightly brighter in the upper right, the camera slowly pulling back"),
        S("cosmic", "cosmic — the dew-lights from immense height dimmed to a faint scatter of embers across infinite indigo darkness like a quiet star field, one point burning a little brighter, open and unresolved"),
        S("sparse", "DARK BACKGROUND — a single slender blade bowed in the lower right of vast darkness, one bead of pale gold light resting at its tip, the bookend of the first light, accepted rather than solved"),
      ]),
    ],
    morphs: [
      "the camera descends toward one lit blade tip until a single bead of light trembles close in the dark",
      "the rings of light widen and the camera rises until the dew-lights merge into a slow green-gold galaxy",
      "the falling arcs settle and the camera glides down as a pool of pale gold light opens in the dark",
      "the spiral of light dims and the camera settles close on one small bead of cooling amber alone in the dark",
      "the swell recedes and the camera rises to look down on faint strings of light re-forming across the dark",
    ],
  },
  {
    id: "c80a89bc-2c88-4bde-bec8-4be6916acb62",
    name: "Yellow Bird",
    world: "F major song rocking F ↔ Bbmaj9 over a held F pedal, lifting into Bb/Eb colour at 0:28 and 0:56, a reflective dip at 1:07, a modest crest at 1:40, then a bare F open fifth — a contented homeward flight told in leaves of gold light: one leaf lifting from a dark branch, a rising ribbon of leaves like notes on a staff of wind, a wing of thousands folding in honey and pale blue, one leaf drifting alone, the bloom at the crest, and a last gold leaf resting on a dark mirror",
    phases: [
      P("threshold", 0, 0.167, 0.88, "threshold", "0:00-0:23 Rocking Sunrise (F ↔ Bbmaj9 over the F pedal, the melody leaping out every few seconds)", [
        S("sparse", "DARK BACKGROUND — a single small yellow leaf made of warm light lifting off a dark branch tip in the lower left of vast darkness, swaying gently in a slow rocking breeze, nearly the entire frame empty"),
        S("micro", "extreme macro — the underside of the leaf at closest range, veins branching like golden lightning through the translucent blade, soft honey bokeh drifting in the dark beyond"),
        S("aerial", "from high above at first light, looking down on a dark canopy filling the frame edge to edge where one crown has turned entirely to luminous gold, its leaves trembling light in a slow sway, the camera drifting lower"),
      ]),
      P("expansion", 0.167, 0.298, 0.98, "expansion", "0:23-0:41 Subdominant Lift (the bass lets go at 0:28 — Bb sus2/add9, a first glint of Ebmaj13 at 0:30) → C7sus4 folds back to Fsus2", [
        S("interior", "inside a rising stream of gold leaves made of light curving upward through shafts of pale blue morning air, each leaf a wingbeat of honey light banking past the camera"),
        S("abstract", "abstract — the flight path rendered as a single ribbon of butter-yellow light curling up through darkness toward the upper right, small leaves of light strung along it like notes on a staff of wind, a glint of pale blue at its crest"),
        S("micro", "macro — a leaf of light at the top of its rise, its edge lit butter yellow and sage, fine motes of gold shaken from its tip into the dark air, weightless"),
      ]),
      P("transcendence", 0.298, 0.488, 1, "transcendence", "0:41-1:07 Fuller Return (the sway sung with more shine) → the 0:56 Bb–Ebmaj9–Gm9 plateau, the warmest stretch", [
        S("cosmic", "cosmic — thousands of luminous gold flakes of light wheeling as one immense spiral arm across infinite dark blue space, curving in a slow rocking sway like a galaxy breathing, the camera soaring along its edge"),
        S("interior", "inside a whirling vortex of countless tiny gold sparks and leaf-shaped flakes of light at every depth, pale blue haze between them, abstract and weightless, the warm glow weighted toward the upper left"),
        S("aerial", "looking straight down from great height on a slow luminous stream of gold light winding across dark land, a drift of tiny gold flakes gliding beside it, surreal and still"),
      ]),
      P("illumination", 0.488, 0.633, 0.9, "integration", "1:07-1:27 Final Ascent opens (C13sus4/F, a reflective rereading of the theme, long-held F chords, the energy dip at 1:15) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small leaf of pale gold light drifting alone in the upper right of immense dark blue space, a faint thread of light trailing behind it, nearly the entire frame empty"),
        S("micro", "extreme macro — the drifting leaf's edge at closest range, fine serrations glowing honey and sage, a single bead of light held in its curl reflecting a tiny warm world"),
        S("abstract", "abstract — slow parallel curves of gold light gliding through darkness in long held arcs, spaced like long breaths, sage and pale blue glow between them, impossibly still"),
      ], { sparse: true }),
      P("return", 0.633, 0.771, 0.9, "illumination", "1:27-1:46 Final Ascent (Gm7, Bb, Ebmaj9 climbing to the 1:40 crest — C over Bb blooming into Bbmaj13)", [
        S("cosmic", "cosmic — a swirl of gold flakes of light rising into a vast bloom of honey and pale blue nebula light spreading across a star field, opening at once at the crest like a flower of light, the camera rising through it"),
        S("micro", "macro — one leaf of light at the very top of the crest, suspended weightless, its veins blazing gold, sparks of light streaming from its edge into the dark"),
        S("abstract", "abstract — descent as slow gold rain: leaves of light falling in parallel curved paths through darkness, each trailing a fading thread of luminous honey"),
      ]),
      P("integration", 0.771, 1, 0.37, "integration", "1:46-2:17 Fading Open Fifth (Lydian Bbmaj9#11 at 1:47, a stepwise bass descent, one last rocking, a bare F fifth at 2:16)", [
        S("aerial", "looking straight down on black still water at dusk, one gold leaf of light resting on its surface in the lower right, a slow ring of luminous ripples fading outward, the camera gently descending"),
        S("interior", "beneath the surface looking up, the floating leaf a small gold glow in a dark translucent ceiling, dusky rose-amber light shafting down through the deep"),
        S("cosmic", "cosmic — from immense height the last gold point resting in deep dusky violet among faint stars, a single warm light left at the end of the year, still and open"),
      ]),
    ],
    morphs: [
      "the camera drifts upward with a few sparse leaves of gold light lifting into open darkness, following them as they curve into a rising stream",
      "the leaves of light arc past and the camera glides along them as sparse gold leaves gather into one slow folding wing of light in the dark",
      "the wing of light loosens and the camera pulls back until one small leaf of pale gold drifts alone in vast dark space",
      "the slow arcs of light lift and the camera rises with a few gold leaves as they bloom into a wide soft glow of honey light in open darkness",
      "the falling threads of light slow and the camera descends with one last gold leaf as it settles onto a still dark mirror among sparse motes",
    ],
  },
  {
    id: "f0362f24-75f1-4717-8487-cc9cf12c7bcc",
    name: "The First (Expanded)",
    world: "G major reverie on one gesture, G opening onto a Lydian-glowing Cmaj9#11, an earnest E-minor heart at 1:01 under cool green-grey, amber flooding back at 1:20, dissolving into bare open fifths that feel like a beginning — first light as a seam of amber in a sleeping dark: a dew bead holding the whole night, light climbing inside dark trunks ring by ring, a held pool of gold, a tide of amber rolling across the dark at the heart, the day folded into strata, and the seam left glowing at the edge of a star field",
    phases: [
      P("threshold", 0, 0.148, 0.81, "threshold", "0:00-0:17 First Light Opening (G, a soft Em11/D, an expansive Cmaj13 — one warm idea)", [
        S("sparse", "DARK BACKGROUND — a single thin seam of warm amber light glowing low in the lower right of vast darkness, like the first fold of a sleeping world catching dawn, nearly the entire frame empty"),
        S("micro", "extreme macro — a single dew bead at closest range holding a whole dark sleeping valley curved inside it, the amber seam a thin bright thread across its translucent heart"),
        S("aerial", "from high above in the last of the night, dark ridgelines rolling like slow waves of mist filling the frame edge to edge, one fold glowing like a luminous crack into a warmer world below, the camera descending toward it"),
      ]),
      P("expansion", 0.148, 0.287, 0.81, "expansion", "0:17-0:33 First Light Opening (each statement slightly fuller, the light widening with each breath)", [
        S("interior", "inside a dark trunk as the light arrives within it, the concentric rings of its years glowing as nested bands of honey and mint light, the newest ring blazing, the camera drifting through them"),
        S("micro", "macro — bark at closest range as light floods its ridges like slow channels of liquid gold, one resin bead igniting amber, pale mint glow at the edges"),
        S("abstract", "abstract — dozens of dark vertical strokes with light climbing inside each one like slow luminous fuses, sage and amber bands rising through deep blue darkness"),
      ]),
      P("transcendence", 0.287, 0.435, 0.9, "illumination", "0:33-0:50 Lydian Hover (the 3.5 s Cmaj9#11 at 0:36 held like breath in bright air; a faint B-major shadow at 0:44)", [
        S("aerial", "looking straight down on still dark water holding one motionless pool of pale gold light in the upper left, a faint ripple of shadow passing at its lower edge, mint haze hanging weightless above it"),
        S("interior", "within the held light, layered veils of gold and mint air suspended motionless through darkness, motes hanging in slow spirals, the camera rising through them"),
        S("micro", "macro — a flake of golden light the size of a wingtip spiralling upward past dark leaves at closest range, its glow strobing through cool shadow"),
      ]),
      P("illumination", 0.435, 0.8, 1, "transcendence", "0:50-1:32 Relative-Minor Heart (Esus2 → Em7, the earnest peak at 1:01, cool green-grey) → Homecoming Glow (1:10; the fuller Cmaj9#11 at 1:20; D9/C left open)", [
        S("cosmic", "cosmic — a vast tide of luminous amber light rolling across an immense dark expanse seen from the edge of space, a cool green-grey veil sweeping over it at the crest and gold flooding back along one long diagonal, infinite darkness above, the camera soaring with the wavefront"),
        S("micro", "extreme macro — a single bead of dew on a dark leaf tip at closest range, cool sage and slate light inside it turning slowly to amber, tiny spirals of motes suspended within"),
        S("aerial", "from high above, countless dark trunks seamed with climbing amber light, the whole canopy catching fire-gold from beneath in slow luminous waves running toward the lower right"),
      ]),
      P("return", 0.8, 0.904, 0.37, "integration", "1:32-1:44 Open-Fifth Farewell begins (everything falls away to bare open G fifths, a last maj9 and #11 touch) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small pool of pale gold light no bigger than a coin resting on a dark leaf in the lower left of immense blue darkness, its veins faintly mapped in gold, nearly the entire frame empty"),
        S("micro", "extreme macro — the coin of light at closest range, a tiny mirror of fading gold smoothing to dusky blue, fine luminous motes settling across it"),
        S("abstract", "abstract — the morning folded closed: thin layers of amber, mint and dusky blue light banded like strata across darkness, the day stored as luminous sediment"),
      ], { sparse: true }),
      P("integration", 0.904, 1, 0.37, "integration", "1:44-1:55 Open-Fifth Farewell (fading to near silence by 1:49, the third unspoken — a beginning rather than an ending)", [
        S("cosmic", "cosmic — a thin seam of warm amber light glowing faintly along the lower right of an immense star field, soft mint haze around it, the first light of a world held just before dawn, the bookend of the opening seam"),
        S("aerial", "looking straight down from immense height on a dark mirror of still water at dusk, the last gold fading to blue as luminous ripples smooth away"),
        S("sparse", "DARK BACKGROUND — a single thin seam of amber light resting low in the lower right of vast darkness, steady and quiet, the first light left open"),
      ]),
    ],
    morphs: [
      "the camera descends into the glowing fold until nested rings of honey light open around it in the dark",
      "the climbing fuses of light dim and the camera glides down to one motionless pool of gold hanging in the dark",
      "the spiralling flake of light rises and the camera follows it up until a vast tide of amber rolls across the darkness below",
      "the waves of light settle and the camera pushes in on one small coin of pale gold alone in the dark",
      "the bands of light fold closed and the camera pulls back until one thin seam of amber glows at the edge of a star field",
    ],
  },
  {
    id: "a5b5f0cf-9a6b-451a-8293-3d98f3904342",
    name: "Bath",
    world: "F major free-time immersion over a tonic pedal like still warm water, F ↔ Bbmaj9 rocking, the sparsest float at 0:19, a D-minor descent at 0:41, one reach to C at 1:14-1:26, the measured climax at 1:32, evaporating onto F/A — warmth as light: one swelling bead of honey light at the lip of dark stone, a lone curl of luminous steam, sinking through caustic nets of gold, the steam blooming into a nebula of cream and white, slow rings of gold pulsing on a still surface, and the bead resting again as the warmth cools",
    phases: [
      P("threshold", 0, 0.128, 0.94, "threshold", "0:00-0:19 Settling In (F7 → F/A → F → Bbmaj9/F over the tonic pedal, dominant-sus colours hovering)", [
        S("sparse", "DARK BACKGROUND — a single bead of warm honey light swelling at the lip of dark stone in the lower right of vast darkness, a faint curl of luminous steam rising behind it, nearly the entire frame empty"),
        S("micro", "extreme macro — inside the swelling bead at closest range, a tiny amber world curved within its translucent belly, soft cream light trembling in slow irregular pulses"),
        S("aerial", "looking straight down into a deep dark basin slowly filling with luminous warm water, its surface trembling and rising in soft pulses, gold caustics waking along the rim, the camera descending toward it"),
      ]),
      P("expansion", 0.128, 0.276, 0.88, "integration", "0:19-0:41 Floating Thought (the sparsest stretch — the same idea floats with more space, the melody drifting up to C6 like steam) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of steam made of pale ivory light rising alone in the upper left of immense warm darkness, a few fine motes drifting from it, nearly the entire frame empty"),
        S("micro", "macro — a single wisp of steam at closest range curling through a thin blade of honey light, its edge glowing and dissolving in the same slow breath"),
        S("aerial", "from high above, slow coils of luminous steam drifting upward off a still dark surface into soft cream light, spaced far apart across the darkness, the camera rising with them"),
      ], { sparse: true }),
      P("transcendence", 0.276, 0.457, 0.92, "expansion", "0:41-1:08 Deepening Descent (the bass moves: I–vi–IV–I with D minor, played fullest and lowest — a wistful shade)", [
        S("interior", "beneath the surface, sinking slowly through warm amber depth, a ceiling of liquid gold rippling far above, caustic nets of light sweeping across the dark, silver bubbles rising past the camera"),
        S("micro", "macro — one caustic knot at closest range, ropes of luminous light lacing and unlacing on pale smooth stone, the water's slow motion written in gold and sea-glass teal"),
        S("abstract", "abstract — the caustic net spread wide: a rippling lattice of gold and teal light drifting across darkness in slow interference, deep shadow pooling between its strands toward the lower left"),
      ]),
      P("illumination", 0.457, 0.585, 1, "transcendence", "1:08-1:27 Reaching for C (Gm, C7 → a broad C major at 1:14, held five seconds at 1:21 — the single opening-up) → Fmaj9 folds home", [
        S("cosmic", "cosmic — the steam blooming into a vast luminous nebula of cream, honey and white light breaking open across infinite warm darkness, slow coils unfolding outward in every direction, the camera rising through the glow"),
        S("interior", "inside the radiant steam, layered veils of cream and pale gold light folding past on every side, soft sea-glass shadows in the recesses, weightless and warm"),
        S("micro", "extreme macro — a single bead of light lifting off the warm surface at closest range, held weightless at the top of its rise, the broad white glow refracted through it"),
      ]),
      P("return", 0.585, 0.84, 0.96, "return", "1:27-2:05 Homecoming Sway (the reprise over a deeper F1 pedal, the measured climax at 1:32; long rests on Bbmaj9/F, motion slowing)", [
        S("aerial", "looking straight down on a still dark surface where single drops of light fall, slow concentric rings of soft gold pulsing outward and overlapping, spaced like long breaths, the camera drifting lower"),
        S("abstract", "abstract — ripples of warm light crossing in slow golden arcs, a gentle rocking interference of honey and teal rings across darkness, weighted toward the upper right"),
        S("micro", "macro — slow-breathing gold filigree of luminous light settled on pale stone beneath clear still water at closest range, the glow banked from gold toward bronze"),
      ]),
      P("integration", 0.84, 1, 0.37, "integration", "2:05-2:29 Dissolving Warmth (suspensions linger at 2:10 and 2:13; closes on a three-second F/A, unresolved stillness)", [
        S("aerial", "looking straight down through clear dark water at slow descending veils of luminous amber settling into the deep, the steam above thinning to a pale shine, the camera sinking with them"),
        S("cosmic", "cosmic — from immense height one faint warm glow resting in folded darkness among scattered pale motes like distant stars, a held ember of warmth cooling to a pale haze"),
        S("sparse", "DARK BACKGROUND — a single bead of warm honey light resting at the lip of dark stone in the lower right of vast darkness, one last thread of steam rising from it, the bookend of the first drop"),
      ]),
    ],
    morphs: [
      "the camera rises away from the warm glow as a single curl of ivory steam-light lifts off and drifts alone into open darkness, most of the frame deep black",
      "the sparse coils of light slow and the camera sinks down through them as faint nets of gold light begin to ripple across the open dark",
      "the strands of gold light gather and the camera rises through them as sparse coils of cream light bloom outward into open darkness",
      "the lifted bead of light falls and the camera follows it down as a few soft rings of gold spread outward across the dark",
      "the filigree of light loosens into a few slow veils of amber and the camera drifts down with them through open darkness",
    ],
  },
  {
    id: "fb56b19e-ee23-43c6-ad41-5714e7969aad",
    name: "Afterglow",
    world: "Eb major (written D#) glowing stasis over a constant low pedal and a dense shimmer of arpeggios, sus4 → 3 breaths instead of cadences, a relative-minor shadow at 1:07-1:29, the clouds parting onto the longest tonic at 1:38, a last bloom at 2:05 and a slow decay into a half-lit Eb — the glow that outlasts the light: one band of rose and ember on violet dark, rings of fading gold, stone exhaling the day as rose vapour, the whole heaven a churning sourceless gradient at the shadow, one band of pale gold floating alone, and the last thread of ember along a black ridge",
    phases: [
      P("threshold", 0, 0.218, 0.92, "threshold", "0:00-0:33 Glow on the Pedal (Ebsus4 ↔ Ebmaj7add11 rocking against the third over the low Eb)", [
        S("sparse", "DARK BACKGROUND — a single thin band of rose and ember light lying low in the lower right of vast violet darkness, its glow pooling softly, a faint shimmering double beneath it, nearly the entire frame empty"),
        S("micro", "extreme macro — still dark water at closest range, the bands of rose and ember lying broken across fine shimmering ripples, each ripple a tiny luminous arc of gold"),
        S("aerial", "from high above, a luminous mirror of still dark water filling the frame edge to edge holding a graded fire of rose, ember and violet strata, fine shimmer trembling across it, the camera slowly descending"),
      ]),
      P("expansion", 0.218, 0.443, 0.97, "expansion", "0:33-1:07 Widening Circles (Absus2, Ab add9/Eb, Cm7, widening leaps — a stirring of longing) → the long reassuring Eb at 0:53", [
        S("abstract", "abstract — concentric rings of light spreading outward across dark water from the upper left, each ring carrying a fading band of rose, gold or violet, widening in slow overlapping interference"),
        S("micro", "macro — warm stone at closest range still holding soft red along its fine mineral glints as the air cools, one thin line of ember light along its upper edge, blue shadow rising from below"),
        S("aerial", "looking straight down as thin veils of rose light rise slowly off dark stone into violet air, the stone exhaling its day in luminous drifting plumes, the camera gliding with them"),
      ]),
      P("transcendence", 0.443, 0.589, 1, "transcendence", "1:07-1:29 Relative Shadow (Cm7, a fleeting Ebm at 1:16, the melody's highest C5, inner voices churning at peak intensity)", [
        S("cosmic", "cosmic — the whole heaven a graded sourceless fire of rose, salmon and burnt gold churning edge to edge, slow slate-blue shadows drifting across it in waves, the deepest ember banked along the lower edge of the frame, the camera rising into it"),
        S("interior", "inside the gradient itself, floating groundless among churning bands of colour, slate shadow above and ember below, fine glints of light drifting between the strata"),
        S("micro", "extreme macro — fine shimmering beads of rose light trembling on dark stone at closest range, darkening to slate and flaring back in slow waves, one point of brightest gold at the upper left"),
      ]),
      P("illumination", 0.589, 0.688, 0.94, "integration", "1:29-1:44 Open Horizon (the clouds part; a suspended Bb pedal resolves into the longest held tonic at 1:38, consoling and spacious) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small soft band of pale gold light floating alone in the upper left of immense violet darkness, still and spacious, nearly the entire frame empty"),
        S("micro", "macro — a single spruce needle at closest range, its edge lit rose and gold, the whole evening gradient compressed into the soft blur behind it"),
        S("aerial", "from high above, dark ridgelines stacked in violet haze like slow waves, each fold pooled with a different temperature of afterglow, pale gold widening evenly across them, luminous and still"),
      ], { sparse: true }),
      P("return", 0.688, 0.788, 0.94, "return", "1:44-1:59 Open Horizon (the Eb ↔ Ebsus4 breaths that follow, consoling and spacious)", [
        S("intimate", "close — one long soft band of warm light lingering above dark still water, drifting slowly sideways, its luminous reflection keeping pace below, deep violet around it"),
        S("abstract", "abstract — two slow horizontal ribbons of rose and pale gold light breathing apart and together across darkness, a mirror symmetry offset toward the lower right"),
        S("micro", "macro — the band's light crossing a wet stone at the waterline at closest range, warming it rose for one long moment before the blue takes it back"),
      ]),
      P("integration", 0.788, 1, 0.37, "integration", "1:59-2:31 Afterglow Fading (Cm, Fm7 gather into the final Ebmaj13/Abmaj9 bloom at 2:05; a third-less ii–V lets go; a half-lit Eb shadowed by Cb)", [
        S("cosmic", "cosmic — a final flare of rose and amber light blooming across an immense dark expanse among the first faint stars, then sinking into violet dusk, the glow outlasting the light that made it"),
        S("abstract", "abstract — the day's colours banked into one thin horizontal seam of rose-gold between vast fields of black, an ingot of evening drifting slowly toward the lower edge"),
        S("sparse", "DARK BACKGROUND — a single last thread of ember light, thin as wire, lying along a black ridge in the lower right of vast violet darkness, a few stars sharpening above, the bookend of the first band"),
      ]),
    ],
    morphs: [
      "the camera glides low over sparse bands of rose light as they loosen into a few slow concentric rings of ember glowing in open darkness",
      "the drifting plumes of rose light rise and the camera rises with them until sparse bands of salmon and gold glow spread across open darkness",
      "the shimmering beads fade and the camera pulls back until one small soft band of pale gold floats alone in the dark",
      "the pooled glows thin and the camera drifts closer as one long band of warm light lingers in open darkness, its faint double keeping pace below",
      "the warm glint lets go and the camera rises as sparse rose and amber light blooms outward among faint stars in open darkness",
    ],
  },
];
