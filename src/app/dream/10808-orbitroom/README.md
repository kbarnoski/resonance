# 10808 · orbit•room

## The one question

**What if you could physically move through a room and hear the music orbit your body in binaural 3-D?**

The lab's first embodied **body-position → HRTF spatial-audio** room. Your body, read
by the front camera, becomes a listener walking through a virtual room ringed with
soft ambient voices. On headphones the chord genuinely swings and orbits around you
in binaural 3-D; on the top-down map, the spatialisation is drawn so you can *see* it
even where a phone speaker can't render it.

## How it works

### 1. Body → silhouette centroid (model-free)

No MediaPipe, no TensorFlow, no network. (`silhouette.ts`)

- The front camera is grabbed to a tiny **160×120** offscreen canvas each frame
  (mirrored, so stepping to *your* left moves the dot left).
- A **slow running background mean** of luma is kept per pixel
  (`bg += (luma − bg) · 0.03`).
- Each frame we threshold **|luma − mean|** into a foreground mask, and take its
  **centroid (x, y)** and **area**. That is the body's horizontal position, vertical
  position, and *closeness* (a bigger silhouette = nearer the camera).
- The reading is exponentially smoothed (~0.18 s) before it reaches the audio, because
  HRTF localisation degrades badly under raw per-frame pose jitter.

This primitive is the same running-mean-background + frame-difference + centroid
technique used by `7672-dissolve`, re-implemented here (not imported).

### 2. Centroid → HRTF listener/source geometry

Five soft **inharmonic voices** sit at fixed points on a ring in a virtual room, each
through a `PannerNode` in `panningModel: "HRTF"` mode. (`audio.ts`)

- Body **X** → `AudioListener` **X** (walk left, the sources swing right).
- Body **area / closeness** → listener **Z** (step toward the camera → move forward,
  deeper into the ring).
- The listener faces −Z (up on the map). Positions are set with
  `AudioParam.setTargetAtTime(…, ~0.05 s)` — a smooth glide, never an instantaneous
  jump.
- Each voice is a few detuned sine partials on an inharmonic ratio set (`1, 1.004,
  2.01, 3.02`) over a low just-intonation drone (55 / 66 / 82.5 / 88 / 110 Hz). Every
  voice breathes under a very slow (<0.1 Hz) amplitude LFO, so the room is a calm
  cosmic-ambient chord, not a melody. Everything is routed through the shared
  `createSafeMaster` limiter bus.

### 3. The room map (Canvas2D, top-down)

`page.tsx` draws a dark room with faint distance rings around a bright **you-dot**
(pale cyan/steel, with a forward tick). The five source-dots sit around you in
violet→cyan; each **brightens and enlarges with its current gain**, and a **line is
drawn from you to each source**, tinted by whether it currently sits to your left or
right. An L / R / front / back crosshair makes the binaural pan axis explicit. This is
the whole point: **the spatialisation is visible on the map even when a speaker can't
render binaural.**

### Fallback / self-demo

Before you press **Begin**, and whenever the camera is denied or unavailable, a
**deterministic seeded virtual performer** (`makeVirtualRig`, seed `0x10808`) drifts
the body along a slow Lissajous orbit — so the map animates and the sources orbit on
their own. It runs **muted** until the first user gesture (browser autoplay policy);
`Begin` creates and `resume()`s the `AudioContext` inside that gesture, then attempts
the camera. If the camera is denied, a `text-destructive` note is shown and the
virtual performer keeps orbiting.

## Named reference

**HRTF `PannerNode` binaural spatialisation** + **Google Omnitone / Resonance-Audio**
ambisonic panning — the living web-spatial-audio technique being ported — with a
**front camera standing in for a headset IMU** as the pose source
(computer-vision → spatial-audio).

## Safety notes

- **Flicker-safe:** no full-frame luminance flashing. The only pulsing is each voice's
  slow (<0.1 Hz) level drift and the corresponding dot brightness — far below the 3 Hz
  ceiling. `prefers-reduced-motion` is honoured by calming the motion clock.
- **Privacy:** the camera is read only in your browser to sense the silhouette;
  nothing is recorded, stored, or sent anywhere.
- **Cleanup:** on unmount the MediaStream tracks are stopped, the animation frame is
  cancelled, and the `AudioContext` is closed.
- **Graceful degradation:** no camera → virtual performer + note; no Web Audio → the
  room map still animates with a note.

## Next-cycle deepening

Give each source its own **short reverb send whose pre-delay and level track its
distance to the listener** (a per-source `ConvolverNode` or a delay-network room), so
that stepping deeper into the ring not only re-pans the voices but changes their
*near/far* timbre — early reflections tightening as you approach a source and washing
out as you back away. That would turn the flat HRTF ring into a room with felt depth.
