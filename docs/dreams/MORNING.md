# Morning digest — last updated 2026-06-11 (UTC) · cycle 393

## ▶ Open this first
**[/dream/520-singing-dune](https://getresonance.vercel.app/dream/520-singing-dune)** — **Singing Dune** ⛰ (adult / meditative)
One living dune of sand, under its own gravity. Tap **wake the dune**, then **tilt your phone** (or drag / arrow-keys) — the sand slumps, avalanches, and finds a new angle of repose, *forever, never the same*. There's no goal and no resolve button; the whole piece is one presence settling. And the sound **is** the sand: the drone's pitch rides the grains' shear (it bends up in an avalanche, sinks back at rest), density tracks how much is moving, and each slip throws a soft grain-burst. It's the real *"song of dunes"* acoustics over a real physics sim.

This is the lab's **first actual continuum simulation** — a **WebGPU MLS-MPM** granular solid (the Houdini/TouchDesigner sand-sim paradigm, finally ported to a browser compute shader; APIC + Drucker-Prager so it *piles* instead of splashing). It answers three of yesterday's jury asks at once: **refuses to resolve** (#2), **extends the WebGPU lane** instead of migrating renderers again (#3), and is about **one presence** (#5). It also finishes the MLS-MPM upgrade that your loved **84-wave-fluid** explicitly deferred.
*(Settles + sounds on load even before you touch it; if your phone has no WebGPU — iOS still doesn't mid-2026 — a CPU sand-sim runs the same dune, just fewer grains.)*

## 2 more explored this fire (banked — see IDEAS §393)
- **521-overpass** — hear ONE real satellite (the ISS, live) pass overhead: a lone voice rising from the horizon, peaking at zenith, fading as it sets, silent between passes, on a three.js star-dome. Real-world-data, genuinely fresh, the **cleanest resurrect** — lost only on lower ambition + live-API risk. I'd happily ship this next.
- **522-chladni-voice** — hum and your voice becomes a 60k-grain Chladni sand figure. Built clean, but a curation grep caught that **19-cymatics / 165-cymatics already did this** — a hidden repeat. Out on the "too similar" rule. (The WIDE fan-out earning its keep: it surfaced the duplicate before it shipped.)

## Why WIDE, not the DEEP-on-516 I floated yesterday
I asked yesterday about taking **516-slow-presence** DEEP this cycle — I deliberately **didn't**. 516 is another WebGPU Gray-Scott reaction-diffusion piece, and shipping it the night after 518 (also Gray-Scott RD) would be exactly the "too similar" autopilot the jury keeps flagging. Alternation also said WIDE after a DEEP. So I went three divergent directions instead. 516 is still banked for when it won't read as a twin.

## Honest caveats
- Build-verified (compiles clean, 9.6 kB static), **not browser-verified.** The WebGPU pipelines have **never run on a real device** — first-run shader/bind-group errors are possible (the CPU sand-sim fully covers that, including iOS). The GPU scatter has racy writes (no f32 atomics) and the plasticity is approximate, so the angle of repose may drift. Whether the drone reads as "booming" behind the limiter is unverified.
- **#5 not claimed** again — this week's cs.SD is all server-side diffusion, nothing client-portable (a stable, repeated read now). The freshness here is the WebGPU-MPM paradigm port, not a bound paper.

## Open question for you
Two things I'd value a steer on: (1) **521-overpass** feels like the strongest bank in a while — want it shipped next, or folded into the Living Earth spine as its "look up / orbital" chapter? (2) For **520's** cycle-2, more interesting to you: a true 2-material sim (sand + water), a **kids** "pile-it-and-crumble" version, or persisting the dune you shape?
