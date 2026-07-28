# 3448 — aura

**What if your silhouette became a glowing resonant aura, and the SHAPE of you — not your motion, not your pitch — made the sound?**

A meditative mirror. A camera silhouette is reduced to a handful of _shape
descriptors_, and those descriptors steer a soft evolving drone and a
golden-spiral bloom. Stand tall and gathered and the tone darkens and settles;
open out and reach up and it brightens and lifts. There is no score, no win, no
fail — only the shape you make, hummed back to you.

## How it works

### Silhouette (dependency-free, all in-browser)

The camera is drawn into a hidden, downscaled `128×96` 2D buffer
(`getContext('2d', { willReadFrequently: true })`) and reduced to a binary
silhouette by **background subtraction**: a slow per-pixel luminance model that
adapts fast on pixels it believes are background and slowly under the figure, so
a still silhouette persists instead of dissolving. The **raw video is never
displayed, uploaded, or stored** — only the derived shape leaves the pixel
buffer. This is privacy-forward by construction.

### Shape descriptors

A single pass over the binary mask yields:

- **area** — fraction of the frame filled.
- **boundary complexity** — `perimeter² / area`, normalized. A filled disc sits
  near `4π`; a ragged, spread, reaching shape climbs well above it.
- **reach** — top extent + centroid height: how much you climb upward.
- **centroid** and **aspect** — for placing and colouring the aura.

### Shape → sound (cross-modal)

Nothing maps a descriptor to _its own_ modality — the shape of you is heard, not
your motion or pitch:

- **area → level + number of voices.** A fuller body lights more harmonic voices
  and raises the overall level, floored so the drone is _never fully silent_.
- **boundary complexity → filter brightness.** Ragged/reaching opens a low-pass
  filter (~4.6 kHz); compact/still closes it toward ~320 Hz.
- **reach → the fundamental region.** Reaching up glides the fundamental
  (70–185 Hz) **continuously — never snapped to a scale or chord**. The voices
  are integer harmonics of that one gliding fundamental (timbre, not melody), so
  the pitch stays free to bend anywhere.

Built on the Web Audio API: six harmonic oscillator voices → a low-pass filter →
master gain → a soft compressor. A ~0.07 Hz detune LFO adds gentle chorus.

### The aura (raw WebGL2)

The silhouette is uploaded as a small **R8 mask texture** to a raw WebGL2
fragment shader (`#version 300 es`, no three.js). A multi-ring blur of the mask
becomes a spreading halo; a **golden-angle spiral** modulates radiant filaments
around the centroid; everything is coloured on the shared Resonance **violet
ramp** (`_shared/palette`'s `dreamPalette`). A slow luminance drift breathes the
field at **≤ 0.11 Hz — no strobe**.

### Self-demo (works with no camera)

With no camera permission the piece runs anyway on a **seeded synthetic figure**:
a slowly breathing standing figure whose arms rise and fall, rasterized directly
into the mask and driven by `mulberry32(0x3448)` + `performance.now()` (never
`Math.random` / `Date.now`). It sweeps the full descriptor → sound → shader
chain, so a reviewer with no webcam still sees the aura breathe and hears the
drone evolve. When the camera is granted, the source switches to your real
silhouette; deny it and the synthetic figure stands in with a calm notice.

### Graceful degradation & reduced motion

Camera denied → synthetic mode + a `text-destructive` notice. WebGL2 missing →
a clear notice, no crash. Web Audio missing → the aura plays silently with a
notice. Under `prefers-reduced-motion` the luminance drift and the figure's
breathing both still. On unmount: camera tracks stopped, `requestAnimationFrame`
cancelled, oscillators stopped, `AudioContext` closed, and the WebGL context
released.

## Named references

- **Myron Krueger, _Videoplace_ (1974)** — the silhouette as instrument; your
  body's outline as the interface.
- **Daniel Rozin's mirror works** — you as your own reflection, the material
  rearranged into your image.
- **"Fluid Body: An Adaptive Embodied Sonification System" (CHI / Springer
  2026)** — "the sound steers you" as much as you steer it.

## What I'd deepen next

- **Better segmentation:** the EMA background model is honest but simple. A light
  morphological open/close, or an optional in-browser person-segmentation model,
  would sharpen the silhouette in busy rooms.
- **Richer shape vocabulary:** curvature histograms, symmetry, and number of
  "limbs" (connected boundary lobes) could add independent timbral axes beyond
  the current three.
- **Spatialization:** pan/voice placement from the centroid, so where you stand
  in the frame moves the aura through a stereo field.
- **Two auras:** two silhouettes sharing one drone — the space _between_ shapes
  as a fourth descriptor.

## Files

- `page.tsx` — client chrome, the RAF loop, source switching, teardown.
- `silhouette.ts` — mask sources (camera background-subtraction + seeded
  synthetic figure) and shared descriptor extraction.
- `audio.ts` — the cross-modal Web Audio drone.
- `aura-gl.ts` — the raw WebGL2 golden-spiral bloom renderer.
