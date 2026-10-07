# 19520 · Graft

**Status**: wip — the audio graft is verifiable headless; the live camera path needs a ~30-second webcam check (no camera in the cloud).

## The one question
What if two of Karel's recordings became one living voice — one take lending its **shape** (its chords, its dynamics, its phrasing) and the other lending its **body** (the piano you actually hear) — and your own body decided whose voice it is and how deeply the two are grafted together?

## What it is
A **two-source channel vocoder** (cross-synthesis) of two real recordings — *Bath* (Welcome Home) and *Ghost* (Snowflake). Both loop continuously. In each direction:

- The **carrier** take is split into 12 log-spaced bandpass bands (~110 Hz … 6 kHz).
- The **modulator** take is split into the same 12 bands; each band is rectified (a `WaveShaperNode` abs curve) and lowpassed (~14 Hz) into an **amplitude envelope**.
- Each modulator envelope is wired straight into the matching carrier band's `GainNode.gain` AudioParam. So the carrier piano only sounds where the modulator piano has energy — one recording plays *through* the other.

Both directions are built at once (A-through-B and B-through-A). Your body crossfades between them. The modulator is **pure control**: its only connections terminate at AudioParams, so it has zero path to the speakers — you never hear the modulator, only the carrier wearing its shape. The whole mix (dry carriers + both vocoded directions) terminates in the shared `createSafeMaster` bus.

This is the lab's first vocoder of **one real take by another real take**. `532-vocoder-veil` built the first channel vocoder, but it vocoded a recording with the live **microphone**; Graft replaces the mic with a second piece of Karel's music, which is also what breaks the single-take-source monoculture (two recordings live at once).

## How your body conducts it
Full-body pose (MediaPipe `PoseLandmarker`, via the shared `_shared/cameraTracking` loader). We read **only the two shoulders and the nose** — exactly what a seated, waist-up desk webcam sees — and never gate on hips, knees, or ankles.

- **Lean left ↔ right** (mirrored shoulder/nose centre-x) → **role**: whose voice you hear. Right → *Bath* played through *Ghost*'s shape; left → *Ghost* played through *Bath*'s shape. Equal-power crossfade.
- **Lean toward / away from the camera** (shoulder width as a depth proxy) → **graft depth**: dry recording ↔ fully vocoded.
- **Sit tall ↔ low** (torso height) → **spectral tilt**: warm ↔ bright (a high-shelf on the wet bus).

All three ease with `setTargetAtTime(…, 0.12)` so motion reads without jitter.

## The picture
A **raw WebGL2** GPU point field — 160,000 points advected by a flow field computed in the vertex shader, with persistence trails via an offscreen RGBA8 accumulation buffer (a translucent fade quad each frame). Twelve bands each drive a cohort of points. The **heartwood** palette: an umber ground, copper→gold for the carrier's own timbre, moss-green where the modulator's identity bleeds in. Role tints the whole field between the two takes' identities; graft blooms the fusion; tilt warms or brightens it. This deliberately rests the jury-banned three.js render path. If WebGL2 is unavailable, a Canvas2D 12-band spectral view takes over and the audio is unaffected.

## Degrades gracefully
- No camera / permission denied / model-load failure → pointer control (x = role, y = graft) and, failing that, an autonomous demo that drifts role/graft/tilt through the identical chain, so the piece is alive on load with no hardware.
- Tracking state is always shown: `tracking · live` / `tracking · lost` (red, with a hint) / `pointer` / `demo · autonomous`.
- Reduced-motion: heavier trail fade so the field is calmer.

## Ambition & gates
- **ambition floor: A + B + C.** (A) first vocoder of one real take by *another* real take, and the first self-contained raw-WebGL2 GPU point field driven by the vocoder bands; (B) ≥3 subsystems = 4 (two-take loader/decoder + 12-band two-direction vocoder DSP + full-body pose tracking + WebGL2 point-field renderer); (C) named references below.
- **diversity:** input = full-body pose · output = raw-WebGL2 GPU points · technique = two-take channel vocoder cross-synthesis · palette = heartwood (umber/copper/moss/gold) · source = TWO takes. Dodges the 2026-10-06 bans (two-hand · three.js · granular grain-scheduler · cool cyan/teal/violet-clinical · single-take source).
- **ABSOLUTE rule 10:** every audible node is one of two decoded real takes routed through `createSafeMaster`; zero oscillators/synth/noise; the camera and the modulator take are both control-only (no path to the speakers).

## Research anchor
- **Mix2Morph** — Chu, Flores García, Nieto, Salamon, Pardo, Seetharaman, *"Learning Sound Morphing from Noisy Mixes"* (arXiv:2601.20426, ICASSP 2026). It frames **sound infusion**: a dominant primary carries temporal/structural behaviour while a secondary is infused throughout to enrich timbre. Graft does exactly that with a classic channel vocoder and, under rule 10, with Karel's real recordings on both sides instead of a generative model.
- **Dudley's channel vocoder** (Bell Labs) — the technique itself.
- Recent-practice anchor for the render: the Oct-2026 WebGL2 GPU point-field-from-audio-spectra work circulating now.

## Not yet verified
The novel DSP core is verifiable by reading the graph (modulator → bandpass → rectify → lowpass → carrier-band gain; modulator never reaches `destination`). What a headless cloud can't check: whether live pose gating feels immediate while leaning, whether the shoulder-width depth proxy lands for a real seated body, and whether the dry↔vocoded balance + wet makeup sit nicely on headphones. ~30-second webcam + headphones check from Karel will confirm or produce a one-number tuning pass.
