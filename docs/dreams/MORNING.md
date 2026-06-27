# Morning digest — last updated 2026-06-27 (~14:20 UTC)

> **Jury verdict (2026-06-27)**: You fixed everything from two weeks ago, but the lab over-corrected away from the WebGPU monoculture and landed in a *2D monoculture* — **WebGPU compute collapsed 6×→1×, 14 of 15 builds render flat 2D** (Canvas2D + single fragment shaders), true 3D is 0×, and the adult lane ran one "explainable-inverse-of-a-neural-frontier" formula four times. Two asks: *force a real GPU-compute/3D path* and *extend 977 instead of shipping one-offs*. See `docs/dreams/JURY.md`.

Cycle 574 · **kids** · WIDE (3 GPU-compute/3D explorers, orchestrated). Shipped 1, banked 2. **This fire answers the jury's loudest ask head-on: all three explorers make a real GPU physical-simulation the instrument's resonating body — none is flat 2D.**

## New since yesterday
- **[/dream/988-kids-jelly-pond](https://getresonance.vercel.app/dream/988-kids-jelly-pond)** — *Sing the Pond.* **A 4-year-old drags a finger across a glowing pond of thousands of REAL GPU-simulated water particles — stir it, pool it, splash it — and the water's own motion is the instrument.** Stir-speed → a soft shimmer that climbs the scale (always in key); a splash → a marimba sparkle; a calm pool → a fuller, lower chord. Never silent, no wrong notes.
  - *Why it's different:* it's the directest answer to today's jury — a genuine **WebGPU compute** Position-Based-Fluids solver (5 WGSL passes, ~4k particles, atomic spatial-hash neighbour search), **NOT** a Canvas2D loop or a flat shader. The sim *is* the body: GPU-measured water motion drives every note. Named ref: **Macklin & Müller, "Position Based Fluids," SIGGRAPH 2013**; chained to today's GPU-physical-sim research.
  - *Try it on your phone right now:* tap Play and **drag a finger on the screen** — instant water + sound, no mic/camera/permissions. This is the easiest build of the fire to actually feel at 06:30.
  - *Love-aware:* a rare cycle where your loves pulled the pick — `84-wave-fluid`❤️, `133-kids-ripple-pond`❤️, `130-tsl-particle-compute`❤️ all point straight at fluid + GPU compute.

## Also explored (banked, not shipped — IDEAS §574)
- **989-kids-star-cloth** ⭐ RESURRECT-FIRST — tilt the tablet to roll a glowing moon-ball across a **springy trampoline of stars rendered in TRUE 3D** (the lab's *only* true-3D scene-graph build — the jury flagged 3D as 0×). It's a real WebGPU mass-spring cloth, and the cloth's membrane-vibration modes **literally ARE the sound** — the closest kids analog to 960's "the timbre is physics." Calm bedtime. De-selected only because touch (988) is the cleaner 06:30 verification.
- **990-kids-firefly-flock** — **hum, and ~30,000 WebGPU-compute fireflies** (Reynolds boids) gather to your voice and sing back a choir; high hum → swarm rises → higher notes. Largest GPU count of the fire, freshest sensor (mic).

## Research finding worth a look (RESEARCH §574)
- The 2026 cs.GR frontier is no longer single-material — **arXiv:2606.21753 "Scene-Level Heterogeneous Physics Simulation" (Jun 23, 4 days old)** simulates cloth + fluid + granular *together* in one real-time GPU scene. That motivated the whole fire: make the GPU physical-sim the playable body of the sound. WebGPU cloth feasibility: arXiv:2507.11794.

## Open questions for Karel
- **988 is touch-only and phone-friendly — please drag a finger in the pond and tell me if the water "sings" the way it should.** The motion→note mapping is reasoned; one real play would let me tune it.
- The jury wants the **adult** lane to (a) extend **977-echo-room-gpu** into a multi-cycle spatial instrument and (b) retire the "explainable-inverse" formula. Next fire is adult — I'll aim there unless you'd rather I deepen one of today's GPU-compute kids toys first.
- Two infra fixes still need you: (a) raise the container ~4096-fd ceiling so Next static-gen runs locally, or (b) a hand-verify pass on a real GPU+sensor device. Everything builds green + Vercel-deploys.
