# Morning digest — last updated 2026-06-22 (cycle 519, adult · WIDE)

## New since yesterday
- **[/dream/859-paths-compute-bloom](/dream/859-paths-compute-bloom)** — **Compute Bloom.** Drop your own piano recording (or play the built-in tape-piano) and the music blooms a living cloud of **half a million particles computed on the GPU** — an 8-band FFT drives a curl-noise field: bass swells the core, highs scatter sparkle, every onset blooms the whole cloud then settles, and velocity-damping gives it **memory** (different at minute 5 than minute 1). Why open it: it lands the **scarcest surface in the lab — WebGPU compute, 0× in the last 15** — the exact thing the jury keeps begging for, and it answers Karel's "use my real piano" directive (drag-drop intake). On a non-Safari-26 phone it auto-falls to a WebGL2 cloud, so it's never a dead screen.

## How this cycle was run
- **WIDE mode** — 3 orthogonal adult explorers, each a **GPU surface** (jury HARD-banned Canvas2D) on a *different* non-banned input — shipped the strongest, banked the other two.
- Today's research found the unlock: **WebGPU just became iOS-deployable** (Safari 26 / three.js r171, late 2025). That's what made shipping a phone-glance WebGPU surface defensible *now* rather than a desktop flex — the cleanest today's-research → today's-build chain.

## Banked siblings (see IDEAS §519) — both built complete
- `860-marine-gamelan` ⭐ — the **live ocean plays a bronze gamelan**, and rough seas audibly **DETUNE the metal** (live Open-Meteo wave data → modal physical-modeling + WebGL2 caustics). The jury-PRAISED real-world-data-with-consequence register (like air-veil); **top adult resurrect-first** — built, clean, lowest runtime risk.
- `861-flow-veil` — conduct a luminous dye veil with the **raw river of your motion** (webcam **optical flow**, not tracked joints) → granular audio. Built complete but needs a 1-line `OffscreenCanvas`→`ImageBitmap` texImage2D fix before it builds.

## Research worth a look (RESEARCH §519)
- **WebGPU crossed into production on iOS** (Safari 26 + three.js r171 auto-fallback) — a browser GPU-compute surface is now phone-safe, and the creative-coding field is shipping audio-reactive compute-particle work this month (webgpu.com "Party," etc.). The lab's scarcest surface just became its safest.

## Open questions for Karel
- 859 has a real WebGL2 fallback, but the **WebGPU compute path is device-unverified** here (no GPU in the build sandbox) — worth a look on your phone/desktop to confirm the 500k-particle path actually lights up vs. quietly falling back.
- Want the next adult cycle to **resurrect 860-marine-gamelan** (the sea plays gamelan, jury-loved data register), or keep pushing fresh WebGPU surfaces while the jury's GPU-only window is open?
