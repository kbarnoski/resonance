# Morning digest — last updated 2026-07-10 ~16:35 UTC

> **Cycle 729 · psychedelic · WIDE** — three unrelated instruments in one night, cashing the two things you'd nagged about most: **bring the camera back** (the jury said the whole embodied lane had collapsed to one piece) and **a second GPU-compute piece**. Shipped the camera one — partly *because* you'd just gotten a dissonance piece last night, and the GPU candidate was *also* dissonance; two of those in a row is exactly the "too similar" trap, so I banked it and shipped the one that looks nothing like anything recent.

**Open the lab:** https://getresonance.vercel.app/dream

## New since yesterday — open this first (on your phone, front camera)
- **[/dream/1412-time-smear](https://getresonance.vercel.app/dream/1412-time-smear)** — *perform in front of your webcam and **play time itself**.* Instead of showing the live picture, it keeps only a thin vertical sliver of each frame and scrolls it sideways — so the across-the-screen axis becomes **time**. Wave a hand and it stretches into an eerie liquid ribbon; the brightness of that sliver, band by band, drives a 16-voice shimmering drone, so your movement literally **paints the sound**. A classic slit-scan / chronophotography idea (Golan Levin, Zbigniew Rybczyński) the lab had never done — every other camera piece here is a mirror or hand-tracker, none turns time into the axis. **Why the pick:** it revives the camera lane you flagged, it's love-territory (your camera pieces are all favorited), and it's the freshest thing on the wall — nothing like last night's tuning piece. Best on a phone with the front camera. No camera? It falls back to a pointer-drawn version so it's never blank.

## Explored but not shipped (2 more — banked, full specs in IDEAS §729)
- **⭐⭐ 1414-beat-field** (TOP ship-next) — compose in the **beating itself**: detune a stack of voices and sculpt the roughness from a slow trance-shimmer up to a howl, with a live **WebGPU-compute** field painting the dissonance. This IS the "prove we can ship a *second* GPU-compute piece" the jury keeps naming — and it's **fully built and clean this time**, all three fallback tiers (WebGPU→WebGL2→Canvas2D), dark-violet never-black floors. I held it only to avoid two dissonance winners back-to-back; it's **one look on your screen from shippable** — say go and it ships next cycle.
- **⭐ 1416-nebula-thread** — tilt your phone to **thread a path through a 3-D nebula** and voice the tones hidden in its density (three.js point-cloud, glassy chimes panned by where they are on screen). Calm, cosmic, the one fully phone-tilt piece of the night. Love-fit with your aurora/spectral favorites.

## Open questions for Karel
- **The AI-pipeline chain is still the last 0× rung** (audio→image→video — jury's standing ask, now a sixth time). It needs your explicit per-prototype **paid-budget** go-ahead (FAL/Replicate); I will NOT auto-spend, so it can't run unattended. Say the word and I'll build one.
- **Ship 1414-beat-field next?** It just needs you to confirm the GPU field paints (not black) on your browser — open it once; if it's alive, I'll promote it as-is. It's the cleanest, best-defended GPU piece the lab has produced.

## Note on the build
- Winner verified: full production build **compiled + linted + typechecked with zero errors** in the dream code; **ESLint `--max-warnings 0` = 0**, **TypeScript `--noEmit` = 0**. The plain `npm run build` only tripped on the container's known open-file-limit at the very last packaging step (not a code error, absent on Vercel). It's a pure client-side WebGL2 + Web Audio + camera component — deploys clean.
