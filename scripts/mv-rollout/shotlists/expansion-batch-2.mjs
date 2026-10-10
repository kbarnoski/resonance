// Expansion — Journey Archetype shot lists, batch part 2 (2026-10-09):
// Tranquility 17, No question 7, Northern Plane 5, Never Forget 4,
// Tranquility 30, Amboise 1, Roll Away 8, Surrounded by Light 6.
//
// Same format and craft as expansion-sample.mjs (Karel-approved on the
// kiosk), minus shaders/opacity. Phase ids/bounds/intensities are the
// journeys' CURRENT ones; `music` names the deep-analysis sections each
// phase holds; each world keeps its 10-05 analysis-derived identity,
// TRANSFIGURED (made of light, particles, impossible stillness).
// Applied by scripts/mv-rollout/apply-shotlists.mjs.

export const SET = { key: "expansion-batch-2", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "68b4289e-2247-41d6-8b9d-064345da9769",
    name: "Tranquility 17",
    world: "C# major hymn swaying tonic to subdominant, Lydian shimmer on IV, a Neapolitan D-natural sigh under the calm; climax 1:55 then a clouded afterglow and an open C#-G# fifth — a green-gold floor of luminous moss and fern spirals: one frond uncurling, haze and motes lifting, a galaxy-scale fern fractal blazing gold at the summit, violet shadow pooling in the afterglow, a softer second wave, and one half-uncurled frond left open in twilight blue",
    phases: [
      P("threshold", 0, 0.05, 0.74, "threshold", "0:00-0:10 Opening Hymn (still, swaying C# to F#)", [
        S("sparse", "DARK BACKGROUND — a single fern frond made of pale green-gold light uncurling slowly in the lower right of vast darkness, its tight spiral tip glowing like a held breath, a few warm motes drifting above it, nearly the entire frame open black"),
        S("micro", "extreme macro — the coiled tip of that frond at closest range, fine luminous hairs of pale green light beaded with tiny suspended grains of gold, haze breathing around it in soft darkness"),
        S("aerial", "from high above, looking straight down on a dark carpet of moss where faint fern spirals glow green-gold across the frame edge to edge, the first slow ripple of warm light crossing it, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.407, 0.76, "expansion", "0:10-1:25 Opening Hymn → Pedal and Question (0:45 first arrival) → Subdominant Bloom (0:50 arpeggios, motes spiralling up) → Gathering Tide (1:13)", [
        S("interior", "inside a slow rising spiral of warm golden motes lifting through green-gold haze, curled fronds of light passing close on every side, the motes turning upward in a weightless fibonacci curl, the camera rising with them"),
        S("micro", "extreme macro — the velvet surface of luminous moss at closest range, each tiny frond tipped with a bead of pale gold light, translucent haze drifting between them, shallow focus fading into green-black darkness"),
        S("aerial", "looking straight down from high above as layers of lit mist lift off the glowing moss in translucent veils, revealing fern spirals by the hundred, a broad tide of warm light advancing across the frame edge to edge"),
      ]),
      P("transcendence", 0.407, 0.567, 1, "transcendence", "1:25-1:59 Gathering Tide → Lydian Summit (F#/G# shimmer, crest 1:55; the Dmaj7 ache at 1:57)", [
        S("cosmic", "cosmic — a vast fern spiral of green-gold light uncurling across infinite darkness like a galaxy, every frond branching into smaller fronds in a luminous fractal, gold motes streaming outward from its open heart, the camera rising through it"),
        S("micro", "macro at the height of the light — the tip of one glowing frond blazing gold-white, its tiny leaflets dissolving into sparks of warm light against green-black darkness"),
        S("abstract", "abstract — a radiant lattice of fronds made of light opening outward in every direction, gold flooding along each branching vein, one cool shadow of violet sliding across the brightness"),
      ]),
      P("illumination", 0.567, 0.84, 0.64, "integration", "1:59-2:56 Shadowed Afterglow (Neapolitan crunch, D/F# at 2:19) — the sparse valley → Second Ascent (2:33, softer light)", [
        S("sparse", "DARK BACKGROUND — one small curled frond of dim violet light resting alone in the upper left of immense darkness, a last thread of gold along its spine, nearly the entire frame empty"),
        S("aerial", "from high above, violet shadow pooling in the hollows of a dark mossy land seen straight down, one long thread of gold light still lying along a low ridge of luminous moss, translucent haze settling over it"),
        S("interior", "within the soft haze a second wave of diffuse green-gold light rolling slowly over the moss, motes lifting again in loose spirals, the camera drifting forward through them, gentler than before"),
      ], { sparse: true }),
      P("return", 0.84, 0.92, 0.94, "return", "2:56-3:13 Homeward Dissolve (D-C# sighs, plagal farewell)", [
        S("abstract", "abstract — slow ribbons of green-gold light unwinding across black like fern spirals relaxing, the light deepening toward twilight blue at their edges, dissolving into fine particles"),
        S("micro", "extreme macro — a single bead of pale gold light at the tip of a dark frond, holding a tiny reflection of the whole luminous moss, a faint ring of light widening around it"),
        S("aerial", "rising slowly away while looking straight down, the glowing moss narrowing far below to a few green-gold spirals, deep blue dusk folding back over the land"),
      ]),
      P("integration", 0.92, 1, 0.54, "integration", "3:13-3:30 Homeward Dissolve (ends on an open C#-G# fifth)", [
        S("cosmic", "cosmic — from immense height the moss becomes a faint green-gold glow drifting in deep twilight blue, scattered motes around it like a quiet star field, the camera pulling back into stillness"),
        S("micro", "extreme macro — one last grain of gold light caught in the coil of a dark frond, slowly dimming to blue, translucent and weightless"),
        S("sparse", "DARK BACKGROUND — a single fern frond of faint gold light resting half-uncurled in the lower right of vast deep-blue darkness, the bookend of the first light, left open"),
      ]),
    ],
    morphs: [
      "the camera descends toward the glowing moss until it is rising inside a spiral of golden motes",
      "the tide of warm light spreads and the camera pulls back as the fern spirals unfurl into a galaxy-scale fractal",
      "the gold lattice dims under violet shadow and the camera settles close on one small curled frond alone in the dark",
      "the second wave of light thins and the camera drifts up as the fronds unwind into slow ribbons of green-gold",
      "the camera keeps rising until the moss is a faint green-gold glow among quiet points of light",
    ],
  },
  {
    id: "19acdb4c-5a52-4532-99bd-a59652c7ff8e",
    name: "No question 7",
    world: "C minor circling C and F over long pedals, suspended rather than resolved, a Db-over-C smoky shadow, an eight-second harmonic wheel pressing to a low, dense climax at 1:42, then a held Cm opening to a quiet Cadd9 — certainty in the dark: one vertical line of light over a night canopy, light breaking through slate vapor, a turning wheel of lit mist around the beam, a heavy deep-toned summit, the held minor as one smoky ember, and the line standing true in pale gold",
    phases: [
      P("threshold", 0, 0.05, 0.62, "threshold", "0:00-0:08 Clustered Threshold (open C5 / sus chords)", [
        S("sparse", "DARK BACKGROUND — a single thin vertical thread of low amber light standing in the left third of deep slate darkness, a few motes of dust turning slowly through it, a faint veil of mist at its base, nearly the entire frame empty"),
        S("micro", "extreme macro — motes of dust suspended inside the thread of light at closest range, each grain glowing amber against smoky violet dark, impossibly still"),
        S("aerial", "from high above, looking straight down on a dark canopy lying under hanging mist, one fine vertical seam of amber light rising out of it, the camera descending toward the glow"),
      ]),
      P("expansion", 0.05, 0.55, 0.71, "expansion", "0:08-1:28 Clustered Threshold → Subdominant Shadow (F pedals) → Light Through Cracks (0:43) → The Turning Wheel (1:04, four revolutions)", [
        S("interior", "inside the cool damp mist beside the thread of light, smoky violet veils passing close on every side, the amber line glowing steadily through them, the camera drifting toward it"),
        S("abstract", "abstract — thin shafts of pale light breaking through cracks in heavy slate vapor, splitting into prismatic threads of amber and teal that fan out across darkness"),
        S("aerial", "looking straight down at a slow spiral of luminous mist turning like a great wheel of light, flashes of amber catching on its arms with each revolution, deep darkness at its centre and all around it"),
      ]),
      P("transcendence", 0.55, 0.72, 0.9, "transcendence", "1:28-1:55 The Turning Wheel (pressing harder) → Low Summit (climax 1:42, Cm held at 1:47)", [
        S("cosmic", "cosmic — the beam at full height, a radiant vertical line of amber and pale gold rising out of a dense sea of churning slate mist into infinite darkness, the wheel of mist around its base pressing faster, the camera rising along it"),
        S("micro", "macro — the dense heavy core of the beam at closest range, slow dark currents of violet and teal light pushing hard against one another, sparks of low amber caught between them"),
        S("interior", "within the churning mist at the base of the beam, deep-toned swells of slate and charcoal vapor surging past like a swollen current, one low amber glow holding firm through them"),
      ]),
      P("illumination", 0.72, 0.84, 1, "illumination", "1:55-2:14 Low Summit (C7#9 push 1:57-2:02) → Major Light, Letting Go (2:03, G7b9 points home)", [
        S("abstract", "abstract — at the largest scale, the vertical line of light flaring as bands of rust gold, smoky violet and teal streak outward from it in a vast interference pattern across darkness, then begin to soften"),
        S("aerial", "looking straight down from immense height as the mist over the dark canopy parts in slow folds, broad warm amber light spreading through the gaps, the pressure easing, the camera pulling back"),
        S("micro", "extreme macro — fine strands of pale gold mist trembling at closest range, tiny sparks of light caught along their filaments, translucent, the glow wavering between cool teal and warm amber"),
      ]),
      P("return", 0.84, 0.92, 0.68, "integration", "2:14-2:27 Major Light, Letting Go (C major and minor alternating, the long Cm at 2:28 gathering) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of smoky violet light hanging alone in the upper right of immense slate darkness, held and still, a few fine motes falling away from it, nearly the entire frame empty"),
        S("micro", "macro — the thread of light narrowing at closest range within cooling mist, the last amber fading to pale silver along it, fine motes slowing to stillness"),
        S("cosmic", "cosmic — far above, the dark canopy under mist becomes a deep charcoal field beneath a quiet star field, one faint vertical line still standing among the stars"),
      ], { sparse: true }),
      P("integration", 0.92, 1, 0.39, "integration", "2:27-2:40 the held Cm opening to Cadd9 (2:37) — acceptance", [
        S("intimate", "DARK BACKGROUND — a single vertical thread of pale gold light standing true in the lower left of vast darkness, rinsed and calm, a faint warm glow opening at its tip, the bookend of the first light"),
        S("micro", "extreme macro — the tip of the thread of light blooming into a tiny open flare of pale gold, one mote of dust resting weightless inside it"),
        S("aerial", "rising high above the dark canopy and looking straight down, one fine seam of pale gold light standing through calm night mist, everything else at rest"),
      ]),
    ],
    morphs: [
      "the camera descends through the hanging mist until smoky violet veils pass close around the thread of light",
      "the wheel of mist turns faster and the camera rises along the beam as it swells into a radiant line above a churning sea of mist",
      "the deep currents burst outward and the camera pulls back as the line of light flares into a vast pattern across the dark",
      "the gold bead dims and the camera settles close on one small smoky ember alone in the dark",
      "the star field fades and the camera drifts down to one thin thread of pale gold standing true",
    ],
  },
  {
    id: "13e71555-03d6-4b27-ad32-2c6834559c24",
    name: "Northern Plane 5",
    world: "C major pendulum between C and F in open fifths and add9 shells, no dominants at all, very low bass under wide leaps; one veiled A-minor shadow, a Lydian glow, and a bare C fifth fading — the northern plane as an immense flat dark expanse drawn in horizontal lines of light: a seam of silver, ground mist breathing in parallel bands, a pendulum of slate and wheat-gold, a passing shadow, the full Lydian seam blazing level across infinite dark, and one seam left ringing",
    phases: [
      P("threshold", 0, 0.05, 0.64, "threshold", "0:00-0:08 Open Ground (C and F laid down as open fifths)", [
        S("sparse", "DARK BACKGROUND — a single thin horizontal seam of cold silver light lying low in the lower third of vast darkness, faint and level like a held open fifth, a few pale motes resting above it, nearly the entire frame empty"),
        S("micro", "extreme macro — fine luminous threads of dry grass at closest range, each blade beaded with a tiny grain of silver glow, swaying slowly in soft darkness"),
        S("aerial", "from high above, looking straight down on an immense flat dark expanse filling the frame edge to edge, long faint bands of luminous ground mist lying across it in parallel lines, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.35, 0.73, "expansion", "0:08-0:54 Open Ground → Pendulum Breathing (0:22, Fmaj9/Fmaj13 warming)", [
        S("interior", "gliding low within the long drifts of slate-blue mist that slide over the flat dark ground, translucent veils passing close on every side, pale wheat-gold light seeping along their seams"),
        S("abstract", "abstract — two broad bands of light swinging slowly back and forth across darkness like a pendulum, one cool slate blue and one warm wheat gold, each pass leaving a wider luminous wake"),
        S("aerial", "looking straight down as wave after wave of luminous threads ripple across the flat dark expanse in slow parallel swells, the light warming to honey as it spreads, the camera gliding along"),
      ]),
      P("transcendence", 0.35, 0.47, 1, "integration", "0:54-1:13 Shadow Through A (Asus2/Am, the long quiet F5 at 1:08) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small band of slate-grey mist resting alone in the upper left of immense darkness, a faint cool glow inside it, nearly the entire frame empty"),
        S("micro", "macro — the edge of a slow shadow sliding across fine luminous threads, the gold in each thread cooling to slate as it passes, translucent and veiled"),
        S("aerial", "from directly above, a vast soft shadow drifting across the dark flat expanse like a passing veil, the bands of light beneath it dimmed to slate grey, the camera holding still as it slides away"),
      ], { sparse: true }),
      P("illumination", 0.47, 0.53, 0.42, "illumination", "1:13-1:22 Shadow Through A ends → Return, Fuller (1:17, sixths added)", [
        S("intimate", "close — the shadow lifting off the flat ground, warm amber light returning along fine parallel ripples of luminous threads, each one glowing fuller than before"),
        S("micro", "extreme macro — a single grain of warm amber light swelling on a translucent thread, its glow spreading outward in soft rings"),
        S("interior", "inside the warm haze as it rises off the ground, layered translucent gold vapor drifting past on every side, the camera rising through it"),
      ]),
      P("return", 0.53, 0.788, 0.75, "transcendence", "1:22-2:01 Return, Fuller → Lydian Glow (1:41, F6add9 / Fmaj13, the brightest voicings)", [
        S("cosmic", "cosmic — the flat expanse seen from immense height as one endless horizontal seam of silver-gold light stretches across infinite darkness, layered bands of luminous vapor above and below it shimmering pale gold, the camera rising"),
        S("micro", "macro at the height of the light — the bright seam at closest range, countless tiny particles of pale gold and silver streaming along it in one level line, blazing against the dark"),
        S("aerial", "looking straight down on broad golden light flooding evenly across the immense flat expanse edge to edge, long luminous ripples combed in parallel across it, the camera pulling back to reveal its full width"),
      ]),
      P("integration", 0.788, 1, 0.4, "integration", "2:01-2:34 Lydian F (2:03) resolving home, last swell 2:13 → Open Fifth Horizon (bare C5 fading to silence)", [
        S("cosmic", "cosmic — from far above, the last broad swell of pale gold light rolling once across the flat dark expanse and fading into deep indigo, a faint scatter of starlight overhead"),
        S("micro", "extreme macro — one last luminous thread of grass holding a single grain of fading silver light, deep blue darkness closing gently around it"),
        S("sparse", "DARK BACKGROUND — a single thin horizontal seam of dim silver light lying low in the lower right of vast darkness, the open fifth left ringing, the bookend of the first seam"),
      ]),
    ],
    morphs: [
      "the camera descends into the parallel bands of ground mist until slate-blue veils glide past on every side",
      "the pendulum of light slows and a shadow passes over, the camera settling close on one small band of slate mist alone in the dark",
      "the shadow slides away and the camera drifts down as warm amber light returns along the luminous threads",
      "the camera rises through the gold haze until the whole expanse is one endless seam of silver-gold light",
      "the flood of gold drains toward indigo and the camera keeps rising into the last broad swell",
    ],
  },
  {
    id: "8f3e82e2-0a30-499f-ba74-5158208a07a0",
    name: "Never Forget 4",
    world: "E minor remembrance in free time, relative-major warmth inside a minor frame, a radiant D6add9/Cmaj13 plateau at 1:45, then cooling, a last swell of pangs and a hollow E fifth — memory as small held lights at dusk: one tide pool glowing on dark sand, a tide of light flooding between pools, every pool glowing rose-gold at once like a galaxy, the glow receding one by one, one violet pool pulsing like an ember, and a black glassy stillness with one faint light",
    phases: [
      P("threshold", 0, 0.249, 0.79, "threshold", "0:00-0:52 Opening Remembrance (E pedal, Emadd4) → Shadowed Turn (0:42 flat-side doubt)", [
        S("sparse", "DARK BACKGROUND — one small tide pool holding a faint pewter glow in the lower right of vast darkness, its rim of wet dark sand shining softly, a few motes of pale violet light above it, nearly the entire frame empty"),
        S("micro", "extreme macro — the still surface of that pool at closest range, tiny suspended grains of light drifting beneath it, a slow ripple of slate blue crossing a mirror of luminous memory"),
        S("aerial", "from high above, looking straight down on dark tidal flats where a scatter of small pools glow faint grey-violet, a slow shadow sliding across them, the camera descending toward the brightest"),
      ]),
      P("expansion", 0.249, 0.398, 0.85, "expansion", "0:52-1:23 Toward the Fifth (F# and B pedals, B7sus4 reaching at 1:16)", [
        S("interior", "drifting inside a slow rising tide of luminous mist that floods between the pools, translucent slate and amber layers passing close on every side, glints of warm light catching where they touch"),
        S("abstract", "abstract — thin ribbons of light threading between dark pools in branching curves, slate blue warming to amber at their tips, reaching toward something just out of frame"),
        S("micro", "macro — the edge of the incoming tide of light meeting one dark pool, a thin crescent of amber light spilling over its rim, fine particles lifting from the meeting"),
      ]),
      P("transcendence", 0.398, 0.571, 1, "transcendence", "1:23-1:59 Radiant Plateau (D6add9 → Cmaj13/G held long and loud, 1:45-1:52)", [
        S("cosmic", "cosmic — seen from immense height, every pool across the dark tidal flats glowing warm rose-gold at once, hundreds of small held lights scattered like a galaxy across the dark, the camera rising through the warmth"),
        S("intimate", "close — one pool brimming with gold light so bright it overflows into the dark around it in soft luminous streams, grateful and full"),
        S("abstract", "abstract — rings of rose-gold and amber light opening outward from many centers at once, overlapping into a vast interference pattern of warmth across darkness"),
      ]),
      P("illumination", 0.571, 0.7, 0.86, "return", "1:59-2:26 Turning Inward (the light cools onto a long Bm at 2:11)", [
        S("aerial", "looking straight down as the glow recedes into the pools one by one, the dark sand between them widening, the remaining lights cooling from gold to slate, the camera slowly rising"),
        S("micro", "extreme macro — a luminous skin of liquid light filling the frame, dimming from gold to slate blue, fine ripples of glowing particles fading outward, translucent"),
        S("interior", "within the cooling twilight haze above the flats, layered veils of slate and dusky violet drifting slowly past, faint points of warmth beneath them"),
      ]),
      P("return", 0.7, 0.873, 0.8, "integration", "2:26-3:02 Last Light Lingering (Baug, Em(maj7) pangs; rocking D to F#m7, unresolved) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small pool of violet light glowing alone in the upper left of immense darkness, pulsing once like a dimming ember, nearly the entire frame empty"),
        S("micro", "extreme macro — embers of deep red and violet light pulsing beneath the dark skin of one pool, sparks rising and dimming into translucent haze"),
        S("aerial", "from high above, a few distant pools still holding the last violet light, long stretches of dark sand between them, poignant and quiet, the camera drawing slowly back"),
      ], { sparse: true }),
      P("integration", 0.873, 1, 0.37, "integration", "3:02-3:28 Open Fifth Silence (low hollow E fifth into near-silence)", [
        S("cosmic", "cosmic — the dark flats seen from immense height become deep night, the last scattered points of light like a faint star field over a black glassy expanse, still and silent"),
        S("micro", "extreme macro — a single low ripple of faint silver light spreading across a black glassy pool, widening and vanishing"),
        S("sparse", "DARK BACKGROUND — one small tide pool holding a faint glow in the lower right of vast darkness, the bookend of the first remembrance, held in stillness"),
      ]),
    ],
    morphs: [
      "the camera descends toward the brightest pool until it is drifting inside a rising tide of luminous mist",
      "the crescent of amber spills over and the camera pulls back as every pool across the flats ignites rose-gold at once",
      "the rings of warmth fade and the camera rises as the glow recedes into the pools one by one",
      "the twilight veils close and the camera settles close on one small violet pool alone in the dark",
      "the last pools dim and the camera keeps drawing back until they are a faint star field over black glass",
    ],
  },
  {
    id: "4dac5718-517d-4183-ad27-e1a6c583e305",
    name: "Tranquility 30",
    world: "C# major, 77% major, gentle I-IV sway over deep F# and C# pedals with a bittersweet D-natural rub, a radiant F# crest at 2:06, then a pedal-point lullaby and a soft unresolved C#6 — calm on the largest scale, always seen from above: endless curved terraces of still mirrors holding soft overcast light, haze shifting over them, tier after tier flooding gold at the crest like a turning spiral, dimming to pewter one tier at a time, and one curved pool keeping a single warm gleam",
    phases: [
      P("threshold", 0, 0.05, 0.55, "threshold", "0:00-0:10 Hazy Threshold (C# clouded by D natural, the home chord at 0:05)", [
        S("sparse", "DARK BACKGROUND — a single curved mirror pool holding soft grey-green light low in the lower left of vast darkness, seen from high above, its glassy edge barely lit, a faint haze lying over it, nearly the entire frame empty"),
        S("micro", "extreme macro — the glassy rim of that pool at closest range, a thin line of luminous moisture beaded with tiny grains of pale gold, haze drifting above"),
        S("aerial", "looking straight down through thinning haze as more curved mirror pools emerge in the dark below, each holding a faint reflection of soft overcast light, the camera descending"),
      ]),
      P("expansion", 0.05, 0.16, 1, "expansion", "0:10-0:34 Hazy Threshold warming (gentle I-IV sway, wistful G#m7)", [
        S("abstract", "abstract — flowing contour lines of soft green and pale gold light curving across darkness in concentric bands, each band a mirror catching luminous haze, translucent and calm"),
        S("micro", "macro — a slow ripple crossing one still mirror terrace, its crest traced in honey light, impossible stillness on either side"),
        S("aerial", "from high above, terrace after terrace of luminous still mirrors stepping down a dark hillside edge to edge, curved banks dividing them in flowing lines, the camera gliding along"),
      ]),
      P("transcendence", 0.16, 0.338, 0.98, "illumination", "0:34-1:11 Settled Home Ground (C# and C#6 rocking, F#maj9/Bmaj9 blossoms, G#m7 shadow at 1:06)", [
        S("interior", "inside a soft bank of luminous haze resting over the terraces, warm rose-amber light shifting slowly through it as shadows pass, translucent and weightless on every side"),
        S("micro", "extreme macro — the skin of one mirror pool holding a tiny drifting reflection of rose and lavender haze, a single bead of light trembling at its edge"),
        S("aerial", "looking straight down at an immense pattern of curving mirror pools filling the whole frame like a living contour map, slow shadows sliding across them so tier after tier dims and brightens"),
      ]),
      P("illumination", 0.338, 0.631, 0.75, "transcendence", "1:11-2:12 Gathering Current (C#-D rub, long G#sus4) → Radiant Crest (1:47, F# crest peaking 2:06)", [
        S("cosmic", "cosmic — from immense height the countless terraces become one vast spiral of mirrors flooding gold, honey light pouring from tier to tier like a galaxy turning, deep evening blue at its edges, the camera pulling back"),
        S("micro", "macro at the height of the light — the lip of one terrace where gold light spills over in a thin luminous veil, fine sparks scattering into the dark"),
        S("abstract", "abstract — streams of rose-amber light gathering from many curved channels into one broad shining current, threads converging and brightening across darkness"),
      ]),
      P("return", 0.631, 0.834, 0.46, "integration", "2:12-2:55 Suspended Afterglow (F#sus4 → F# at 2:31) → Pedal-Point Lullaby (2:38, rocking over F#) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curved pool of muted lavender light resting alone in the upper right of immense darkness, a few faint motes above it, nearly the entire frame empty"),
        S("micro", "extreme macro — slow concentric ripples circling outward across one dark mirror, each ring traced in faint amber, rocking gently like a lullaby"),
        S("aerial", "from directly above, the terraces dimming to pewter one tier at a time, a last thread of honey light lingering along the highest curve, the camera rising slowly"),
      ], { sparse: true }),
      P("integration", 0.834, 1, 0.55, "integration", "2:55-3:30 Pedal-Point Lullaby → Homeward Fade (plagal F#maj9/C# → C#6add9, left open)", [
        S("cosmic", "cosmic — from far above the dark hillside of pools becomes a faint field of tiny mirrors scattered across deep blue darkness like a quiet star field, one warm point of light lingering"),
        S("micro", "extreme macro — a single bead of warm light resting on the glassy rim of a dark pool, holding a tiny reflection of every terrace"),
        S("sparse", "DARK BACKGROUND — a single curved mirror pool holding one warm gleam in the lower left of vast darkness, the bookend of the first pool, at rest"),
      ]),
    ],
    morphs: [
      "the camera descends through the haze as the contour lines of light resolve into tiers of mirrors",
      "the camera glides down the terraces and into a soft bank of luminous haze resting over them",
      "the haze parts and the camera pulls back as the whole pattern of mirrors turns gold like a slow spiral",
      "the gold drains tier by tier and the camera settles close on one small lavender pool alone in the dark",
      "the camera keeps rising until the terraces are a faint field of tiny mirrors among quiet points of light",
    ],
  },
  {
    id: "6ff51cde-f4ca-4285-8707-0f77eaf9394c",
    name: "Amboise 1",
    world: "G major over a sustained G pedal, open fifths and Lydian Cmaj13/C6/9#11 glow, an E-minor drift, the only dominant at 1:38, the theme returning in full voice to a 1:56 climax and fading to a bare G fifth — warm, teeming, ever-turning: spiral eddies of a golden current, one honey curl, many interlocking turning spirals under a cool shadow, a galaxy of golden vortices at the summit, the spirals loosening into dusk, and one last curl carried home",
    phases: [
      P("threshold", 0, 0.05, 0.8, "threshold", "0:00-0:10 Opening Theme (bare G fifth blooming into GMadd9)", [
        S("sparse", "DARK BACKGROUND — a single golden eddy curling on itself in the lower right of vast darkness, its spiral edge lit like spun honey, a few warm motes turning above it, nearly the entire frame empty"),
        S("micro", "extreme macro — the spiral rim of the eddy at closest range, a thread of honey light winding inward through clear dark current, tiny glints suspended at every depth"),
        S("aerial", "from high above, looking straight down on a dark slow current where faint golden spirals begin to turn, pale mist lifting off it in soft veils, the camera descending toward the brightest"),
      ]),
      P("expansion", 0.05, 0.548, 0.96, "expansion", "0:10-1:46 Opening Theme → Relative-Minor Drift (0:35, Lydian blossoms 0:56) → Gathering Toward D (1:11, shade deepening; D7 at 1:38) → Radiant Return begins (1:41)", [
        S("interior", "riding inside the slow turning current, curved ribbons of honey and slate-blue light sweeping past on every side, soft luminous haze glowing above the surface"),
        S("abstract", "abstract — dozens of small spirals of gold light turning at different speeds across darkness, a cool slate-blue shadow drifting over some of them, interlocking curls in a slow fibonacci pattern"),
        S("aerial", "looking straight down as long braided currents of luminous amber wind between turning eddies across the frame edge to edge, deep umber shade gathering along one side, the camera gliding toward a bright opening"),
      ]),
      P("transcendence", 0.548, 0.668, 1, "transcendence", "1:46-2:09 Radiant Return (full voice, C6/9#11 climax at 1:56)", [
        S("cosmic", "cosmic — the whole current become one vast field of interlocking golden vortices seen from immense height, spirals within spirals like a galaxy of honey light, the largest whorl blazing right of frame, the camera rising through the warmth"),
        S("micro", "macro at the height of the light — the bright core of one whorl at closest range, gold and sage-green sparks spinning outward against deep umber darkness"),
        S("abstract", "abstract — luminous spiral arms of amber, cream and pale gold unfurling outward from many centers, a radiant kaleidoscopic web of curves across darkness"),
      ]),
      P("illumination", 0.668, 0.807, 0.59, "return", "2:09-2:36 Radiant Return held (long D at 2:12) → Shaded Reflection (2:17, pensive E minor)", [
        S("aerial", "looking straight down as the wide golden spirals loosen into long curved streams of warm light, slate-grey shadow cooling the dark current between them, the camera slowly pulling back"),
        S("micro", "extreme macro — a single curl of amber light unwinding on a dark mirror, its glow softening to dusky violet-grey at the tip"),
        S("interior", "within the cooling haze above the slow current, translucent veils of violet-grey drifting past, faint golden curls still turning far below"),
      ]),
      P("return", 0.807, 0.913, 0.33, "integration", "2:36-2:56 Shaded Reflection → Fading Pedal Close (2:39, thinning to near-silence) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small faint curl of amber light drifting alone in the upper left of immense darkness, slowing to stillness, nearly the entire frame empty"),
        S("micro", "extreme macro — a single trembling reflection of honey light on motionless dark current, one ring of light slowly widening"),
        S("cosmic", "cosmic — far above, the dark current becomes a faint winding band of dim light across infinite darkness, a few slow spirals glowing like distant galaxies"),
      ], { sparse: true }),
      P("integration", 0.913, 1, 0.3, "integration", "2:56-3:13 Fading Pedal Close (opening motif returns softly 2:58, open G fifth at 3:08)", [
        S("intimate", "close — a last slow spiral of honey light turning in near-dark current in the upper right, the opening motif returning softly, its glow carried gently onward and dissolving"),
        S("micro", "extreme macro — the innermost coil of that spiral at closest range, one bright grain of gold resting at its heart, translucent dusk all around"),
        S("sparse", "DARK BACKGROUND — a single golden eddy curling on itself in the lower right of vast darkness, its honey edge barely lit, the bookend of the first light, left ajar"),
      ]),
    ],
    morphs: [
      "the camera descends toward the brightest spiral until it is riding inside the turning current",
      "the camera glides toward the bright opening and rises as the eddies interlock into a galaxy of golden vortices",
      "the spiral arms loosen and the camera pulls back as they stretch into long curved streams of warm light",
      "the violet haze thickens and the camera settles close on one small amber curl alone in the dark",
      "the distant spirals fade and the camera drifts down to one last curl of honey light turning home",
    ],
  },
  {
    id: "d8705068-f8a9-4dd7-95a5-c6f1160fed22",
    name: "Roll Away 8",
    world: "Eb major (transcribed D#), short and steadily pulsed, Mixolydian Db and a Db-Ab-Eb double-plagal tide that closes every phrase by sinking home, a warm climax on Eb6 at 0:59 — the mountaintop at night, warmed: sparks spiralling up from summit rock, silver mist filling the folds of land far below, waves of honey light rolling in under a star field crossed by wishing trails, the thinning to open fifths, and a warm amber pool of light at rest",
    phases: [
      P("threshold", 0, 0.05, 0.48, "threshold", "0:00-0:05 Opening Glow (near-silence, Abmaj7/Ebmaj7 shells)", [
        S("sparse", "DARK BACKGROUND — a few warm sparks spiraling up from a single small hollow of dark summit rock in the lower left of vast darkness, honey-amber and faint, nearly the entire frame empty"),
        S("micro", "extreme macro — one spark of amber light at closest range rising through cool dark air, a faint spiral trail of glitter curling behind it"),
        S("aerial", "from high above the dark summit, looking straight down into deep folds of land far below where silver mist begins to gather and glow, the camera tipping forward into the descent"),
      ]),
      P("expansion", 0.05, 0.374, 0.52, "expansion", "0:05-0:37 Opening Glow (deep bass 0:05, Eb/G 0:09) → Rising Current (0:19, Eb7 opening the door at 0:33)", [
        S("interior", "drifting down inside the silver mist as it fills the folds below the summit, translucent layers of blue and honey light passing close on every side, small separate glints waking in the dark"),
        S("abstract", "abstract — long slopes of warm light spilling downward in slow overlapping curves, honey gold over slate blue, fine particles rolling ahead of each wave"),
        S("micro", "macro — sparks of warm light rising from the summit rock into the cool dark, each one trailing a thin wishing streak of pale blue glitter"),
      ]),
      P("transcendence", 0.374, 0.72, 0.94, "transcendence", "0:37-1:11 Plagal Tide (Dbmaj9 → Abmaj13 → Eb looping like waves; Lydian Db 0:55; climax on Eb6 at 0:59)", [
        S("cosmic", "cosmic — looking straight down from immense height on an endless sea of glowing mist, slow wishing trails of gold light crossing a deep star field mirrored across it, the whole night rolling in warm waves of light, the camera rising"),
        S("micro", "macro at the height of the light — a wishing trail of light at closest range, a stream of honey and rose sparks burning across deep blue darkness"),
        S("abstract", "abstract — broad waves of amber and peach light rolling in one after another out of the dark, a slow tidal pattern of glow repeating and swelling, kaleidoscopic and weightless"),
      ]),
      P("illumination", 0.72, 0.84, 1, "integration", "1:11-1:23 Plagal Tide thinning to open fifths (1:08, the energy rolling away) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small spark of amber light floating alone in the upper right of immense blue-black darkness, its glow softening, nearly the entire frame empty"),
        S("aerial", "looking straight down as the glowing mist far below thins to a few open bands of light, the dark folds of land showing through, the camera slowly settling"),
        S("micro", "extreme macro — a single fading streak of light dissolving into fine particles of dim gold against deep slate blue"),
      ], { sparse: true }),
      P("return", 0.84, 0.92, 1, "return", "1:23-1:31 Rolling Home (low-middle register, the Db → Ab → Eb descent)", [
        S("interior", "within the slow amber haze settling over the dark folds below, one luminous current of light winding downward and pooling, the camera gliding with it as it rolls gently downward"),
        S("abstract", "abstract — three soft arcs of light descending one after another, rose, amber and honey, each settling lower and warmer across darkness"),
        S("aerial", "from high above, the folds of land far below holding a calm pool of warm light, the dark summit rock edging the frame, the camera easing to a stop"),
      ]),
      P("integration", 0.92, 1, 1, "integration", "1:31-1:39 Rolling Home (comes to rest on a 2.5-second Eb at 1:35, earned and grateful)", [
        S("intimate", "DARK BACKGROUND — a single still pool of warm amber light resting in the lower left of vast darkness far below the dark summit, one thin wishing trail of gold fading above it, settled and grateful"),
        S("cosmic", "cosmic — far above, a last thin trail of gold light drifting across a quiet star field, the warm glow of the land resting far below"),
        S("micro", "extreme macro — one last spark of honey light settling onto dark summit rock, its glow resting, translucent and warm"),
      ]),
    ],
    morphs: [
      "the camera tips forward from the summit and descends into the silver mist filling the folds below",
      "the sparks rise and the camera rises with them until the night opens into waves of light under a field of wishing trails",
      "the waves roll away and the camera settles close on one small spark of amber alone in the dark",
      "the fading streak becomes a current of warm light and the camera glides down with it as it rolls home",
      "the arcs of light settle and the camera eases to rest on a still pool of amber far below the summit",
    ],
  },
  {
    id: "6251d682-b5e4-46b6-98cf-ceb6b609a7bc",
    name: "Surrounded by Light 6",
    world: "Eb major cycling vi7-IVmaj9-I/5-Vsus with 9ths, 11ths and suspensions, gathering warmth to a radiant plateau (3.5-second Eb at 1:37), then a pale chromatic halo and a rootless Gm7 glow — surrounded by light in deep luminous teal: one golden mote in a hair-thin ray, shafts multiplying, a complete ring of converging rays blazing at the crest, the light exhaling to silver, one distant ray in the dark, and soft beams re-converging around a calm small glow",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:09 First Glow (Cm7 - Abmaj9 - Eb/Bb - Bbsus4, testing the air)", [
        S("sparse", "DARK BACKGROUND — a single golden mote of light suspended inside one hair-thin ray falling through deep teal depths in the upper right, everything beyond it vast unlit darkness, nearly the entire frame empty"),
        S("micro", "extreme macro — the golden mote at closest range, a tiny sphere of warm light ringed with fine prismatic glitter, slow luminous particles drifting past it through teal darkness"),
        S("aerial", "looking straight down through the deep teal depths at faint shafts of white-gold light descending into darkness far below, the camera beginning to sink with them"),
      ]),
      P("expansion", 0.05, 0.492, 0.63, "expansion", "0:09-1:26 First Glow → Gathering Warmth (Abmaj13 bloom 0:40, G7/F longing 0:52) → Open Radiance (0:58, deep Eb pedal 1:19)", [
        S("interior", "inside a deep luminous teal haze, long diagonal rays of white-gold light crossing the frame from the upper left, motes rising along them like sparks, the lower right still dark and open, the camera drifting through"),
        S("abstract", "abstract — broad slow rays of honey gold and rose-peach light sweeping across darkness in wide arcs, crossing and parting like a slow breath, fine particles caught in each"),
        S("micro", "macro — luminous motes gathering around the edge of one shaft of light, each a small bead of gold trailing a faint wake, the beam thickening with warmth"),
      ]),
      P("transcendence", 0.492, 0.695, 1, "transcendence", "1:26-2:02 Crest of Light (G7#9b13 coil 1:26, summit 1:32, 3.5-second Eb at 1:37, C7#9 colour 1:48)", [
        S("cosmic", "cosmic — fully surrounded, a vast ring of converging rays seen at a steep angle as a glowing tilted ellipse across infinite darkness, white-gold blaze along its near edge, dense galaxies of lit motes wheeling along it"),
        S("micro", "macro at the height of the light — the meeting point of the beams at closest range, countless sparks of white-gold and honey scattering into teal darkness, glare softened into glitter"),
        S("aerial", "looking straight down into a vast luminous spiral of light, curved arms of honey and teal rays sweeping inward toward a blazing gold core in the lower left, the camera plunging into the radiance"),
      ]),
      P("illumination", 0.695, 0.755, 0.3, "illumination", "2:02-2:12 Crest exhales (F11 onto a long Eb/Bb) → Thinning Halo begins (2:07)", [
        S("abstract", "abstract — slow currents of golden light curving around the view in long luminous ribbons, then thinning to silver, the warmth beginning to exhale"),
        S("intimate", "close — the rays thinning to pale silver threads, a faint halo of refracted light hanging in the teal haze, translucent and cool"),
        S("micro", "extreme macro — a cluster of luminous motes loosening apart, each glowing silver at its edge, drifting slowly into the dark"),
      ]),
      P("return", 0.755, 0.89, 0.3, "integration", "2:12-2:36 Thinning Halo (Ab augmented, bright C major refracted; quietest 2:30) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small faint ray of pale silver light far off in the upper left of vast dark teal depths, a few sparse motes drifting in the emptiness, nearly the entire frame empty"),
        S("cosmic", "cosmic — a thin halo of silver light hanging in infinite darkness, cool and veiled, a scatter of pale motes drifting below it"),
        S("micro", "extreme macro — a single mote of light dimming from silver to amber, faint glitter around it in the cool dark"),
      ], { sparse: true }),
      P("integration", 0.89, 1, 0.3, "integration", "2:36-2:55 Embers at Rest (low Eb6, Ab/C; ends on a rootless Gm7, the glow lingering)", [
        S("interior", "within the deep teal depths, soft wide beams of warm amber light gently re-converging on every side around one calm small glow, held in radiance, at rest"),
        S("sparse", "DARK BACKGROUND — a single golden mote resting in one thin ray of light in the lower left of vast teal darkness, the bookend of the first glow, lingering"),
        S("micro", "extreme macro — the last embers of amber light glowing faintly inside a slow drifting mote, translucent and warm"),
      ]),
    ],
    morphs: [
      "the camera sinks with the shafts of light until it is descending inside the luminous teal as the beams multiply",
      "the beams thicken and the camera pushes in as rays converge from every direction into a complete ring of light",
      "the camera plunges into the radiance and emerges as the light curves away in long golden ribbons",
      "the silver threads thin out and the camera settles on one small distant ray alone in the dark",
      "the cooling mote warms and the camera drifts toward it as soft beams re-converge on every side",
    ],
  },
];
