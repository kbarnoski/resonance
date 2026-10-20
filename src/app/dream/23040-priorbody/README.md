# PRIOR BODY

**Status**: demoable

A closed-loop spatial-hearing lab. One of Karel's real piano recordings is hidden
at a direction on a sphere that slowly drifts around you; you point your body (or
the pointer) toward where you *hear* it, and commit a guess. The piece measures its
angular prediction error, splits it into **lateral** (left/right), **polar**
(up/down) and **hemifield** (front/back) components, and takes a variational-free-
energy gradient step on three persistent precisions. As those precisions climb
across trials, the *same* recording sharpens from an omnidirectional smear into a
pinpoint HRTF source, and the raymarched volumetric belief-field collapses from a
diffuse ice-blue cloud into a tight beam — your ear and the light sharpen together.
The body is the action, the visual feedback is the observation, and the three
precisions descend free energy live.

**Status:** Demoable. The pointer-only path gives the complete audible + visible
loop (aim → commit → prediction-error flare → precision climb → re-seed) and was
the path built against, since a webcam cannot be verified in a headless cloud. The
body-pose path is wired and lint/type-clean but **camera path untested — needs a
30-second webcam check** (see below).

## Mechanic

- **Audio — one real take, never synthesis.** `loadRealTrackBuffer` decodes one of
  Karel's recordings (default track `eba95845…` "Bath", or pick another from the
  collections). A single looping `BufferSource` fans into three sends:
  - a **direct** HRTF `PannerNode` placed at the hidden true direction (localizable);
  - a **diffuse** decorrelated send — dual pre-delays (13 ms / 27 ms) into a
    `ChannelMerger` — that is non-localized and smeared;
  - a **flare** HRTF copy at the true direction that swells on each commit by the
    prediction-error magnitude.
  Combined precision crossfades diffuse → direct (and tightens the panner cone), so
  low precision = omnidirectional smear, high precision = pinpoint. Every path
  terminates at `createSafeMaster(...).input`; visuals are driven from
  `safeMaster.analyser`. No oscillators, no noise, never `ctx.destination`.
- **Action — the body.** MediaPipe `PoseLandmarker` (via the shared runtime-CDN
  helper). Each frame reads `landmarks[0]`, gating only on shoulders (11/12) and the
  reaching wrist (15/16) — never hips/ankles. Azimuth comes from the reaching-wrist
  horizontal offset plus shoulder-line yaw (shoulder-depth asymmetry); elevation
  from the wrist height above the shoulder line. Mirrored-x, smoothed at ~0.12 s. A
  sustained point (~0.6 s held) auto-commits.
- **The loop / VFE.** On commit, the angular error is split into lateral / polar /
  hemifield. Each precision takes a gradient step toward 1 when its error is small;
  polar — lowest at the start, as in the paper's listeners — is given the largest
  learning rate so it gains the most. The true direction is revealed (warm marker),
  then the source re-drifts to a new hidden direction for the next trial.
- **See == hear, exactly.** The one combined `sharpness` value each frame drives
  *both* the audio diffuse→direct crossfade and the visual beam width. The one
  prediction-error magnitude at commit drives *both* the audible swell at the true
  direction and the warm visible burst there. Every visible change has an audible
  consequence and vice-versa.
- **Render — raw WebGL2.** A fragment-shader raymarch of a volumetric density: a
  belief lobe/beam along the pointing direction (width = inverse precision), a faint
  clinical az/el shell grid, and a warm prediction-error marker/burst at the true
  direction. No three.js, no Canvas2D. Cool clinical palette (slate / ice-blue /
  white) with a single warm accent reserved strictly for prediction error.
- **Perceptual learning.** Precision is persistent session state and is shown as
  growing lateral / polar / front-back bars plus a trial counter, so minute five is
  calmer and sharper than minute one.

## Graceful degradation

- **No camera / permission denied / model-load failure** → a pointer + keyboard
  fallback that drives the **identical** action: drag to aim the beam, click or
  press Enter to commit, arrow keys nudge azimuth/elevation. A mono status line
  shows `body · tracking · live` vs a `text-destructive` lost state with an
  actionable hint ("face the camera, shoulders in frame"). There is no autonomous
  demo that could be mistaken for live tracking.
- **WebGL2 unavailable** → a designed notice; the spatial-hearing audio loop still
  runs.
- **Audio load throws** → a designed `text-destructive` notice and no loop. There is
  **no synth fallback** — if Karel's recording cannot load, nothing is faked.
- **Full teardown on unmount:** the `BufferSource` is stopped, every node and the
  safe-master are disconnected, `ctx.close()` is called, camera tracks are stopped,
  `pose.close()` runs, the rAF is cancelled, and GL program/buffer/VAO are deleted.

## Camera path untested — needs a 30-second webcam check

The pose path compiles, lints and type-checks, and mirrors the proven shared
helpers, but it has not been exercised against a live webcam in this environment.
A quick check: allow the camera, sit ~60–150 cm back with both shoulders in frame,
raise one arm and point left/right/up; confirm the belief beam follows your arm,
that holding a point ~0.6 s auto-commits, and that the status line reads
`body · tracking · live`. Tune the azimuth/elevation gains in `poseToAim` if the
mapping feels under- or over-scaled.

## References

- Barumerli, Meyer-Kahlen & Picinali, *"Framing Spatial Hearing within the Free
  Energy Principle: A Hierarchical Model of Perceptual Learning"* — arXiv:2610.23196
  (16 Oct 2026). Their model tracks lateral precision, polar precision and hemifield
  disambiguation by gradient descent on variational free energy, and names the
  closed action-perception loop (body as action, feedback as observation) as future
  work. This prototype builds that loop.
- Karl Friston, the **free-energy principle** (foundational) — perception and action
  as the joint minimization of variational free energy.
