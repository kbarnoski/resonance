# 724 · Presence Drift

> **The one question:** What if the voices you leave hanging in 3D were each a slow
> READ-HEAD walking through Karel's real _Welcome Home_ recording — so the spatial
> chord you build never holds still, but continuously re-voices itself as each point
> drifts through a different moment of his performance, sounding genuinely different
> at minute five than at minute one?

## What it is

A long-form, stateful audio-visual instrument. You move your body to leave behind
**persistent singing voices** at fixed points in 3D space around your own ears
(one `AudioListener` at the origin, every voice an HRTF `PannerNode` with distance
attenuation and a reverb send that grows with distance).

The single change versus its parent (**710 · Presence Bloom**): a placed voice is
no longer a synth oscillator in a D-Dorian field. Instead **each voice owns its own
slow read-head** that walks through Karel's REAL recording, continuously playing
Hann-windowed grains (~100 ms, 50% overlap) from wherever its head currently sits —
concatenative grain synthesis. Every head drifts at a slightly different rate and
wraps at a different time, so the spatial chord never re-aligns: the harmony of the
room re-voices itself over minutes. It is alive and never a loop.

Voices accrete (cap ~24, oldest fades out gracefully). Overall body energy gently
steers global drift speed — still = heads crawl, moving = heads advance faster —
while the discrete reach → dwell (~0.65 s) → flick gesture remains the placement act.
Each voice is also an attractor in a GPU particle storm (tens of thousands of points;
a first-class Canvas2D field if WebGPU is absent), whose bloom warms in colour as its
read-head drifts through the performance.

## How to use

1. Open the page — the particle field animates immediately (idle preview).
2. Put on **headphones** (the sound is HRTF-spatial / binaural).
3. Press **Start**. Audio unlocks, Karel's recording loads, two seed voices appear.
4. Allow the camera if prompted. Then **reach** a hand out, **hold it still** for a
   beat, and **flick** outward — that leaves a persistent drifting voice at that point.
5. Keep placing voices to build a spatial chord. Stand still and listen: the chord
   slowly re-voices itself as each head walks through a different moment of his playing.

No camera / denied / no body for ~2.5 s → a synthetic **ghost body** keeps placing and
drifting voices hands-free, so it always sounds and moves with zero setup.

## Tags

- **INPUT:** webcam full-body pose (MediaPipe Tasks-Vision, CDN at runtime) → reach/dwell/flick gesture; body energy. Synthetic ghost-body fallback.
- **OUTPUT:** HRTF-spatialized concatenative grains of a real recording + WebGPU compute particle storm (Canvas2D fallback).
- **TECHNIQUE:** per-voice drifting read-heads · Hann-windowed grain scheduling · HRTF `PannerNode` around one `AudioListener` · distance attenuation + distance-growing convolution reverb · accreting voices with oldest-fades cap · energy-steered drift rate · WGSL compute particle advection.
- **PALETTE:** violet → amber over deep blue-black; read-head position warms each voice's bloom. Monospace accents.

## References

- **HRTF / binaural spatialization** — Web Audio `PannerNode` (`panningModel: "HRTF"`), one listener at the origin.
- **CataRT / corpus-based concatenative synthesis** — Diemo Schwarz: navigating and re-sounding a corpus of recorded grains by descriptor/position.
- **Refik Anadol** — GPU particle data-architecture as luminous, accreting form.

## Lineage & notes

- **Cycle-2 of `710-presence-bloom`** — identical body-sensing, spatial-voice, and particle architecture (copied + adapted); the one change is that voices play moving read-heads of the real recording instead of synth oscillators.
- Fused with the lab's concatenative-grain piano work — **`718-duet-paths`**, **`720-paths-grainfield`** (the recording loader, fallback synthesis, and Hann-grain approach are copied from 720's `audio.ts`).
- A **long-form / stateful** piece: state lives in each voice's read-head position and drift rate; the work is meaningfully different over minutes, by design.

### Degradation (first-class at every layer)

- **Visuals** animate instantly on mount (idle preview), before any audio unlock.
- **No camera / denied / pose model offline / no body ~2.5 s** → synthetic ghost body places and drifts voices hands-free.
- **No WebGPU / init throws** → complete Canvas2D particle field with the same accreting-attractor behaviour.
- **Recording can't be fetched (4 s abort, error, bad response)** → an offline-rendered soft piano buffer fills the corpus so heads always have real content to walk through, with an amber notice in the HUD.
- The prototype only **reads** the existing public `GET /api/audio/[id]` route — it creates no API route, so no guard is needed. Camera frames are analysed on-device only and never recorded or sent.
