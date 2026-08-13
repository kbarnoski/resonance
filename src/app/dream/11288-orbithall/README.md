# 11288 · orbit•hall

**See your own binaural spatialisation in 3-D.** Move your listener-body through a
3-D hall of voices, watched by a slowly orbiting third-person camera, while a live
tether to each source shows — at a glance — how *dry-and-near* vs *wet-and-far*
each voice currently sounds.

This is the 3-D, third-person deepening of `10808-orbitroom` (a flat top-down
binaural map). Instead of a Canvas2D floor plan, you orbit a real three.js room and
read each source's **Direct-to-Reverberant Ratio (DRR)** straight off its tether.

## The one question

> What if you could SEE your own binaural spatialisation in 3-D — watch your
> listener-body move through a room of voices while a live tether to each source
> shows how dry-and-near vs wet-and-far it currently sounds?

## What you see / hear

- A dark aqueous hall: teal floor grid + faint wireframe bounding walls.
- A bright pale-cyan **listener avatar** with a forward-facing tick (the ears).
- Five ambient voices placed at **varied distances** around the room.
- A **tether** from the avatar to every source, encoding that source's DRR:
  - **Near / high DRR / dry** → thin, bright, taut cyan line; small source, no haze.
  - **Far / low DRR / wet** → thick, dim, washed-out steel line; a soft
    reverberant **haze** swells around the far source.
- On headphones: genuine binaural — each voice's direct sound is HRTF-panned to its
  3-D position and the whole field swings as your body moves.

## How to use

1. Press **Begin** to start audio (must happen inside a user gesture). Until then
   the hall is muted but already animating — a seeded virtual walker orbits the
   avatar so a muted phone sees the room + tethers within ~1 s.
2. Put on **headphones** for the binaural effect.
3. Press **Enable camera** to hand control to your body: your silhouette's
   horizontal position moves the avatar left/right (mirrored), and stepping toward
   the camera moves it deeper into the room. Watch near tethers go thin-and-bright
   and far ones go thick-and-hazy as you move.
4. If the camera is denied/unavailable, the virtual walker keeps orbiting and an
   on-brand note is shown.

## The technique

### DRR — the distance cue (the scientific spine)

Distance perception in a room is governed by the **Direct-to-Reverberant Ratio**:
the level of the direct sound relative to the reverberant tail. Near source = high
DRR (loud direct, little reverb, bright); far source = low DRR (quiet direct, lots
of reverb, dark). See the survey **arXiv:2503.12948**. Each frame, for source→
listener distance `d`, we set (all glided with `setTargetAtTime`, ~50 ms):

- **dry gain** `∝ 1/(1 + 0.55·d)` — falls with distance,
- **wet-send** rises and saturates with `d`,
- a per-source **lowpass cutoff** falls with `d` (far = darker).

The realised DRR (in dB) is normalised to `0..1` and shared by the audio and the
visuals, so each tether draws exactly the ratio the ears are getting.

### FDN room (deliberately not a convolver)

The wet path feeds a shared **feedback-delay-network** reverberator: a ring of four
mutually-prime `DelayNode`s, each fed back through a damping lowpass into the next
line (loop gain ≈ 0.45 → a diffuse decaying tail that is always stable). An FDN is a
*recirculating* structure rather than a fixed impulse convolution — that is what
makes this a distinct technical approach from a `ConvolverNode` room.

### HRTF binaural

Each voice's dry path is a `PannerNode` with `panningModel="HRTF"` at the source's
fixed 3-D position; the single `AudioListener` is moved to the avatar each frame
(guarded `positionX.setTargetAtTime` vs legacy `setPosition`).

**Reference:** HRTF `PannerNode` binaural spatialisation (Web Audio) + Google
Omnitone / Resonance-Audio ambisonic panning — the living web-spatial-audio
technique — with a front camera standing in for a headset IMU as the pose source.

### Input (model-free CV)

Front camera → a 160×120 offscreen canvas each frame → a slow running per-pixel
background mean of luma → foreground mask where `|luma − mean| > threshold` →
centroid `(x,y)` + area. No MediaPipe, no TensorFlow, no network. Centroid-X →
avatar X (mirrored); area (bigger = closer) → depth Z. Copied verbatim from
orbitroom's silhouette primitive to keep this folder self-contained.

## Safety & housekeeping

- **Strobe-safe:** every visual change is a slow (<1 Hz) drift; the camera orbit is
  sub-1 Hz. `prefers-reduced-motion` slows the orbit and the walker.
- All audio routes through the shared `createSafeMaster` limiter (never
  `ctx.destination` directly).
- Full teardown: `MediaStream` tracks stopped, `cancelAnimationFrame`, oscillators
  stopped, FDN + nodes disconnected, `master.disconnect()`, three.js geometries /
  materials disposed, canvas removed, `ctx.close()`.

## Honest limits

- The FDN is a single **shared** room, not a per-source impulse response — the
  *ratio* (DRR) is what carries distance here, not per-source early-reflection
  patterns.
- The DRR→tether mapping is a designed normalisation (a useful ≈ −6…+18 dB DRR span
  mapped to `0..1`), tuned for legibility, not a calibrated acoustic measurement.
- Binaural only reads on **headphones**; on a phone speaker you get the visual
  spatial layout but not the HRTF cue — which is exactly why the tethers exist.
- The model-free silhouette needs a reasonably still background and even lighting;
  a busy or moving background degrades the centroid (it holds the last reading and
  decays closeness toward neutral rather than jumping).
