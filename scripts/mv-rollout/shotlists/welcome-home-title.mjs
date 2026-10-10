// Welcome Home (the album's title track, 79e33115…) — Journey Archetype
// rework (2026-10-09). Karel: "dont use pictures of houses. i like the
// surreal door entry or a view out a cool window but not those house photos
// that look like a suburban house. its about hinting not literal as you
// know. about the spiritual."
//
// Homecoming as a SPIRITUAL arrival: doorways and windows made of light that
// stand alone in the dark or float in the sky, archways of mist, hearth-light
// as presence. Never a house exterior, roof, porch, furnished room or
// anything that reads as a real-estate photo; no humans.
//
// Phase bounds/intensities are the journey's current ones (they already sit
// on the v2 deep-analysis sections: Doorstep Pedal | Suspended Glow | Inward
// Minor Turn → Home Vamp Returns | Cadence Chorus → Radiant Summit (3:52) |
// Evening Settling | Lamplit Silence). The sparse valley is the 1:25 minor
// turn ("closing in further"), which opens the transcendence phase.
// Shaders: phase-owned cast written into scripts/featured-recast.json +
// journey-casts.generated.ts by scripts/mv-rollout/cast-owned-featured.mjs
// (Welcome Home is a featured/album recast journey, not Expansion).

export const SET = { key: "welcome-home-title", presenting: "Welcome Home" };
// This brief asks for doorways and windows (as light, never as buildings).
export const ALLOW_WORDS = ["window", "door"];

const P = (id, start, end, intensity, gradeAs, music, shots, extra = {}) => ({ id, start, end, intensity, gradeAs, music, shots, ...extra });
const S = (reg, text) => ({ reg, text });

export const JOURNEYS = [
  {
    id: "79e33115-7f1e-44bc-b950-7adf5055dd55",
    name: "Welcome Home",
    world: "F major hymn over a held F pedal, a slow arch from a quiet doorstep figure to a full glowing chorus (3:52) and back to one light left on — homecoming as a spiritual arrival: a doorway made of light alone among the stars, honey light pouring through it, an inward rose-and-slate window, a valley at golden dusk opening like a vast threshold, hearth-light as presence, and the doorway resting small in starlit dark at the end",
    phases: [
      P("threshold", 0, 0.133, 0.54, "threshold", "0:00-0:39 Doorstep Pedal (recognising a familiar place from a distance)", [
        S("sparse", "DARK BACKGROUND — a single small doorway made only of warm amber light standing alone in the lower right of an immense field of stars, freestanding and luminous, a short glowing path spilling from it across the dark, nearly the entire frame empty"),
        S("micro", "extreme macro — fine motes of honey light drifting past the glowing edge of the doorway at closest range, each mote a tiny ember, soft indigo darkness beyond, translucent and weightless"),
        S("aerial", "from high above, looking straight down on dark rolling land at deep dusk filling the frame edge to edge, one tiny luminous rectangle of amber light glowing far below like a doorway left open, surreal and still, the camera beginning to descend toward it"),
      ]),
      P("expansion", 0.133, 0.29, 0.78, "expansion", "0:39-1:25 Suspended Glow (Fadd9, C11/F) → the first step inside (1:13)", [
        S("interior", "inside the warm golden haze beyond a surreal open doorway made of light, long beams of honey light pouring forward across the dark, dust motes suspended weightless in them, the camera gliding through"),
        S("abstract", "abstract — long parallel planks of warm amber light receding into darkness like a floor made only of light, fine dust motes hanging in the beams, cream and honey glow, impossibly still"),
        S("micro", "macro — the grain of old wood at closest range transfigured into slow rivers of glowing amber light, tiny luminous motes resting in its channels, deep shadow between them"),
      ]),
      P("transcendence", 0.29, 0.535, 0.83, "integration", "1:25-2:37 Inward Minor Turn (Gm9 ↔ Bbmaj7, a memory surfaces) → Home Vamp Returns (1:58) — the sparse valley", [
        S("sparse", "DARK BACKGROUND — a single small window frame of pale light floating alone in the upper left of vast dusky darkness, a soft rose and slate glow inside it, nearly the entire frame empty"),
        S("micro", "extreme macro — rain beads on old glass at closest range, each bead holding a tiny dusky rose and slate reflection, luminous and trembling, soft focus all around"),
        S("intimate", "close — a surreal window frame floating in a violet dusk sky, through it an impossible view of a golden valley glowing at sunset, the frame's edges catching warm light, the camera drawing toward it"),
      ], { sparse: true }),
      P("illumination", 0.535, 0.815, 1, "transcendence", "2:37-3:59 Cadence Chorus (ii-IV-V-I, each pass richer) → Radiant Summit (Fmaj9 arrival 3:52)", [
        S("cosmic", "cosmic — a vast threshold of golden light opening across the sky above a valley flooded with amber dusk, the radiance pouring out over the hills all at once, coral and gold clouds wheeling around it like a galaxy, the camera rising through"),
        S("aerial", "looking straight down from immense height on a valley at golden dusk filling the frame edge to edge, rivers of luminous amber light flowing together toward one radiant centre, surreal and glowing"),
        S("abstract", "abstract — an archway of glowing mist unfolding in layers of coral, honey and gold light, each layer a luminous arc nested inside the next, receding into radiant depth, kaleidoscopic and weightless"),
      ]),
      P("return", 0.815, 0.904, 0.76, "return", "3:59-4:25 Evening Settling (one last Gm9/Bbmaj7 rocking, down to F at 4:08)", [
        S("intimate", "close — warm hearth light breathing softly in deep violet darkness, embers of gold glowing and fading like a slow heartbeat, translucent smoke curling upward, the camera drifting closer"),
        S("aerial", "from high above, the dark land dissolving into deep violet dusk, a few small points of warm golden light scattered across the darkness like embers, the last coral glow thinning along a ridge, surreal and luminous"),
        S("micro", "extreme macro — a single ember at closest range, its glowing core of orange and gold pulsing under fine white ash, luminous particles lifting off it into the dark"),
      ]),
      P("integration", 0.904, 1, 0.37, "integration", "4:25-4:53 Lamplit Silence (the opening figure once more, a final open fifth — the light left on)", [
        S("cosmic", "cosmic — a window frame of soft light floating in an immense star field, through it a calm valley under early stars with one warm glow left on, deep indigo all around"),
        S("sparse", "DARK BACKGROUND — a single small doorway of warm light resting in the lower right of vast starlit darkness, its glow steady and still, the bookend of the first light"),
        S("micro", "extreme macro — the last mote of honey light drifting at closest range, a tiny reflection of the whole starlit night inside it, dissolving into indigo darkness"),
      ]),
    ],
    morphs: [
      "the camera descends toward the tiny rectangle of light and glides through the open doorway into warm golden haze",
      "the amber channels dim and the camera pulls back as one small window frame of pale rose light floats alone in the dark",
      "the camera drifts through the floating window into the golden valley as a vast threshold of light opens across the sky",
      "the radiant arches soften and the camera settles close on warm hearth light breathing in violet darkness",
      "the last ember glows and the camera rises until a window of soft light floats alone in an immense star field",
    ],
  },
];
