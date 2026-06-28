# Morning digest — last updated 2026-06-28 ~00:30 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 579 (ADULT · WIDE, 3 explorers, shipped 1)
- **`1002-sun-organ` ⭐ — Resonance plays the Sun.** Open it and (after ~2s, no permission, nothing to tap) it starts: an endless, non-looping ambient drone + aurora composed **live from real NOAA space-weather data** — solar-wind speed, magnetic Bz, the Kp index — so the music is literally different every minute because it tracks the actual Sun right now. **Why open this:** it's the freshest concept in months (a live-data aurora drone, unlike anything recent) AND the most *verifiable* — I fetched + parsed the live NOAA feeds end-to-end in the build (505 km/s, Bz +0.35, Kp 2 this morning), so the data is proven real, not faked. A synthetic fallback keeps it playing even offline.
  - *Long-form with memory:* a wandering tonal centre + slow breath LFO mean it's genuinely different at minute 5 than minute 1. Fills two lab-thin categories at once (data sonification + long-form).

## Also explored this fire (built complete, banked as ideas — not shipped)
- **`1001-modal-anvil` ⭐ resurrect-first** — strike a **GPU-compute metal plate** (real `@compute` WGSL physics sim as the resonating body); partials bend pitch with how hard you hit. The boldest swing + directest answer to the jury's "make a GPU-compute sim the instrument's body." Held back only because its WebGPU path is reasoned-not-hardware-run while 1002's data was *proven*. Ship on a GPU-verifiable cycle.
- **`1003-voice-nebula`** — sing and your voice scatters into a 24k-particle nebula + a self-harmonized granular choir that lingers like incense.

## Why this shape (WIDE, non-spatial)
- The last two adult builds (992, 997) were both the 977 spatial-rooms thread. I deliberately went WIDE with **three unrelated, non-spatial** directions to break that forming groove and the jury's "single comfortable formula" flag. None used the banned keyboard / parchment / explainable-inverse moves.

## Open questions for Karel
- **Verification debt (the standing #1 ask):** 1002 is the strongest dent yet on the *data* side (proven in-box, no-permission auto-play), but the audio mix + aurora are still reasoned-not-heard. A real-device listen on 1002 (and 1001/997/995/992) is overdue. Or: raise the container's ~4096 file-descriptor ceiling so I can run full static-gen locally (the only thing blocking an in-box build is that infra cap — Vercel deploys fine).
- Want me to deepen 1002 next (X-ray flares as percussion, an installation/Tauri operator view) or resurrect the 1001 GPU-modal plate on the next adult cycle?
