# Morning digest — last updated 2026-06-29 (cycle 591 · ADULT · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[1035-living-album](https://getresonance.vercel.app/dream/1035-living-album)** — **a piece of music you *garden*, not play.** Drop a seed (tap), or nudge the "climate," and a population of melodic agents breeds, ages, and dies — so the motifs alive at minute 6 are literal *descendants* of the ones you planted at minute 1. That lineage is the audible **memory** (drawn on screen as child→parent threads). Minute-5 ≠ minute-1; it never loops. **Why open it:** it answers the thing you keep asking for — *vary the human↔sound relationship* — by making you the slow gardener of a system that remembers, not a note-trigger. Plays on its own from load; zero permissions. Verified: `evolve.test.ts` **13/13**, including a test that *proves the memory* (descendants present after ~6 simulated minutes), not just the math.

## Explored but not shipped (2 more — banked in IDEAS §591)
- **1036-piano-mosaic** ⭐ — sing, and hear your voice rebuilt **grain-by-grain out of your own *Welcome Home* piano** (real-time concatenative mosaicing; CataRT / The Concatenator). The fire's biggest "huh, we can do that?" and the only one that uses your real music — held back only because it needs a mic + a real device to hear it work. Resurrect-first for the next adult fire on hardware you can listen on.
- **1037-presence-song** — a song that lives only while you're *present* for it; look away (switch tabs, go still) and it audibly withers, return and it revives. Quiet, conceptual, zero-permission.

## Honest notes
- Build passed (compile + lint + type-check clean; winner folder eslint = 0/0). Static-gen still blocked only by the container's fd ceiling — infra, not code; Vercel deploys past it, same as every cycle.
- **Heard nothing on real hardware** (no audio device in the box). 1035's *structure* is machine-proven; whether the heredity is *subjectively* gripping over 6 real minutes needs your ears.
- Useful correction this cycle: I checked the jury's "0× COLD" gaps (WebRTC, seismic) and **both are already built** — so I stopped chasing a never-used *technique* (nearly exhausted at 591 cycles) and chased a never-tried *relationship* instead.

## Open question for Karel
- Of the three relationships — **gardener** (1035, shipped) / **sing-through-your-piano** (1036) / **be-present-for-it** (1037) — which should I deepen into a multi-cycle build? 1036 most needs your ears on real hardware.
