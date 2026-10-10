// Expansion — Journey Archetype shot lists, batch 4 (2026-10-09):
// Night Wind 5, Loire 5A, Tranquility 34, Chemiluminescence,
// Surrounded by Light 3, Nothing 30, Rise 1, Chenin 5.
//
// Same format as expansion-sample.mjs (Karel-approved model) minus the
// shader casts / opacity arcs. Phase ids, bounds and intensities are the
// journeys' CURRENT ones (copied exactly); `music` names the deep-analysis
// sections each phase holds. Each journey keeps its analysis-derived world
// (theme.worldRationale + palette), TRANSFIGURED per law 10a, with ONE
// authored sparse phase at the music's real interior valley.
// Applied by scripts/mv-rollout/apply-shotlists.mjs.

export const SET = { key: "expansion-batch-4", presenting: "Expansion" };

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "954a7000-91ba-42eb-b5a7-a8d5bc21c8c2",
    name: "Night Wind 5",
    world: "C# major nocturne forever blown toward A# minor, 'slow moving air' of rolling figuration under moonlight — a night range of dunes where the wind is made visible as luminous veils of sand: one veil lifting on a first breath, gusts sweeping silver waves across the crests, a held Lydian eddy, the whole range ignited into a shimmering tide with a cool undertow moving through the troughs, one great crest suspended and spilling away, then still clear air and a single veil at rest",
    phases: [
      P("threshold", 0, 0.176, 0.5, "threshold", "0:00-0:37 Gathering Air (soft C#add9, weather approaching)", [
        S("sparse", "DARK BACKGROUND — a single thin veil of luminous sand lifting off one knife-edge crest in the lower right of vast darkness, cool silver moonlight caught inside the drifting veil, a first breath of night wind, the rest of the frame open black"),
        S("micro", "extreme macro — individual grains of sand lifting off the crest at closest range, each grain a tiny spark of silver and warm amber light, suspended weightless at different depths in soft darkness"),
        S("aerial", "from high above, looking straight down on endless dark dune crests in deep indigo night, faint silver light tracing each sharp ridge like a drawn line, the first luminous veils beginning to stir, the camera descending toward them"),
      ]),
      P("expansion", 0.176, 0.353, 0.97, "expansion", "0:37-1:14 First Gust (F#maj9, sus chords on D#, the long Lydian F# hold)", [
        S("interior", "inside the rising gust, long veils of luminous sand streaming past on every side and filling the frame, silver and warm amber light rippling through them in wave after wave, the camera riding the wind"),
        S("aerial", "looking straight down as wave after wave of glowing sand-veil sweeps across the dark ridges, every crest trailing a long translucent plume of silver light in the same direction, the camera gliding with the gust"),
        S("micro", "macro — wind-carved ripples at closest range, each tiny ridge edged with a thin line of moonlit silver, loose grains skipping over them in glittering streams of light"),
      ]),
      P("transcendence", 0.353, 0.491, 0.87, "integration", "1:14-1:43 Lydian Eddy (the lull, C#maj9 at its most luminous, receding) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small eddy of glowing silver sand curling slowly in the upper left of immense darkness, a few fine motes drifting away from it, nearly the entire frame empty"),
        S("abstract", "abstract — slow spiral eddies of pale silver and pearl light turning in the dark air, their edges dissolving into fine particles, the wind briefly holding its breath"),
        S("micro", "extreme macro inside a hanging veil, countless suspended motes of moonlit silver at different depths, shallow focus, one brief clear shaft of moonlight passing through them"),
      ], { sparse: true }),
      P("illumination", 0.491, 0.711, 0.96, "transcendence", "1:43-2:29 Minor Undertow (A# minor, cool and insistent) → Tonic Shimmer (2:08, the warmest, fullest stretch)", [
        S("cosmic", "cosmic — from immense height the whole range of dune crests becomes a vast shimmering tide of silver and warm gold light, every ridge streaming a luminous veil in the same direction, a deeper indigo shadow moving slowly through the troughs, infinite darkness at the edges"),
        S("micro", "macro at the height of the shimmer — one veil of wind-blown sand blazing silver-white and amber as it pours over a crest, countless glittering particles against the dark"),
        S("abstract", "abstract — long diagonal ribbons of slate blue and moonlit silver light driving across black in insistent parallel bands, cool and rain-dark, warming to gold along one edge"),
      ]),
      P("return", 0.711, 0.82, 0.91, "return", "2:29-2:52 Crest and Fall (crest 2:41 on F#maj7/C#, a glowing suspension, then the energy pours away)", [
        S("aerial", "from high above, one great crest of luminous sand-veil lifting into a single glowing wave of silver and gold light, hanging suspended for a breath before it spills down the far slope into deep indigo shadow, the camera pulling back"),
        S("intimate", "close — the last veil of light sliding down a dark slope in slow golden slants, fine motes settling one by one onto the sand, the ripples going still, a cool indigo hush gathering in the troughs below"),
        S("aerial", "rising slowly away while looking straight down, the dune crests dimming to faint silver lines drawn across black, the wind dying, the last luminous veils settling, darkness folding softly over the troughs"),
      ]),
      P("integration", 0.82, 1, 0.37, "integration", "2:52-3:30 Stilled Night Air (high bass-less coda, quietest 3:01, rocks to rest on C#)", [
        S("cosmic", "cosmic — from immense height the stilled dunes become faint pale curves beneath a clear quiet star field, cool thin light everywhere, the night air utterly still"),
        S("sparse", "DARK BACKGROUND — a single thin veil of silver sand resting in the lower right of vast darkness, a few last motes settling onto one quiet crest, the bookend of the first breath of wind"),
        S("micro", "extreme macro — a knife-edge crest at closest range, a few grains of sand glowing pale silver along it, thin veils of luminous sand trailing off it into darkness, translucent and dissolving"),
      ]),
    ],
    morphs: [
      "the camera descends toward the stirring crests until it is riding inside a rising gust of luminous sand-veils",
      "the ripples go still and the camera settles close on one small eddy of silver sand turning alone in the dark",
      "the hanging motes gather and the camera pulls back to immense height as the whole range ignites into a shimmering tide of light",
      "the ribbons of light swell and the camera follows one great crest of sand-veil lifting into a suspended wave",
      "the camera keeps rising until the dune crests are faint pale curves beneath a quiet star field",
    ],
  },
  {
    id: "81683231-3b3c-4542-8696-13dfcf56469a",
    name: "Loire 5A",
    world: "F minor, low and circling, pedal-sustained rolling figuration that swells to a grave climax and never brightens — the flood in deep evening seen as dark liquid light: one slow boil of current, layered sheets of moving water, the whole flood heaving at the 1:55 crest, a faint warm band turning toward Db, a fragile pale-gold clearing where the mist lifts, and a last amber seam sinking into dusk on a bare open fifth",
    phases: [
      P("threshold", 0, 0.05, 1, "threshold", "0:00-0:11 Murmured Invocation (the core loop asked as a question)", [
        S("sparse", "DARK BACKGROUND — a single slow boil of current surfacing on near-black water in the lower left of vast darkness, one faint silver seam of light curling at its edge, translucent mist breathing above it, the rest of the frame open black"),
        S("micro", "extreme macro — the smooth dark skin of deep moving water at closest range, fine filaments of pewter light sliding across it, tiny droplets of mist suspended just above, luminous and still"),
        S("aerial", "from high above, looking straight down on a broad dark flood under heavy mist, slow folds of current traced in faint luminous silver seams across the whole frame, the camera beginning to descend toward them"),
      ]),
      P("expansion", 0.05, 0.484, 0.56, "expansion", "0:11-1:47 Murmured Invocation → Gathering Current (0:34, the pulse locks in) → Pedal-Point Deepening (1:04) → Swelling Crest begins (1:27)", [
        S("interior", "beneath the surface of the dark flood, layers of slow current moving over one another like translucent sheets of smoked glass, faint pewter light filtering down through them, the camera gliding with the drift"),
        S("aerial", "looking straight down as the dark current widens and quickens, one great eddy turning back on itself in a slow spiral of luminous silver seams, deep green-black water filling the frame edge to edge"),
        S("micro", "macro — wet slate stones at the edge of the flood, their dark faces lit by thin threads of muted amber light, fine particles of mist drifting across them"),
      ]),
      P("transcendence", 0.484, 0.604, 0.61, "transcendence", "1:47-2:14 Swelling Crest (the leading tone at 1:47 drives into the grave Fm9 climax, 1:55)", [
        S("cosmic", "cosmic — the flood at full crest seen from immense height, one vast heaving mass of dark luminous current filling the frame, slow galaxy-like swirls of pewter and silver light turning across it, storm-dark vapor pressing at its edges, infinite and grave"),
        S("micro", "macro at the height of the crest — the surface of the dark current heaving, one fold of moving water blazing silver-white for a moment, fine luminous spray glittering into particles against black"),
        S("abstract", "abstract — immense slow folds of slate, deep green and pewter light rolling over one another across the dark, grave and weighty, dissolving at their edges into mist"),
      ]),
      P("illumination", 0.604, 0.664, 0.43, "illumination", "2:14-2:27 Second Wave (turns toward Db, a warmer elsewhere)", [
        S("aerial", "from high above, the long strong current running in luminous seams past widening dark banks, a faint warm band of amber light appearing low along one edge of the frame, the camera gliding along"),
        S("intimate", "close — one warm ribbon of muted amber light laid across moving dark water, the current carrying it without breaking it, translucent mist breathing above, a slow pewter shimmer on either side"),
        S("abstract", "abstract — long parallel bands of pewter and warm amber light flowing diagonally across black, a first Db-gold warmth spreading slowly through them, their edges softening into mist"),
      ]),
      P("return", 0.664, 0.849, 0.31, "integration", "2:27-3:08 Second Wave ebbs → Suspended Clearing (2:48, texture almost vanishes, near-silence 2:59) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small veil of luminous pale gold mist hanging alone above still black water in the upper right of immense darkness, a few fine motes drifting from it, nearly the entire frame empty"),
        S("micro", "extreme macro — a single droplet of pale gold light suspended over a surface that has almost stopped moving, its reflection trembling below, a fragile shimmer held"),
        S("interior", "within the clearing, thin layers of luminous mist rising slowly off the stilled flood, pale gold light hanging weightless between them, the camera rising gently through"),
      ], { sparse: true }),
      P("integration", 0.849, 1, 0.3, "integration", "3:08-3:42 Deep Db Coda (one last swell, then the bare F open fifth with a plagal touch)", [
        S("aerial", "looking straight down on the dark flood swelling once more in a long slow heave that fills the frame edge to edge, thin luminous seams of amber light tracing its ripples, the camera pulling back"),
        S("cosmic", "cosmic — from immense height the dark current becomes one faint seam of amber light winding across infinite darkness, scattered points of light around it like a quiet star field, the question left open"),
        S("sparse", "DARK BACKGROUND — a single slow boil of current on near-black water in the lower left of vast darkness, one last luminous amber seam dissolving at its edge, the bookend of the first light"),
      ]),
    ],
    morphs: [
      "the camera descends through the mist and slips beneath the dark surface into layered sheets of slow current",
      "the eddy swells and the camera rises to immense height as the whole flood heaves into one luminous crest",
      "the folds of light ease and the camera glides along the long current as a warm amber band appears at its edge",
      "the amber bands fade and the camera settles close on one small veil of pale gold mist alone above still water",
      "the mist sinks and the camera pulls back as the dark flood swells once more under a last amber glow",
    ],
  },
  {
    id: "71b71375-8d7f-4e84-86c8-76d9e85a6eb0",
    name: "Tranquility 34",
    world: "C# major pedal meditation, warm plagal summit at 2:01, one hollow open-fifth shadow at 2:50, closing on a bare fifth; lyric 'but I'm never going away' — calm that stays: an autumn pool of dark mirror water where amber leaves made of soft light settle and turn, crane up into one slowly turning spiral of gold at the summit, darken to bronze in the hush, and one leaf is still there at the end",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:11 Pedal Dawn (the C# pedal struck, home established)", [
        S("sparse", "DARK BACKGROUND — a single amber leaf made of soft light floating on dark still water in the lower right of vast darkness, its warm translucent reflection beneath it, a faint breath of luminous mist, the rest of the frame open black"),
        S("micro", "extreme macro — the veins of one floating amber leaf at closest range, each vein a fine thread of glowing honey light, tiny droplets of mist resting along its edge"),
        S("aerial", "from high above, looking straight down on a dark mirror pool wrapped in luminous mist, a few amber leaves of light drifting slowly on its surface, the camera beginning to descend"),
      ]),
      P("expansion", 0.05, 0.351, 0.86, "expansion", "0:11-1:17 Pedal Dawn → Lydian Fourth Lifts (0:44, F#maj13#11 glows, the held G#7 question) → Suspended Dominant begins", [
        S("interior", "inside the lifting mist above the pool, soft honey and rose-amber light spreading slowly through translucent veils, amber and copper leaves turning weightless in the air as they settle, the camera drifting down with them"),
        S("aerial", "looking straight down as more amber and copper leaves arrive on the dark mirror, each one turning slowly and trailing a faint luminous ring, warm light widening across the surface edge to edge"),
        S("micro", "macro — the curled rim of one copper leaf at closest range, frosted with fine beads of pearl light, its edge glowing honey-gold against the black glassy surface, impossible stillness"),
      ]),
      P("transcendence", 0.351, 0.606, 1, "transcendence", "1:17-2:13 Suspended Dominant (tidal swells) → Plagal Summit (F# major, the fullest moment at 2:01)", [
        S("cosmic", "cosmic — the camera craning upward until the whole pool becomes a vast slowly turning spiral of amber, copper and gold leaves of light on a dark mirror, like a galaxy seen from far above, warm radiance pouring across it"),
        S("micro", "macro at the height of the light — one amber leaf blazing gold as warm light breaks fully over it, its edges dissolving into fine glittering particles against the dark water"),
        S("abstract", "abstract — deep slow swells of honey and rose-gold light lifting and settling across the dark in long repeated breaths, translucent layers rocking over one another"),
      ]),
      P("illumination", 0.606, 0.666, 0.47, "illumination", "2:13-2:26 the summit's glow ebbs (secondary dominants lead home), the open fifth begins", [
        S("aerial", "from high above, looking straight down on countless amber leaves of light drifting on a black mirror that fills the frame, deepening to bronze as the glow draws back toward one corner, the camera rising"),
        S("intimate", "close — a few bronze leaves of soft light resting motionless on the darkening mirror, the last warm glow lying along their curled edges, the air going still, mist settling low"),
        S("abstract", "abstract — a slow descending cascade of warm gold light thinning into pale dove grey across black, each step softer than the last, the radiance folding gently back to rest"),
      ]),
      P("return", 0.666, 0.849, 0.3, "integration", "2:26-3:07 Open-Fifth Stillness (time stops; the parallel-minor shadow at 2:50, quietest) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small translucent bronze leaf of faint light resting alone on black water in the upper left of immense darkness, a thin ring of cool dove-grey light around it, nearly the entire frame empty"),
        S("micro", "extreme macro — one clear ring of cool silver light spreading very slowly across black glassy water, a single fine droplet suspended above its centre, translucent and hushed"),
        S("interior", "within the hush, a slate-grey veil of translucent mist drifting low across a black mirror of water, a few faint amber motes suspended in it, the camera holding still"),
      ], { sparse: true }),
      P("integration", 0.849, 1, 0.3, "integration", "3:07-3:40 Homecoming Chimes (sus and add9 chimes climb to C#6, ends on a bare open fifth)", [
        S("abstract", "abstract — fine motes of pearl and honey light rising upward through the dark like slow chimes, the light whitening as they climb, airy and open, the camera rising with them"),
        S("cosmic", "cosmic — from immense height the pool becomes a small dark mirror holding one warm point of light within a quiet star field, still there, never going away"),
        S("sparse", "DARK BACKGROUND — a single translucent amber leaf made of soft light still floating on dark water in the lower right of vast darkness, its warm glow steady, the bookend of the first light, at peace"),
      ]),
    ],
    morphs: [
      "the camera descends into the lifting mist as amber leaves of light drift down past it toward the pool",
      "the leaf's rim glows and the camera cranes upward until the whole pool turns as one spiral of golden leaves",
      "the swells ease and the camera rises as the golden light ebbs across the leaves toward bronze",
      "the warmth drains away and the camera settles close on one small bronze leaf alone on black water",
      "the shadow passes and the camera rises with fine motes of pearl light drifting upward out of the dark",
    ],
  },
  {
    id: "1f5e3884-5317-4146-ba18-4742eaf74ce9",
    name: "Chemiluminescence",
    world: "G# major leaning to F minor over an Eb pedal, intimate for 1:49 then one subdominant bloom and a soft G#6 afterglow — light that glows from within still dark water: one faint point kindling a halo, a dim pulse in the hush, a darker undercurrent flickering, the glows gathering toward release, the whole bay blooming green-gold, amber and rose in spreading waves, and one fading ring",
    phases: [
      P("threshold", 0, 0.185, 0.4, "threshold", "0:00-0:29 First Glimmer (high fragments over the D# pedal, a single faint point of light)", [
        S("sparse", "DARK BACKGROUND — a single faint point of luminous green-gold light glowing beneath still black water in the lower left of vast darkness, a soft halo slowly spreading around it, the rest of the frame open black"),
        S("micro", "extreme macro — a cluster of tiny living sparks of phosphor green-gold light suspended in clear dark water, each spark haloed, drifting at different depths, luminous and weightless"),
        S("aerial", "looking straight down into still dark shallows filling the frame edge to edge, a few faint luminous glows of green-gold kindling under the surface far apart, the camera descending toward them"),
      ]),
      P("expansion", 0.185, 0.498, 0.65, "integration", "0:29-1:18 Pedal Murmur (receding, Fm7/D#) → Open-Fifth Clearing (0:51, a still pool of faint light hanging motionless) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small dim luminous glow of smoky teal and green-gold light pulsing slowly beneath black water in the upper right of immense darkness, a few faint motes drifting from it, nearly the entire frame empty"),
        S("abstract", "abstract — a wide still haze of faint phosphor light hanging motionless in the dark like an open breath, its edges barely shifting, pale green-gold dissolving into indigo"),
        S("interior", "beneath the surface, a slow pulse of dim amber-green glow breathing through dark liquid as if seen through smoked glass, translucent and hushed, the camera drifting toward its core"),
      ], { sparse: true }),
      P("transcendence", 0.498, 0.6, 0.67, "expansion", "1:18-1:34 Minor Undertow (Fm11/D#, a darker current beneath the glow)", [
        S("aerial", "from directly above, a slow current of darker indigo water curling beneath a faintly glowing green-gold surface, the glows stretching into long trailing ribbons of luminous light, the camera gliding along"),
        S("micro", "macro — light flickering up through a dark curling undercurrent, fine threads of green-gold and violet particles twisting slowly past one another, a cool indigo shade pooling between them"),
        S("intimate", "close — one flicker of warm amber light glinting up through the dark undertow and sinking away again, a passing violet shadow curling around it"),
      ]),
      P("illumination", 0.6, 0.696, 0.67, "illumination", "1:34-1:49 Minor Undertow (Db glints flicker, G#7/D# at 1:45 leans toward release)", [
        S("interior", "within the deep undertow, countless faint green-gold glows gathering together beneath the surface, warm amber glints flickering among them, the light leaning toward release, the camera rising through"),
        S("aerial", "looking straight down as the scattered glows drift together into one gathering cloud of soft living light across the dark shallows, luminous and swelling, the frame filled edge to edge"),
        S("micro", "extreme macro — one bright amber-gold spark among the green glows, swelling as if about to bloom, a fine halo of particles around it"),
      ]),
      P("return", 0.696, 0.868, 1, "transcendence", "1:49-2:16 Subdominant Bloom (the deep bass hit at 1:49, G#maj9 → F#maj13#11 → C#add9, the last suspension resolves 2:15)", [
        S("cosmic", "cosmic — the camera pulling back to immense height as the whole dark bay blooms with living light, vast slow waves of green-gold, amber and rose-gold radiance spreading outward to every edge like a galaxy igniting, infinite darkness beyond"),
        S("micro", "macro at the height of the bloom — a dense cloud of living sparks blazing amber and rose-gold beneath the water, glittering particles streaming outward"),
        S("abstract", "abstract — concentric waves of soft amber-gold and phosphor green light spreading outward across black in slow rings, warm and radiant, the last suspension resolving"),
      ]),
      P("integration", 0.868, 1, 0.37, "integration", "2:16-2:37 Afterglow (C#maj9 rocking, plagal close on a soft G#6)", [
        S("aerial", "looking straight down on the darkening water, one wide translucent ring of warm amber light dissolving slowly to a faint green-gold residue, a few last glows sinking beneath the surface, the camera rising"),
        S("sparse", "DARK BACKGROUND — a single faint point of luminous green-gold light glowing beneath still black water in the lower left of vast darkness, a trace of rose warmth held in its halo, the bookend of the first glimmer"),
        S("cosmic", "cosmic — from immense height the dark water holds a few last faint glows like a quiet star field, cooling into ash-blue stillness"),
      ]),
    ],
    morphs: [
      "the camera descends into the shallows and settles close on one small dim glow pulsing alone beneath black water",
      "the glow breathes out and the camera rises above the surface as a darker current begins to curl beneath it",
      "the undertow deepens and the camera slips beneath the surface into the gathering glows",
      "the bright spark swells and the camera pulls back to immense height as the whole bay blooms with living light",
      "the rings of light spread out and fade as the camera rises above the darkening water",
    ],
  },
  {
    id: "79cad85a-13fa-4db9-b4cd-a507b62a6084",
    name: "Nothing 30",
    world: "D major reverie orbiting one small diatonic cycle over a D pedal, 'more remembering than longing' — the emptiness kept warm: veils of honey and umber haze in a dark void, widening in an embrace, sinking to bedrock shade with the third withheld, parting into full warm light at the 2:26 summit, swaying in a consoling G–D rock, and drifting up into pale afterglow with the question left open",
    phases: [
      P("threshold", 0, 0.185, 0.57, "threshold", "0:00-0:38 Opening Reverie (D – Em7 – Bm – Em11/D – Gmaj7/D, each chord allowed to ring)", [
        S("sparse", "DARK BACKGROUND — a single soft veil of warm honey haze hanging in the lower right of vast darkness, a few fine motes of amber dust caught in its folds, calm and inward, the rest of the frame open black"),
        S("micro", "extreme macro — fine grains of warm amber dust suspended in dark haze at closest range, each one glowing softly, drifting at different depths, impossibly still"),
        S("aerial", "from high above, looking straight down on thin layers of luminous warm haze lying over a dark still surface, soft early side-light catching their edges, the camera descending slowly toward them"),
      ]),
      P("expansion", 0.185, 0.327, 0.83, "expansion", "0:38-1:07 Widening Embrace (voicings fill with 6ths and 9ths, the register widens)", [
        S("interior", "inside a warm haze of honey and rose particles filling the frame edge to edge, countless glowing motes drifting at different depths in soft focus, weightless, the camera gliding through them"),
        S("abstract", "abstract — broad overlapping veils of honey gold, muted sage and soft slate light widening across the dark, their edges glowing, spacious and warm"),
        S("micro", "macro — one veil's edge at closest range, a fine translucent membrane of warm light catching tiny motes of rose-gold dust, shallow focus"),
      ]),
      P("transcendence", 0.327, 0.62, 0.85, "return", "1:07-2:07 Pedal and Shadow (Em over the D pedal, Lydian Gmaj7#11) → Bedrock Fifths (1:39, open fifths on a low D, the third withheld until 2:03)", [
        S("aerial", "looking straight down on a slow spiral current of luminous umber and honey mist turning across darkness, its arms trailing glowing dust, the camera descending into its open centre"),
        S("micro", "macro — fine strands of honey-gold light at closest range, woven loosely like threads of luminous silk drifting in deep umber darkness, tiny sparks caught along them, translucent"),
        S("abstract", "abstract — open bands of deep umber and slate light stacked low across the dark like held fifths, a faint warm glow along the highest band, grave and spacious"),
      ]),
      P("illumination", 0.62, 0.751, 1, "transcendence", "2:07-2:34 Full-Hearted Peak (the Em ache pushed through Gmaj9/13 into the broad D-major summit at 2:26)", [
        S("cosmic", "cosmic — rising out of the umber depth into a vast warm haze that fills the entire frame in every direction, layered veils of honey and rose light parting to reveal a calm open expanse of soft radiance, infinite, the camera pulling back"),
        S("micro", "macro at the height of the light — the edge of one parting veil blazing honey-gold and rose, countless fine motes glittering in it against the dark"),
        S("abstract", "abstract — full warm light pouring evenly through every layer of haze at once, honey, rose and pale white dissolving into one another, spacious and full-hearted"),
      ]),
      P("return", 0.751, 0.898, 0.8, "integration", "2:34-3:04 Rocking Descent (the energy exhales into a slow G–D sway, consoling) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small wisp of warm honey haze swaying slowly in the upper left of immense darkness, a few fine motes drifting from it, nearly the entire frame empty"),
        S("interior", "within the thinning haze, long quiet strata of grey-gold light swaying gently back and forth like a slow breath, translucent and settling, the camera drifting down"),
        S("micro", "extreme macro — a single filament of warm light swaying slowly in the dark, fine motes of honey dust rocking back and forth along it, dissolving at its tips"),
      ], { sparse: true }),
      P("integration", 0.898, 1, 0.37, "integration", "3:04-3:25 Unresolved Afterglow (a whisper drifting high, D6 and Bm, ending on G over D)", [
        S("cosmic", "cosmic — rising slowly upward into pale high afterglow, the warm haze becoming faint rose strands across infinite darkness scattered with a quiet star field, the question left open"),
        S("sparse", "DARK BACKGROUND — a single soft veil of warm honey haze hanging in the lower right of vast darkness, its last motes settling, the bookend of the first breath"),
        S("aerial", "from high above, the last warm haze thinning over the dark surface to almost nothing, one faint luminous glow lingering at one edge, the camera pulling away"),
      ]),
    ],
    morphs: [
      "the camera descends into the warm haze as its veils begin to drift apart around it",
      "the veils sink and the camera follows them down into deep umber shade",
      "the camera rises out of the umber depth as the haze parts into full warm light",
      "the light ebbs and the camera settles close on one small wisp of honey haze swaying alone",
      "the camera floats upward through the thinning strata into pale high afterglow",
    ],
  },
  {
    id: "1f83e254-a0c8-45ec-974f-8b363038a98d",
    name: "Rise 1",
    world: "G major plagal rocking over a G pedal, three swells, ending on a suspended C — a rising still in progress: looking up into deep violet dark as warm sparks lift away in long spiraling drifts, the breathing rocking, a wide-open radiance at the first swell clouded by doubt, a lone spark in the shadowed hush, the true bright ascent, and one last spark still climbing at the end",
    phases: [
      P("threshold", 0, 0.05, 0.55, "threshold", "0:00-0:08 Suspended Awakening (a long Gsus4, the third held back)", [
        S("sparse", "DARK BACKGROUND — a single warm spark climbing slowly through deep violet dark in the lower left of the frame, a faint trail of honey light beneath it, held in suspension, the rest of the frame open black"),
        S("micro", "extreme macro — the spark at closest range, a tiny ember of warm amber light shedding fine glittering particles that drift upward, soft rose haze around it"),
        S("cosmic", "cosmic — looking straight up into an immense deep violet dark, a few warm motes beginning to rise away into it at great distances, the camera tilting upward"),
      ]),
      P("expansion", 0.05, 0.452, 0.75, "expansion", "0:08-1:10 Suspended Awakening → Plagal Rocking (0:26, G and C-over-G like slow breathing) → First Swell (crest 1:03 on C over the G pedal)", [
        S("interior", "inside a slow rising stream of warm motes, honey and rose sparks lifting past on every side in long spiraling drifts, the camera rising with them into the violet dark above"),
        S("abstract", "abstract — slow concentric rings of pale gold light breathing outward and back across deep violet dark, rocking gently like slow breath, a few sparks drifting upward across them"),
        S("micro", "macro — a pair of warm sparks spiraling around each other as they climb, each trailing a fine thread of amber light, tiny glints shed along their path"),
      ]),
      P("transcendence", 0.452, 0.572, 1, "transcendence", "1:10-1:29 First Swell recedes (the borrowed Cm at 1:08, diminished passing chords) → Shadowed Return begins (quietest 1:26)", [
        S("cosmic", "cosmic — looking straight up into an immense deep violet dark filled with countless warm golden motes and sparks rising away in long spiraling drifts, a wide open radiance of honey light breaking across them like a galaxy unfolding, infinite depth above"),
        S("micro", "macro at the height of the swell — a dense spiral of sparks blazing amber and rose as they climb, glittering particles streaming from them"),
        S("abstract", "abstract — a slow veil of dusky slate-blue shadow sliding diagonally across streams of rising gold light, dimming them for a breath, a flicker of doubt"),
      ]),
      P("illumination", 0.572, 0.84, 0.8, "integration", "1:29-2:10 Shadowed Return (the quietest, most shadowed space, then regathering through the Lydian Cmaj9#11 at 1:34) → Bright Ascent (1:51, the true rise) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small warm spark hovering alone in the upper right of immense dusk-blue darkness, a faint glow around it, nearly the entire frame empty"),
        S("interior", "within the slowly widening shaft of honey light rising through dusk-blue dark, sparks regathering and climbing in it one by one, the camera rising through"),
        S("cosmic", "cosmic — the brightest rise, looking straight up as warm gold sparks pour upward in a broad spiraling stream into deep violet star-scattered space, confident and radiant"),
      ], { sparse: true }),
      P("return", 0.84, 0.92, 0.73, "return", "2:10-2:23 Open Horizon (the walking bass settles through Em11 to the Lydian C13#11)", [
        S("abstract", "abstract — long slow spirals of warm gold and pale lilac light drifting upward and outward across the deep violet dark, the energy settling, the rise steady and calm, the camera following them upward"),
        S("micro", "extreme macro — fine glittering particles of honey light shed from a rising spark, drifting slowly upward in soft focus, pale lilac haze beyond"),
        S("intimate", "close — a few warm sparks thinning as they rise out of sight into the deep violet dark, each trailing a fading thread of amber light, steady and calm"),
      ]),
      P("integration", 0.92, 1, 0.55, "integration", "2:23-2:35 Open Horizon (rests on Csus2 and an ambiguous G/C#, the ascent poised and unfinished)", [
        S("cosmic", "cosmic — looking straight up into deep violet dark where one last warm spark rises alone toward a faint quiet star field, the ascent still in progress, suspended and open"),
        S("sparse", "DARK BACKGROUND — a single warm spark still climbing in the lower left of vast violet darkness, its faint trail beneath it, the bookend of the first light"),
        S("micro", "extreme macro — the last spark at closest range, a tiny ember of honey light still lifting, holding the whole rise inside it"),
      ]),
    ],
    morphs: [
      "the camera tilts upward and rises into a stream of warm sparks spiraling away into the violet dark",
      "the paired sparks climb and the camera keeps rising as countless motes open into a vast radiance above",
      "the shadow passes and the camera settles close on one small spark hovering alone in dusk-blue dark",
      "the broad stream of sparks slows and the camera follows its spirals as they drift outward and settle",
      "the sparks thin away above and the camera holds on one last spark rising alone toward a quiet star field",
    ],
  },
  {
    id: "6ee9f014-8203-437c-b05c-9d8bd0de9d3e",
    name: "Chenin 5",
    world: "Bb major in a high register, add9 bloom at 0:39, a declined turn, a restless G-minor current, then the E-natural Lydian floor and a summit of light rather than force — an airy macro world of dew on curling tendrils, frame-filling: one glowing drop, warm light flooding the leaves, a dew universe of worlds within worlds, a single drop at rest in the turn, a quick silver current, the whole lattice glowing evenly in the Lydian radiance, and one drop at rest again",
    phases: [
      P("threshold", 0, 0.05, 0.3, "threshold", "0:00-0:10 Pedal Dawn (a lone Fmaj7/E seeds the Lydian colour)", [
        S("sparse", "DARK BACKGROUND — a single curling tendril holding one dew drop that glows pale gold in the lower right of vast darkness, a faint silver-lilac glint trembling inside it, the rest of the frame open black"),
        S("micro", "extreme macro — one dew drop at closest range, a tiny luminous world holding a reflection of honey-gold light, fine glints appearing and fading across its skin"),
        S("aerial", "looking straight down on a dark tangle of young tendrils and translucent leaves filling the frame edge to edge, a few dew drops beginning to glow pale gold among them, the camera descending"),
      ]),
      P("expansion", 0.05, 0.273, 0.59, "expansion", "0:10-0:53 Pedal Dawn → Opening Cadence Bloom (0:26, I–vi–IV–V in add9, the Ebmaj13 bloom at 0:39)", [
        S("interior", "inside the tangle of tendrils as warm light floods through in one slow wave, translucent young leaves glowing honey-gold on every side and filling the frame, dew drops igniting along every curl, the camera gliding forward"),
        S("abstract", "abstract — curling tendrils of pale green and honey light spiraling outward across the dark in a slow fibonacci pattern, dew drops strung along them like points of light"),
        S("micro", "macro — the underside of one translucent leaf lit from behind, its veins a fine branching web of gold light, a row of dew drops glittering along its edge"),
      ]),
      P("transcendence", 0.273, 0.393, 1, "transcendence", "0:53-1:16 Opening Cadence Bloom cadences (0:48 glow carried) → Suspended Turn (G7sus4 at 1:05, the invitation declined)", [
        S("cosmic", "cosmic — the dew universe: thousands of dew drops on a vast lattice of tendrils, each one holding a tiny pale gold glow, spreading away in every direction like an infinite galaxy of light, worlds within worlds"),
        S("micro", "extreme macro at the height of the bloom — a single dew drop blazing honey-gold and rose, the whole curling tendril reflected inside it, fine glitter around it"),
        S("aerial", "from directly above, the frame-filling lattice of tendrils holding still at a turning, warm light pausing over it then slowly drawing back toward one edge, the camera rising"),
      ]),
      P("illumination", 0.393, 0.453, 0.31, "integration", "1:16-1:27 Suspended Turn ebbs (the long Bbmaj7 at 1:20) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — one small dew drop of pale gold light resting alone at the tip of a curled tendril in the upper left of immense darkness, nearly the entire frame empty"),
        S("micro", "extreme macro — the resting dew drop at closest range, slate blue and lilac light turning slowly inside it, a held breath of stillness"),
        S("interior", "within the shadowed leaves, soft lilac light lingering motionless along the tendrils, the dew dimming, translucent and hushed, the camera drifting toward the next curl"),
      ], { sparse: true }),
      P("return", 0.453, 0.754, 0.36, "return", "1:27-2:25 Minor Current (restless Dm7–Gm7–Fsus) → Lydian Threshold (2:04, the bass sinks to E natural, a wider brighter space)", [
        S("aerial", "looking straight down as a quick stream of glittering beads of light runs along the curling tendrils over dark leaves, flickers of cool slate and silver light racing on it, the camera traveling with it"),
        S("micro", "macro — dew drops trembling and sliding along a dark tendril in a quick restless current, each one splitting cool slate and silver light into prismatic threads"),
        S("abstract", "abstract — widening bands of cool silver-lilac light spreading across the dark lattice of leaves in slow parallel waves, opening a wider, brighter space"),
      ]),
      P("integration", 0.754, 1, 0.32, "illumination", "2:25-3:12 Lydian Radiance (Bb6#11/E held, a summit of light rather than force) → Dissolving Home (2:51 near-silence, open Bb with D on top)", [
        S("cosmic", "cosmic — the summit of light: an immense expanse of dew drops across the tendril lattice glowing silver-gold all at once, a hazy radiance spread evenly everywhere, infinite and still, the camera pulling back to reveal it"),
        S("aerial", "from high above, the radiance dimming across the lattice of tendrils, dew drops fading from gold to dim blue one by one, darkness settling, the camera rising away"),
        S("sparse", "DARK BACKGROUND — a single curling tendril holding one dew drop that glows faint pale gold in the lower right of vast darkness, the bookend of the first light, at rest"),
      ]),
    ],
    morphs: [
      "the camera descends into the tangle of tendrils as warm light floods through the leaves",
      "the veined leaf falls away and the camera pulls back as the dew drops multiply into an infinite galaxy of light",
      "the light draws back and the camera settles close on one small dew drop alone at the tip of a tendril",
      "the stillness breaks and the camera rises to follow a quick restless current of light along the tendrils",
      "the bands of silver light widen until the camera pulls back over the whole lattice of dew glowing at once",
    ],
  },
];
