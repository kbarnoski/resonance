# 576 · Presence Room

> "What if you could lean and turn your head and the music physically moved around you — your own face is the listener, and the warmth surrounds wherever you look?"

A warm, sustained just-intonation drone hangs in 3D around you. Your webcam tracks
your head pose and feeds it straight into the Web Audio **AudioListener** — your
own face becomes the listener. Turn your head and the chord re-spatialises; lean
toward a voice and it blooms (comes nearer, glows brighter). There is nothing to
get right. You just exist inside the sound.

## How to use

1. Put on **headphones** — the spatialisation is binaural (HRTF) and only works
   in stereo over the ears.
2. Press **Enter the room**. A warm haze appears and the drone swells in over a
   couple of seconds.
3. Allow the camera if prompted. Then **lean, turn, and tilt your head** — the
   field of voices moves around you, and whatever you face brightens and warms.

That's the whole interaction. It's meant for slow, ambient presence, not tasks.

## How it works (three subsystems)

1. **Face tracking** — MediaPipe **FaceLandmarker** is dynamically imported from
   the jsDelivr CDN at runtime (no npm dep added). Each frame we read one face's
   landmarks and derive a heavily EMA-smoothed (α ≈ 0.15) head pose: planar
   position from the eye centroid in-frame, forward/back depth from inter-ocular
   scale (lean closer → move in), yaw from left/right eye asymmetry around the
   nose, pitch from the eye-to-nose vertical span. See `face.ts`.
2. **Spatial audio** — six soft drone voices at just-intonation ratios
   (1/1, 9/8, 5/4, 3/2, 15/8, 2/1) over a warm A2 root (110 Hz), each built from
   a sine fundamental + a triangle sub + a slightly-detuned upper partial, each
   fed through its own **HRTF `PannerNode`** placed at a fixed azimuth/elevation
   on a ring. Every frame the head pose drives `audioCtx.listener` position and
   forward orientation (modern `positionX/forwardX.setTargetAtTime` AudioParams,
   with `setPosition`/`setOrientation` fallback). All swells use multi-second
   `setTargetAtTime` so the field breathes. The master chain is
   `gain → lowpass → DynamicsCompressor (limiter) → destination`, so it can
   never clip. See `audio.ts`.
3. **Visuals (raw WebGL2)** — a hand-written GLSL ES 3.00 fragment shader on a
   single fullscreen triangle (no three.js): a warm amber/rose/violet volumetric
   haze on near-black whose brightest region tracks where you look, plus one soft
   glowing orb per voice arranged on a ring; each orb brightens with its voice's
   bloom. See `render.ts`.

## Fallbacks (designed for a 06:30 phone glance, no setup)

- **Camera denied / FaceLandmarker fails / no webcam** → a clear `text-rose-300`
  notice, **pointer-drag "look around"** (drag moves the virtual head), and a
  **silent auto-demo**: the virtual head pans on a gentle Lissajous path so the
  field audibly moves around you within a few seconds. The auto-demo cancels on
  any real interaction (a tracked face or a drag) and resumes after ~5 s idle.
- **WebGL2 unavailable** → a notice; the spatial audio still runs.
- **Audio blocked** → a notice; visuals still render.
- Loads in well under a second; the aurora and auto-demo audio start on the
  primary action.

Privacy: camera frames are analysed entirely in-browser — never recorded,
stored, or transmitted.

## Named references

- **Maryanne Amacher** — work where the perceived sound changes as you move your
  head in the room; the body is part of the instrument.
- **La Monte Young & Marian Zazeela, *Dream House*** — a sustained
  just-intonation environment you physically move through.
- **Pauline Oliveros, *Deep Listening*** — attention as the practice; presence
  over performance.
- **Technique bind (2026):** webcam head-tracker auralization — MediaPipe
  FaceLandmarker → Web Audio binaural listener — an actively-developing browser
  technique (e.g. open-source "Spatial-Head-Tracking-Audio" and webcam-
  auralization research).

## Ambition criteria cleared

- **#1** First head-pose → AudioListener (head-tracked binaural) piece in the lab.
- **#2** Three real subsystems: face tracking + HRTF/AudioListener spatial audio
  + hand-written WebGL2 visuals.
- **#3** Named references above.
- **#5** Binds the 2026 webcam-auralization technique.

## Tags

- **INPUT:** webcam → MediaPipe FaceLandmarker head pose
- **OUTPUT:** raw hand-written WebGL2 fullscreen fragment shader
- **TECHNIQUE:** head-pose → Web Audio AudioListener position/orientation; warm
  drone voices as HRTF PannerNodes (head-tracked binaural)
- **VIBE:** warm, enveloping, meditative — no challenge, no score, nothing to get wrong
