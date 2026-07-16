# 1798 · Vection Tide

`state: audio-forward spatial-vection sound-bath · pole: cosmic-ambient`

## The one question

What if sound alone — with the screen deliberately near-dark — could carry you
bodily through space? An HRTF-spatialized field of tones **orbits your head in
true 3-D** so the whole sound-world lifts, tilts and sweeps around you, inducing
auditory **vection** (the illusion that *you* are moving while sitting still) —
a drug-free, eyes-closed cosmic sound-bath where spatial motion, not any beat
frequency, does the work.

## The vection mechanism

- **Orbiting HRTF sources are the medium.** Four warm pad partials (A2 · E3 · A3
  · C#4) plus one soft filtered-noise "wind" each ride their own slow elliptical
  or figure-8 orbit around the listener via a `PannerNode` with
  `panningModel: "HRTF"`, at deep rates of ~0.035–0.13 Hz. The `AudioListener`
  sits still at the origin facing −Z. Because each source carries a *different*
  pitch you can point at each voice, and the coherent sweep of the whole field
  is what the brain reads as **self motion**.
- **The lever is motion, not a beat.** No binaural-beat detuning is used for the
  effect. Two sources additionally carry a real **6 Hz** and **40 Hz**
  oscillation patched straight into their vertical *position* param
  (`panner.positionY`) — the source *location* wobbles at those rates. This is a
  spatial-motion oscillation, **not** an amplitude flicker: there is no strobe.
- **Breath opens the tide.** A best-effort mic (`getUserMedia({audio:true})` →
  `AnalyserNode` time-domain RMS) yields a smoothed 0–1 breath scalar. Deeper
  breath widens the orbit radius, raises the field and speeds the sweep. The
  live readout names the felt phase: **drifting → lifting → carried**.
- **Fully autonomous.** With no mic (or a denied grant) the tide self-drives
  from a deterministic ~0.05 Hz asymmetric breathing curve, so it demos headless
  with zero permission grants. A `text-destructive` line says so.

## The screen

Intentionally minimal and near-dark: a single dim violet horizon line with a
soft halo. It *tilts*, *rises* and *breathes* with the tide (all luminance
change is slow drift well under 0.3 Hz) — a reflection of the sound-world, not a
busy visualizer. There is a visual, but sound is the star. This piece exists to
prove the screen-bias empty lane the lab keeps avoiding.

## Named reference

- **PLOS One 2024 — "A new perspective on binaural beats: Investigating the
  effects of spatially moving sounds on human mental states"** (PMC11290623).
  The EEG/relaxation effect comes from the **spatial motion** (panning / moving
  sources) of the sound, not the beat frequency; relaxation improved at both
  6 Hz and 40 Hz spatial motion. Hence the two positional wobble sources here.
- Auditorily-induced illusory self-motion (vection) review (SIGCHI):
  spatialized sound enhances the self-motion illusion — the basis for making
  *orbiting* HRTF sources the primary lever.

## Honesty note (how this differs)

The lab already has an audio-only ego-dissolution piece — **`1752-dissolve`**
(Shepard / pitch-based) — and an HRTF NDE-void — **`1762-nde-void`** — but that
one is **screen-forward** (it welds sound to a marched WebGL void). This piece's
fresh lever is **HRTF-spatialized orbiting sources as the primary medium to
induce vection with the screen deliberately dark**. It is an audio-forward
spatial-*motion* piece: not another screen-forward visualizer, and not
pitch-based dissolution.

## Safety

- **No amplitude strobe/flicker anywhere.** The only rhythmic modulation is of
  source *position* (6/40 Hz), never brightness or gain. Horizon luminance
  changes are slow drift < 0.3 Hz.
- `prefersReducedMotion()` is honored — horizon tilt/rise/glow motion is damped.
- Master gain is modest (≤ 0.16) and the whole bus runs through a
  `DynamicsCompressor` before `destination`, so layered orbits cannot clip.
- The `AudioContext` is gesture-gated (the **Begin** button) and resumed there;
  everything fades out and the context closes cleanly on End / unmount. The mic
  stream is never routed to `destination` (no feedback), and its tracks are
  stopped on teardown.

## Determinism

Every rendered/position value is a pure function of an integer 60 fps frame
counter (and, when present, the smoothed mic breath). The wind-noise buffer is
filled from a `mulberry32` PRNG seeded with the constant `0x1798`. There is **no
`Math.random`, `Date.now`, or `new Date`** in any output-affecting code, and
`performance.now()` is not used at all — `ctx.currentTime` serves only as the
audio-scheduling clock. The self-driving tide therefore renders identically on a
headless box.

## Files

- `page.tsx` — the client component: lifecycle, gesture-gated audio, best-effort
  mic, the dim SVG horizon, teardown and fallbacks.
- `audio.ts` — the HRTF orbit engine: listener, panners, orbital trajectories,
  the 6/40 Hz positional wobble, the deterministic wind bed, and breath coupling.
- `README.md` — this file.

## Fallbacks

- No mic → autonomous deterministic tide + a self-driving notice.
- No `PannerNode` (essentially never) → a `StereoPannerNode` azimuth fallback,
  still audibly directional, with a notice.
