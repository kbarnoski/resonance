# Morning digest — last updated 2026-07-12 ~18:35 UTC (cycle 752)

> **The jury's #1 note: three.js became the new mouse-drag (5/15, GPU-render-primary ~10/15) — "next cycle's primary surface must NOT be a hand-authored GPU render."** Tonight's WIDE fire put its three explorers on three *distinct* off-GPU-render surfaces (pure **SVG**, **Canvas2D**, **WebGPU-compute**) and shipped the freshest, most render-robust one. See `docs/dreams/JURY.md`.

## New since yesterday — 🎹 keyboard, sound on
- **[1530-hyperbolic-organ](/dream/1530-hyperbolic-organ)** — *Play a negatively-curved universe.* An Escher **Circle-Limit {8,3} tiling** in the Poincaré disk, built from real **SVG `<path>` tiles** (no canvas, no WebGL, no three.js), that you **translate and spin with the keys** — and **each hyperbolic move rings one just-intonation interval** and shifts the drone, so moving through hyperbolic space *is* moving through a lattice of pure ratios. `WASD`/arrows translate, `Q/E` spin. Before you press Play the disk drifts on its own. `WIDE-winner · keyboard → pure SVG · intense/kinetic geometric (rests the void)`

## Why this one
- **The freshest off-GPU-render surface in the lab.** Pure SVG vector tiles — not three.js, not WebGL2, not even canvas — is the cleanest possible break from the ~10/15 GPU-render monoculture the jury flagged. And it's **played, not watched** (a keyboard instrument), and **fully render-robust**: deterministic SVG that renders identically on your phone at 06:30, so it Just Works (the two other explorers' headlines needed a live camera / a real GPU — unverifiable here, so they're banked).
- It's the honest **SVG, keyboard-played inversion** of the lab's existing `1044-hyperbolic-bloom` (which draws the same tiling but as a watched WebGL shader driven by the mic) — cited as lineage, not claimed as new. Named refs: Escher *Circle Limit III* (1959), Poincaré, Coxeter, Fuchsian/Möbius groups.

## Also explored tonight (WIDE fire — 2 banked, full code saved, seeds in IDEAS §752) — both **loved-neighbour** directions of yours
- **⭐⭐ 1532-hand-aurora** — your **bare hands conjure light**: MediaPipe hand-tracking → a Canvas2D aurora where a pinch births a glowing entity (love-adjacent to your 234-kids-hand-creature). Banked because the camera *feel* can't be verified headless — ship after a real-browser test.
- **⭐⭐ 1534-attractor-tide** — **sculpt a living strange attractor**: a 1M-point WebGPU-compute de Jong cloud you fold with tilt+keys (love-adjacent to your 130-tsl-particle-compute). Its Canvas2D fallback is a complete standalone piece; the WebGPU path is written but unrun — ship on a verified-GPU night.

## Two decisions I need from you (both standing, raised by name as instructed)
- **The "first 5/5" is blocked on a hard fact** (confirmed again tonight): in a 1500-deep lab there's no genuinely *never-used* technique left to satisfy criterion #1 — hand-tracking (20 impls), WebRTC (22), TF.js (12), MIDI and moiré are all used. To reach a clean 5/5 I need either (a) you to plug in a **MIDI controller / depth camera** for a piece, or (b) your OK to count a **novel combination** as #1. Which?
- **Oldest unmet ask, now 6 juries running:** the **audio → image → video AI-pipeline chain** (still 0×). Blocked ONLY on your **per-prototype paid-budget go** — one yes/no and I build it. Yes?
