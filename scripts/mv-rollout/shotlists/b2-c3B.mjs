// Batch 2, part c3B — Welcome Home album (Covid-era piano album) — Journey
// Archetype shot lists (2026-10-10): Rebound, Stir Crazy, Rolling,
// Quarantine, All Together.
// Modelled on the Karel-approved expansion-sample.mjs, welcome-home-title.mjs
// (hint, never literal — "about the spiritual") and rise-above-A/B.
//  - Phase ids, bounds and intensities are the journeys' CURRENT ones;
//    `music` names the deep-analysis sections each phase holds.
//  - Each journey keeps its identity (current shot motifs + palette),
//    TRANSFIGURED (made of light, particles, impossible stillness); the
//    album's lockdown story is only hinted (circling, confinement, a seam of
//    light, gathering together) — never houses, rooms, windows, roofs,
//    furniture or streets; no humans, no animals.
//  - One sparse phase at each track's real interior valley; cosmic at the peak.

export const SET = { key: "b2-c3B", presenting: "Welcome Home" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "8997623d-8770-41ce-863d-f359d1a213c4",
    name: "Rebound",
    world: "D major two-bar cycle that never fully lands and keeps rolling forward, dipping into a silver B-minor shadow at 0:57, rebuilt from the bass at 1:36 into a full bloom at 2:05 and settling on a bare open fifth — resilience as rebounding light: one drop of teal light rising off a black mirror, rings answering rings in amber-glinting filigree, a standing crest held still in the cool shadow, a surge from below, rings lifting into space wave after wave, and one last ring closing at its origin",
    phases: [
      P("threshold", 0, 0.169, 0.85, "threshold", "0:00-0:29 Rolling Home Cycle (D, Dmaj7, D/A, A/B, Aadd9 — each two-bar turn adds a little energy)", [
        S("sparse", "DARK BACKGROUND — a single drop of teal light rebounding off a black mirror in the lower right of the frame, a thin luminous crown rising from the impact point and held mid-instant, nearly the entire frame empty"),
        S("micro", "extreme macro — falling beads of teal and amber light at closest range dropping back onto a dark liquid mirror in lit arcs, the first ripple escaping outward in a fine luminous line, weightless"),
        S("aerial", "looking straight down on a black mirror of still liquid light filling the frame edge to edge, one bright teal ring widening in the upper left, slow golden swells rolling through it every two breaths, the camera descending toward it"),
      ]),
      P("expansion", 0.169, 0.331, 0.96, "expansion", "0:29-0:57 Lifted Return (the cycle in a brighter, higher voicing; Dsus2 downbeats, A13/A6add9 phrase-ends leaning homeward)", [
        S("abstract", "abstract — a dark liquid surface seen at a low grazing angle, reflected ripples crossing incoming ones in a sharpening interference filigree of teal light lines, amber glints flaring where the crests collide, each pass brighter than the last"),
        S("micro", "macro — one crest collision on dark liquid at closest range, teal and amber light splashing upward as a single rising column of spray, fine luminous beads hanging weightless above it, deep shadow behind"),
        S("aerial", "from high above, a moiré bloom of nested circles of light spreading across a dark mirror, bands of silver shade sliding over it and the whole bloom brightening to honey gold as each shade passes, the camera rising through the glow"),
      ]),
      P("transcendence", 0.331, 0.558, 0.94, "integration", "0:57-1:36 Relative-Minor Shadow (B pedal; Bm, Gmaj7, Em9 over B — dips at 1:00 and 1:35, a surge at 1:10) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small standing crest of silver-blue light holding its shape in the upper left of immense darkness, a faint ring of pale slate light resting around it, nearly the entire frame empty"),
        S("micro", "extreme macro — the curve of a standing ripple at closest range, liquid light flowing through a shape that refuses to move, cool silver and slate-blue threads woven through it, one amber glint breaking through, translucent and still"),
        S("cosmic", "cosmic — slow concentric rings of pale silver light drifting outward through deep slate-blue void, veils of dim mist passing over them and parting for patches of brightness, the camera gliding down through the hush"),
      ], { sparse: true }),
      P("illumination", 0.558, 0.727, 0.94, "illumination", "1:36-2:05 Low-Register Rebound (the home cycle rebuilt from the bass, Asus2/Dsus4/add9 suspensions) → climax 1:58, A13 and A6add9 resolving to D", [
        S("interior", "inside a swelling surge of dark liquid light rising from below, teal currents gathering force in long luminous folds, the camera riding upward with them toward a widening seam of gold light"),
        S("aerial", "looking straight down from immense height on nested rings of teal and amber light rebounding off one another across a dark surface, each echo larger and brighter, interlocking crescents filling the frame edge to edge"),
        S("micro", "macro — a crest climbing at closest range in a thin translucent sheet of teal light, peeling back transformed into a spray of amber beads, a deep low glow pulsing beneath it"),
      ]),
      P("return", 0.727, 0.872, 1, "transcendence", "2:05-2:30 Full Bloom (widest register, densest sound, fresh Em11/D and A13 colour — the cycle at its most expansive)", [
        S("cosmic", "cosmic — rings of teal and gold light lifting off the dark mirror and expanding into infinite space like ripples through a galaxy, every echo answered at once, sprays of luminous particles wheeling outward in great arcs, the camera soaring up through them"),
        S("micro", "extreme macro — a bead of light at closest range at the instant of rebound, the whole blooming ring of gold and teal curved inside its translucent sphere, sparks lifting from its rim"),
        S("abstract", "abstract — nested waves of honey gold, mint and teal light radiating in layered arcs across darkness, wave after wave each larger than the last, resonant and weightless, kaleidoscopic at the edges"),
      ]),
      P("integration", 0.872, 1, 0.37, "integration", "2:30-2:52 Open-Fifth Release (the energy drains, a last Bm7 glances back, a bare D open fifth — home without quite closing)", [
        S("aerial", "from high above, the dark mirror almost still at indigo dusk, faint rings of teal light settling one inside another in the lower left, the last ripples flattening into one deep luminous reflection, the camera slowly pulling back"),
        S("sparse", "DARK BACKGROUND — one last small ring of teal light closing back at its origin in the lower right of vast indigo darkness, a faint luminous tremble on the surface, the bookend of the first drop, nearly the entire frame empty"),
        S("cosmic", "cosmic — the whole rebound remembered as nested circles of faint teal light fading into infinite indigo darkness like a quiet star field, open and unresolved"),
      ]),
    ],
    morphs: [
      "the camera descends into the widening teal ring until its crests cross in a filigree of light",
      "the bloom dims under silver shade and the camera settles on one small standing crest alone in the dark",
      "the slate rings sink away and the camera rides a surge of teal light rising from below",
      "the rings lift off the mirror and the camera soars up with them into a galaxy of teal and gold",
      "the waves of light thin out and the camera drifts down to look on the dark mirror at indigo dusk",
    ],
  },
  {
    id: "cd517f5a-c4eb-4d50-8a53-044aa668d087",
    name: "Stir Crazy",
    world: "F major ostinato wheel (F5, D♭maj7♯11, E♭sus2, F) turning at a steady 85 BPM around one common-tone F, surging at 0:53, rocking in place at 1:19, brightening at 1:38, dimming at 2:01 and winding down to near-silence — restless energy with nowhere to go: one curled leaf trembling in ember dust on dark stone, a vortex of amber and plum fire-dust swept by a beam of honey light, a pendulum of light held at the top of its swing, blades of amber bending in wind, one ember dimming, and a slowing spiral coming to rest",
    phases: [
      P("threshold", 0, 0.258, 0.94, "threshold", "0:00-0:24 Wheel Starts Turning (open F5, D♭maj7 under a bass jolt at 0:05, sunlit F at 0:11) → 0:24-0:43 Shadowed Circuit (flat-side chords lengthened, repetition becomes pacing)", [
        S("sparse", "DARK BACKGROUND — a single small curled leaf trembling on dark stone in the lower left of vast darkness, ember dust circling it in a tight luminous orbit, violet static licking its edge, nearly the entire frame empty"),
        S("micro", "extreme macro — the leaf's curled edge at closest range, violet filaments arcing between it and the stone, amber motes circling the same tiny loop again and again, one thread of gold light running through every spark"),
        S("aerial", "looking straight down into a deep round hollow of dark stone from high above, dozens of ember-lit leaves shivering on its floor, small twists of glowing dust rising and collapsing in a slow circling rhythm, the camera descending toward them"),
      ]),
      P("expansion", 0.258, 0.439, 1, "transcendence", "0:43-1:13 Subdominant Surge (a B♭ plateau darkening to B♭ minor, crowded D♭maj9♯11 clusters, peak on E♭sus2 at 0:53, drawn back to F)", [
        S("cosmic", "cosmic — a vortex of ember and violet fire-dust seen from immense height turning like a spiral galaxy, bands of amber and plum light wheeling around a calm dark eye, one vast beam of honey gold sweeping across it, the camera rising through the spiral"),
        S("interior", "inside the vortex riding its luminous rim, ember bands streaming past in lit streaks, curled leaves of gold flashing by, the calm dark eye far below, weightless and surging"),
        S("abstract", "abstract — rotation rendered pure: nested rings of ember, plum and honey light turning at different speeds through darkness, a sweeping beam flaring brightest as it crosses them, kaleidoscopic"),
      ]),
      P("transcendence", 0.439, 0.589, 0.96, "expansion", "1:13-1:38 Rocking Plateau (the F–A bass swings at 1:19–1:23, the music parks on a long B♭5 — a held breath)", [
        S("micro", "macro — a bead of molten brass light swinging in a slow arc at closest range, catching dull amber on each pass, fine violet sparks trailing behind it, deep plum shadow beyond"),
        S("aerial", "from directly above, ember dust swaying back and forth across the dark stone hollow in long rocking crescents, the swirl slowing to a held breath, faint luminous traces of every pass layered like translucent growth rings"),
        S("abstract", "abstract — a pendulum of plum and amber light frozen at the top of its swing in the right third of the frame, its earlier arcs hanging behind it as fading luminous ribbons, suspended weightless in deep darkness"),
      ]),
      P("illumination", 0.589, 0.727, 0.93, "illumination", "1:38-2:01 Suspended Variation (the loop recast as B♭sus4 suspensions resolving plagally into F — a second wind, brighter and more hopeful)", [
        S("aerial", "looking straight down on a vast expanse of tall luminous blades of amber light bending all one way in a steady wind, honey gold breaking through drifting plum shadow in long bright swaths, surreal and glowing"),
        S("micro", "extreme macro — one bent blade tip at closest range lit gold from behind, its fine filaments glowing like brass wire, a bead of violet light resting in its fold, the whole wind held in its curve"),
        S("cosmic", "cosmic — the streaming blades of light seen from immense height as a slow golden spiral arm, motes of amber drifting outward against infinite plum darkness, the circling at last turning outward, the camera rising through it"),
      ]),
      P("return", 0.727, 0.865, 0.81, "integration", "2:01-2:24 Dimming Return (the original wheel under dimmer light, a bittersweet A-natural rub against D♭ at 2:12) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of dim orange light resting in the lower right of vast plum darkness, a thin translucent curl of smoke rising from it and bending into a slow loop, nearly the entire frame empty"),
        S("micro", "extreme macro — the ember's glowing core at closest range under fine grey ash, amber pulsing and fading in the same slow cycle, a bittersweet thread of violet light crossing it"),
        S("aerial", "from high above, the stone hollow dimmed to a faint ember spiral at its floor, the circling motes slowing and spreading apart, cool silver beginning to edge the dark, the camera pulling back"),
      ], { sparse: true }),
      P("integration", 0.865, 1, 0.37, "integration", "2:24-2:46 Quiet Unwinding (one last E♭sus2 held three seconds, then F with a faint ♭7, fading — restlessness that tires itself out)", [
        S("cosmic", "cosmic — a slowing spiral of pale silver and amber motes widening across infinite darkness, each loop wider and slower than the last, the last wobble catching one cool glint, open and airy"),
        S("sparse", "DARK BACKGROUND — a single curled leaf resting at the still centre of a faint spiral of settled ember dust in the lower left of vast darkness, three motes still circling it, the bookend of the first tremble"),
        S("micro", "extreme macro — the last mote of amber light at closest range coming to rest on dark stone, a tiny reflection of the whole slowed spiral inside it, dissolving into silver"),
      ]),
    ],
    morphs: [
      "the camera plunges down into the hollow as the twists of dust gather into one vast turning vortex",
      "the rings slow and the camera settles close on one bead of brass light swinging in a slow arc",
      "the frozen arc dissolves into streaming light and the camera rises over blades of amber bending in wind",
      "the golden spiral dims and the camera drifts down to one small ember alone in plum darkness",
      "the ember spiral loosens and the camera pulls back until silver motes widen across the dark",
    ],
  },
  {
    id: "38daff92-ae34-4448-8868-5f1df6029b94",
    name: "Rolling",
    world: "G major pedal-point reverie of rolled arpeggios rocking between Gmaj9 and a Lydian C6/9♯11 every eight breaths, a stepping bass, a bittersweet turnaround at 1:34, an exhale at 2:15, three rising circuits to a radiant summit at 3:19 and a long open Gadd9 — the land as a slow sea: a bead of dawn light riding one bending blade, swells of sage mist rolling in identical curves, a silver ribbon stepping lower, bands of honey light pouring across dark slopes, a breath crossing still light, the whole country turning liquid and golden, and the bead resting on its blade at the end, unresolved",
    phases: [
      P("threshold", 0, 0.211, 0.92, "threshold", "0:00-0:30 Pedal-Point Awakening (Gmaj9 rocking to a Lydian C over the G pedal) → 0:30-0:58 First Release (the bass steps off G onto C at 0:50 — the first open sky)", [
        S("sparse", "DARK BACKGROUND — a single slender blade of sage light bending in the lower left of vast darkness, one bead of pale gold dawn light riding its curve, nearly the entire frame empty"),
        S("micro", "extreme macro — a bead of pale gold light at the tip of a bending grass leaf at closest range, about to slide, soft out-of-focus dawn glow behind, fine cream motes drifting"),
        S("aerial", "looking straight down on long slow swells of luminous sage-green mist rolling across dark land in identical curves, each crest catching a thin seam of pale gold, rocking every few breaths, the camera gliding over them"),
      ]),
      P("expansion", 0.211, 0.341, 0.74, "expansion", "0:58-1:34 Stepping Bass (G – D/F♯ – C/G – G, direction and calm reflection)", [
        S("abstract", "abstract — stacked dark ridgelines layered one behind another like slow sound waves, a pale gold seam of light stepping down from one to the next, silver mist pooled weightless between them"),
        S("micro", "macro — a single drifting seed of gold light resting on a slow translucent current at closest range, tiny luminous ripples spreading from it, sage and cream reflections sliding past"),
        S("aerial", "from high above, a slow ribbon of silver light bending in long curves through dark rolling land, its glow stepping lower with each turn, faint gold motes drifting on it, surreal and still, the camera descending toward a bend"),
      ]),
      P("transcendence", 0.341, 0.432, 0.94, "illumination", "1:34-1:59 Turnaround Bloom (the first iii–ii7–V7–I, Bm/D – Am7 – D7 – Gmaj7: a brief longing, immediately reassured)", [
        S("abstract", "abstract — bands of honey gold and sage shadow pouring across rolling dark slopes in alternating waves, each crest igniting then dimming, a flicker of shade and gold repeating like a heartbeat, luminous and weightless"),
        S("micro", "extreme macro — the moving boundary between light and shadow at closest range, each fine luminous fibre igniting gold the instant the line crosses it, a trace of dusk rose along the edge"),
        S("interior", "inside a passing band of golden light, glowing stems flaring all around one after another, the camera riding the wave as it passes through rather than by, cream motes suspended weightless"),
      ]),
      P("illumination", 0.432, 0.545, 0.75, "integration", "1:59-2:30 Settling Breath (the loops played lightly, an exhale, the softest dip so far at 2:15) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small pool of still silver light resting in the upper right of immense sage-dark emptiness, a faint breath of wind wrinkling its surface and letting it go flat, nearly the entire frame empty"),
        S("micro", "extreme macro — the wrinkle of a breath crossing still liquid light at closest range, fine concentric lines of cream and pale gold fading back into a mirror, translucent and hushed"),
        S("cosmic", "cosmic — a slow drift of faint gold motes resting in deep green-black void like a calm star field, one soft swell of light passing beneath them and settling, the camera drawn toward it"),
      ], { sparse: true }),
      P("return", 0.545, 0.792, 0.93, "transcendence", "2:30-3:07 Rising Circuits (the turnaround spins three times, faster and higher, suspending on the dominant) → 3:07-3:38 Lydian Summit (the opening idea at full voice, peak 3:19)", [
        S("aerial", "looking straight down on an ocean of rolling land filling the frame edge to edge, waves of honey light and sage shadow travelling across it in grand overlapping swells, each cycle sliding farther and brighter, the land visibly liquid and surreal"),
        S("cosmic", "cosmic — the swelling country seen from immense height dissolving into a slow spiral of green-gold light across infinite darkness, warm radiance pouring across every swell at once, the camera rising through it"),
        S("micro", "macro — one luminous crest at closest range curling like a breaking swell, fine fibres of light streaming back from it like glowing spray, honey and cream on deep green-black"),
      ]),
      P("integration", 0.792, 1, 0.43, "integration", "3:38-4:08 Hushed Return (both ideas remembered in a hush) → 4:08-4:35 Gadd9 Afterglow (a long open Gadd9 over a deep G1, suspension rather than cadence)", [
        S("aerial", "from high above at dusk, the rolling swells resting in deepening layers of blue-green dark, translucent silver mist sliding slowly up their slopes, one last seam of green-gold light along a far crest, the camera pulling back"),
        S("intimate", "close — mist lifting off a perfectly still mirror of dark liquid light at nightfall, a faint rose glow fading into it, motes of cream light dissolving into the hush"),
        S("sparse", "DARK BACKGROUND — a single slender stem of grass bending in the lower left of vast darkness, one bead of pale gold light resting at its tip, held open and unresolved, the bookend of the first light, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the swells of mist settle into layers and the camera glides toward the stacked ridgelines of dark land",
      "the silver ribbon brightens and the camera rides into a band of golden light pouring across the slopes",
      "the light band passes and the camera settles on one small pool of still silver light in the dark",
      "the swell beneath the motes rises and the camera lifts to look down on the whole country turning liquid",
      "the radiance sinks to dusk and the camera floats over the resting swells as mist climbs their slopes",
    ],
  },
  {
    id: "019e1e1d-c7e2-4609-a9c6-364a2755b115",
    name: "Quarantine",
    world: "E minor two-chord world (Em ↔ Cmaj9♯11, an F♯ hanging like an unanswered question) pressing on one loop for two minutes, a warm G glimpse at 0:22, a crest at 1:32, a first quiet turn to E major at 2:15 and a coda of open fifths — confinement held in a raindrop: a whole grey world inverted in one bead with an amber thread at its rim, the storm curled inside the drop, lightning flowering above the cloud deck, clean trails of clarity, one seam of warm light opening and narrowing, and a single clear bead resting in silver stillness",
    phases: [
      P("threshold", 0, 0.119, 0.9, "threshold", "0:00-0:21 Circling Pulse (a dense Em ostinato turning between Em and a VI whose F♯ hangs unanswered)", [
        S("sparse", "DARK BACKGROUND — a single bead of rain resting on a dark smooth stone in the lower right of vast darkness, a faint slate-grey sheen held inside it, one thread of warm amber at its rim, nearly the entire frame empty"),
        S("micro", "extreme macro — three beads of rain on dark glass at closest range, each holding the same circling grey world at a slightly different angle, the amber thread finding all three, translucent and trembling"),
        S("abstract", "abstract — beads of silver-blue light circling in a tight eddy through darkness, the same loop turning again and again in the left third of the frame, a few gold motes caught in the orbit, weightless"),
      ]),
      P("expansion", 0.119, 0.266, 0.99, "expansion", "0:21-0:47 Glimpse of G (Gmaj9, D6add9, Gmaj13 at 0:22–0:29 — a memory of warmth that collapses back to Em)", [
        S("interior", "inside one raindrop as a curved translucent world, the storm bent into sweeping ribbons of silver-blue light arcing around the camera, a small warm amber glow hanging calm off to one side"),
        S("aerial", "from high above, one brief shaft of warm amber light breaking through a slow-moving deck of grey mist onto dark wet slate below, the glow spreading for a moment before the grey swallows it again, luminous and surreal"),
        S("micro", "macro — the bead beginning to slide at closest range, its curved world stretching, the amber light elongating into a small comet of warmth, fine silver beads trembling beside it"),
      ]),
      P("transcendence", 0.266, 0.493, 1, "transcendence", "0:47-1:27 Pressing Loop (the Cmaj7–Am9/C–Em cell recurring every few seconds at sustained high intensity — pacing)", [
        S("cosmic", "cosmic — the storm seen from far above the cloud deck, lightning blooming through it in silent silver flowers, spirals of slate-blue mist wheeling around one faint amber point far beneath, the camera rising through the flashes"),
        S("micro", "extreme macro — a mosaic of translucent beads on dark glass flaring in sequence at closest range as cold silver light cascades through them, each bead a tiny lightning-lit world, the wave repeating every breath"),
        S("abstract", "abstract — a churning loop of silver-blue and pewter light folding over itself again and again in one tight circuit, a compulsive spiral pressing against darkness, flecks of amber caught in the folds, kaleidoscopic"),
      ]),
      P("illumination", 0.493, 0.731, 0.93, "illumination", "1:27-2:09 Crest and Release (Cmaj9 held long, Em11 and Cmaj13 at the highest pitch at 1:30–1:36 — a breaking point — then long tonic holds and a descending D–C close)", [
        S("abstract", "abstract — one towering crest of silver light rising to its highest point in the right third of the frame, luminous spray hanging weightless in grey air, the breaking point held for one long breath before the backwash slides away"),
        S("aerial", "looking straight down on long slow trails cut through mist on dark glass, each clean stripe revealing a sliver of glowing sage-green light beyond, beads of silver drifting downward through the clarity"),
        S("micro", "macro — the edge of one clear trail at closest range, fog on one side and luminous clarity on the other, a single green-gold leaf beyond rendered sharp and translucent in the clean stripe"),
      ]),
      P("return", 0.731, 0.856, 0.75, "integration", "2:09-2:31 Turning Toward E (Bm, A, C♯ colours to E major at 2:15 — a first opening to the outside, quietly closed again) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small seam of warm gold light opening in the lower left of immense slate darkness, a thin shaft of it spilling across the black and then narrowing, nearly the entire frame empty"),
        S("micro", "extreme macro — dust motes at closest range suspended in a narrow shaft of amber light, each mote glowing gold, slate-blue darkness pressing in on both sides as the shaft slowly narrows"),
        S("cosmic", "cosmic — a faint golden glow opening in infinite slate darkness and closing again, motes of amber drifting outward from it into the void like a quiet star field, the camera approaching"),
      ], { sparse: true }),
      P("integration", 0.856, 1, 0.37, "integration", "2:31-2:56 Open-Fifth Stillness (the turn retraced slowly, then bare E5 and Esus2 over a deep E1 — the F♯ finally resting)", [
        S("aerial", "seen from directly overhead, fine concentric ripples spreading slowly across dark still water filling the frame edge to edge, the ripple lines catching faint pale-silver light like a held tone, a thin veil of luminous mist drifting low over the surface, the camera pulling back into the hush"),
        S("sparse", "DARK BACKGROUND — a single clear luminous bead resting in the lower right of vast dark silence, empty of the storm now, one star and one amber glint held together inside it, the bookend of the first drop"),
        S("cosmic", "cosmic — the open stillness from immense height, faint rings of silver light widening across infinite indigo void and dissolving, open and unresolved"),
      ]),
    ],
    morphs: [
      "the circling eddy closes in and the camera passes into one raindrop's curved world of silver ribbons",
      "the bead slides away and the camera rises through grey mist until lightning flowers above the cloud deck",
      "the churning loop slows and the camera holds on one towering crest of silver light",
      "the clear trail narrows and the camera settles on one small seam of warm light alone in the dark",
      "the golden glow closes and the camera lifts to look down on pale silver mist over a still mirror",
    ],
  },
  {
    id: "b207b557-e984-4a06-ae71-83124bcd80d5",
    name: "All Together",
    world: "G major pedal-point meditation that never leaves its root, colouring one G triad (G6, Gadd9, Gmaj7) and swaying to C-over-G, widening at 0:59, building fervour from 1:32 to a full-hearted embrace at 2:19 and emptying to bare open fifths — being apart and gathering in: one small honey light alone in the dark, scattered lights sending threads toward the same low ground, threads braiding into streams like a galaxy lying on the earth, every current arriving at once in one shared blaze, two inner ribbons running shoulder to shoulder, and one small pool of light holding them all",
    phases: [
      P("threshold", 0, 0.151, 0.8, "threshold", "0:00-0:33 Gathering Light (waking on G, one colour tone at a time — G6, Gadd9, Gmaj7)", [
        S("sparse", "DARK BACKGROUND — a single small light of warm honey gold glowing alone in the lower left of a vast dark expanse, a thin luminous thread just beginning to leave it, nearly the entire frame empty"),
        S("aerial", "from high above, many small separate lights scattered across dark land like embers, each alone in its own pool of night, fine threads of gold and teal light reaching from each toward the same unseen low ground"),
        S("micro", "extreme macro — one light at closest range, a small teal glow welling up between dark stones, its first thread of light slipping away into the black, fine motes of cream drifting above it"),
      ]),
      P("expansion", 0.151, 0.42, 0.9, "expansion", "0:33-0:59 Settled Warmth (rocking contentment sealed by a long G triad at 0:58) → 0:59-1:32 Widening Sky (highest register, Lydian and 13th colours, closing plagally at 1:29)", [
        S("abstract", "abstract — two threads of teal and honey light braiding together across darkness, the joining point flaring softly, warm embers pulsing slowly along the braid, translucent and weightless"),
        S("aerial", "looking straight down on a dark hillside laced with joining threads of luminous gold, each junction a soft flare, the whole network organizing downhill like the veins of a leaf, the camera gliding over it"),
        S("micro", "extreme macro — the flare where two threads meet at closest range, teal and gold interleaving in miniature turbulence, a slow glowing pulse like embers breathing, cream motes lifting off it"),
      ]),
      P("transcendence", 0.42, 0.598, 0.93, "illumination", "1:32-2:11 Swelling Tide (arpeggios thickening, the C-suspensions over G held longer — quiet fervour)", [
        S("cosmic", "cosmic — the gathering seen from immense height, a branching network of luminous streams sprawling across dark ground like a galaxy lying on the earth, every tributary a star-stream, slowly swelling brighter"),
        S("micro", "macro — one stream at closest range accepting a thread half its size, the small light folded in without being lost, the current fractionally brighter after, honey and teal glints on dark stone"),
        S("abstract", "abstract — slow tides of gold light rising across dark sand in layered luminous arcs, each wave reaching a little further than the last, the gathered threads carried in the swell"),
      ]),
      P("illumination", 0.598, 0.698, 1, "transcendence", "2:11-2:33 Radiant Embrace (the richest IV-over-I voicings, peak 2:19, the luminous Cmaj9♯11/G at 2:25)", [
        S("cosmic", "cosmic — every stream arriving at once into one immense braided current of light, gold and teal interleaved, its radiance spilling outward into infinite space like a spiral galaxy forming, the camera soaring up through the blaze"),
        S("interior", "inside the shared blaze, currents from many sources sliding past and through the camera, each keeping its own colour, cream, honey and teal, weightless and embraced"),
        S("aerial", "looking straight down on the great confluence filling the frame edge to edge, a knot of brilliance where the threads meet, one wide calm current of light flowing out of it, luminous blades all around glowing gold at once"),
      ]),
      P("return", 0.698, 0.858, 0.85, "integration", "2:33-3:08 Plagal Afterglow (thankful reflection, swaying between C-over-G and G as the energy subsides) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ribbon of amber light lying alone in the upper right of vast blue-grey darkness, two faint inner currents of teal and gold running side by side within it, nearly the entire frame empty"),
        S("micro", "extreme macro — two inner ribbons at closest range, teal and gold running shoulder to shoulder, their boundary feathered with tiny exchanged glints, slowing ripples of amber light"),
        S("aerial", "from high above, the gathered current resting wide and calm, a low mist of luminous amber rising from it and keeping pace, lengthening bands of light swaying slowly between two colours, the camera descending toward it"),
      ], { sparse: true }),
      P("integration", 0.858, 1, 0.37, "integration", "3:08-3:39 Open Fifth Farewell (the texture falls almost silent, bare G open fifths — the single root it all grew from)", [
        S("cosmic", "cosmic — the gathered light from immense height resting as one calm luminous eye in deep indigo darkness, faint threads still traced across the land toward it, the stars above mirrored in it"),
        S("sparse", "DARK BACKGROUND — a single small pool of warm honey light resting in the lower left of vast blue-grey darkness, every thread folded into it, the bookend of the first small light, glowing steady"),
        S("micro", "extreme macro — the still surface of the gathered light at closest range, a tiny reflection of the whole night held inside it, cream and teal motes dissolving into blue-grey haze"),
      ]),
    ],
    morphs: [
      "the camera descends toward one teal glow until its thread braids with a second thread of honey light",
      "the flaring junction recedes and the camera rises until the whole network spreads below like a galaxy",
      "the tide of gold swells and the camera soars up as every stream arrives at once into one blaze",
      "the blaze softens and the camera settles on one small ribbon of amber light alone in blue-grey dark",
      "the mist of amber thins and the camera rises until the gathered light rests as one calm eye in the dark",
    ],
  },
];
