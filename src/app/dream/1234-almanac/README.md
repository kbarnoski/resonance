# 1234 · Almanac

**The question:** _What if Karel's short piano recording became a slow ALMANAC
of the hours — a piece that plays for many minutes and is genuinely different at
minute 5 than at minute 1?_

A **long-form (>5 min), stateful, evolving** generative piece. The lab has
shipped plenty of blooms and looms, but zero true long-form stateful pieces that
walk an arc with memory across many minutes. This cashes that gap, and it
resurrects the long-standing ⭐ idea **`1162-loom-of-hours`** — a canonical-hours
long-form of Karel's music that had never shipped.

## How it evolves over 5+ minutes (not a loop)

Two systems run together:

### 1. Granular time-stretch of the real recording (`engine.ts`)
The recording (`549fc519-…`, ~12s) is treated as a **grain corpus**, not a clip
to loop. A read-head **crawls** through the buffer at `readRate` — well under
real time (0.10×–0.26×) — so the short source is stretched across the whole day.
From the crawling position the engine sprays short overlapping **grains**
(11–32 ms … up to 320 ms), each windowed with a soft raised-cosine envelope,
panned, and **transposed** to a consonant scale offset within the current hour's
`register` (centre) and `spread` (width). There is **no loop point**: when the
head reaches the end it re-enters at a fresh random offset, and the arc keeps
changing the parameters, so the same bar of source never returns as the same
texture. A generated convolution reverb keeps it airy. Reference: granular
synthesis & time-stretching — **Curtis Roads, _Microsound_ (2001)**.

### 2. A long-form arc state machine (`arc.ts`)
`ArcController` holds continuous memory (`elapsed`) and walks a slow **day** of
eight **canonical hours** (the **Liturgy of the Hours**), ~46s each → ~6.1 min
per day:

| Hour | Time of day | What the texture does |
|------|-------------|-----------------------|
| **Matins** | deep night | sparse, very low (−12 st), single grains, dark |
| **Lauds** | dawn | grains in twos, register lifts, first warmth |
| **Prime** | early morning | denser, quicker stretch, brightening |
| **Terce** | mid-morning | three voices, wide spread, bright & moving |
| **Sext** | midday | densest & brightest, register rises a third |
| **None** | afternoon | settles back to warm amber, unhurried |
| **Vespers** | dusk | thins to two voices, register sinks, softens |
| **Compline** | night | one long low grain at a time; rest |

The controller **interpolates smoothly** (smoothstep) between each hour's target
`density / grainDur / spread / register / layers / readRate / brightness / gain`,
so evolution is continuous rather than stepped. Crossing into a new hour rings a
soft **chime of the hour**. Each new day applies a small deterministic **drift**
to register/spread/read-rate, so day 2 is a variation of day 1, never an
identical repeat — the piece can run indefinitely and keep changing. A
**lighten ↔ deepen** slider biases register/brightness/density live, and
dragging the sun on the dial **seeks** to any hour.

The texture at 5:00 (Sext/None — dense, bright, high) is unmistakably not the
texture at 1:00 (Lauds — sparse, low, warm), which is the whole point.

## The form: an almanac / clock page (`viz.ts`)
A turning **day-dial** in Canvas2D, not a jewel-object or particle field: eight
canonical hours set around a ring, a **sun/moon** travelling the dial as the day
plays, a progress arc for the elapsed day, a drifting cloud of **grain-motes**
around the sun whose count tracks granular density and whose brightness tracks
the live audio level, and the current hour named in serif at the centre with a
drifting almanac caption below. The background is a **high-key pastel dawn→dusk
gradient** — lavender-grey night, cream/peach dawn, pale noon blue, dusty-rose
vespers — that slowly shifts with the hour. Dark slate ink for contrast.

## Real-piano integration
`audio.ts` loads Karel's recording read-only via the existing
`/api/audio/[id]` route. If it can't be fetched, it renders a ~12s gentle
solo-piano-like fallback buffer offline (detuned partials, slow pentatonic
phrase, soft attack / long decay) so the grain corpus always has real harmonic
content. Status shows **"Karel's piano"** (emerald) or **"fallback tone"**
(amber). Because the source is short, the point is that granular re-layering
makes it last many minutes and evolve — it is never looped.

## Tags
- **INPUT:** minimal, time-driven — press play, it runs itself; optional gentle
  control (drag the sun to skip hours; lighten/deepen slider).
- **OUTPUT:** 2D almanac / clock page (Canvas2D + HTML text).
- **TECHNIQUE:** granular time-stretch + layering of the real recording, driven
  by a long-form arc state machine with memory.
- **PALETTE:** high-key pastel dawn→dusk gradient that shifts with the hour.

## Next-cycle deepening
- Give each hour its own harmonic set (modal colour per hour) rather than one
  shared pentatonic pool, so the day also modulates key.
- Season drift: let successive days shorten/lengthen the light so a "week" of
  days slowly moves toward solstice.
- A per-hour spectral filter shaped from the corpus's own spectrum.
- Let the chime of the hour draw from a distinct low-frequency grain layer.
- Optional bell text: real almanac ephemera (sunrise/sunset lines) in the margin.

_References: the canonical hours / Liturgy of the Hours; Curtis Roads,
_Microsound_ (MIT Press, 2001). Internal: resurrects `1162-loom-of-hours`._
