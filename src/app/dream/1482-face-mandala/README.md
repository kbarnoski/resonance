# 1482 — Face Mandala

**The one question:** *What if your own face conducted a living psychedelic mandala — your mouth, brows, and gaze bending an ecstatic kaleidoscopic bloom in real 3D?*

Route: `/dream/1482-face-mandala`

## Concept

A nested, counter-rotating kaleidoscopic **mandala** rendered as a genuine
three.js **scene-graph** — five tiers of `InstancedMesh` diamond petals with
N-fold rotational symmetry, glowing additively over a violet void with a
pulsing gold core — **not** a full-screen fragment shader. Your own face
conducts it live.

The front camera feeds **MediaPipe FaceLandmarker v2**, which returns 52
ARKit-style *blendshape* coefficients plus a head-pose matrix every frame,
entirely in the browser. Those coefficients bend both the geometry and an
affect-coupled synth:

| Expression | Mandala | Sound |
| --- | --- | --- |
| `jawOpen` | blooms outward — petal-ring scale + fold count open up | opens the drone lowpass, swells its level |
| `mouthSmile L/R` | warm gold saturation + brighter glow | raises the upper partials (warmth) |
| `browInnerUp` | adds an upper petal tier + brightness | lifts an upper harmonic partial |
| `browDown L/R` (frown) | contracts + darkens | pulls the tone down / darker |
| `eyeBlink L/R` | soft throttled pulse | a bell strike |
| `mouthPucker` | tightens the kaleidoscope — fewer, sharper petals | narrows the filter toward the fundamental |
| head yaw / pitch / roll | rotates + tilts the whole mandala in 3D | — |

When the face is neutral or absent, a slow autonomous **breathing** keeps the
mandala alive and singing.

## Graceful fallback (required, and what renders at review)

Every part of the pipeline — `getUserMedia`, the CDN ESM import, landmarker
creation, per-frame detect, and the AudioContext — is wrapped in `try/catch`.
If the camera is denied, the CDN is blocked, or WebGL is unavailable, the app
shows a `text-rose-300` notice ("Camera / face tracking unavailable — running
self-demo") and runs a **synthetic self-demo**: the same blendshape values are
generated from slow sine LFOs, so the mandala always blooms and the synth
always plays. MediaPipe is loaded from a CDN via a non-static dynamic
`import(/* webpackIgnore: true */ …)` and is **not** an npm dependency.

## Named references

- **MediaPipe FaceLandmarker v2** (Google, 2024–2025) — browser-native face
  blendshapes (52 coefficients) + `facialTransformationMatrixes` head pose.
- **Klüver's four form constants** + the **Bressloff–Cowan** cortical
  (log-polar / retino-cortical) map — the account of *why* psychedelic geometry
  is fundamentally radial and rotationally symmetric; the mandala's N-fold
  petal rings are that symmetry made an instrument.
- **Psilocybin affect-coupling** — imagery shifts with emotional state
  (Carhart-Harris **entropic brain** / **REBUS**); here delivered literally by
  coupling live facial affect to the form.

## Ambition criteria hit

- **#1 — a technique never used in this lab:** MediaPipe FaceLandmarker /
  face-blendshape input driving a three.js instanced mandala.
- **#2 — integrates ≥3 subsystems:** front camera + ML face-landmark inference
  (MediaPipe) + three.js `InstancedMesh` scene-graph + affect-coupled Web Audio
  synthesis.
- **#5 — implements a research finding from the last 14 days:** browser-native
  MediaPipe FaceLandmarker blendshapes as an affect input (2026-07-08).

## Safety

- **Audio:** master gain ramps `0 → 0.2` into a `DynamicsCompressor`; bell
  voices are pooled and capped (≤12, plus 6 drone oscillators, under the 14
  ceiling), stolen oldest-first; click-free attack/decay envelopes. On unmount
  every oscillator stops, the AudioContext closes, `cancelAnimationFrame`
  fires, all three.js geometries/materials/renderer are `dispose()`d, and all
  media tracks stop.
- **Flicker:** no strobe. The only luminance modulation is a soft, opt-in
  `SafeFlicker` breathing drift clamped to ≤3 Hz, and `prefersReducedMotion`
  disables it and gentles every swing.

## Files

- `page.tsx` — client component: camera + MediaPipe wiring, self-demo fallback,
  the animation/audio loop, UI, and design-notes panel.
- `face.ts` — runtime CDN loader for FaceLandmarker, blendshape/pose extraction,
  and the synthetic self-demo drive.
- `mandala.ts` — the three.js instanced-petal mandala scene-graph.
- `audio.ts` — the affect-coupled drone + bell synth.
- `readme.ts` — the in-page notes string.
