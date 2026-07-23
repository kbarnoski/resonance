# 2410-facesong — Face Song

**The question:** *What if your face were the instrument — open your mouth to
swell a vocal pad, raise your brows to bend pitch, smile to brighten the timbre,
purse your lips to round it, tilt your head to pan, and a glowing face-mesh
sings back what your expression is doing?*

This is the dream lab's **first real MediaPipe `FaceLandmarker`** integration
driven by the **52 blendshape coefficients** — the rich expressive channel the
lab had never touched — plus head pose read from the 478-point landmark
geometry.

## What it is

A face-driven **vocal instrument**. Your expression plays a formant "voice":

| Expression (blendshape) | What you hear |
| --- | --- |
| `jawOpen` | Gate + amplitude swell + lowpass opens; vowel morphs toward **"aah"** (open mouth = full pad, closed = quiet hum) |
| `mouthSmileLeft/Right` | Brighter timbre; vowel shifts toward **"ee"** |
| `mouthPucker` | Darker, rounder; vowel shifts toward **"oo"** |
| `browInnerUp` − `browDownLeft/Right` | Pitch bend ±7 semitones (snapped to A minor-pentatonic) + vibrato depth |
| Head **roll** (nose vs eye-line geometry) | Stereo pan |
| Head **yaw** | A small drone detune |
| `eyeBlinkLeft/Right` | A soft, debounced amplitude accent |

The glowing face-mesh mirrors your expression back in cool bioluminescent
phosphor (teal / indigo / white): in live mode it draws the true 478-point
landmark cloud with contour polylines (face oval, brows, eyes, nose, both lip
loops); in the auto-demo / fallback it draws a clean parametric face deformed by
the same control parameters.

## How it works

- **`face.ts`** — the control surface. Runtime-loads MediaPipe from a CDN via a
  `webpackIgnore` dynamic import (no npm dependency), raced against a 12 s
  timeout so a blocked CDN can't hang the UI. Builds a `{name → score}`
  blendshape lookup, computes head pose (roll/yaw) from the landmark geometry,
  and reduces everything to a `FaceParams` control vector consumed by both the
  synth and the renderer. Also holds the mesh contour index lists, the parametric
  face generator, the phosphor renderer, and a **seeded** (`mulberry32(0x2410)`)
  deterministic auto-demo driver.
- **`audio.ts`** — a **source–filter** vocal synth. A harmonically rich glottal
  source (two detuned sawtooths + a sub sine) is passed through **three parallel
  bandpass formant filters** whose centre frequencies sweep between measured /u/,
  /a/ and /i/ vowel targets, producing genuine vowel morphing. Output runs
  through a stereo panner, a master gain, and a brick-wall limiter. The
  `AudioContext` is created only inside the Start gesture (`webkitAudioContext`
  fallback included).
- **`page.tsx`** — the React client component. A single persistent
  `requestAnimationFrame` loop reads refs (so it never re-subscribes), smooths
  the parameters, draws the mesh, and drives the synth. Full teardown on stop /
  unmount: oscillators stop, `ctx.close()`, RAF cancelled, camera tracks stopped,
  landmarker closed.

## Degraded / review path

On mount, a seeded deterministic auto-demo animates a synthetic face — the mesh
breathes, the mouth opens and closes, brows drift, an occasional blink — so the
piece reads as live at a glance with **no camera**. Audio stays silent until the
user clicks **Start camera** (browsers forbid a gesture-less `AudioContext`). If
the camera is denied/absent or MediaPipe fails to load, the piece falls back to
**pointer + sliders** driving the identical synth, with a `text-destructive`
notice. No `Math.random` / `Date.now` anywhere in the visual loop — the auto-demo
is fully deterministic (seeded PRNG + frame counter).

## Privacy

Webcam frames are analysed entirely in-browser. Nothing is recorded, stored, or
transmitted.

## References

- MediaPipe **`FaceLandmarker`** and its 52 facial blendshapes — Google AI Edge
  (MediaPipe Solutions / Tasks-Vision).
- I. Grishchenko, et al., *"Blendshapes GHUM: Real-time Monocular Facial
  Blendshape Prediction"* — arXiv:2309.05782 (2023).
- Gunnar Fant, *Acoustic Theory of Speech Production* (1960) — the source–filter
  model and formant vowels this voice is built on.
- The vocoder / vowel-morphing lineage of expressive vocal synthesis
  (the "vocaloid" tradition of formant-driven singing timbres).

## Honest limitations

- Face tracking itself is not novel here; the fresh move is treating the 52
  blendshapes as a **continuous instrument** for a formant voice.
- Blendshape scores are noisy, so all parameters are EMA-smoothed — very fast
  expressions blur rather than snapping.
- The formant morph approximates three vowel poles rather than modelling a full
  vocal tract, and pitch is quantised to A minor-pentatonic to stay musical, so
  you cannot glide freely between notes.
- MediaPipe's GPU delegate and the CDN model download require a modern browser
  and network; the timeout + fallback keep the piece playable when either is
  missing.
