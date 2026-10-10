// Rise Above — Journey Archetype shot lists, part B (2026-10-09): the three
// built-in featured journeys in Karel's Rise Above loop — The Summit
// (the-ascent, Folsom St 5), Cosmic Drift (17th St 61), Mycelium Dream
// (Folsom St 8). Same format as expansion-sample.mjs / welcome-home-title.mjs
// (no shaders/opacity — added at cast time).
//
// Phase ids/bounds/intensities are the built-ins' current ones; `music`
// names the deep-analysis sections each phase holds. Each keeps its
// built-in identity (ridge + rivers of cloud / amber shards + golden dust /
// bioluminescent network) transfigured per law L, steered by Karel's Rise
// Above notes: Summit "a classical, moving piece"; Cosmic Drift "soulful
// solo-piano ambient — the exhale after the peak"; Mycelium Dream "spacey,
// far out there, visionary".
// Sparse valleys: Summit = the 2:20 hush / descending-bass retelling;
// Cosmic Drift = the 1:11 Subdominant Pause (held C fifths); Mycelium Dream =
// Long Breaths 1:42-2:43 (C5/Csus2 held up to 6 s — "answers with stillness").

export const SET = { key: "rise-above-B", presenting: "Rise Above" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "the-ascent",
    name: "The Summit",
    world: "D minor, slow rubato over a tonic pedal, bare open fifths and a returning Bbmaj7#11 lift, an ache that never cadences hard; Karel: 'a classical, moving piece' — the infinite ridge climbed through luminous cloud: one silver seam of light on dark rock, rivers of lit mist pouring through the saddle, the pedal-point surge as a sea of cloud heaving under the ridge, the 1:57 Lydian bloom flaring white-gold, the hush at 2:20, the cloud sinking back, and the ridge left holding a seam of pale dawn gold",
    phases: [
      P("threshold", 0, 0.158, 0.62, "threshold", "0:00-0:32 Open-Fifth Awakening (a bare D fifth, a question asked into silence; the Bbmaj7#11 lift at 0:15)", [
        S("sparse", "DARK BACKGROUND — a single thin seam of cold silver light resting along the crest of a dark rock ridge in the lower right of vast darkness, a faint veil of luminous mist breathing over its edge, nearly the entire frame empty"),
        S("micro", "extreme macro — fine mist spilling over the edge of dark rock at closest range, countless suspended droplets glowing silver and faint amber, drifting at different depths, translucent and weightless"),
        S("aerial", "from high above, looking straight down on a long ridge of black rock dividing two pools of luminous mist, one pale glow slowly widening beneath the cloud on the left, the camera beginning to descend toward the crest"),
      ]),
      P("expansion", 0.158, 0.465, 0.9, "expansion", "0:32-1:34 Full-Pedal Current (turn to F 0:44, first A7 0:51 cushioned onto Dsus2) → Leaning Half-Steps (Bbmaj7 rocking against A/Bb, a repeated sigh)", [
        S("interior", "gliding inside a slow river of luminous cloud as it pours through a dark saddle between ridges, deep teal and silver billows of light folding over one another on every side, a faint amber sheen rising through them"),
        S("abstract", "abstract — two broad bands of slate-blue and amber light rocking against each other across black in a slow repeating sigh, their edges dissolving into fine particles, wide dark space in the upper half"),
        S("micro", "macro — a fine rime of light coating dark rock at the crest, one trembling patch of reflected silver rippling across it and resettling again and again, deep shadow filling the left side"),
      ]),
      P("transcendence", 0.465, 0.569, 1, "transcendence", "1:34-1:55 Pedal-Point Surge (everything gathers onto the D pedal, the A–Bb half-step churning beneath, then a long exhaled fifth)", [
        S("cosmic", "cosmic — an immense sea of luminous cloud heaving in slow swells beneath a long black ridge, seen from far above, cold silver and smoky violet light rolling across its surface like a galaxy turning, the camera rising through the dark"),
        S("micro", "macro at the height of the surge — the crest of one swell of glowing mist breaking over dark rock in a spray of silver particles, blazing against deep darkness in the right third"),
        S("aerial", "looking straight down on the dark ridge as luminous cloud surges against it from both sides, long plumes of lit mist torn upward from the crest and dissolving, the camera pulling back"),
      ]),
      P("illumination", 0.569, 0.673, 0.96, "illumination", "1:55-2:16 Lydian Crest, Dominant Ache (Fmaj9#11 bloom at 1:57 → Dm13 → an A7b9 left hanging)", [
        S("abstract", "abstract — a sudden bloom of white-gold light unfolding across the dark in wide radiant fans, layers of pale gold and rose light opening one inside the next, kaleidoscopic and weightless, filling the upper left"),
        S("aerial", "from high above, the whole sea of cloud glowing white-gold from within for one long moment, luminous and impossibly still, the black ridge cutting a diagonal through the radiance, the light already dimming at the far edges"),
        S("intimate", "a single faint amber point of light pulsing low in the lower right where the bloom has withdrawn, luminous mist closing softly around it, the ache left hanging in the dark"),
      ]),
      P("return", 0.673, 0.886, 0.69, "integration", "2:16-2:59 the hush at 2:20 → Descending Bass, Rising Light (the opening retold from higher up, melody to G6) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small wisp of pale blue lit mist suspended alone in the upper left of immense darkness, a few fine motes drifting upward from it, nearly the entire frame empty"),
        S("aerial", "rising slowly while looking straight down as the luminous cloud sinks back between the dark ridges, its surface softening to blue-grey, pale gold catching the high crests one by one"),
        S("micro", "extreme macro — a single droplet of pale gold light clinging to the edge of dark rock at closest range, holding a tiny upside-down reflection of the whole ridge above the cloud"),
      ], { sparse: true }),
      P("integration", 0.886, 1, 0.37, "integration", "2:59-3:22 Dissolving Major Ninth (D major add9 sliding back to Dsus2 — open-ended consolation)", [
        S("cosmic", "cosmic — from immense height the ridge becomes a faint silver line across deep blue darkness, a thin band of rose light lying along it, a quiet star field opening all around, still and unresolved"),
        S("micro", "extreme macro — the last veil of mist on dark rock at closest range turning pale dawn gold, translucent droplets dissolving into the dark one by one"),
        S("sparse", "DARK BACKGROUND — a single thin seam of pale gold light resting along the crest of a dark ridge in the lower right of vast darkness, the bookend of the first silver seam, left open"),
      ]),
    ],
    morphs: [
      "the camera descends to the crest and slips into the river of luminous cloud pouring through the saddle",
      "the rippling rime of light flares and the camera rises far above as the cloud sea heaves in slow swells",
      "the plumes torn off the crest catch fire and the camera is swept up into a bloom of white-gold light",
      "the amber point fades and the camera settles close on one small wisp of pale blue mist alone in the dark",
      "the gold droplet's reflection widens and the camera keeps rising until the ridge is a faint silver line among the stars",
    ],
  },
  {
    id: "cosmic-drift",
    name: "Cosmic Drift",
    world: "G major, slow rubato in the plagal orbit between G and C with Lydian shimmer over a G pedal, warm settled nostalgia that clouds once into suspended E-minor longing before its only V–I homecoming; Karel: 'soulful solo-piano ambient — the exhale after the peak' — a slow drift between the stars: one amber shard breathing golden dust, the dust gathering into warm currents, a held breath of near-empty space at the C-chord pause, a long Lydian river of honey light carrying the shards, slate-blue nebula veils at the longing, and one ember of gold left glowing in the dark",
    phases: [
      P("threshold", 0, 0.167, 0.53, "threshold", "0:00-0:47 Opening Reverie (Gadd9 ↔ Cmaj7 sway over a G pedal, drifting into an open Am11)", [
        S("sparse", "DARK BACKGROUND — a single small jagged shard of dark stone drifting in the lower left of deep space, its broken edge lit warm amber, a faint breath of golden dust lifting off it, nearly the entire frame empty"),
        S("micro", "extreme macro — the rough broken surface of the shard at closest range, warm amber light grazing every ridge, fine motes of golden dust lifting off it and hanging weightless in the beam"),
        S("cosmic", "cosmic — from far away, a loose scatter of small amber shards drifting slowly through a vast star field, a faint warm haze of golden dust trailing between them, the camera gliding toward them"),
      ]),
      P("expansion", 0.167, 0.252, 0.87, "expansion", "0:47-1:11 Settled Warmth (G6/9 and Lydian C13#11 glowing at a steady mf — the memory comes into focus)", [
        S("interior", "drifting inside a warm luminous cloud of golden dust, shards of dark stone passing slowly close on every side, their broken edges glowing honey and amber, the light pooling and spreading between them"),
        S("abstract", "abstract — slow currents of golden dust flowing in long curving bands across black, pooling into soft spirals of honey light, wide dark space below"),
        S("micro", "macro — golden dust settling across the broken surface of one shard in fine luminous drifts, faint sage-green glints in its hollows, impossible stillness"),
      ]),
      P("transcendence", 0.252, 0.348, 0.43, "integration", "1:11-1:38 Subdominant Pause (C and bare C fifths held for seconds — a held breath) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of golden dust suspended alone in the upper right of immense dark space, a few fine motes drifting away from it, nearly the entire frame empty"),
        S("cosmic", "cosmic — one slow ring of pale gold light widening across the infinite void in the lower left, fading as it spreads, the dark around it perfectly still"),
        S("micro", "extreme macro — one mote of golden dust at closest range, glowing softly and hanging motionless in the dark, a tiny warm spark held at its heart"),
      ], { sparse: true }),
      P("illumination", 0.348, 0.748, 0.94, "illumination", "1:38-3:31 Rising Lydian Light (climbs to D6 on Cmaj9#11) → Pedal-Point Pulse (rocking G-pedal ostinato) → Lydian Crest (2:43, Cmaj13/E blooms, G held 5.5 s at 3:09)", [
        S("cosmic", "cosmic — an immense slow river of honey-gold dust flowing diagonally across deep space, countless small amber shards carried within it, light rising and widening along its length, the densest glow left of centre, the camera gliding with it"),
        S("micro", "macro — the leading edge of one shard blazing with warm light at closest range, golden dust streaming off it in fine luminous threads, deep dark filling the right side"),
        S("abstract", "abstract — gentle swells of amber and honey light rocking in slow repeating waves across black, each swell reaching a little further than the last, the long golden glow held motionless at the crest"),
      ]),
      P("return", 0.748, 0.848, 1, "transcendence", "3:31-3:59 Suspended Longing (D/C → Em7add11, E7sus4 — the loudest, most suspended passage)", [
        S("cosmic", "cosmic — vast slate-blue veils of nebula rolling across the golden river of dust, shafts of warm light breaking through the gaps and closing again, infinite darkness beyond, the camera rising through"),
        S("micro", "macro — one shard caught in the passing slate-blue veil, its amber surface dimming and flaring as the shadow moves over it, fine dust glittering along its broken edge"),
        S("aerial", "from high above, the whole river of golden dust half-veiled in drifting blue-grey haze, long luminous bands of light and shadow trading across it, the camera pulling back"),
      ]),
      P("integration", 0.848, 1, 0.37, "integration", "3:59-4:42 Homecoming Coda (the opening sway returns; the only V–I, D7 → Gadd9 at 4:23; open fifths dissolving)", [
        S("cosmic", "cosmic — from immense distance the river of dust thinning to a faint thread of gold across a quiet star field, a few small shards drifting away into the deep dark, at peace"),
        S("micro", "extreme macro — a last ember of gold light glowing in the hollow of one dark shard, fine motes lifting off it and dissolving into the dark"),
        S("sparse", "DARK BACKGROUND — a single small ember of warm gold light drifting in the lower left of vast dark space, the bookend of the first amber shard, slowly softening"),
      ]),
    ],
    morphs: [
      "the camera glides in among the drifting shards until it is inside a warm cloud of golden dust",
      "the dust settles and the camera pulls back until one small curl of gold hangs alone in the dark",
      "the mote's spark brightens and the camera is drawn into an immense river of honey-gold dust",
      "the rocking swells darken and the camera rises as slate-blue veils of nebula roll across the river",
      "the veils thin and the camera keeps pulling back until the river is a faint thread of gold among the stars",
    ],
  },
  {
    id: "mycelium-dream",
    name: "Mycelium Dream",
    world: "C major, free-time devotion around one gesture (a bare C fifth reaching to a D-minor colour over a low C pedal and home again), warmth that deepens and darkens as it grows, no dominant sevenths, cadences through suspensions; Karel: 'spacey, far out there, visionary' — a mycelial cosmos: one bioluminescent spore on black, threads of light reaching node to node, a radiant gill geometry under a passing shadow, the long breaths as one pulsing node alone, a network sweeping out to galactic scale that blazes ember-orange at the 5:42 open fifth, and a single seed of light indistinguishable from a first star",
    phases: [
      P("threshold", 0, 0.101, 0.37, "threshold", "0:00-0:39 Open Fifth Dawn (the home chord sounded almost as an object, a first step to F)", [
        S("sparse", "DARK BACKGROUND — a single small bioluminescent spore glowing soft green-gold in the lower right of vast brown-black darkness, a faint warm glow breathing around it, nearly the entire frame empty"),
        S("cosmic", "cosmic — a scatter of green-gold points of light spiraling slowly upward through an infinite dark void like the first stars forming, each one pulsing at its own pace, the camera drifting toward them"),
        S("micro", "extreme macro — one translucent mushroom cap at closest range, cyan and amber light glowing through its flesh from within, a single spore lifting off its gill edge lit gold, luminous against the dark"),
      ]),
      P("expansion", 0.101, 0.197, 0.49, "expansion", "0:39-1:16 Pedal Takes Root (the C–Dm tug named, melody at its highest, D7sus4 → Cadd9 at 1:12)", [
        S("interior", "inside the dark earth beneath the glowing caps, countless pale threads of light reaching downward through brown-black depth, green-gold pulses travelling along them as they take root, the camera descending"),
        S("micro", "microscopic — two glowing mycelial threads reaching across a dark gap toward each other, green-gold light pulsing along them as the connection closes, fine motes glinting around the meeting"),
        S("aerial", "looking straight down on a dark ground netted with faint green-gold veins of light spreading outward from one bright point in the upper left, luminous and fractal, the web widening across the frame"),
      ]),
      P("transcendence", 0.197, 0.265, 0.64, "expansion", "1:16-1:42 Shadow of the Second (slower, heavier Dm7add11 clusters and C/E shadings, a Gsus4 left hanging)", [
        S("abstract", "abstract — the gill geometry of one enormous mushroom cap seen from below, radiating blades of gold-green light fanning from an off-centre point in the upper left, a slow umber shadow sliding across them, prismatic motes drifting through the spokes"),
        S("micro", "macro — one water droplet hanging from a gill ridge at closest range, the whole radiating gill structure curved inside it upside down, a prism-spark of amber burning at its heart"),
        S("cosmic", "cosmic — dark umber clouds of dust drifting slowly across a glowing green-gold nebula, shadows passing over its light and lifting again, infinite darkness beyond, the camera passing through"),
      ]),
      P("illumination", 0.265, 0.423, 0.78, "integration", "1:42-2:43 Long Breaths (C5 and Csus2 held for up to 6 s — choosing to stay with home) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small node of green-gold light pulsing slowly alone in the upper left of immense brown-black darkness, a few faint motes drifting around it, nearly the entire frame empty"),
        S("aerial", "from high above, a calm sheet of deep amber light lying across the dark ground, slow concentric ripples spreading outward from one point and fading, luminous and impossibly still, the camera hovering"),
        S("micro", "extreme macro — a single bead of amber light resting at the tip of one fine mycelial thread at closest range, breathing slowly brighter and dimmer, darkness close around it"),
      ], { sparse: true }),
      P("return", 0.423, 0.896, 0.91, "transcendence", "2:43-5:45 Deepening Ground → Suspended Ascent → Sus Cadence Returns (the Fsus2–Gsus4–C/G refrain) → Gathering Tide → Summit in C (the open C5 at 5:42, ember orange)", [
        S("cosmic", "cosmic — a vast bioluminescent network sweeping across an infinite brown-black void, millions of green-gold points joined by hair-thin threads of light like galaxies, ember-orange pulses racing between the nodes, the densest cluster blazing in the lower right, the camera pulling back to reveal it all"),
        S("interior", "flying inside one glowing thread of the network, node-lights flaring past, amber signal-pulses overtaking and racing ahead, branches of light curving away into deep umber dark on every side"),
        S("aerial", "from very high above, the network spread across the whole dark ground filling the frame edge to edge, green-gold veins netting it, slow tides of ember-orange light rolling across it wave after wave, luminous and fractal"),
      ]),
      P("integration", 0.896, 1, 0.74, "integration", "5:45-6:25 Homeward Fifth (the D-minor sigh recalled, D7sus4 → C6add9, the bare fifth that opened the piece)", [
        S("abstract", "abstract — the network slowly drawing inward, threads of green-gold light folding toward one point in long fractal spirals, the ember glow cooling to blue-black at the edges"),
        S("micro", "extreme macro — the single bright node at closest range, a seed of condensed green-gold light with the memory of its threads still flickering faint at its rim, darkness pressing close"),
        S("sparse", "DARK BACKGROUND — a single green-gold point of light alone in the lower right of brown-black immensity, indistinguishable from a first star or a last seed, the bookend of the first light"),
      ]),
    ],
    morphs: [
      "the camera descends past the glowing cap into the dark earth, following the threads of light as they take root",
      "the green-gold web widens and the camera tilts up beneath one enormous radiating gill geometry",
      "the umber shadow passes and the camera settles close on one small node of light pulsing alone in the dark",
      "the amber bead brightens and the camera pulls back as the network sweeps out to galactic scale",
      "the ember-orange tides cool and the camera follows the threads as they fold inward toward one point",
    ],
  },
];
