# Morning digest — last updated 2026-06-06 14:26 UTC, cycle 332 (kids · WIDE)

> Yesterday's **jury verdict** still stands (see `docs/dreams/JURY.md`): a strong fortnight on *legibility* (`358-beat-mirror`, `353-collapse-score`) — but starve the adult JI-drone monoculture and stop letting the screen habit hide inside SVG. Today is the even-cycle **kids** slot, so I went after a different gap entirely.

## ☀️ Open this first
- **[/dream/360-kids-sand-choir](https://getresonance.vercel.app/dream/360-kids-sand-choir)** — **for kids (4+).** Press ▶, then **tilt the iPad**: a spout pours glowing warm sand into dunes, and tipping the tablet swings gravity so the sand flows and reshapes. Seven harp strings cross the field — **every grain that lands on a string sings** (D-Dorian). Build a tall dune on a low string → a low drone; spill sand across all seven → a rippling arpeggio. **The shape you build *is* the song.** Sways and plays itself hands-free if no one touches it.
  - *Why this one:* it's the lab's **first falling-sand cellular automaton** — we had Lenia, Game-of-Life, reaction-diffusion, fluid, particle-life… but never *the* famous one. And it's the kids lane's **most legible** piece yet — a 4-year-old sees cause→effect (sand → string → note), not an abstract glow. That's your standing "make it legible" ask, in the kids lane.

## Also explored this fire (2 more — banked in IDEAS §332, both build-reviewed)
- **361-kids-coral-bloom** — **shake** the iPad to release sparkles that drift, stick, and grow a glowing **coral reef** by *Diffusion-Limited Aggregation* (the physics of real coral/frost/lightning) — each new branch sings a rising note. Lab-first DLA. Lost only on legibility (growth is random) + perf weight. **Strong next-kids build.**
- **362-kids-tumble-bells** — drip grains on a magic pile (**tilt** to aim); usually nothing, but sometimes one grain triggers a huge **avalanche** that ripples out as a fractal star and plays a cascade of bells. Lab-first *Abelian sandpile* (power-law surprise). Closest sibling to the recent chain-reaction `350`, so it lost — but it'd shine **as an adult piece**.

## How this was made (the studio choreography)
- **WIDE fan-out** (alternating off last kids fire's DEEP): three *unrelated* simulation families — falling-sand / DLA / Abelian-sandpile, each a **grep-verified lab-first CA** — built by three parallel builders, curated to the most legible + most robust + warmest-palette. Shipped one, banked two. One commit.
- Dodged every jury ban: **tilt** (not touch), **WebGL2** (not SVG), no mic, kids (not the adult drone). CA/granular appears nowhere in the last 10.

## Open questions for you (carried — your call unblocks these)
- **`351-erosion`** (a tape more ruined each morning) is triple-banked and ready but keeps losing because its hook is **invisible on a first open**. Ship it unconditionally next adult? Reframe to open already-half-eroded? Or leave banked?
- **AI-pipeline-chain in an AV piece** is still blocked on a small paid FAL budget grant — one word and I build it.
- The jury wants a **multi-cycle thread actually deepened** (Mirror-Canon cycle-2 is cleanest). Next adult cycle (333) I'll ship depth instead of a fourth fresh explorer — flag if you'd rather I keep going wide.

## Caveats
- `360` is **build-verified, not browser-verified** — the CA + audio + fallbacks are written correct and `npm run build` passes, but **real tilt feel, the iOS permission gesture, the 180×120 CA's 60fps budget on a phone GPU, and exact shader colors are unverified** (no sensor / GPU in this sandbox). All likely one-number tunes if off.
- **GPU verification debt (still open):** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware — worth a browser-verify pass before the next big WebGPU build.
