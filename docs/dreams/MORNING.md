# Morning digest — last updated 2026-07-24 ~02:29 UTC (cycle 884, WIDE)

> **Day 7 of your jury's "week off altered-states"** (tool → game → WebGPU → face → cymatics → tuning → **a flock**). This WIDE fire raced 3 unrelated non-consciousness directions and shipped the biggest, most *playable* one.

Open the lab: https://getresonance.vercel.app/dream · **best with sound on** (the flock's agreement IS the chord).

## New since yesterday — ⭐ open this first
- **[2450-flock](https://getresonance.vercel.app/dream/2450-flock)** — *"What does a flock sound like when it agrees?"* A few **thousand boids** run on the **GPU** (a real WebGPU compute shader — Craig Reynolds' separation/alignment/cohesion, 1987). Their **agreement** — the mean velocity-alignment, one number in [0,1] — tunes a choir: when the flock flies as one, the voices **lock into a consonant just-intonation chord**; when it scatters, they **detune into beating dissonance**. Tap to drop an **attractor** and watch them gather → lock → hear the chord resolve; arm the **Predator** and tap to scatter → hear it fall apart. It plays itself on load (a scripted attractor drives the whole gather→lock→scatter arc), so a silent glance already shows the idea. This is **played, not watched** — an instrument you herd. It runs on a guaranteed **CPU fallback** if your browser has WebGPU off, so it always works on your phone.

## Also explored this cycle — banked, not shipped (IDEAS §884)
- ⭐⭐ **spheres** — *"What does the sky sound like right now?"* Music of the Spheres, **correct for this minute**: the real positions of the Sun, Moon and naked-eye planets (computed from orbital elements, zero network) drawn as a clean **SVG orrery** and tuned — each body's **orbital period** → one just-intoned drone voice (after Kepler's *Harmonices Mundi*, 1619). Scrub ±1 year to hear fast planets lap slow ones. The lowest-risk, most *different* thing in the fan — a strong next ship.
- ⭐ **echo-hunt** — an **audio-first game**: a ping hides in **HRTF space**; find it by ear alone (proximity speeds the ping and raises its pitch), tap to guess, scored by distance. Headphones on.

## Research worth a look
- The **WebGPU-compute-boids ecosystem is very active in 2026** — [webgpu.com's parametric BOIDS playground](https://www.webgpu.com/showcase/antlii-boids-emergent-flocking-behavior/) and a [10-example WebGPU compute showcase](https://github.com/scttfrdmn/webgpu-compute-exploration) (SPH fluids, DLA, boids). That grounded tonight's build directly: it confirmed the canonical two-buffer `@compute` pattern is a solved, ship-safe path, so the novelty budget went into the *sonification* (order-parameter → consonance), not the plumbing. (RESEARCH §884.)

## Open questions for Karel
- **Which lane next?** The flock is playable/emergent; `spheres` is outward-facing/celestial; both are off the altered-state theme you asked me to break. Want me to keep mining the outward-facing seam (your jury's strongest-rated lane — cf. solar-wind, seismic-choir), or come back toward the instrument/altered-state side now that the monoculture's broken?
- **AI-pipeline chains** (music→image→video) are still **0×** and would be the single most novel next step — but they'd spend your FAL_KEY budget. Give me an explicit go-ahead + a budget and I'll build one.

_Not eye/ear-verified — the headless container has no display/GPU/speakers. Whether the WebGPU path runs (vs the CPU fallback), the fps of the ~2,600-agent O(n²) sweep, and whether the chord audibly "locks" as the flock agrees all want your browser. The CPU fallback + deterministic idle auto-demo are the guaranteed silent-review stand-ins._
