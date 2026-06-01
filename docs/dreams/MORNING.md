# Morning digest — last updated 2026-06-01 UTC (Cycle 271)

> **Jury verdict today**: Top of the night is the best the lab has ever shipped — the orchestrated builds (233/234/236/238/243) all cleared the ambition floor — but the five solo kids cycles in between collapsed into near-identical pentatonic tap-chimes, so the verdict is: run the orchestrator on the kids cadence too, or keep paying for the local minimum. See `docs/dreams/JURY.md`.

## New since yesterday

- **[/dream/243-spectral-cloud](/dream/243-spectral-cloud)** — Spectral Cloud `demoable`
  **Drop in one of your own piano recordings and watch it become a slowly-rotating nebula of light you orbit.** Each frame of the spectrum is deposited into 3D space — angle/radius = pitch, height = time, brightness = energy — into a rolling few-second memory you drift around. Beats fire an expanding shockwave shell; the timbre's brightness blooms or condenses the whole cloud. Press Start (a pad plays instantly) or Drop a track; drag to orbit, scroll to dolly.
  **Open this if**: you want to see your music as an *inhabitable data-sculpture* (Anadol / Ikeda lineage), not another flat reactive canvas. First volumetric orbital point-cloud + first custom GLSL point-shader in the lab — and it sits on the `130-tsl-particle-compute` ❤️ + your real-music thread (`227-paths-granular` ❤️).

## How this was made (DEEP orchestration)

- One **massively-bigger concept** — *"navigate YOUR OWN music as a living 3D world"* — explored **three structurally-different ways** by 3 parallel builders, shipped the strongest. The two I didn't ship are banked as **build-verified** seeds in IDEAS.md:
  - **`spectral-tunnel`** — fly down a **wormhole carved by the spectrum** (most kinetic; the most physically-correct flythrough of the three).
  - **`spectral-canyon`** — fly through your music as a **scrolling spectrogram terrain** (most legible; has one ring-buffer fix queued before it's resurrected).

## Research finding worth a look

- **WebGPU just hit browser baseline everywhere**, and three.js ships `WebGPURenderer` by default — GPU *compute* (million-particle physics, **volumetric point clouds**) is finally a safe browser target. The lab is almost all WebGL/canvas2d. `243` is the first step onto that frontier. (Also logged: a 2026-04 paper on real-time human-AI musical co-performance → a future `duet-shadow`.) RESEARCH.md cycle-271 entry.

## Open questions for Karel

- Want me to chase the **WebGPU compute** frontier next (denser clouds, on-GPU FFT), or keep the immersive-3D-of-your-music thread going on the CPU path (the banked tunnel/terrain)?
- Still open: INDEX.md is missing entries for prototypes 230–234 (earlier cycles didn't backfill; 236/238/243 are in). Want a polish cycle to reconcile it?
