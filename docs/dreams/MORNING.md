# Morning digest — last updated 2026-06-25 ~08:2x UTC (cycle 547, adult · DEEP)

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[932-tilt-orrery](https://getresonance.vercel.app/dream/932-tilt-orrery)** 🪐🔔 — *Tilt your device and a little cosmos tips like a bowl; every time a body swings through its closest approach to the center, it rings.* The music is the emergent **polyrhythm of orbits** — pitch is held deliberately dumb (a drone + fixed pentatonic) so the piece lives in **rhythm, density and space, not pitch theory**. Steeper tilt squashes orbits → faster, denser passes. Listen for the steady hypnotic sub-pulse inside the chaos: **seven amber bodies seeded in the TRAPPIST-1 resonance chain** (Kepler's "harmony of the spheres," made literal) lock into a repeating beat against the chaotic violet field.
  - **The whole N-body sim AND the perihelion detection run on the GPU** — 3000 bodies integrated in a raw WGSL compute shader, only a tiny per-frame flag buffer read back for audio. The directest answer to the jury's "swing to the scarce GPU surface" + "make music from rhythm, not pitch." Bell timbre from radius+speed, stereo pan from angular position (you hear the cosmos rotate).
  - No tilt sensor (laptop)? It opens in auto-drift + drag + sliders, sounding/moving within ~0.6s. No WebGPU? Falls back to a 360-body CPU sim on a 2D canvas — still sounding.

## In progress / partial
- Nothing mid-thread. Cycle 548 (kids) resurrect-first: **930-kids-tilt-tide** (three.js/CPU tide-pool). Adult resurrect-first: **933-tilt-orrery** (below) then **929-cathedral-rhythm**.

## Research findings worth a look
- **RESEARCH §547** — browser N-body gravity now runs *entirely on the GPU* at 1M+ bodies, and **WebGPU finally reached the iPad (Safari 26 / iOS 26)** — so a tilt-held GPU cosmos is now shippable on the device it's for. Paired with **Kepler 1619 + NASA's 2017 TRAPPIST-1 sonification** for the resonance-chain-inside-chaos idea. In-README dated-citation streak now **13 cycles**.

## Also explored (DEEP — 1 concept × 2 approaches, shipped 1)
- **933-tilt-orrery** — the same cosmos as a lush three.js `WebGLRenderer` galaxy (~12k bodies) with a dynamic-`import()` WebGPU/TSL compute enhancement (~100k). Build-green, banked ⭐ resurrect-first in IDEAS §547 (a richer galaxy look to fold into 932; and a reusable build-safe way to use `three/webgpu` in this repo).

## Open questions for Karel
- Orrery deepening: should a *sustained* tilt-hold **capture** bodies into a held resonance the cosmos remembers over minutes (state/memory — the long-form depth the jury most praised)? And do you want the lush galaxy look (933) folded in, or is the clean point-field right?
- Only compile+lint+type are verified here (container has no GPU/tilt/audio; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). The resonance-pulse-vs-chaos "feel" may want a real-device tuning pass when you have a moment.
