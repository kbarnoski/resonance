# 1103 · Strange Face

**The one question:** What if staring into your own reflection dissolved your face — the Caputo *strange-face-in-the-mirror* illusion, induced on purpose in the browser?

A dark mirror. Your webcam feed rendered through a WebGL2 kaleidoscope with decaying optical feedback. The longer you hold **still**, the more the reflection loses its edges, folds into itself and drifts into a stranger. Any real motion snaps it back to clarity. It is meant to feel quiet, uncanny and a little unsettling — derealization, not a filter.

## The technique — stillness → dissolution

One scalar, `dissolve` (0 = clear, 1 = gone), is raised the longer your facial **motion** stays low and snapped back fast on any real movement. As it climbs, the mirror does three things at once:

1. **Troxler fading** — the periphery is progressively blurred and desaturated while the centre stays sharp, reproducing the way a steadily-fixated visual field fades at its edges (Troxler, 1804).
2. **Radial mirror folding** — the image folds into N-fold kaleidoscopic symmetry (1 → 6-fold), so the face tiles into itself.
3. **Optical feedback** — a ping-pong feedback buffer, slowly zooming, warping and hue-drifting, smears each frame into the next so the "someone else" congeals out of your own reflection.

A soft inharmonic **shiver** fires when the *strange-face threshold* is crossed. The pipeline is energy-preserving (feedback weights sum to 1), so mean screen brightness stays roughly constant — **no strobe** — and reduced-motion damps the spin and warp.

- `page.tsx` — UI, the stillness→dissolve integrator, and the frame loop.
- `face.ts` — MediaPipe **FaceLandmarker** (CDN, runtime import) measuring facial motion + the **autonomous pseudo-face** fallback (a procedurally drawn, slowly-morphing face that undergoes the same dissolution).
- `scene.ts` — the WebGL2 kaleidoscope + ping-pong feedback + Troxler vignette.
- `audio.ts` — a drone whose partials **thin and detune** and a low slow **beat** that deepens as the face dissolves, plus the threshold chime, through a `DynamicsCompressor` limiter. Reuses the shared `_shared/psych/droneBank` bed.

## Named references

- Giovanni B. Caputo, "Strange-Face-in-the-Mirror Illusion," *Perception* 39 (2010): 1007–1008.
- Giovanni B. Caputo et al. (2023) on strange-face illusions and their relation to derealization, depersonalization and dissociation.
- I. P. V. Troxler (1804), on the fading of a fixated peripheral stimulus — *Troxler fading*.

## How to use it

1. **Dim your room** and put on headphones.
2. Tap **Enable camera · begin** and allow the webcam.
3. Sit close, gaze softly at the centre of your reflection and **hold still**. Over roughly a minute the face at the edges fades, folds and drifts — watch it become a stranger.
4. **Move** to snap back to a clear reflection.

## Honest scope / what is unverified

- Face/pose tracking already exists elsewhere in this lab — this does **not** claim any "first face-tracking." The genuinely new element is the **Caputo strange-face / Troxler dissolution mechanism** (stillness-driven edge-fade + radial folding + optical feedback), not the tracking.
- The build box has **no camera and no GPU**, so the live-camera + FaceLandmarker path is **code-verified only** (type-checked and lint-clean, mirroring the proven loader in `1068-entity-lattice/pose.ts`); it has not been exercised against a real webcam or the CDN model. If the camera is denied, unavailable, or the model fails to load, the autonomous pseudo-face path runs the identical dissolution so the piece is never blank or silent. If WebGL2 is unavailable, a notice is shown.
