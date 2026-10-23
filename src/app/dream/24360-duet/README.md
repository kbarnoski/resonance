# Duet

**Status**: demoable

## The one question
What if **two people in one camera frame** could conduct **one** of Karel's piano takes **together** — and their *togetherness* (gesture sync) is the reward?

This is the lab's first multi-person piece.

## What it is
One of Karel's real recordings (pick any from the catalog; default *Interplay*) plays off a single looping `AudioBufferSource`. That one take is split into **two voices** at a ~700 Hz crossover:

- a **warm low band** (`lowpass`, dusk-rose) — conducted by **person 1** (the left body on screen),
- a **bright high band** (`highpass`, amber-gold) — conducted by **person 2** (the right body).

Each voice has its own brightness tilt, gain, and `PannerNode`. Nothing synthetic is ever a musical voice — the two voices are literally two bands of *his* recording. The only generated sound is a shared convolution-reverb **swell** fed by his own audio, which is pure effect, not a voice.

## How togetherness becomes the reward
Each frame we compute a **coherence** signal between the two bodies:

- **Pearson correlation** of their hand-height histories over a ~1 s rolling window (are they rising and falling *in time*?),
- **arm-span match** (are their arms equally wide?),
- **hand-height match** (are their hands at the same level?).

Coherence rises fast and relaxes slowly, so sync feels **immediate and rewarding**. As it rises, three things happen at once:

1. **Spatial** — the two `PannerNode`s converge from hard L/R toward centre (listener at the origin, `equalpower`, rolloff disabled so convergence changes *position*, not loudness).
2. **Swell** — the shared reverb send opens (`coherence^1.3`), a warm unifying wash blooming over both voices.
3. **Light** — the two warm radial light-fields attract toward their midpoint and bloom into a single warm-gold **core**, with a soft **coherence halo** ring showing how unified they are.

Diverge, and the voices split back out L/R and the field separates into two.

## Embodied control (priority)
MediaPipe `PoseLandmarker` for **up to two people** (`createPoseTracker(2)`), via the shared `_shared/cameraTracking` loader. Designed for a **seated / waist-up laptop webcam**: we gate tracking only on **shoulders + wrists** (`POSE_LM`), **never** on hips or ankles. Per person we read horizontal centre (where their field lives), hand height (presence → gain), and arm span (brightness). The two detected poses are assigned to the rose/amber slots by mirrored screen-x so the left body always drives the low voice. Params smooth with `setTargetAtTime(…, 0.13)`; detection runs on `requestAnimationFrame`.

## The mandatory hands-free fallback (the verified path)
Person 2 is **always** an autonomous, **labelled** "ghost partner" that drifts on its own, so it is never mistaken for a live second person (it also carries a faint non-human breathing in the shader, and the status line names it). Person 1 is:

- the **live camera body** when one is present, else
- **pointer + arrow keys** (move / arrows raise-lower the hand and slide left-right), else
- an **autonomous drift** whose phase slowly sweeps *through* the ghost's — so even fully untouched, the two periodically sync (coherence swells, the core blooms) and part.

So a **solo** user still feels the convergence against the ghost, and with no input at all the piece plays and evolves on its own. The idle state drifts and breathes; there is no grain and no strobe.

## Tracking status line
Shown whenever the piece is running: `2 people · tracking` / `1 person + ghost partner` / `pointer + ghost partner` / `autonomous duet + ghost partner`, plus a live `togetherness NN%`. If the camera is on but no body is found, a `text-destructive` line reads *"tracking lost — sit back, shoulders in frame."*

## Visuals — raw WebGL2 fragment shader
A single full-screen fragment shader (no three.js, no Canvas2D in the primary path). Two warm Gaussian light-fields (dusk-rose `#e8a0b8`, amber-gold `#f0b060`) positioned by each person's horizontal gesture and sized by arm span; a merged warm-gold core and a coherence halo that strengthen with sync; audio RMS drives a gentle pulse; the warm-dark ground breathes so idle is alive. If WebGL2 is unavailable, a Canvas2D two-glow + core view takes over and the audio is unaffected.

## Safety / rules
Every audible path terminates in `createSafeMaster(ctx).input` — nothing touches `ctx.destination` directly. The camera path is control-only (no recording, no transmit). Clean teardown of AudioContext, rAF, camera stream, and the GL context on unmount.

## Reference
The reward model follows **interpersonal / movement synchrony** research — the finding that temporally coupled joint movement (moving *in phase*) increases felt affiliation and is intrinsically rewarding (e.g. Hove & Risen, *"It's all in the timing: Interpersonal synchrony increases affiliation,"* Social Cognition, 2009). Here the coherence signal is a hand-height cross-correlation, and the reward is made audible (spatial convergence + unifying reverb) and visible (two fields merging into one core).
