// Welcome Home album — Journey Archetype shot lists, batch 2 part c3A
// (2026-10-10): Interplay, The Knife, 2019, The Knife (Jam), Playa,
// Isolation. Same format as expansion-sample.mjs / welcome-home-title.mjs /
// rise-above-A/B (no shaders/opacity — added at cast time).
//
// Phase ids/bounds/intensities are the journeys' current ones; `music`
// names the deep-analysis sections each phase holds. Each keeps its
// identity (Interplay's amber/blue duet, The Knife's blade of light in black
// glass, 2019's year held in a dew drop, the Jam's reawakened molten seam,
// Playa's cracked clay flats, Isolation's lone light in a fog sea),
// transfigured per law L. Welcome Home album law (Karel): hint, never
// literal — no houses, rooms, furniture or streets.
// Sparse valleys: Interplay = 1:29 Lifting Recession (near-silent at 1:55);
// The Knife = 1:00 Bb Pedal Undertow; 2019 = 1:27 Line-Cliché Reverie;
// The Knife (Jam) = 3:46 Subdominant Shadows; Playa = 1:51 Ebbing Refrain;
// Isolation = 2:15 Hollow Return.

export const SET = { key: "b2-c3A", presenting: "Welcome Home" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "27f52cf0-5fad-420f-8324-8017c414f1f8",
    name: "Interplay",
    world: "F major rubato duet over an F pedal — two voices trading leaping figures in add9 and 6/9 colour, suspension over resolution, an ardent Mixolydian swell at 0:57, a near-silent lift at 1:55, a radiant Fmaj7 crest at 2:26 and an open Fadd9 left unresolved — two lights in conversation, one honey-amber and one pale cool-blue: two dew-lights sliding toward each other, two currents of light marbling into one, two star-streams in counterpoint, a veil of lit mist lifting off still water, and two glows resting apart at the end, each carrying a trace of the other's colour",
    phases: [
      P("threshold", 0, 0.127, 0.37, "threshold", "0:00-0:20 Floating Invitation (a lone F fifth opening into hovering clusters, C7sus pulling toward a home not yet confirmed)", [
        S("sparse", "DARK BACKGROUND — a single small bead of honey-amber light resting on the curve of a dark leaf in the lower left of vast darkness, a second smaller bead of pale cool-blue light a little way along the same luminous vein, the two not yet touching, nearly the entire frame empty"),
        S("micro", "extreme macro — the two beads of light at closest range sliding slowly toward each other along a glowing vein, one holding a tiny curved world of warm gold, the other a world of soft blue morning, translucent and trembling, deep indigo darkness all around"),
        S("aerial", "from high above, looking straight down on dark rolling land at first light, two faint luminous ribbons of light winding far apart across it, one honey gold and one pale blue, their slow curves answering each other like call and reply, the camera beginning to descend"),
      ]),
      P("expansion", 0.127, 0.362, 0.85, "expansion", "0:20-0:57 Pedal and Reply (the low F pedal arrives; leaping figures traded over add9 and 6/9 chords, brief Eb and Dm7 shadows)", [
        S("interior", "inside the place where two currents of light meet, honey-amber and pale-blue streams folding into one another in slow marbled sheets all around, fine luminous spray catching both colours, the camera gliding through the seam"),
        S("micro", "macro — the meeting line at closest range, amber and blue light interleaving around one smooth dark stone, tiny bubbles of light carrying each colour into the other, a faint sage-green glow at the edges"),
        S("aerial", "looking straight down from great height on two winding ribbons of light, one gold and one blue, curving toward each other across dark country bend by bend, flickers of light leaping between them in reply, surreal and calm"),
      ]),
      P("transcendence", 0.362, 0.565, 1, "transcendence", "0:57-1:29 Mixolydian Swell (Cm9 → F7 → Bbmaj9/F, a web of sus4 chords holding longing at full volume)", [
        S("cosmic", "cosmic — two vast rivers of stars streaming past one another across infinite darkness, one warm honey-gold and one cool cool-blue, their crossings flaring white-gold, counterpoint at galactic scale, the camera rising through the place where they cross"),
        S("abstract", "abstract — two spirals of light, amber and pale blue, turning around a shared centre in the upper right of deep darkness, each arm shedding motes into the other, the gold thickening into a warm humming haze, weightless and ardent"),
        S("micro", "extreme macro — a single spark at the crossing point at closest range, half honey-amber and half cool-blue, dusty rose light blooming where the two colours fuse, fine luminous particles spinning outward into the dark"),
      ]),
      P("illumination", 0.565, 0.787, 0.78, "integration", "1:29-2:04 Lifting Recession (Csus4 ↔ Fadd9, higher but receding, nearly silent at 1:55) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small veil of luminous mist lifting slowly from black still water in the upper right of vast darkness, a single faint amber glow held inside it, nearly the entire frame empty"),
        S("aerial", "looking straight down on still dark water going mirror-calm at dusk, faint luminous mist rising off it in slow translucent sheets, one blue glow and one amber glow drifting apart far below, the camera rising gently"),
        S("abstract", "abstract — two slow drifting veils of luminous mist, one gold and one pale blue, interleaved like threads of smoke high in deep darkness, a held suspension, the space between them brightening softly while everything below fades away, impossibly still"),
      ], { sparse: true }),
      P("return", 0.787, 0.895, 0.83, "illumination", "2:04-2:21 Homeward Descent begins (a brighter wave, clear major triads over a bass stepping F–E–D–C)", [
        S("interior", "inside a slow rising tide of warm light, amber and cool-blue currents climbing together through layered veils of luminous mist, broad bands of deep gold stepping downward beneath them, the camera pushing forward through the swell"),
        S("intimate", "close — two almost-presences of light hovering over dark water, one amber and one blue, translucent and featureless, circling one another slowly like elders greeting, half-gathered out of the water's own glow"),
        S("micro", "macro — paired sparks lifting off a dark surface two by two where the lights cross, each pair one gold and one blue, luminous particles rising in small bright spirals"),
      ]),
      P("integration", 0.895, 1, 0.83, "integration", "2:21-2:38 Homeward Descent (the 2:26 radiant Fmaj7 crest, softening to an open Fadd9 — the door left open)", [
        S("cosmic", "cosmic — the two star-streams fused for one breath into a single radiant spiral of warm gold light across an immense star field, a halo of pale blue around its rim, then beginning to part again, the camera pulling back to reveal both arms"),
        S("sparse", "DARK BACKGROUND — two small glows resting apart on dark luminous water in the lower left of vast darkness, the amber one tinged faintly blue, the blue one tinged faintly gold, each changed by the meeting, nearly the entire frame empty"),
        S("micro", "extreme macro — the last bead of light at closest range, honey-amber and cool-blue swirled together inside it without merging, a tiny luminous world left open, dissolving softly into indigo"),
      ]),
    ],
    morphs: [
      "the camera descends between the two ribbons of light until amber and blue currents fold around it in slow marbled sheets",
      "the marbled currents widen and the camera rises through them until two rivers of stars stream past each other in the dark",
      "the spark at the crossing dims and the camera settles close on one small veil of lit mist lifting alone from black water",
      "the held arcs brighten and the camera pushes forward into a rising tide of amber and blue light",
      "the paired sparks rise and the camera pulls back as they gather into one radiant spiral of gold across the stars",
    ],
  },
  {
    id: "00fcca2b-bc1e-461a-8dcd-3fff74587f3e",
    name: "The Knife",
    world: "F minor pentatonic unrest voiced in open fifths and quartal clusters, reaching twice for the warmth of Db major (0:49 and the 1:41 climax) and twice cut back to a bare Bb fifth, dissolving unresolved into near-silence — a blade of white light in a cold black-glass world: a razor line catching steel-blue side-light, fractures spidering through dark glass, an undertow of cold light beneath a still surface, amber warmth pouring through one immense fracture at the crest, and a single taut line of light fading into fog",
    phases: [
      P("threshold", 0, 0.151, 0.9, "threshold", "0:00-0:22 Open-Fifth Threshold (Bb7sus4, Ab-bass quartal clusters, Fsus4 — a blade held still and catching light)", [
        S("sparse", "DARK BACKGROUND — a single razor-thin vertical line of white light standing in the right third of pure black, its edges impossibly sharp, a faint cold steel-blue gleam pooling at its base, nearly the entire frame empty"),
        S("micro", "extreme macro — the line's edge at closest range, black parting from black along a boundary of pure white light thinner than anything, sharp intermittent glints running along it like a held breath, slate shadow on both sides"),
        S("aerial", "from directly above, a cold flat expanse of dark grey glass at dawn filling the frame edge to edge, its surface creased by sharp intermittent glints of white light, one long hard seam running the diagonal, the camera descending toward it"),
      ]),
      P("expansion", 0.151, 0.412, 0.96, "expansion", "0:22-1:00 Pentatonic Surge to Db (the same material circling with growing insistence, breaking into Db6/9 at 0:49 — the first warmth)", [
        S("abstract", "abstract — pressure made visible: fine white stress-lines spidering out from one edge through dark glass in the lower left, stacked fourths of light branching at clean angles, the material deciding where to give, steel-blue glow beneath"),
        S("micro", "macro — the point where a blade-thin plane of light meets black glass at closest range, a single ember of amber and rose light igniting there, the first warmth welling up through the cold"),
        S("aerial", "looking straight down on a steel-grey expanse of dark glass under low mist, the mist splitting for a moment to let one luminous band of amber light fall across it in a long diagonal, surreal and sharp, the camera pushing in"),
      ]),
      P("transcendence", 0.412, 0.562, 0.89, "integration", "1:00-1:22 Bb Pedal Undertow (the warmth drains onto a deep Bb pedal, darker and softer but churning beneath the surface) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small sliver of cold blue light resting deep in the lower left of vast black stillness, a faint second glow churning far beneath it, nearly the entire frame empty"),
        S("interior", "beneath the surface of a still black glassy deep, slow cold currents of steel-blue light pulling steadily away into the dark, fine luminous particles streaming with them, the surface above unmoving"),
        S("micro", "extreme macro — the edge of a dark glass sheet at closest range, layered strata of black and slate with a hairline of dim violet light trapped inside, trembling with a low churning pulse"),
      ], { sparse: true }),
      P("illumination", 0.562, 0.693, 1, "transcendence", "1:22-1:41 Bbm9 Ascent (through Bbm9 at 1:26, the most openly minor moment, to a broad Db6 at 1:35)", [
        S("cosmic", "cosmic — an immense fracture of white light splitting the darkness of deep space from corner to corner, cold steel-blue nebula haze on one side, molten amber light pouring through the widening gap on the other, countless shards of black glass glittering along its edges, the camera rising through the breach"),
        S("micro", "macro — the parted depth of the great fracture at closest range, black glass strata parted clean, rose and amber light rising between the parted layers like heat, tiny prismatic glints at every edge"),
        S("aerial", "looking straight down on a vast field of black glass from great height, fractures glowing cold white in branching cuts, one long fracture running the diagonal with amber light welling up in its depth, prismatic and sharp"),
      ]),
      P("return", 0.693, 0.837, 0.97, "illumination", "1:41-2:02 Db Crest and Descent (the climax saturated with Db6/9 radiance, the register sinking, pared back to the bare Bb/F fifth by 1:54)", [
        S("abstract", "abstract — sheets of saturated amber and rose light standing between suspended planes of black glass, mid-split, every gap flooding with warmth that slowly sinks toward the lower edge as cold shadow climbs from above, kaleidoscopic and still"),
        S("intimate", "close — two separated planes of dark glass inches apart, their matching edges mirroring each other, a sheet of fading amber light standing in the gap like a blade at rest, the camera drifting into the gap"),
        S("micro", "extreme macro — a last bead of amber warmth sinking into dark glass at closest range, its glow thinning to bone white and slate as the cold returns, fine luminous dust settling"),
      ]),
      P("integration", 0.837, 1, 0.37, "integration", "2:02-2:26 Bb Fifths Dissolve (the open fifth alone, a flicker of Bb7 at 2:13, near-silence by 2:20, never cadencing)", [
        S("aerial", "from high above, a dim empty expanse of dark glass dissolving into still fog, one taut line of pale light stretched across it from edge to edge, its shimmer fading, the camera slowly pulling back"),
        S("micro", "macro — the taut line of light at closest range, its fine vibration slowing to stillness, cold blue-grey haze closing softly around it, a faint violet afterglow along its length"),
        S("sparse", "DARK BACKGROUND — a single thin line of pale light resting low in the lower right of vast black stillness, soft at its ends, the bookend of the first blade, unresolved and quiet, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends into the creased glass until fine stress-lines of white light spider out around it",
      "the band of amber dims and the camera sinks below the dark surface toward one small sliver of cold blue light",
      "the trapped violet hairline brightens and the camera rises through it as an immense fracture of light splits open across deep space",
      "the branching cuts lift and the camera glides between suspended planes of glass flooded with amber light",
      "the last warmth sinks and the camera rises to look down on one taut line of light stretched across the fog",
    ],
  },
  {
    id: "eb79818b-c7e8-45a7-886c-2a432fe83332",
    name: "2019",
    world: "G major hymn-like meditation turning one consoling C/G → G → D/A cycle every ~23 seconds, a chromatic G–G+–G6 ache inside it, fullest bloom at 1:04, an inward reverie at 1:27, a deep bridge swell to the 2:27 climax and a high fading coda on a bare open fifth — a year kept in a drop of light: dew spheres strung on fine strands of light each holding a tiny amber sky, seed-down glowing in raking beams, a sea of honey haze from above, sparks of cold gold blinking under a passing shade, a slow swell of gold rising from deep dark, and the last grain of amber held in one dark drop",
    phases: [
      P("threshold", 0, 0.185, 0.86, "threshold", "0:00-0:41 Opening Glow (a long G over a deep pedal, a suspended dominant, a shimmering Lydian C/G — a place being recognised)", [
        S("sparse", "DARK BACKGROUND — a single small drop of dew strung on one fine luminous strand in the lower left of vast darkness, a tiny amber sky glowing inside it, nearly the entire frame empty"),
        S("micro", "extreme macro — a dew drop on a fine strand at closest range, filled with soft amber glow and drifting gold motes, its curve bending a blur of warm light, long even waves of luminous mist lifting behind it"),
        S("aerial", "from high above, looking straight down on dark rolling land at first light, long even waves of luminous mist lifting off it in honey-gold bands, low warm side-light slowly filling the frame, the camera beginning to descend"),
      ]),
      P("expansion", 0.185, 0.289, 0.92, "expansion", "0:41-1:04 Rocking Return (the rocking inner figure, the progression familiar and safe)", [
        S("abstract", "abstract — a wheel of fine strands of light strung with dozens of glowing dew spheres, rocking gently in the upper right of deep darkness, each sphere holding a different shade of amber and rose, turning slowly like a held memory"),
        S("interior", "inside a slow luminous current of honey light bending through darkness, its surface barely rippling, fine motes of gold carried along with it, the camera gliding through the bend"),
        S("micro", "macro — one seed-down at closest range backlit to a burst of gold filaments, drifting weightless through a beam of amber light, a soft sage-green glow at its base"),
      ]),
      P("transcendence", 0.289, 0.393, 1, "transcendence", "1:04-1:27 Fullest Bloom (the thickest voicings, the G–G+ chromatic ache twice, repeated Dsus4 sighs)", [
        S("cosmic", "cosmic — an immense sea of honey-gold haze seen from the edge of space, slow currents of pollen-light swirling between dark ridges into a vast luminous spiral, motes suspended in the gold like galaxies, the camera rising through the glow"),
        S("micro", "extreme macro — motes of light suspended in a beam of late gold at closest range, each mote a tiny sphere of amber and rose, the chromatic ache rendered as a faint violet shimmer turning through them"),
        S("aerial", "looking straight down from great height on gold country at fullest bloom, long beams of light pooling between layered ridges like honey settling, surreal and still, one bend of luminous mist returning the peach glow"),
      ]),
      P("illumination", 0.393, 0.687, 0.79, "integration", "1:27-2:32 Line-Cliché Reverie (the G6 line, a plagal hover, receding — a smile turning into nostalgia) → Deep Bridge Swell (1:54, descent to G1, the held tonic swelling to the 2:27 climax) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small spark of cold gold light blinking in the upper right of vast dusky darkness, a slow shade of violet passing over it, nearly the entire frame empty"),
        S("aerial", "from high above, a slow shadow of violet drifting across dark folds of land at dusk, a scatter of tiny gold sparks blinking awake beneath it, the light dimming and warming as the shade passes, translucent and dreamlike"),
        S("cosmic", "cosmic — a long slow swell of gold light rising out of deep darkness and cresting in a bright foam of luminous particles across an immense star field, the camera pushing in toward the crest"),
      ], { sparse: true }),
      P("return", 0.687, 0.79, 0.9, "illumination", "2:32-2:55 Afterglow Cycle (bright and slightly quicker, reaching up to D#6 while already easing down)", [
        S("micro", "macro — glitter of light scattering across a dark mirror at closest range just after a breath of air, each glint a tiny amber star calming to a smooth sheen"),
        S("abstract", "abstract — rows of cold gold sparks drifting upward in slow diagonal lines through deepening dusk violet, blinking in a rocking rhythm, each line a little higher than the last, weightless"),
        S("intimate", "close — a cluster of dew spheres on a dark strand at last light, each holding a sliver of rose fading to violet, one sphere slipping free with a soft flash of gold, the camera drawing toward it"),
      ]),
      P("integration", 0.79, 1, 0.37, "integration", "2:55-3:41 High Fading Coda (Cmaj13, C6/9, Em11 colour in high airy voicings, a last G+ passing, a bare open fifth fading to near silence)", [
        S("aerial", "looking straight down from immense height on a dark mirror of still water at dusk, the last pale gold thinning to violet across its luminous surface, one thin seam of amber resting along its lower edge, the camera rising slowly"),
        S("cosmic", "cosmic — a thin seam of deepest amber seen from far above beneath an immense field of sharpening stars, two or three sparks of gold keeping the year lit, cold silver haze high overhead, the camera pulling back"),
        S("sparse", "DARK BACKGROUND — a single dark drop of dew on a fine strand in the lower left of vast starlit darkness, one last grain of amber light still held inside it, the bookend of the first drop, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the camera descends through the lifting mist until a wheel of fine light strung with glowing dew spheres turns in the dark",
      "the seed-down drifts upward and the camera rises with it into an immense sea of honey haze",
      "the gold pools dim and the camera settles close on one small spark blinking alone under a passing shade of violet",
      "the swell's foam of light scatters and the camera descends onto glints calming across a dark mirror",
      "the dew sphere slips free and the camera rises to look down on the last pale gold thinning across still water",
    ],
  },
  {
    id: "5a3beb75-4788-4448-a024-4bfae30040c3",
    name: "The Knife (Jam)",
    world: "C# major free-time improvisation in suspended quartal colour under a constant F-minor shadow, swelling on a low drone, summiting on an unresolved C#sus2 at 2:19, sinking into hushed subdominant shadows at 3:46, spelling out its home key from 4:19, an altered-dominant gust at 5:04, a last minor flare and a maj7 glow before a bare C# fifth — The Knife's healed seam reawakened as live improvisation: molten gold welling through black glass under slate mist, light forking along unplanned seams, the summit as a vast suspension of shards in golden side-light, a hush of teal shadow, a storm of shards wheeling round a molten core, and the session resting as cooled bronze filigree with one seam still breathing",
    phases: [
      P("threshold", 0, 0.262, 0.9, "threshold", "0:00-1:54 Quartal Haze (D#sus24/G#, A#7sus4, no third) → Bass Drone Swell (0:58, A#5 drone, C#M13#11 warmth) → Deceptive Turn (1:28, the side-step into C# at 1:50)", [
        S("sparse", "DARK BACKGROUND — a single small seam of light glowing again in the lower right of vast darkness under drifting slate mist, molten orange bleeding into its white core, nearly the entire frame empty"),
        S("micro", "extreme macro — one branch-tip of the seam at closest range splitting dark glass layer by layer, rose-gold light welling into each new hairline as it opens, cool blue-grey haze beyond"),
        S("aerial", "from directly above, a dark plane of black glass under low mist filling the frame edge to edge, the reawakened seam pulsing brighter as a slow luminous tide presses along it, its first branches forking toward a shaft of amber light in the upper left, the camera descending"),
      ]),
      P("expansion", 0.262, 0.52, 0.84, "expansion", "1:54-3:46 Suspended Summit (C#maj9 climbing to the unresolved C#sus2 at 2:19-2:25, then a long exhalation to near-silence by 3:35)", [
        S("cosmic", "cosmic — a vast suspension of black glass shards hanging motionless across deep space, broad golden side-light breaking over them all at once, each shard edged in rose-gold, a pale nebula haze beyond, the camera rising through the summit"),
        S("interior", "inside a fresh crack as it runs, planes of black glass parting ahead of the camera, molten gold light chasing from behind and forking into unplanned seams, luminous and fast"),
        S("abstract", "abstract — light forking and rejoining in jagged live lines through deep darkness, molten gold welling at every junction while older lines cool to pale silver, the whole web slowly exhaling into dusk"),
      ]),
      P("transcendence", 0.52, 0.596, 0.73, "integration", "3:46-4:19 Subdominant Shadows (a hushed F#6add9 over C# pedals, a brief chromatic smear of doubt) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small ember of rose-gold light resting in the upper left of vast deep-teal darkness, a faint grey shadow drifting across it, nearly the entire frame empty"),
        S("micro", "macro — black glass crust at closest range thinning to amber where a hidden warmth rises beneath it, a new hairline of light glowing awake across the frame, teal shadow pooled in its creases"),
        S("aerial", "looking straight down from very high above on a dark volcanic expanse at twilight, faint copper filigree veining the crust in branching luminous lines, deep teal shadow greying the edges, one line stirring brighter"),
      ], { sparse: true }),
      P("illumination", 0.596, 0.759, 0.9, "transcendence", "4:19-5:30 Db Homecoming (C#–G#7–C#–F#–C# spelled out plainly) → Altered Ascent (5:04, G#7b9/#9/#11 gusting, resolving to C#maj9)", [
        S("abstract", "abstract — warmth spreading in slow concentric waves of amber and rose-gold light across deep darkness from the lower left, each ring crossing older seams of cooled silver, kaleidoscopic and calm"),
        S("cosmic", "cosmic — a kaleidoscope of obsidian shards tumbling through deep space in a gust, every fragment mid-turn with light streaming off its edges, white heat and ember orange trading lead around a core of molten light in the upper right, the camera diving through"),
        S("micro", "extreme macro — sparks of light flashing off a wet dark surface at closest range, each spark splitting into rose and gold, fine luminous spray streaking upward on a rising gust"),
      ]),
      P("return", 0.759, 0.916, 0.85, "illumination", "5:30-6:38 F Minor Return (one last F7#9 flare at 5:51, dissolving into sus chords) → Major Seventh Glow (6:09, C#maj7 in full)", [
        S("interior", "within the deep shade beneath a vast suspended mobile of dark glass fragments, a single shaft of warm light sliding slowly across their cooled copper bindings, slate and teal all around, the camera drifting upward through it"),
        S("intimate", "close — a current of warm light half-gathered into an almost-presence, translucent and featureless, moving slowly along cooled copper seams and pausing at each joint as if listening, dissolving at its edges into rose-gold haze"),
        S("aerial", "from high above, a wide expanse of dark glass flooding with late golden light in slow luminous waves, every seam glowing warm at once, the filigree written across the whole ground in amber"),
      ]),
      P("integration", 0.916, 1, 0.37, "integration", "6:38-7:15 Open Fifth Fade (rocking G# sus / C# fifths, ending on a bare C#5 — home with the last word suspended)", [
        S("micro", "macro — one cooled seam in dark volcanic glass at closest range, a last thread of copper light flowing slowly inside the crack, silver haze thinning over the black surface"),
        S("cosmic", "cosmic — the whole session seen from far away as a faint tangle of dark lines hung in infinite darkness, a tiny glint of light caught at every joint, dissolving into evening haze, the camera pulling back"),
        S("sparse", "DARK BACKGROUND — a single small seam of dim orange light still breathing in the lower right of vast darkness, the bookend of the first seam, warm but left open, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the seam's branches reach the amber shaft and the camera rises past it into a vast suspension of glowing shards",
      "the forking web exhales and the camera drifts down to one small ember of rose-gold alone in teal darkness",
      "the stirring line flares and the camera pushes into it as warmth spreads in slow rings across the dark",
      "the tumbling shards slow and the camera glides beneath them into deep shade as one shaft of warm light slides across the bindings",
      "the amber waves settle and the camera pushes in on one cooled bronze binding with a thread of copper light inside",
    ],
  },
  {
    id: "5a3e5044-9da5-404e-b3d6-c0c4fc757a5b",
    name: "Playa",
    world: "E minor tide piece rocking between an inward Em7add11 refrain and brighter G-major swells (0:31, the high-water climax at 1:38), ebbing thinner at 1:51 and fading to a bare low E fifth — a dry lakebed dreaming of the tide: cracked clay polygons glittering with salt under rose dusk, mirage bands doubling the ground, a thin luminous flood spreading across the flats at the crest mirroring rose and violet, one polygon left holding amber as the light withdraws, and the crack-seams phosphorescent at night",
    phases: [
      P("threshold", 0, 0.186, 0.91, "threshold", "0:00-0:31 Low-Tide Refrain (Em7add11 rocking to G and Cmaj9#11 over a G pedal — a question asked softly)", [
        S("sparse", "DARK BACKGROUND — a single small polygon of pale cracked clay in the lower right of vast darkness, its curled edges catching faint rose dusk light, salt glittering in its fissures like embedded stars, nearly the entire frame empty"),
        S("micro", "extreme macro — inside one fissure at closest range, a miniature gorge with glittering salt sides, a thread of luminous violet haze far above it, every speck catching sea-glass green light"),
        S("aerial", "looking straight down at the cracked mosaic of a dry basin at dawn filling the frame edge to edge, a pale band of gold creeping slowly across the polygons like a returning tide, surreal and still, the camera beginning to descend"),
      ]),
      P("expansion", 0.186, 0.33, 1, "expansion", "0:31-0:55 Major Swell (G – A – Cadd9 – D into G major, peaking 0:45-0:50)", [
        S("abstract", "abstract — the crack mosaic doubled in a mirage: a second luminous net of polygons hanging inverted above the first, their lines almost aligning, bands of turquoise and gold light swelling between them"),
        S("micro", "macro — salt glitter scattering light at closest range as a breath of turquoise light washes over it, each speck a tiny prismatic spark, curled clay edges glowing gold"),
        S("interior", "inside a slow swell of turquoise and pale gold light rising over the flats, the glow scattering into countless luminous particles around the camera as it lifts through the crest"),
      ]),
      P("transcendence", 0.33, 0.486, 0.96, "illumination", "0:55-1:21 Refrain Returns (deeper Em9/Em11 colours, reflective rather than searching)", [
        S("aerial", "from high above, veils of silver light dissolving across the cracked flats as the glow slides back, overcast softness muting the colours, the polygon net showing through in faint sea-glass green"),
        S("intimate", "close — the cracked floor of the dry basin seen low at a grazing angle, a thin film of luminous silver light withdrawing across the polygons, the fissures glittering faintly rose"),
        S("abstract", "abstract — slow rocking bands of grey-green and amber light advancing and retreating across darkness in long two-breath swells, each return reaching a little less far, weightless and tidal"),
      ]),
      P("illumination", 0.486, 0.666, 1, "transcendence", "1:21-1:51 High-Water Climax (the major episode higher and stronger, Esus4 at 1:38, a broad Cadd9 – D – G cadence, the Am – D13 – Gmaj9 tag)", [
        S("cosmic", "cosmic — a vast mirror-thin flood of luminous water spreading across the cracked flats seen from the edge of space, reflecting rose and violet nebula light, the polygon net glowing through it like a galaxy map, the camera soaring over its leading edge"),
        S("micro", "extreme macro — spray of light at closest range lit gold in slow motion, each droplet a tiny prismatic sphere holding the whole rose and violet basin inverted, suspended at the crest"),
        S("aerial", "looking straight down at the flooded basin at the high-water mark, a thin sheet of luminous water filling the frame with rose and pale gold, a slow plume of glowing dust turning in place in the lower left, dissolving into motes"),
      ]),
      P("return", 0.666, 0.87, 0.8, "integration", "1:51-2:25 Ebbing Refrain (thinner and quieter, its G chords lingering 3 s at 2:22 as if reluctant to let go) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small polygon of clay still holding a film of amber light in the lower left of vast dusk darkness, the glow retreating across it, nearly the entire frame empty"),
        S("micro", "macro — smooth sea-worn stones of light at closest range as the last amber film slides off them, tiny beads of luminous water lingering in their hollows, low warm light raking across"),
        S("abstract", "abstract — stacked bands of liquid amber and rose haze bending and doubling as the mirage thins, the ground's bone glow smeared into slow ribbons, sinking toward deep blue"),
      ], { sparse: true }),
      P("integration", 0.87, 1, 0.37, "integration", "2:25-2:47 Open-Fifth Afterglow (a deep E open fifth, the third flickering in and out, near silence at 2:41)", [
        S("cosmic", "cosmic — the basin seen from the night, a faint phosphorescent filigree of cracks glowing on dark earth beneath hazed stars, the desert dreaming in its own lines, the camera pulling back into deep blue"),
        S("micro", "macro — one crack's phosphorescent seam at closest range, a faint green-violet vein in dark clay, the day's warmth spending itself as luminous particles"),
        S("sparse", "DARK BACKGROUND — a single small polygon of pale clay resting in the lower right of vast deep-blue darkness, its seams glowing faintly violet, the bookend of the first light, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the band of gold crosses the mosaic and the camera rises into the mirage where a second net of polygons hangs inverted",
      "the swell's particles settle and the camera rises to look down as silver veils dissolve across the flats",
      "the rocking bands of light surge and the camera soars up as a thin luminous flood spreads across the basin",
      "the plume of glowing dust dissolves and the camera descends to one small polygon still holding a film of amber light",
      "the mirage ribbons sink to blue and the camera pulls back into the night until the cracks glow as faint filigree beneath the stars",
    ],
  },
  {
    id: "08f4c26e-4185-440a-a25c-2440e8e7ae47",
    name: "Isolation",
    world: "G minor ostinato circling a G pedal every 13.7 seconds, a loop that breaks at 1:00 into a harmonic-minor reach, cries out at 1:56, then returns hollow and drained and thins to a bare G fifth — solitude as one small held light in a sea of fog: a lone wind-bent outcrop in pearl-grey night, beads tracing the same lines down dark bark, rings of mist orbiting a cold glow, hard white shafts tearing the shroud at the cry, the fog closing back in grey and numb, a slow pale beam sweeping the same arc, and at the end a single point of light smaller than at the start",
    phases: [
      P("threshold", 0, 0.298, 0.78, "threshold", "0:00-1:00 Circling Ostinato (Gm → Eb/G → Cm/G → a chromatic slide onto D5/A, four bars repeated) → Reaching Within Walls (0:35, the melody pressing up to A5)", [
        S("sparse", "DARK BACKGROUND — one small rocky island bearing a single wind-bent pine alone in a sea of translucent night fog, lit by a pale cold sheen, tiny in the lower left of an enormous dark frame, nearly the entire frame empty"),
        S("micro", "extreme macro — luminous rain beads on dark wind-carved bark at closest range, each bead tracing the same bright line down the grain again and again, one bead holding a faint cold glint of light, slate darkness beyond"),
        S("aerial", "looking straight down from high above on a vast sea of pearl-grey fog, slow rings of luminous mist circling one small dark outcrop in the lower right again and again, the camera turning in a slow orbit as it descends"),
      ]),
      P("expansion", 0.298, 0.497, 0.89, "expansion", "1:00-1:40 Dominant Threshold (the loop breaks: D5/A held 4.5 s, D7b9, F# and D# diminished, Am7b5, reaching out to C#6)", [
        S("abstract", "abstract — the circle breaking: concentric rings of pewter light spun out of their orbit into a long rising spiral, cold light spilling at an angle through pale mist, reaching outward toward the upper right"),
        S("micro", "macro — wind-bent needles at closest range, each holding a bead of condensed fog lit faint silver-blue, one drop trembling on the point of falling, a hard cold glint growing inside it"),
        S("interior", "inside the fog itself, abstract pearl-grey depth with no ground and no horizon, cold light spilling in at a steep angle as long translucent rays through drifting veils of luminous mist, direction dissolved, empty of any form, the camera rising through"),
      ]),
      P("transcendence", 0.497, 0.67, 1, "transcendence", "1:40-2:15 Harmonic-Minor Cry (Gm(maj7) and D7b9 trading blows, peaking at 1:56 on GmMaj9b6 with Eb6 ringing at the top)", [
        S("cosmic", "cosmic — seen from directly overhead at immense height, the top of an endless sea of cloud torn open in one long rift, hard white light pouring upward through the tear and glaring frost white across the grey shroud, ice-bright particles swirling in the gale"),
        S("micro", "extreme macro — frost forming at closest range on a dark needle in the white glare, fractal ice ferns branching across it in seconds, each tip blazing with the hard light"),
        S("aerial", "from directly above, a vast frozen expanse of luminous ice under torn grey cloud, one sudden diagonal shaft of white light glaring across it, the small dark island a speck in the lower left, surreal and exposed"),
      ]),
      P("illumination", 0.67, 0.775, 0.69, "integration", "2:15-2:36 Hollow Return (a single Gm held 8.5 s, then the old ostinato quieter and slower, as if the outburst changed nothing) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small point of cold grey light in the lower right of vast fog darkness, dimmed and drained, the mist settling back around it, nearly the entire frame empty"),
        S("aerial", "looking straight down on dense cold fog settling in slow even grey layers over dark still water, the luminous shroud closing seamless to every edge, one dim point fading beneath it, impossibly still"),
        S("micro", "macro — fine motes of grey mist settling at closest range onto dark stone after the cry, each mote dull pewter, the echo fading into stillness, translucent and numb"),
      ], { sparse: true }),
      P("return", 0.775, 0.879, 0.81, "return", "2:36-2:57 The Loop Again (twice more, busier but capped below Bb4 — the routine of being alone)", [
        S("abstract", "abstract — a slow pale beam of light sweeping the same arc through dark fog again and again, each pass leaving a faint luminous trace layered over the last, the arcs stacking without ever changing, the camera circling with it"),
        S("interior", "beneath the surface of dark rippling water looking up, the sweeping beam a pale smear crossing the translucent fog above again and again, the ripples never changing"),
        S("micro", "macro — a single luminous bead of rain on dark stone at closest range catching the sweeping beam once per pass, flaring pale silver then going dark, the loop held inside one drop"),
      ]),
      P("integration", 0.879, 1, 0.37, "integration", "2:57-3:21 Fading to Fifths (the last chromatic turn onto D5/A, a brief Gm6 glint, a bare G5 at 3:14 — simply empty)", [
        S("cosmic", "cosmic — from far above, the fog sea gone dark beneath faint cold stars in high thin haze, the outcrop a tiny shadow, its small light banked so low it barely shows, smaller and emptier than at the start, the camera pulling back"),
        S("micro", "extreme macro — the last thread of pale mist rising at closest range from a dying point of light, curling into darkness, a faint amber glint flickering once toward warmth and fading"),
        S("sparse", "DARK BACKGROUND — a single tiny point of cold light alone in the lower left of vast darkness, smaller than the first light, neither warm nor cold, the bookend of the island's glow, nearly the entire frame empty"),
      ]),
    ],
    morphs: [
      "the circling rings of mist spin outward and the camera follows them as they unwind into a long rising spiral of pewter light",
      "the veils of mist tear and the camera soars up through the rift into hard white shafts of light",
      "the glare fades and the camera sinks down to one small point of cold grey light alone in the settling fog",
      "the grey layers stir and the camera begins to circle with a slow pale beam sweeping the same arc",
      "the flaring drop goes dark and the camera rises far above the fog until one tiny light barely shows beneath faint stars",
    ],
  },
];
