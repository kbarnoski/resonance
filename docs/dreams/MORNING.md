# Morning digest — last updated 2026-06-25 ~12:2x UTC (cycle 549, adult · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[939-aurora-harp](https://getresonance.vercel.app/dream/939-aurora-harp)** 🌌🌠🟢🟣 — *Hear space weather right now.* It fetches the **live solar wind** streaming past Earth (NOAA's real-time feed from a satellite at the L1 point) and turns it into a shimmering aurora curtain **and** sound. Calm wind → slow steady drones; a gust or a **southward magnetic field (Bz)** → the aurora flares green-violet-crimson and the sound thickens, beats and ripples. **It's a live planetary instrument — different every time you open it.**
  - Sonification is done the way **NASA's HARP project** does it: it audifies the magnetosphere's *real resonances and beating*, not a pretty chord. This is the lab's deliberate fix for the concept jury's complaint that our past data pieces leaned on an "always-in-tune" safety net — here the **Sun is the composer**, pitch held non-melodic.
  - No internet / feed blocked? It **falls back to a synthetic solar wind** (with its own gusts) so it always sounds and shows within ~0.6s, with a small amber notice. A live readout (speed/density/Bz/Bt) and a "what am I hearing" panel explain the mapping.

## In progress / partial
- Nothing mid-thread. **Cycle 550 (kids)** resurrect-first: **936-kids-rattle-bloom** → 930-kids-tilt-tide. **Adult** resurrect-first now: **938-morphogenesis** (below) → 937-cathedral-phase → 933-tilt-orrery (only once the tilt-orrery concept has cooled).

## Also explored this fire (WIDE — 3 orthogonal directions, shipped 1)
- **938-morphogenesis** ⭐ — music from a **living chemical pattern**: a Gray-Scott reaction-diffusion sim breeds spots/labyrinths on **WebGPU compute** (the scarcest GPU surface we have); you drip reagent and the evolving *texture* becomes a granular sound-texture. Build-green, banked in IDEAS §549 as the **top adult resurrect-first** (it's the cleanest answer to the jury's "swing to the scarce GPU surface").
- **937-cathedral-phase** — a cathedral as a **rhythm machine**: Euclidean beats on five rings drift **out of phase** (Steve Reich's *Piano Phase* process) inside a raymarched stone nave with cathedral-sized reverb. Build-green, banked in IDEAS §549.

## Research finding worth a look
- **RESEARCH §549** — you can **hear space weather**: NOAA streams the live solar wind as open data, and NASA's **HARP** has shown the magnetosphere's plasma waves *audify* into real music. The corrected way to sonify data — resonance, not a chord. In-README dated-citation streak now **15 cycles**.

## Open questions for Karel
- Did I make the right call rejecting the queued **933-tilt-orrery** resurrect? It's a renderer-swap of 932 (shipped *last* adult cycle) — felt too close to "the same thing again," so I went WIDE with three fresh directions instead. Push back if you'd rather I'd shipped the lush galaxy.
- 939 is **not network/GPU/ear-verified** here (no live net/GPU/audio in the container; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). Worth a glance on whether the NOAA feed resolves from your machine and whether a real quiet-wind day reads as too calm (the synthetic fallback injects gust energy for the demo).
