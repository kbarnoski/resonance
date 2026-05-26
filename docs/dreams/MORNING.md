# Morning digest — last updated 2026-05-26 UTC (Cycle 203)

## New since yesterday

- **Cycle 203 — Research sweep** (this cycle, no new prototype)
  Scanned 8 fresh sources: arxiv papers Feb–May 2026, MUTEK 2026 lineup, Revision 2026 Shader
  Showdown, fal.ai April–May releases, MediaPipe/WebGPU community. 8 new RESEARCH.md entries
  (§219–226). 4 new IDEAS.md prototype seeds added (see below). Queue refreshed for the next
  10+ cycles.

- **[/dream/173-kids-garden-bloom](https://getresonance.vercel.app/dream/173-kids-garden-bloom)** — Garden Bloom 🌸 (kids) `demoable` (Cycle 202)
  **Hold the soil** → stem grows, petals unfold as notes. 0.75s=1 note; 4s=5-note chord.
  Release → flower loops its chord softly. 6 flowers → grand 12-second ceremonial arc → reset.
  X position = timbre: violet/piano · amber/bells · teal/pluck · rose/pad. For kids 3+.

- **[/dream/172-loop-station](https://getresonance.vercel.app/dream/172-loop-station)** — Loop Station `demoable` (Cycle 201)
  4-slot phase-locked looper. Load demo → four loops on same beat grid. Tap REC to record.
  First prototype about *constructing* a composition rather than reacting to audio.

## New seeds worth knowing about

Four prototype seeds added to IDEAS.md from Cycle 203 research:

- **`174-vocal-choir`** — Sing into mic → 3 auto-harmony voices (M3 + P5 + bass octave) appear
  spatially via HRTF PannerNodes. Visual: 4 colored orbs in SATB formation around you.
  Zero deps, zero API. Aligns with `spatial-palette` ❤️ love. **Top Cycle 205 candidate.**

- **`175-sdf-cave`** — Audio-reactive SDF ray-marching WebGL shader: a cave interior where
  bass melts the walls, treble roughens the ceiling, centroid shifts color. You're *inside*
  a space that responds. First prototype in the sandbox where the viewer is inside the visual.
  **Highest surprise factor of the batch.** Zero deps.

- **`176-score-structure`** — Mic → chord detection + density analysis → scrolling timeline
  showing the architecture of your improvisation. Each 4-bar section gets auto-labeled
  (Intro / Build / Climax / Resolution). First prototype analyzing compositional *structure*.
  Completes the "four perspectives on your playing" suite with `chord-canvas`, `piano-roll`,
  `piano-canvas`. Zero deps.

- **`177-splat-bloom`** — 500 oriented Canvas2D ellipses (Gaussian splat visual language)
  react to audio: bass = outward bloom, treble = field rotation, onset = scatter/coalesce.
  Screen-blend compositing. Completely different visual quality from particles or fluid —
  a soft, luminous texture field. Zero deps. Aligns with `tsl-particle-compute` ❤️ love.

## In progress / partial

- Nothing in-progress. Queue is fresh.

## Research findings worth a look

- **MUTEK 2026** (Aug 25–30, Montreal) — Sphaîra (voice + Oscar Niemeyer dome acoustics + light)
  is the most architecturally bold AV piece in recent festival programming. Confirms the
  "room as instrument" direction. `sdf-cave` is the direct Resonance interpretation.

- **AI Harmonizer** (NIME 2025) — 4-voice real-time SATB harmonization from one mic. Zero-dep
  browser approach viable with autocorrelation + additive synthesis. Surprisingly musical result
  for a purely procedural system — no ML at runtime.

- **Revision 2026 Shader Showdown** — `smin()` SDF blending as an audio-reactive parameter is
  a visually stunning technique the sandbox hasn't used. Wall-melting on bass hits is impossible
  to achieve with particles or fluid.

- **NeoLightning** (ICMC 2025) — confirms the `gesture-music` spec is right; adds depth-as-reverb
  (hand distance from camera → reverb decay) as an upgrade to the IDEAS spec.

## Open questions for Karel

- **Garden Bloom grand chord**: 6-flower threshold → 12s ceremonial arc. Too slow to discover?
  Lower to 4 flowers?
- **Loop station overdub**: want Cycle N+1 to add overdub (tap REC on looping slot = layer)?
- **Spectral Morph pitch lock**: root fixed to C3. Add transpose slider?
- **sdf-cave or vocal-choir first?** Both zero-deps, one cycle. `vocal-choir` aligns with
  spatial-palette love. `sdf-cave` is the highest-surprise entry in the queue. Your call.
