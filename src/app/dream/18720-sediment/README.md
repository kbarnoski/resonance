# Sediment

**Status**: demoable — first accretive/sedimentary stateful piece in the lab, and its first >5-minute evolving piece. Builds and passes `qa-proto`. Camera/audio paths unverifiable in the build sandbox (no webcam, no audio device); logic is wired for both live pose and an autonomous demo.

## The one question

*What if your body's phrasing left PERMANENT STRATA — so by minute 5 the piece is a geological record of everything you did, not just what you're doing now?*

Every past lab piece is a stateless instrument: identical at second 1 and second 300. Sediment is a **memory piece**. It accumulates. It is genuinely different at minute 5 than at minute 1 — not because the input changed, but because everything you already did is still physically present in the column and audible in the bed.

## How the memory / accretion works

- A real growing array of **deposited strata** persists for the whole session. Each stratum is an archived snapshot of the sonic + gestural state at its moment: openness, reach, torso lift, audio RMS, spectral brightness, a playback offset into the original recording, a band thickness/radius, and a fresh "patina" color.
- **Deposits** happen on a cadence (every ~3.6s) **and** on **gesture peaks** — a big opening gesture (openness jumping above its slow baseline) punches in an extra, thicker, brighter band immediately.
- Strata **never disappear**. They stack bottom-up into a vertical core. The camera slowly **rises** so the column always reads as growing, and deeper/older strata **oxidize toward slate** while the fresh top band glows verdigris-bronze and pulses with the live audio level.
- The array is capped at 320 by **merging the two oldest into one** (summed thickness, averaged state) — the record is compressed at the very bottom, never forgotten: total column height (the shape of your whole session) is preserved.
- The audio has memory too. A parallel **granular memory-wash bus** schedules soft Hann-windowed grains (~0.3–0.6s) sampled from the **original recording buffer** at the offsets captured at **past deposits**, weighted toward older memories, gently panned. The bed thickens as strata accumulate, so by minute 5 the ambient wash is a palimpsest of your earlier gestures layered softly under the live take — and always kept under it.

## Control path (landmark → feature → parameter → sound/visual)

- **Input = full-body POSE** via MediaPipe `PoseLandmarker` (shared `cameraTracking` loader, CDN at runtime). Read **only** landmarks a seated desk webcam sees: shoulders (11/12), wrists (15/16), nose (0). Gated **only** on shoulders + nose presence; a dropped wrist is synthesized from the previous frame — never hips/ankles.
- **Feature** — `openness` = shoulder-width-normalized wrist span + arm elevation; `reach` = radial wrist distance from torso center; `rise` = nose height above the shoulder line. Smoothed per frame.
- **Parameter** (immediate, no async hops; `setTargetAtTime(…, 0.12–0.15)`): openness → live-take lowpass cutoff (650 → ~7250 Hz) and live gain; strata count × reach → memory-wash level.
- **Visual**: openness/reach/level at the deposit moment → the new band's thickness, radius, edge roughness and fresh color; peaks → thicker/brighter bands; live audio RMS → top-band emissive glow; reach → camera distance/orbit.

## Reference

Inverts **LETHE** (arXiv:2609.04289, 2026-09-03), "memory as transformation" — a self-referential loop comparing current sonic output against **archived initial states** to drive evolution. Here the archive is **literal**: each deposited stratum is an archived state the present is layered over, in both geometry and the memory-wash grains. Also in the lineage of geological-strata / data-sediment framing (Refik Anadol's data-memory installations).

## Graceful degradation

- **Autonomous DEMO drive** runs on load, with no camera, on permission denial, and on model-load failure — exercising the identical body → deposit → audio + strata chain, labelled `demo · autonomous` and visually distinct (a cinematic auto-orbit and a deliberately rhythmic breathing conductor, never mistakable for live tracking). The column is already accreting behind the intro panel.
- **Pointer conducting** (bonus): moving the mouse over the stage conducts the demo (height → openness, horizontal distance from center → reach).
- **Tracking state** is always visible: `tracking · live` vs a `text-destructive` lost hint ("open up — shoulders & hands in frame"); when lost, features ease to a calm neutral so deposition continues rather than freezing.
- **No WebGL** → a designed notice plus a cheap 2D canvas fallback drawing the same accreting core; audio still plays.
- **Audio** routes every node (live take + memory-wash) through the shared `safeMaster`, never `ctx.destination`. Audio uses Karel's verified catalog only (Welcome Home + Snowflake), with a grouped selector; default track is `REAL_TRACKS[0]`.

## Readout

A `font-mono text-xs` status line shows mode, elapsed time and stratum count, so the growth is unmistakable: the column is visibly taller and denser, and the count climbs, over minutes.
