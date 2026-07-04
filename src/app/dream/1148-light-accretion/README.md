# 1148 · Light Accretion

**Route:** `/dream/1148-light-accretion`

> What if a real recorded piano slowly accretes a long-form volumetric
> **cathedral of light** — a persistent 3D light-field with genuine ~75-second
> memory, so minute five looks nothing like minute one (never a loop) — while
> the viewer drifts down an NDE-style tunnel toward an ever-brightening core?

## What it is

An audio-visual meditation. Real audio drives deposits of light into a
persistent 3D density grid; the grid is raymarched on raw WebGL2 as a
volumetric field of molten-gold and pearl-white on deep-space near-black. The
camera drifts perpetually inward toward a bright core — the being of light.

Because the field has a slow decay rather than a reset, it is genuinely
**long-form**: the cathedral you see after five minutes is the accumulated
history of everything the music has done, faded on a 75-second half-life. It
never repeats.

## How to use it

1. Open the page. The light-field is **already accreting** on load, driven by a
   gentle deterministic procedural pulse (never blank, never silent-looking).
2. Press **Begin** to start audio. Three input tiers, in order of preference:
   - **A Path recording id** (prefilled with Karel's "Welcome Home" piano,
     `549fc519-f7fc-4c38-a771-adaad2edbc81`). Fetched from the existing
     read-only `GET /api/audio/<id>` route — handles both a JSON `{url}`
     response and raw audio bytes.
   - **Drop or choose your own audio file** — decoded locally.
   - **Synth fallback** — if no id/file (or a load fails), an offline-rendered
     gentle detuned-partial piano arpeggio plays so the piece is never silent.
     A small amber note flags when the fallback is active.
3. Playback runs through a synthesized convolution reverb tail → a compressor /
   limiter → the speakers. Per frame it derives RMS energy, spectral flux
   (onset strength) and spectral centroid (brightness), which drive deposits.

Audio start is gesture-gated (browsers block autoplay). Everything tears down
on unmount: RAF cancelled, GL resources deleted + context lost, AudioContext
closed.

## Architecture (three subsystems)

- **`audio.ts`** — three-tier loader (recording id / file / synth fallback) and
  the realtime analysis + playback engine (`AudioEngine`). Reverb → limiter →
  destination; `getFrame()` returns `{energy, flux, centroid}` each RAF.
- **`field.ts`** — `AccretionField`, a 48³ `Float32Array` density grid = the
  memory. `deposit()` adds a soft 3D gaussian blob whose height tracks spectral
  centroid and whose angle spirals around a central helix; `decay()` multiplies
  the whole grid by `exp(-dt·ln2 / 75)` (75-second half-life); `quantize()`
  emits an auto-exposed R8 `Uint8Array` for texture upload.
- **`gl.ts`** — `AccretionRenderer`, a raw WebGL2 volumetric raymarcher. Uploads
  the grid as a `sampler3D` (R8) each frame via `texSubImage3D` and marches a
  full-screen fragment shader front-to-back with emission/absorption, a
  molten-gold→pearl density ramp, a core glow, distance fog, and a slow inward
  camera drift. `AccretionFallback2D` provides an additive rotating projection
  when WebGL2 is missing.
- **`page.tsx`** — the `"use client"` component: hero, loader UI, the animation
  loop, reduced-motion handling, and teardown.

## Design thinking

The core bet is that **memory** is what turns a reactive visualizer into a
long-form artwork. Most audio-reactive pieces are Markovian — the current frame
depends only on the current sound. Here, every onset leaves a slowly-fading
mark, so the image is an integral of the whole performance. The helical
deposit angle means successive notes stack into a twisting column (the
cathedral nave); brightness climbs with register; louder/percussive onsets
bloom bigger and whiter. The perpetual inward camera drift reframes the whole
thing as passage — you are not watching the light, you are moving into it.

The palette is a deliberate commitment to warmth — molten gold `#ffb347` into
pearl `#fff4d6` on a `#04060a` near-black — chosen to break a run of cool /
electric pieces in the lab.

## Named references

- **Refik Anadol** — data as luminous pigment; the "data nebula" of a
  volumetric, self-illuminating point/field cloud.
- **Near-death-experience phenomenology** — the "tunnel toward a being of
  light," as documented by **Raymond Moody** (*Life After Life*), **Bruce
  Greyson**, and **Pim van Lommel**. The inward drift and brightening axial
  core are drawn directly from that literature (as aesthetic phenomenology,
  not a claim).

## Ambition-floor criteria hit

- **Audio-visual:** produces sound (real piano / file / synth) and visuals.
- **≥3 subsystems:** audio, field (memory), renderer — plus the page.
- **Genuine long-form state:** 75-second half-life decay; the field is an
  accumulating integral, not a loop.
- **Raw WebGL2 volumetric raymarch** over a `sampler3D` R8 3D texture.
- **Three input tiers**, never blank/silent, graceful degradation everywhere.
- **Deterministic:** mulberry32 seeded PRNG only — no `Math.random`,
  `Date.now`, or `new Date()` in the build.

## Safety notes

Cosmic-ambient by design. Luminance changes are slow drifts (camera easing,
gentle tone-mapped emission) — **no flicker, no strobe**. `prefers-reduced-
motion` further slows the camera drift and rotation. Read-only of the audio
API; no mic, no `getUserMedia`, no new API route, no recording.
