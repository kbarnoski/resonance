// Expansion — Journey Archetype shot lists, batch 1 (2026-10-09): Tranquility 8,
// Surrounded by Light 19, Night Wind 2, Loire 2, Torraine 6, Bells 1,
// Chenin 3, The Other Side 10. Modelled on the Karel-approved
// expansion-sample.mjs (same format, minus shaders/opacity).
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones (the
//    v2 measured arcs from the 2026-10-05 re-theme); `music` names the
//    deep-analysis sections each phase holds.
//  - Each journey keeps its analysis-derived world (theme.worldRationale)
//    and palette, TRANSFIGURED (made of light, particles, impossible
//    stillness) per law 10a; one sparse phase at the music's real valley.

export const SET = { key: "expansion-batch-1", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "0b4eb01a-9ac7-4a04-8877-05f905b14f8b",
    name: "Tranquility 8",
    world: "C# major free-time arch with one recurring ache (the borrowed b6 sighing onto G#), a crest of glow rather than force on F# at 1:51, then a rocking F# floor ending on an open fifth — lavender mist breathing through a close stand of tall still reeds at night: one dew-beaded reed tip, the mist kindling from within to a gold summit glow, cooling to blue shadow, rocking gently over a mirror of still water, and left open as one beaded tip of light",
    phases: [
      P("threshold", 0, 0.089, 0.3, "threshold", "0:00-0:20 Crunch at Dawn (quietest 0:06, a hushed question over G#)", [
        S("sparse", "DARK BACKGROUND — a single slender reed tip bowed low in the lower right of vast darkness, one bead of moisture at its end holding a tiny point of lavender light, a faint breath of mist curling past it, nearly the entire frame empty"),
        S("micro", "extreme macro — that bead of moisture at closest range, a whole luminous lavender world held inside the translucent sphere, fine motes of pale gold drifting within it, the dark edge of the reed falling away into soft darkness"),
        S("aerial", "looking straight down on thousands of dark reed tips standing perfectly still, a thin veil of luminous lavender mist lying across them like breath, the camera slowly descending toward one faint glow among them"),
      ]),
      P("expansion", 0.089, 0.328, 0.3, "expansion", "0:20-1:12 Crunch at Dawn → Gathering Warmth (C# arrives 0:38, the b6 sigh) → Home Key Blooming", [
        S("interior", "drifting inside the slow lavender mist as it gathers between tall dark reed stems, soft veils of light passing close on every side, a first warm amber glow kindling deep within the haze"),
        S("aerial", "from high above, long bands of warm gold light widening slowly across a deep layer of luminous lavender mist that fills the frame edge to edge, the dark reed tips piercing it like fine brushstrokes, the camera gliding with the light"),
        S("micro", "macro — dew beads strung along one dark reed blade like a row of tiny embers, each bead glowing honey gold on its lit side and lavender on its shadow side, impossible stillness between them"),
      ]),
      P("transcendence", 0.328, 0.494, 1, "transcendence", "1:12-1:49 Home Key Blooming → Golden Summit (minor iv turns major IV at 1:48)", [
        S("cosmic", "cosmic — the mist blooming into a vast slow nebula of rose-honey and gold light rising above the dark reed tips, its luminous arms unfolding across infinite darkness, a glow of warmth rather than force, the camera rising through it"),
        S("micro", "extreme macro at the height of the glow — one reed tip ablaze with light, a cluster of dew beads on it burning gold and rose, fine sparks of mist streaming off them into the dark air"),
        S("abstract", "abstract — tall reed stems become fine vertical strokes of gold light in a slow kaleidoscopic pattern, lavender mist folding between them, the whole frame tilting gently toward the upper right as the light peaks"),
      ]),
      P("illumination", 0.494, 0.571, 0.56, "illumination", "1:49-2:05 the 1:51 crest on F# → Shadowed Descent begins (1:56)", [
        S("aerial", "looking straight down from great height as the gold glow crests over the stand of reeds and begins to slide away, long blue shadows drawing across the luminous mist in slow diagonal bands"),
        S("intimate", "close — one tall reed stem leaning slowly in cooling air, the last gold light running down its length like liquid, lavender shadow rising from below, translucent and weightless"),
        S("abstract", "abstract — the gold and blue light separating into two slow spiral currents of mist, one warm and one cool, drifting apart across darkness"),
      ]),
      P("return", 0.571, 0.807, 0.3, "integration", "2:05-2:57 Shadowed Descent (C# minor shade 2:18) → Subdominant Haven (the F# floor) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small curl of cool lavender mist hanging alone in the upper left of immense blue-black darkness, a few fine motes drifting from it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single bead of moisture trembling at the tip of a dark reed in slow rocking motion, its surface holding a tiny sliding reflection of blue and lavender light"),
        S("interior", "within the still haven of mist, slow even swells of pearl-lavender light rolling gently between dark reed stems and back again, rocking like breath, the camera swaying with them"),
      ], { sparse: true }),
      P("integration", 0.807, 1, 0.3, "integration", "2:57-3:40 Lydian Swell (the 3:00 shimmer) → Rocking to Rest (a bare C# fifth, home but open)", [
        S("aerial", "from high above, a mirror of still dark water among the reeds catching a lydian shimmer of silver light in luminous moving patches, a faint breeze crossing it, the camera slowly pulling back"),
        S("cosmic", "cosmic — from immense height the stand of reeds becomes a faint lavender haze across infinite darkness, one steady glow at its heart like a quiet star, home but open to the air"),
        S("sparse", "DARK BACKGROUND — a single slender reed tip bowed in the lower right of vast darkness, one bead of warm gold light resting at its end, the bookend of the first light, left open"),
      ]),
    ],
    morphs: [
      "the camera descends toward the faint glow among the reed tips until it is drifting inside the gathering lavender mist",
      "the embers of dew flare and the camera rises out of the reeds as the mist blooms into a vast slow nebula of gold",
      "the strokes of gold light lean away and the camera pulls up to look straight down as the glow crests and slides off the reeds",
      "the two currents of mist drift apart and the camera settles close on one small curl of lavender mist alone in the dark",
      "the swells of pearl light ease and the camera rises to look down on a still mirror of water shimmering among the reeds",
    ],
  },
  {
    id: "21448504-ec00-48c3-8b0a-c92da2cf216a",
    name: "Surrounded by Light 19",
    world: "Eb major (written D#), warm add9 light always tugged by C minor, lyric 'surrounded by light ... you gave me pain' — an embrace with an ache in it: drops of light falling into a dark forest pool, rings of gold and pale teal widening around a still centre, swelling into a vast mandala of light at the 1:56 crest, letting go into lavender afterglow, and closing on one steady ring around the still centre",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:10 Dawning Pedal (soft open fifths, low)", [
        S("sparse", "DARK BACKGROUND — a single drop of light striking a black pool in the lower left of vast darkness, one thin ring of warm gold spreading from it, nearly the entire frame empty"),
        S("micro", "extreme macro — the drop at the instant of impact, a tiny crown of luminous gold and pale teal beads lifting from the black surface, each bead holding a point of light"),
        S("aerial", "looking straight down on the dark pool as a second and third drop fall, overlapping rings of soft gold light spreading across the black mirror, deep shadow at the edges of the frame, the camera drifting lower"),
      ]),
      P("expansion", 0.05, 0.361, 0.35, "expansion", "0:10-1:12 Dawning Pedal → Low Murmured Reply (shadows pooling, the pull of C minor) → Gathering Current", [
        S("interior", "beneath the surface of the pool, looking up through translucent dark water as rings of gold light spread above, slow motes of light sinking past on every side"),
        S("abstract", "abstract — dozens of concentric rings of gold and pale teal light interlocking across darkness in a slow interference pattern, a cool violet shadow lying across them like a held breath, the camera drifting toward their shared centre"),
        S("micro", "macro — dew-bright beads of light trembling along the rim of one dark leaf floating on the pool, their glow spilling outward in slow luminous gold ripples"),
      ]),
      P("transcendence", 0.361, 0.594, 1, "transcendence", "1:12-1:59 Gathering Current → Radiant Fullness (the open-hearted crest 1:25-1:56)", [
        S("cosmic", "cosmic — the pool becomes a vast shimmering mandala of light seen from far above, countless interlocking rings of gold and ivory spreading across infinite darkness like a galaxy breathing, a still dark centre held at its heart, surrounded by light"),
        S("interior", "inside a slow falling curtain of luminous drops, each one a bead of warm gold light streaking past the camera, rings of light blooming below in every direction"),
        S("aerial", "from directly above at the height of the light, the whole dark pool alive with honey and amber rings, its dark rim dissolving into a glowing haze, the camera pulling back to reveal the embrace"),
      ]),
      P("illumination", 0.594, 0.654, 0.41, "return", "1:59-2:10 Last Crest, Release (a wave of light breaking and spilling into a hush)", [
        S("abstract", "abstract — a last wave of gold light breaking across the rings and spilling away in long soft spirals, dusky rose and lavender seeping in behind it"),
        S("intimate", "close — broad soft rings drifting slowly across the dark pool, their gold fading to rose at the edges, the drops slowing to one every few breaths, translucent and calm, the camera settling lower toward the surface"),
        S("micro", "extreme macro — the last falling drop of light suspended above the black surface, a tiny luminous reflection of the whole mandala held inside it"),
      ]),
      P("return", 0.654, 0.844, 0.39, "integration", "2:10-2:49 Last Crest, Release → Gentle Afterglow (the intimate hush, 2:05-2:35) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small luminous ring of lavender-gold light resting alone on black water in the upper right of immense darkness, faintly widening, nearly the entire frame empty"),
        S("aerial", "looking straight down on calm dark water veiled in a soft lavender-gold haze, ripples barely moving, a few dim rings of light dissolving slowly at its edges"),
        S("micro", "macro — slow beads of afterglow gathering along the edge of a dark floating leaf, rose and amber points of light swelling as the second rise begins, the camera pushing in toward the brightest one"),
      ], { sparse: true }),
      P("integration", 0.844, 1, 0.55, "integration", "2:49-3:20 Homeward Glow (the echo swell 2:45-3:05, settling on a bare Eb fifth)", [
        S("cosmic", "cosmic — from immense height the dark pool becomes one ring of amber light circling a still centre in deep blue darkness, a quiet star field scattered around it, the embrace held"),
        S("interior", "inside the last soft echo of light, a slow ring of amber and deep blue glow passing gently through the camera and widening into the dark"),
        S("sparse", "DARK BACKGROUND — a single drop of warm gold light resting on the still black pool in the lower left of vast darkness, one steady ring around it, the bookend of the first drop"),
      ]),
    ],
    morphs: [
      "the camera sinks toward the black mirror and passes beneath the surface, looking up as rings of gold spread overhead",
      "the leaf's ripples widen and the camera rises far above as the whole pool becomes a vast mandala of interlocking rings",
      "the camera pulls back from the glowing pool as a last wave of gold breaks across the rings and spills away in spirals",
      "the suspended drop falls and the camera settles close on one small ring of lavender-gold light alone in the dark",
      "the afterglow beads brighten and the camera rises until the pool is one ring of amber light among the stars",
    ],
  },
  {
    id: "4cd35ec2-bc13-4b9a-b26c-9e38e956fb80",
    name: "Night Wind 2",
    world: "C# major, slow plagal suspensions at a 68 BPM breath, wind as a breath not a gale — a night of tall seed-heads lit silver at the edges: one bending seed-head, inward circling currents of air, sweeping silver bands, seed-fluff lifting, the fervent plateau at 1:57 as the whole land rolling in long luminous waves under a rising drift of seed-light, and a high, weightless, unresolved coda of one seed alone in starlight",
    phases: [
      P("threshold", 0, 0.239, 0.63, "threshold", "0:00-0:50 Night Opens → Inward Circling (wind in slow circles, the frame closing inward)", [
        S("sparse", "DARK BACKGROUND — a single tall luminous seed-head bending in a warm night breeze in the lower right of vast darkness, its fine hairs edged in silver light, a faint amber glow far behind it, nearly the entire frame empty"),
        S("micro", "extreme macro — the fine hairs of one seed-head at closest range, each hair a translucent thread of silver light trembling in moving air, warm amber points glowing between them"),
        S("abstract", "abstract — slow circling currents of night air made visible as faint silver spirals of drifting particles, turning inward over dark ground and fading, the camera drifting into their centre"),
      ]),
      P("expansion", 0.239, 0.372, 0.73, "expansion", "0:50-1:18 Brightening Gusts (silver bands sweep in as the veil parts)", [
        S("aerial", "from high above, pale silver bands of light sweeping slowly across dark rolling ground covered in tall seed-heads, each band bending the stems as it passes in a long luminous curve, the camera gliding along with the wind"),
        S("intimate", "close — a dense stand of seed-heads leaning together in one gust, their tips lit silver in sequence like a wave of sparks running through them"),
        S("micro", "macro — one cool bead of night dew clinging to a bent stem, a sweeping band of silver light passing through it and splitting into prismatic threads"),
      ]),
      P("transcendence", 0.372, 0.558, 0.75, "illumination", "1:18-1:57 Gathering Current (the deep rhythmic sway, leaning and recovering)", [
        S("interior", "inside the swaying stems as the current strengthens, tall translucent seed-heads leaning past the camera in slow rhythmic waves and recovering, silver light flickering between them, loose fluff beginning to rise"),
        S("aerial", "looking straight down on long slow swells passing through a vast expanse of pale seed-heads, the rhythm visible as rolling bands of silver and pewter light, deep indigo darkness between them"),
        S("micro", "extreme macro — one seed of fluff lifting free of its stem, its glowing parachute of fine hairs catching rose-gold light, drifting upward into the dark air"),
      ]),
      P("illumination", 0.558, 0.706, 1, "transcendence", "1:57-2:28 Fervent Plateau (the sustained forward push to the 2:29 crest)", [
        S("cosmic", "cosmic — the whole land breathing at once seen from immense height, long luminous waves of bending stems rolling across the dark earth while countless seeds of light stream up from it into infinite darkness like a galaxy being born, rose-gold at the crest"),
        S("interior", "riding the sustained wind through a luminous storm of drifting seed-light, glowing fluff streaming past the camera in long diagonal trails, the air itself shining pale rose and silver"),
        S("abstract", "abstract — thousands of trajectories of seed-light drawn as fine curved lines across darkness, a vast kaleidoscopic flow pressing in one direction, unhurried and fervent"),
      ]),
      P("return", 0.706, 0.835, 0.81, "return", "2:28-2:55 Crest and Release (the last surge, then the air settles)", [
        S("aerial", "from high above as the last surge rolls over a ridge of pale seed-heads and the wind lets go, a wide dark land opening below in calm silver light, drifting seeds settling in gentle luminous slants"),
        S("micro", "macro — seed-fluff settling back onto a dark stem, its fine hairs folding closed one by one, the glow softening to a warm pearl light"),
        S("abstract", "abstract — the long waves of air easing into slow parallel ribbons of pearl light across black, widening apart, the rhythm slowing toward stillness"),
      ]),
      P("integration", 0.835, 1, 0.37, "integration", "2:55-3:30 Afterglow Stillness (high, sparse, unresolved; the quietest moment 3:23) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small seed of light drifting alone across the lower right of immense darkness, weightless, a faint warm glow trailing behind it, nearly the entire frame empty"),
        S("cosmic", "cosmic — from far above the quiet land becomes a dark expanse under pale starlight, a few last seeds of light turning slowly upward into the star field, high and unresolved"),
        S("sparse", "DARK BACKGROUND — a single seed-head standing upright and still in the lower left of vast darkness, its fine hairs holding the last faint silver light, the bookend of the first breeze"),
      ], { sparse: true }),
    ],
    morphs: [
      "the circling spirals of air unwind and the camera rises to glide above silver bands sweeping across the seed-heads",
      "the dew bead's prismatic threads scatter and the camera drifts down inside the swaying stems as the current strengthens",
      "the lifting seed rises and the camera follows it up until the whole land is rolling in luminous waves beneath a galaxy of seed-light",
      "the trails of seed-light slow and the camera pulls back to look down on the last surge rolling over a pale ridge",
      "the ribbons of pearl light widen apart and the camera settles on one small seed of light drifting alone in the dark",
    ],
  },
  {
    id: "a96b4696-c02b-4004-a1a5-a0b1eee09308",
    name: "Loire 2",
    world: "C major plagal reverie (C, F, D minor) in 1:43, shadowed by a borrowed F minor at the opening and the close — a slow bend of current between trailing willow leaves: pearl-violet haze over the source, a calm clear reach, a held breath of one glint on still water, the shimmering gold flecks of the peak, a soft violet shadow passing over the current, and a bittersweet amen of one warm reflection",
    phases: [
      P("threshold", 0, 0.203, 0.37, "threshold", "0:00-0:21 Hazy Source (pale grey-violet mist, F minor at 0:11)", [
        S("sparse", "DARK BACKGROUND — a single willow leaf trailing in a slow current in the lower right of vast darkness, a thin line of pearl light along its edge, faint violet mist breathing over it, nearly the entire frame empty"),
        S("micro", "extreme macro — mist droplets of pale grey and violet light suspended just above dark moving water, drifting at different depths, luminous and weightless"),
        S("aerial", "from high above, a slow bend of dark current half hidden under lifting veils of pearl-violet mist, the far bank dissolving into haze, the camera descending toward the surface"),
      ]),
      P("expansion", 0.203, 0.329, 0.73, "expansion", "0:21-0:34 Arrival in C (a calm reach, the bed glowing through clear water)", [
        S("interior", "beneath the surface of clear slow water, looking up through translucent green-gold light at trailing willow leaves far above, smooth stones glowing softly far below, motes of light drifting with the current"),
        S("abstract", "abstract — long soft bands of river green and honey light flowing slowly across darkness in parallel, the edges of each band rippling into fine prismatic threads"),
        S("micro", "macro — the edge of one willow leaf resting on the surface, a crescent of tiny beads of light gathered along it, the current sliding beneath like dark glass"),
      ]),
      P("transcendence", 0.329, 0.444, 0.73, "integration", "0:34-0:46 Arrival in C (steady, the held breath before the shimmer) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small glint of amber light resting alone on still dark water in the upper left of immense darkness, a faint luminous ring around it, nearly the entire frame empty"),
        S("aerial", "looking straight down on the slow current filling the frame, long luminous amber reflections stretching across dark glassy water, the first gold flecks beginning to stir, the camera gliding downstream"),
        S("micro", "extreme macro — a single luminous fleck of gold light trembling on the skin of dark water, a tiny halo of pearl haze around it, the current sliding beneath, about to multiply into thousands"),
      ], { sparse: true }),
      P("illumination", 0.444, 0.667, 1, "transcendence", "0:46-1:09 Shimmering Current (the 0:46-1:05 swell, the whole bend lit)", [
        S("cosmic", "cosmic — the whole bend of current seen from immense height blazing with countless moving flecks of gold and silver light, like a slow river of stars curving through infinite darkness, mist glowing along its edges"),
        S("micro", "macro at the height of the shimmer — rippling light breaking into thousands of trembling gold flecks, reflections of leaves quivering among them in prismatic fragments"),
        S("abstract", "abstract — scattered golden flecks streaming diagonally across darkness in a slow kaleidoscopic drift, honey and pearl light interlacing, the camera traveling with them"),
      ]),
      P("return", 0.667, 0.841, 0.79, "return", "1:09-1:27 Minor-Shadowed Return (the pause at 1:10, the last lift to the 1:23 crest)", [
        S("aerial", "looking straight down as a soft violet shadow slides slowly across the luminous current, the gold flecks dimming to muted rose and slate beneath it, then light lifting again at the far edge of the frame"),
        S("intimate", "close — trailing willow leaves lifting gently in the current as warm amber light returns along them, each leaf edged in a fine glowing line, translucent and weightless"),
        S("abstract", "abstract — a wide fan of amber and rose light opening slowly across dark space, the crest of the last lift, dissolving at its edges into fine particles"),
      ]),
      P("integration", 0.841, 1, 0.79, "integration", "1:27-1:44 Minor-Shadowed Return → the F minor amen (1:33-1:35) onto a long-held open C", [
        S("micro", "extreme macro — one last warm reflection held in a bead of light at the tip of a willow leaf, the dark current sliding below, amber fading slowly toward violet"),
        S("cosmic", "cosmic — from far above the slow current becomes a faint line of amber light winding across infinite darkness, a few quiet points of light along it, the long-held amen"),
        S("sparse", "DARK BACKGROUND — a single willow leaf resting in a slow current in the lower right of vast darkness, one warm line of light along its edge, the bookend of the source"),
      ]),
    ],
    morphs: [
      "the camera descends through the pearl-violet mist and slips beneath the clear surface, looking up at the trailing leaves",
      "the beads along the leaf dim and the camera settles close on one small glint of amber light alone on still water",
      "the gold fleck multiplies and the camera rises far above as the whole bend blazes like a slow river of stars",
      "the streaming flecks slow and the camera tilts down to look straight onto the current as a violet shadow slides across it",
      "the fan of light folds inward and the camera pushes in close on one last warm bead of light at a leaf tip",
    ],
  },
  {
    id: "05664df7-d355-40b7-85d2-e2badf26123a",
    name: "Torraine 6",
    world: "A minor over A and G pedals, a restrained inward longing in two swells (a brief amber break at 1:03, the heavier Aeolian summit at 2:40) that dissolves without resolving — muted reflections trembling on dark water under low mist: one streak of rose light, ribbons pulled by a heavy pulse, the reflections fading under mist, returning one by one in steady sets, the summit as a dim field of points of light joined by faint threads, and one muted ribbon left suspended",
    phases: [
      P("threshold", 0, 0.137, 0.37, "threshold", "0:00-0:26 Unmoored Preamble (single ripples from far-apart points)", [
        S("sparse", "DARK BACKGROUND — a single faint luminous streak of muted rose light trembling on black water in the lower left of vast darkness, one ring spreading far from it, nearly the entire frame empty"),
        S("micro", "extreme macro — the trembling edge of that reflection at closest range, the light broken into tiny rose and slate-teal fragments on the black surface, each one shivering, translucent"),
        S("aerial", "from high above, a wide dark expanse of still water with single rings spreading slowly from far-apart points, each ring a faint luminous line of pale silver, the camera drifting down"),
      ]),
      P("expansion", 0.137, 0.47, 0.78, "expansion", "0:26-1:29 Gathering Pulse (fog lifting, a push-in on every bass anchor) → G-Major Crest (the amber break, 1:03)", [
        S("interior", "inside a low drifting bank of mist over the dark current, slow veils of pewter and rose light parting one after another as a steady pulse pushes them, ribbons of reflected light trembling below"),
        S("aerial", "looking straight down at the broad dark surface filling the frame, muted ribbons of reflected light pulled into long trembling streaks by the heavy flow, one long band of amber light laid suddenly across them"),
        S("micro", "macro — a ribbon of amber light breaking into a spray of luminous points on the dark rippled surface, slate-teal shadow closing in at its edges as it fades"),
      ]),
      P("transcendence", 0.47, 0.628, 0.44, "integration", "1:29-1:59 Shadowed Return (dusky grey, close and sheltered) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small luminous point of warm light reflected alone on still black water in the upper right of immense darkness, low mist drifting faintly over it, nearly the entire frame empty"),
        S("abstract", "abstract — layers of low mist sliding slowly over one another in soft pewter and violet bands, every reflection beneath them dimmed and dissolving, a sheltered hush"),
        S("micro", "extreme macro — fine beads of mist settling on a dark wet stone edge, each holding a dim grey-rose glint, the pulse beginning again beneath them"),
      ], { sparse: true }),
      P("illumination", 0.628, 0.76, 0.78, "illumination", "1:59-2:24 Pedal-Bound Pulse (heavy swells landing in steady sets)", [
        S("aerial", "from directly above, heavy slow swells rolling in steady sets across the dark luminous surface, muted reflections returning one by one on their crests and pulled into long trembling streaks, the camera drifting lower with each set"),
        S("intimate", "close — the crest of one heavy swell lifting slowly in dim light, a line of rose and silver reflections running along its dark back"),
        S("abstract", "abstract — repeated arcs of muted light stacked in a slow rhythmic pattern across black, each landing with the same weight, the pressure gathering toward the upper edge"),
      ]),
      P("return", 0.76, 0.887, 1, "transcendence", "2:24-2:48 Aeolian Summit (the larger peak at 2:40, a storm-edged glow that never breaks)", [
        S("cosmic", "cosmic — the dark water becomes a vast field of countless dim points of light joined by faint threads of rose and teal, a constellation spread across infinite darkness, light pressing through slow churning vapor at its edges, the camera rising"),
        S("micro", "macro at the summit — one point of reflected light swelling to a blaze on the black surface, fine threads of light reaching out from it toward its neighbours"),
        S("aerial", "looking straight down from great height on churning banks of low vapor lit from within by a storm-edged glow, the vapor dissolving in slow gaps that open onto the joined points of light far below, the camera hovering above it"),
      ]),
      P("integration", 0.887, 1, 0.54, "integration", "2:48-3:10 Suspended Farewell (mist settling, ending on an unresolved A minor over C)", [
        S("sparse", "DARK BACKGROUND — a single muted luminous ribbon of rose light resting on still black water in the lower left of vast darkness, mist settling over it, the bookend of the first streak, left unresolved"),
        S("cosmic", "cosmic — from immense height the still surface holds the last pale silver of a few dim points of light, faint threads fading between them into infinite darkness, suspended"),
        S("micro", "extreme macro — the last dim reflection dissolving into tiny grey-rose particles on the black surface, a fine haze of mist closing over them, slate-teal shadow gathering at the edges, the pulse gone still"),
      ]),
    ],
    morphs: [
      "the camera descends toward the far-apart rings and drifts into a low bank of mist as a steady pulse parts its veils",
      "the amber spray fades and the camera settles close on one small point of warm light alone under the mist",
      "the beads of mist tremble and the camera rises to look straight down as heavy swells roll in steady sets",
      "the stacked arcs of light press upward and the camera rises until the surface becomes a vast field of joined points of light",
      "the storm-edged glow thins and the camera sinks close onto one muted ribbon of rose light resting on black water",
    ],
  },
  {
    id: "ecf0d90f-7e1b-4ecb-a654-ecea936caca8",
    name: "Bells 1",
    world: "C minor over one tolling C pedal, clustered bronze shimmer (Bb against B natural), grave and ceremonial, no cadence, ending on a bare fifth — a great bronze tone struck in fogbound dawn: a shiver along a vast curved rim, rings of bronze light rolling over still dark water, the full peal as a vast interfering lattice of light, a long ringing decay to one ring, and the final summons rolling outward into a vast empty stillness",
    phases: [
      P("threshold", 0, 0.05, 0.8, "threshold", "0:00-0:10 Distant Tolling (one tone heard through fog)", [
        S("sparse", "DARK BACKGROUND — a single thin shiver of bronze light running along the curved rim of something immense in the lower right of vast darkness, faint pewter fog drifting over it, nearly the entire frame empty"),
        S("micro", "extreme macro — the cast bronze surface at closest range, its patina a terrain of dull ember and pewter, a tremor of light passing across it as the tone sounds"),
        S("aerial", "from high above a fog-bound expanse of still dark water at first light, one faint luminous ring of bronze spreading across it from a distant point, the camera slowly descending"),
      ]),
      P("expansion", 0.05, 0.16, 1, "expansion", "0:10-0:31 Distant Tolling → the bass toll enters at 0:20 (monumental)", [
        S("abstract", "abstract — concentric rings of warm bronze light rolling outward across darkness from one struck point, each ring thick with trembling particles, the dark air shaking in matching circles, the camera pushed back by the force"),
        S("intimate", "close — fine dust shaken loose by the deep stroke, hanging in a shaft of grey light and trembling in time with the toll, every mote glowing dull amber"),
        S("interior", "inside the dense hanging fog as the low tone passes through it, slow pressure waves of pewter and bronze light rippling the mist on every side"),
      ]),
      P("transcendence", 0.16, 0.28, 0.82, "illumination", "0:31-0:54 Bronze Ostinato (slow pendulum swing, one gesture per beat)", [
        S("aerial", "looking straight down on still dark water as the ostinato tolls, each stroke sending a new ring of bronze light outward over the older ones, their crossings glowing amber, translucent fog sliding across the frame"),
        S("micro", "macro — a slow sweep of bronze light particles swinging through darkness like a pendulum of glowing dust, each pass leaving a curved trail of copper motes, translucent and weightless"),
        S("abstract", "abstract — a slow pendulum arc of bronze light swinging back and forth across darkness, leaving faint luminous trails that layer into a fan of copper lines"),
      ]),
      P("illumination", 0.28, 0.781, 0.73, "transcendence", "0:54-2:30 Minor Litany (a warm glow at 1:29 swallowed by cloud) → Full Peal (1:36-1:58, vibrations visible in the mist) → Ringing Decay", [
        S("cosmic", "cosmic — the full peal seen from immense height, wave upon wave of luminous bronze rings filling infinite darkness and interfering into a vast shimmering lattice of amber and indigo, hard metallic flares at every crossing, the camera rising through it"),
        S("interior", "within the vibrating fog, slow visible waves of sound rippling through dense pewter mist in rings of dull amber light, one warm glow kindling for a moment deep inside it and being swallowed again"),
        S("micro", "extreme macro — dark still water trembling under the sustained tone into a fine standing pattern of tiny bronze-lit ripples, impossible stillness between the crests"),
      ]),
      P("return", 0.781, 0.902, 0.77, "integration", "2:30-2:54 Ringing Decay (quiet spaciousness, a low hum) → Final Summons gathering (2:39) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small faint ring of copper light expanding alone in the upper left of immense darkness, the last of the tone, a few dim motes trembling inside it, nearly the entire frame empty"),
        S("aerial", "looking straight down on luminous mist settling over a still black mirror, the air faintly vibrating, faint concentric ripples of pale copper light spreading across it, translucent and dissolving"),
        S("interior", "inside the low hum, the deep dark slowly filling with a vast bronze pressure, faint rings of ember light beginning to gather from far below, the camera sinking toward them"),
      ], { sparse: true }),
      P("integration", 0.902, 1, 0.84, "illumination", "2:54-3:13 Final Summons (the vastest stroke at 2:58 rolling out over dark water, then the bare open fifth)", [
        S("cosmic", "cosmic — the deepest stroke rolling outward seen from far above, one immense ring of bronze light crossing infinite darkness and still dark water alike, fog glowing ember amber along its edge, vast and grave"),
        S("sparse", "DARK BACKGROUND — a single faint luminous bronze ring widening at the far edge of black water in the lower right of vast darkness, only a low glow remaining, the bookend of the first shiver, open and unresolved"),
        S("micro", "extreme macro — the last tremor of light fading from the curved bronze rim into dull ember, fine particles of fog settling on it"),
      ]),
    ],
    morphs: [
      "the camera descends toward the distant ring until the struck point bursts outward in rolling rings of bronze light",
      "the fog's pressure waves part and the camera rises to look straight down as the ostinato sends ring after ring across dark water",
      "the copper trails of the pendulum widen and the camera soars up as the full peal fills the darkness with a lattice of light",
      "the standing ripples still and the camera settles close on one small faint ring of copper light alone in the dark",
      "the gathering ember rings surge upward and the camera pulls back as the deepest stroke rolls out across the darkness",
    ],
  },
  {
    id: "86b64938-26ea-40b9-9ea1-461323a049d5",
    name: "Chenin 3",
    world: "Bb major (written A#), songlike tonic pedal, warm grateful contentment in waves (crests 0:15, 1:10, 1:45, 2:35), a hushed open-fifth clearing at 1:51 and a borrowed Db rose-violet turn at 2:31 — golden light glowing through translucent fruit and leaves: one lit fruit in the dark, honey light through clustered fruit, the peak as a slow galaxy of pollen and amber motes, the cool slate clearing with one fruit faintly lit, the rose-violet return, and one small steady amber glow at home",
    phases: [
      P("threshold", 0, 0.126, 0.84, "threshold", "0:00-0:24 Opening Invocation (crest 0:15, mist lifting in slow layers)", [
        S("sparse", "DARK BACKGROUND — a single translucent golden fruit hanging low in the lower right of vast darkness, warm light glowing through its skin from within, a fine curling tendril above it, nearly the entire frame empty"),
        S("micro", "extreme macro — inside the skin of the fruit at closest range, honey-coloured light streaming through translucent cells and tiny seeds, a lit world within a world"),
        S("aerial", "from high above, long rows of dark leaf canopy under slow lifting layers of luminous mist, warm low light spreading across them in widening bands, the camera descending toward one glowing cluster"),
      ]),
      P("expansion", 0.126, 0.268, 1, "expansion", "0:24-0:51 Home Ground Hymn (warm, steady, light pouring in)", [
        S("interior", "within the leaves, clusters of translucent golden fruit and broad leaves filling the frame on every side, warm honey light pouring through the fruit in long soft shafts, the camera drifting slowly forward"),
        S("abstract", "abstract — overlapping rounds of amber light glowing through one another like stacked lenses, a slow honeycomb pattern of warmth across darkness, soft cream at the centres"),
        S("micro", "macro — the edge of one broad leaf lit from behind, its fine veins a branching map of gold light, pollen motes resting along them"),
      ]),
      P("transcendence", 0.268, 0.584, 0.98, "transcendence", "0:51-1:51 Rising Turn to Peak (climax 1:10) → Lydian Unfolding (a band of pale gold as the haze parts, 1:45)", [
        S("cosmic", "cosmic — countless motes of pollen and amber light rising out of the dark leaves into a vast slow galaxy of warm gold across infinite darkness, luminous fruit glowing like stars within its arms, the camera rising through it"),
        S("aerial", "looking straight down at the height of the warmth as golden light breaks over the crest of the leaf canopy, long violet shadows stretching down one side, translucent fruit blazing along the bright edge"),
        S("micro", "extreme macro — a drop of nectar at the tip of a fruit catching a band of pale gold light, a tiny inverted reflection of the whole glowing canopy held within it"),
      ]),
      P("illumination", 0.584, 0.716, 0.37, "integration", "1:51-2:16 Suspended Clearing (a bare open fifth, cool, immense and empty) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small fruit faintly glowing pale gold in the upper left of immense dusky slate darkness, cool and still, a few fine motes suspended near it, nearly the entire frame empty"),
        S("aerial", "from very high above, a vast pale expanse of frosted leaves under a cool slate haze, one distant thin line of light across it, immense, hushed and translucent"),
        S("micro", "macro — fine frost crystals forming along the edge of a dark leaf in the hush, each crystal holding a pinpoint of cool blue light"),
      ], { sparse: true }),
      P("return", 0.716, 0.837, 0.98, "illumination", "2:16-2:39 Return and Detour (the borrowed Db rose-violet turn at 2:31, the 2:35 crest)", [
        S("abstract", "abstract — warm light flooding back in slow waves of rose, violet and amber across darkness, a kaleidoscopic turn of colour before parting onto clear gold"),
        S("intimate", "close — clusters of translucent fruit and leaves edged in returning gold, a rose-violet glow passing slowly through them like a borrowed shadow and fading back to warm amber, fine pollen motes catching the light"),
        S("aerial", "looking straight down as the haze over the leaves glows rose and violet and then clears onto one long luminous amber band, the camera gliding with it"),
      ]),
      P("integration", 0.837, 1, 0.53, "integration", "2:39-3:10 Homecoming Pedal (a small steady amber glow, a slow pull-back to rest)", [
        S("micro", "extreme macro — one bead of warm amber light at the stem of a resting fruit, holding a tiny reflection of the whole golden day as it fades"),
        S("cosmic", "cosmic — pulling back to immense height, the dark leaves become a faint warm haze across deep blue darkness, scattered amber points glowing like a quiet star field, settled and grateful"),
        S("sparse", "DARK BACKGROUND — a single translucent fruit holding a small steady amber glow in the lower right of vast darkness, the bookend of the first light, at rest"),
      ]),
    ],
    morphs: [
      "the camera descends through the lifting mist into the leaves until clusters of glowing fruit surround it",
      "the leaf veins blaze and the camera rises as countless motes of pollen lift into a vast slow galaxy of gold",
      "the nectar drop's reflection dims and the camera pulls back to one small fruit faintly glowing in cool slate darkness",
      "the frost crystals melt into colour and the camera drifts through waves of rose, violet and amber light",
      "the amber band narrows and the camera pushes in close on one bead of warm light at the stem of a resting fruit",
    ],
  },
  {
    id: "6499ac06-2cb1-4970-b75f-1258587c84d8",
    name: "The Other Side 10",
    world: "Bb minor (written A#) over a low tonic pedal, a patient inward ache gathering warmth through the relative major and Gb, a darker swell held near-still at 1:43, ending on a bare open fifth — a black mirror of water with violet light beneath it: the pedal as slow rings, a dim light rising from below, the surface thinning to translucency, the peak as a standing wall of dark water lit violet and teal from behind, and the mirror restored, its glow steady and unresolved",
    phases: [
      P("threshold", 0, 0.304, 0.37, "threshold", "0:00-0:38 Pedal-Tone Awakening (a ring with each low bass note; the quietest passage) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single slow luminous ripple ring on black water in the lower right of vast darkness, bending one faint thread of violet light, nearly the entire frame empty"),
        S("micro", "extreme macro — the crest of that ring at closest range, a thin ridge of black water carrying a sliver of violet light, translucent and weightless"),
        S("aerial", "looking straight down on a black mirror of water as one ring after another spreads with each low pulse, faint luminous violet light bending through their crossings, the camera sinking slowly toward the surface"),
      ], { sparse: true }),
      P("expansion", 0.304, 0.44, 0.85, "expansion", "0:38-0:55 Submediant Warmth (the amber break at 0:39)", [
        S("interior", "beneath the surface of the black mirror, a dim violet light rising slowly from far below through dark translucent water, a patch of warm amber breaking in from above, ripples bending both"),
        S("intimate", "close — a patch of warm amber light drifting across the dark mirror, warming a small circle of the surface before sliding on, violet shadow closing behind it"),
        S("abstract", "abstract — crossing ripple rings of violet and amber light interfering in a slow pattern across darkness, warm and cool bands braiding where they meet, the camera drifting through them"),
      ]),
      P("transcendence", 0.44, 0.568, 0.85, "illumination", "0:55-1:11 Submediant Warmth, quicker and more insistent (amber 1:00-1:20)", [
        S("micro", "extreme macro — the surface thinning to a dark translucent membrane, faint luminous shapes of light drifting just beneath it, aching and restless"),
        S("aerial", "from high above, the black mirror lit from beneath in slow-moving luminous patches of amber and smoky violet, a second glow breathing under the surface, the camera gliding along insistently"),
        S("interior", "inside the dark translucent depths, drifting shapes of violet and amber light passing close on every side and rising toward the surface, the camera carried upward with them, faint ripples glowing far above"),
      ]),
      P("illumination", 0.568, 0.753, 1, "transcendence", "1:11-1:34 Lydian Shadows Swell (bands of violet and pale gold sliding past one another)", [
        S("cosmic", "cosmic — a vast standing wall of dark water lit from behind by a deep violet and muted teal glow, light bending through its ripples in slow aching swells like a nebula seen through glass, infinite darkness on either side"),
        S("micro", "macro — beads of dark water lifting off the standing surface into the dark, each one glowing violet and teal, suspended and weightless"),
        S("abstract", "abstract — slow bands of violet and pale gold light sliding past one another in layers across darkness, dissolving at their edges, the camera pulling back"),
      ]),
      P("return", 0.753, 0.881, 0.97, "illumination", "1:34-1:50 Lydian Shadows → Open-Fifth Farewell (the darker swell held near-still at 1:43)", [
        S("aerial", "looking straight down from great height on the standing water holding still and heavy, the violet light steady and grave behind its translucent surface, slow ripples crossing it, the swell held motionless"),
        S("intimate", "close — one heavy slow ripple crossing the luminous dark surface in the held breath of the swell, a grave line of violet light running along its crest, teal shadow pooling in its trough"),
        S("micro", "extreme macro — a bead of deep violet light trembling on the edge of the dark translucent water, holding a tiny inverted reflection of the whole glowing wall, slow ripples passing beneath it"),
      ]),
      P("integration", 0.881, 1, 0.97, "integration", "1:50-2:05 Open-Fifth Farewell (a bare A# fifth, a thin bright edge, the question left open)", [
        S("cosmic", "cosmic — from immense height the black mirror restored, its deep violet glow steady within it like a quiet nebula under infinite darkness, one thin bright edge of light along its far rim, unresolved"),
        S("sparse", "DARK BACKGROUND — a single slow ring of violet light on the black mirror in the lower right of vast darkness, the bookend of the first pulse, left open"),
        S("micro", "extreme macro — the last thin sliver of bright edge-light lying on still black water, dissolving into fine violet particles, a faint ring trembling around it, the low pulse fading beneath"),
      ]),
    ],
    morphs: [
      "the camera sinks through the black mirror and looks up as a dim violet light rises from far below",
      "the interfering rings tighten and the camera pushes in until the surface thins to a dark translucent membrane",
      "the drifting shapes rise and the camera pulls back as the water stands up into a vast wall lit violet and teal from behind",
      "the bands of light settle and the camera rises to look straight down on the standing water held still and heavy",
      "the bead of violet light trembles and the camera keeps rising until the black mirror glows steady beneath infinite darkness",
    ],
  },
];
