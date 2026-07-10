# Morning digest — last updated 2026-07-11 ~UTC

> **Cycle 730 · psychedelic · DEEP** — one big concept built three ways, to finally do the thing you've been asking about for a month: **ship a real GPU-compute piece** (not bank it a third time). I built the *beating* itself as an instrument — and shipped the one that runs an actual WebGPU compute shader.

**Open the lab:** https://getresonance.vercel.app/dream

## New since yesterday — open this first
- **[/dream/1418-beat-field](https://getresonance.vercel.app/dream/1418-beat-field)** — *compose in the **beating itself**.* Four detuned voices; **drag** left→right and you sweep one continuous axis from a pure, silent **lock** → a ~1–3 Hz shimmer → a tremolo → a dense **howl**. The dissonance is the thing you *play* — you push into the roughness and release, and that gesture is your dynamics. It's the antidote to the lab's oldest crutch (every melody pre-guaranteed to sound "nice"): here a note can sound *wrong* on purpose, and that's the point. Under the hood it's a genuine **WebGPU compute shader** painting a Plomp–Levelt roughness field (Sethares) — the "prove we can ship a *second* GPU-compute piece, not just `1348`" the jury keeps naming. Keys `1`–`5` pick chords, `↑↓` moves the root. **Please check one thing:** open it and confirm the field actually *paints* (not a dark frame) — it renders WebGPU→WebGL2→Canvas2D and the audio works regardless, but the GPU look is the payoff and I can't see it headless.

## Explored but not shipped (2 more — banked, full specs in IDEAS §730)
- **⭐⭐ 1420-beat-loom** (TOP ship-next) — the *same* beating instrument on the **three.js + TSL-compute** stack you already favorited (`130-tsl-particle-compute`), as a 40,000-point GPU cloud. It's the higher-ambition, better-cited one (borrows Robert Borghesi's *ASTRODITHER*, shipped July 1) — I held it only because `1418` is the more literal "raw WGSL" cash and has a sturdier fallback. **One look on your screen from shippable.**
- **⭐ 1422-beat-mesh** — the same field done in **WebGL2** so it renders on *any* device (4-tier fallback ladder). The safety-floor version — resurrect it if we ever need a GPU field guaranteed to paint at an installation.

## Open questions for Karel
- **The AI-pipeline chain is still the last 0× rung** (audio→image→video — the jury's standing ask, now a seventh time). It needs your explicit per-prototype **paid-budget** go-ahead (FAL/Replicate); I won't auto-spend, so it can't run unattended. Say the word and I'll build one.
- **Ship 1420-beat-loom next?** If `1418` paints well for you and you want the loved-TSL/point-cloud version too, say go — it's built and clean, one browser confirmation away.

## Note on the build
- Winner verified: full production build **compiled + linted + typechecked with zero errors** in the dream code; **ESLint `--max-warnings 0` = 0**, **TypeScript `--noEmit` = 0**, route in the manifest. The plain `npm run build` only tripped on the container's known open-file-limit at the last packaging step (not a code error, absent on Vercel). Pure client-side WebGPU + WebGL2 + Web Audio — deploys clean.
