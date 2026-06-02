# 258 · Mirror Pets — a music-box mirror made of little singing creatures

**The one question:** *What if a child's face became a living mosaic of little
creatures that sing — a music-box mirror you conduct by moving and making
expressions?*

## Concept

A "soft mirror" in the spirit of **Daniel Rozin's mosaic mirrors**. The webcam
feed is *never shown as your literal face*. Instead a chunky grid of soft glowing
**pets** — round creatures with tiny blinking eyes — light up to *form* your
reflection, pointillist-style. The pets that wake up sing. As you move, the
constellation of lit pets follows your face, and the music box re-voices itself
in real time. It is a swarm/grid of physical-feeling units, not one big face —
that is the whole point of the Rozin reference.

MediaPipe FaceLandmarker (478 points + blendshapes) drives everything. Driving
values are smoothed with an EMA so the swarm feels alive, not jittery.

## Mapping table — face → sound → visual

| Input (face) | Source | Sound | Visual |
|---|---|---|---|
| **Where the face is** (bounding-box center, x mirrored) | landmark bbox | which pets ring | which tiles light up to form the portrait |
| **Vertical position of a lit pet** | tile row | **pitch** in C pentatonic (top row = high, bottom = low — a vertical xylophone of faces) | — |
| **Mouth open** (`jawOpen`) | blendshape | **louder + faster**; more pets twinkle; sparkly arpeggio sweep speeds up & rings more notes per sweep | mouth-region pets bloom larger |
| **Smile** (`mouthSmileLeft/Right`) | blendshape | **warmer, happier timbre** (saw harmonics) + occasional major-third lift | hue shifts cool violet → warm gold/pink; pets grow little smiling mouths |
| **Head tilt / horizontal pos** | eye-corner landmarks (33, 263) + bbox x | **stereo pan** | the whole mosaic gently **leans** |
| **No face / low confidence** | — | music box rests on the ambient bed | pets dim to a faint sleeping glow (never blank) |

Underneath it all: an **always-on ambient pad** (three soft sines with slow LFO
shimmer) so the room is never silent, and a **DynamicsCompressor limiter** on the
master so nothing can ever get scary-loud. Scale is C-major pentatonic across
three octaves, so no note is ever "wrong."

A short **arpeggio sweep** walks one grid column at a time; lit pets in that
column ring. Mouth-open both speeds the sweep and increases how many pets ring per
step, giving the "sparkly arpeggio runs across the lit pets" feel.

## Named references

- **Daniel Rozin** — *Wooden Mirror*, *PomPom Mirror*, *Mirrors No.* series:
  interactive mosaic mirrors that render your reflection in a grid of physical
  units. The core inspiration — a reflection made of many discrete, tactile
  things rather than video.
- **MediaPipe FaceLandmarker** (Google AI Edge) — 478-point face mesh +
  blendshape scores (`jawOpen`, `mouthSmile*`), loaded from CDN.

## Graceful degradation

- If `getUserMedia` is denied/unavailable **or** MediaPipe fails to load, it
  catches the error, shows a readable `text-rose-300` message
  ("Camera's not on — here's a self-playing demo! Tap to wake the pets.") and runs
  a **self-playing auto-demo**: a soft "face" blob wanders the grid, mouth opens
  and closes, smile and tilt oscillate, and the music box plays on its own.
- **Tap/click anywhere** (with or without camera) lights up pets and rings the
  matching pentatonic note — so it is interactive even with no camera. Tapping
  also nudges "presence" so the arpeggio keeps sweeping.
- Webcam preview is mirrored (and the whole portrait is x-mirrored) so it feels
  like a real mirror.

## Limitations

- One face only (`numFaces: 1`).
- MediaPipe model + wasm download from CDN on first run, so the very first start
  can take a couple of seconds on a cold cache; the ambient bed + demo cover the
  gap.
- Painting the portrait samples every 3rd landmark for performance; the mosaic is
  an impressionistic blob, not a crisp face outline (intentional, but it means
  fine expressions like an eyebrow raise are not individually legible).
- GPU delegate is requested; on machines without it MediaPipe falls back to CPU
  and detection may run slower than the 30fps throttle target.

## Next-cycle ideas

1. **Per-region voices** — let the eye-pets, mouth-pets, and cheek-pets each carry
   a distinct timbre so the portrait becomes a small ensemble rather than one
   instrument.
2. **Pet personalities** — give clusters slightly different blink rhythms and
   colors so kids recognize "the same pets" returning, and let a held still pose
   make a pet "purr" (slow tremolo).
3. **Two-face duet** — bump `numFaces` to 2 and let a parent + child each grow
   their own swarm that harmonizes where the two mosaics overlap.
