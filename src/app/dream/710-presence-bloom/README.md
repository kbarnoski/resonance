# Presence Bloom

**Route:** `/dream/710-presence-bloom`

## The one question

> What if moving your body let you **leave behind persistent singing voices in 3D** — and those voices were rendered as a GPU particle storm of tens of thousands of points that accrete into a luminous resonant architecture around your own ears over minutes?

## What it is

An installation-scale spatial-presence instrument. **Spatialization is the
instrument.** A single `AudioListener` sits at the origin — your ears. Each
deliberate wrist gesture (reach, dwell ~0.65s, then an outward flick) leaves a
**persistent** voice fixed at that point in 3D, sung through an HRTF `PannerNode`
with distance attenuation and a reverb send that **grows with distance**: far
voices are quieter and wetter, near voices present and dry.

Voices **accrete** — they keep singing (cap ~24, oldest fades when exceeded) —
each drawing its pitch from a slowly drifting **D-Dorian** modal field
(Dm9 → Gmaj9 → Em11 → Dadd9 region, homeward gravity on D and A). The set
becomes an evolving spatial chord; the chord drifts over minutes, so the field
is genuinely different at minute five than at minute one. Harmony is the
material, not the subject — the point is building **spatial architecture**.

Every voice is an **attractor** in a particle storm of tens of thousands of GPU
points (WebGPU compute, WGSL): particles drift on an ambient field and gather /
orbit / bloom around each voice, brighter and larger for nearer voices. Body
movement energy swells overall brightness and level; stillness eases the storm
into a slow bloom while the voices keep singing. If WebGPU is absent or init
throws, it silently falls through to a **first-class Canvas2D particle field**
(a few thousand particles with the same accreting-attractor behaviour, additive
trails, glowing haloes) — this is the expected path on most devices.

## How to use

1. Press **Start** (unlocks audio inside the gesture). Headphones strongly
   recommended — the sound is HRTF-spatial.
2. **Reach** a wrist out, **dwell** briefly, then **flick** outward to leave a
   voice at that point. It keeps singing.
3. Keep placing voices around you to build the spatial chord and thicken the
   storm. Move more for a brighter field; be still and it blooms slowly.
4. No camera / GPU / network needed: visuals animate the instant the page
   mounts, and a synthetic **ghost body** drifts and places voices hands-free if
   MediaPipe fails to load, the camera is denied, or no body is seen for ~2.5s.
   Real input takes over seamlessly.

## Tags

- **INPUT:** webcam full-body pose (MediaPipe Tasks-Vision `PoseLandmarker`,
  loaded from CDN at runtime; synthetic ghost-body fallback).
- **OUTPUT:** WebGPU compute particle field (WGSL), with a first-class Canvas2D
  particle fallback.
- **CORE TECHNIQUE:** HRTF spatialization-as-instrument with **persistent,
  accreting** voices + distance attenuation and reverb-grows-with-distance.
- **VIBE:** luminous architectural **awe**, Anadol-scale — explicitly **not**
  hushed / tender / sleepy.

## Audio safety

Per-voice `GainNode` → HRTF `PannerNode` → (dry + reverb send via shared
`ConvolverNode`) → master `GainNode` (≤ 0.32, scaled down as voice count grows)
→ `DynamicsCompressor` → destination. Soft attacks; ~0.7s master fade-in on
start. The `AudioContext` is created/resumed inside the Start gesture (iOS).

## References

- **Refik Anadol** — GPU particle data-architecture, *Latent City* /
  *Machine Hallucinations* (the particle-storm awe).
- **arXiv:2505.18020** — "Effects of auditory distance cues and reverberation on
  spatial perception" (distance + reverb as the spatial signal).
- **arXiv:2407.13083** — "Modeling and Driving Human Body Soundfields through
  Acoustic Primitives" (body movement shaping spatial sound distribution).
