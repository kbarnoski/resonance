# Morning digest — last updated 2026-06-03 ~04:20 UTC (cycle 291, adult · WIDE, 3 explored)

**Open this first:** [/dream/283-piano-isosurface](https://getresonance.vercel.app/dream/283-piano-isosurface)
*(Tap Start — a glowing 3D blob starts breathing to a soft pad. Drop an audio file, or paste a Welcome Home track id, to sculpt it with your real piano. Drag to orbit. No mic/file needed — it's never silent.)*

## New since yesterday
- **283-piano-isosurface — your piano sculpts a living 3D volume.**
  The lab's **first marching-cubes / volumetric isosurface** in 280+ prototypes.
  Every prior visual drew meshes, particles, shaders, or 2D — this one
  **reconstructs a surface from a scalar field**: a field of metaballs driven by
  the music's frequency bands, polygonized into one breathing connected form
  every frame. Bass swells a central core, mids orbit it, highs flick flecks at
  the edges; loudness makes it breathe; brightness shifts its hue cool→warm.
  - Feeds **your real Welcome Home recordings** via the loved `163` track-id
    pattern (`/api/audio`) — drop a file, paste a track id, use the mic, or just
    let the built-in D-dorian pad sculpt it. Always alive.
  - Refs: **Lorensen & Cline, "Marching Cubes," SIGGRAPH 1987**; Refik Anadol.
    Built off this cycle's research that **GPU isosurface is now browser-real-time**.
  - Winner of a **WIDE** 3-builder fire — see "also explored" below.

## Also explored this fire (build-verified, banked in IDEAS.md)
- **midi-harmonograph** — play a chord (MIDI / QWERTY / on-screen) and it **draws
  itself as a Victorian harmonograph** in raw WebGL2; flip JI-lock and the figure
  cleans up + the beating resolves. Consonance = a clean closed curve. *(Pianist fit.)*
- **ensemble-tabs** — open 2–3 tabs and they lock into ONE serverless, tempo-locked
  ensemble on a `Date.now()` shared clock — the **lab's first networked piece**.

## Research worth a look
- **§291 — GPU marching cubes is now near-native in the browser** (Will Usher 2024;
  Twinklebear). That's what makes a *sound-driven* isosurface feasible live. Next
  step for 283 is a **WebGPU compute** isosurface for much higher resolution.

## Open questions for Karel
- The **AGENT.md drift is resolved** — on-disk origin/main is now the current version
  (AMBITION + ORCHESTRATION sections present). Cycle 290 had read a stale copy.
- The diversity audit **banned canvas2d this cycle** (5/10 recent), which blocked the
  obvious resurrections (midi-harmonograph/ensemble-tabs/mosaic-listener were all
  built as canvas2d). I rebuilt the first two in raw-WebGL2 to clear the ban and
  shipped the 3D one. Working as intended — flag if you'd rather I override the audit.
- Strong deepening path for 283: **per-note metaballs from onset detection** (each
  piano note buds off the surface) + a WebGPU-compute high-res version.
