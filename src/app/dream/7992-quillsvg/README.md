# 7992-quillsvg — "Inscribe" (pure-SVG variant)

> What if the entire instrument were a single sheet of paper and a quill — you
> write a living, variable-width ink line, the **shape of your handwriting IS
> the music**, and the wet ink bleeds at its edges — all in inline SVG/DOM, with
> **nothing on the GPU**?

This is the deliberately GPU-free member of the **INSCRIBE** family. A
calligraphic stroke's *kinematics* drive a real Web-Audio synth in real time;
the stroke is rendered as an inline-SVG variable-width ink path whose edges bleed
through an SVG filter graph; completed strokes persist and **layer into a
canon**. Substrate is **pure SVG + CSS/DOM — no `<canvas>`, no WebGL, no
libraries** — so it is crisp at any zoom and phone-perfect everywhere.

## How it works

1. **Sample** — `Pointer Events` are sampled continuously (with
   `getCoalescedEvents` for sub-frame fidelity). Each sample carries
   `pointerType`, `pressure`, and `tiltX`.
2. **Derive** (`stroke.ts` → `Kinematizer`) — from consecutive samples we derive
   **speed**, **curvature** (signed turn rate), **acceleration**, and an ink
   **half-width**. Missing pressure (0-pressure mice) is *synthesized from
   speed*: a slower, more deliberate hand lays down fatter, wetter ink.
3. **Eventize** (`stroke.ts` → `Eventizer`) — kinematics become a stream of
   `SoundEvent`s. Following **Gesture2Music**, this kinematic-event stream is
   kept *separate* from playback: `audio.ts` only knows how to *play one event*.
4. **Render** — the ribbon is an SVG `<path>` offset from the centreline along a
   per-point **nib normal** (a fixed-direction offset — exactly what a broad-nib
   pen does), giving authentic thick↔thin modulation on top of the pressure
   term. A bright warm centreline is the "wet core". Edges feather via
   `feTurbulence → feDisplacementMap → feGaussianBlur`.
5. **Layer** — each completed stroke persists as its own SVG path *and* its
   recorded event stream loops through the synth, re-wetting its bleed on every
   cycle. New strokes stack into a canon of your own handwriting (capped at 6).

## Kinematics → sound + ink mapping

| Kinematic quantity | Sound parameter | Ink / visual parameter |
| --- | --- | --- |
| **Speed** (px/ms) | note **density** (∝ ink laid down) + master & per-note **filter cutoff** (fast = brighter) | thinner ribbon; drives wet-core motion |
| **Curvature** (signed turn rate) | **pitch selection** — straight run ⇒ held/repeated degree; sharp turn ⇒ melodic **leap** (up one way, down the other) | direction of the calligraphic swell |
| **Pressure** (`PointerEvent.pressure`, else speed-synthesized) | **amplitude** | **ink width** — *the beautiful coupling: press harder ⇒ fatter, wetter, louder line* + darker/more-saturated violet fill |
| **Acceleration** (Δspeed/ms) | **attack sharpness** — sharp accel ⇒ percussive onset | (fed into the event, felt as note bite) |
| **Tilt** (`tiltX`) | — | rotates the **nib angle** ⇒ asymmetric calligraphic width |
| **Pen-lifts / pointerup** | phrase boundary → the stroke closes and joins the canon | stroke persists; new layer begins |

Pitch is quantized to a warm **just-intonation major pentatonic**
(`[1, 9/8, 5/4, 3/2, 5/3]` tiled across octaves from C3), so the result is
musical, never noise. Everything routes through the shared code-generated void
reverb, so wet ink reads as wet sound.

## Deterministic self-demo

On load, with **no input**, a seeded **ghost quill** auto-writes a flowing
calligraphic line — drawing the variable-width bleeding ink and (once audio is
unlocked) playing the synth. It then becomes the first canon layer and loops, so
the concept reads on a **muted phone at 06:30** with zero interaction and zero
sound. All randomness is seeded with an inlined `mulberry32(0x7992)`; there is
**no `Math.random`, `Date.now`, or `new Date()`** anywhere. Timing uses
`performance.now()`; `AudioContext.currentTime` is used only for envelope
scheduling. Real audio starts on the first user gesture (autoplay policy) via a
clear **Enable sound** affordance — the ghost animates regardless.

## Why pure SVG is the right substrate here

- **Vector ink is calligraphy's native medium.** A quill line is a filled
  variable-width shape; an SVG `<path>` *is* that shape and stays crisp at any
  zoom — no resolution baked in, no re-raster on a retina/zoomed phone.
- **The wet-bleed is a first-class SVG primitive.** `feTurbulence` +
  `feDisplacementMap` + `feGaussianBlur` feather the ink edge into the paper and
  animate (freshly wet → settling) by mutating two filter attributes per frame —
  no shader, no framebuffer.
- **GPU-free reach.** No WebGL context, no device-loss handling, no thermal
  throttle; it runs on any browser and the cheapest phone. This is the point of
  the variant — the jury praised our one recent CSS/DOM piece as a distinctive
  look, and this leans all the way into that.

## References

- **Calliphony** — *a calligraphy-driven interface for real-time generative
  music.* arXiv:**2608.03040** (2026). The grounding concept: handwriting
  gesture as a live musical instrument.
- **Gesture2Music** — *event-based architecture separating the kinematic-event
  stream from audio playback.* arXiv:**2511.00793** (2026). The architecture we
  follow: `stroke.ts` emits `SoundEvent`s; `audio.ts` plays them; the same
  stream a live stroke emits is what a canon layer later loops.

## Files

- `stroke.ts` — kinematics (`Kinematizer`), event stream (`Eventizer`),
  variable-width ribbon + wet-core geometry, seeded ghost quill, `mulberry32`.
- `audio.ts` — the Web-Audio synth: warm just-intonation pentatonic voice,
  drone pad, shared void reverb; `play(event)` + `setBrightness()`.
- `ink.ts` — violet ink colour ramp, warm core colour, wetness/bleed curves.
- `page.tsx` — the sheet of paper: SVG scene, pointer handling, the single rAF
  loop (ghost writing + canon looping + bleed animation), chrome + design notes.

## Next-cycle deepening ideas

- **Ink pooling & dry-time per layer.** Model wetness as a per-layer clock that
  darkens/settles over real seconds, and let overlapping strokes bleed *into*
  each other where paths cross (SVG `mix-blend` or a shared displacement field).
- **Nib presets & real tilt calligraphy.** Expose broad-nib / pointed-nib /
  brush presets; use `tiltX/tiltY` magnitude (not just X) to skew the nib in 2-D
  for true copperplate thick/thin.
- **Canon as counterpoint, not just loops.** Quantize layer loop lengths to a
  shared bar and offset entries so the canon becomes a genuine round; add a
  gentle voice-stealing/duck so 6 layers stay legible in the mix.
- **Paper physics.** Absorbency parameter: fast strokes skip/feather (dry-brush),
  slow strokes bloom — coupling the `feDisplacement` seed to local speed.
- **Erase-by-gesture.** A scrubbing back-and-forth gesture lifts the nearest
  layer (reuse the kinematics to detect the scrub), giving a physical undo.
