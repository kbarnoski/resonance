# 295 · Kids Shadow Dance

**The one question:** What if a 4-year-old's whole-body dancing made a dusk
meadow bloom and sing — no poking, no precise gestures, just MOVE?

A camera / whole-body audio-visual toy for ages 4+. Stand back, hit one big
**Start dancing** button, and wherever you move the dusk meadow blooms flowers,
leaves glowing light-trails, and sings a warm scale. There is nothing to tap
and no way to be wrong — the only instruction is *move*.

## How to play

1. Tap **Start dancing**.
2. Allow the camera when asked (or don't — see graceful degradation below).
3. Stand far enough back that the camera can see your body, then dance, wave,
   jump, spin. The meadow lights up and sings under you.

The camera is **analysis-only**. Frames are read, reduced to motion numbers,
and immediately discarded. Nothing is recorded, stored, or sent anywhere — it
all stays in the browser tab. An amber on-screen notice says so before you start.

## The technique — frame-difference optical flow motion-field

No MediaPipe, no skeleton, no model, no CDN library. Every animation frame:

1. The camera frame is drawn into a tiny **32×24** offscreen canvas
   (`motion-field.ts`).
2. Each cell's **luminance** (Rec. 601 luma) is computed.
3. We take the **absolute difference** vs. the previous frame's luminance,
   per cell. After a small noise gate and a light temporal smoothing (so a
   wiggle leaves a brief glow in the data), that difference grid is the
   **motion field** — hot cells are wherever the body just moved.

This is deliberately model-free: it's robust for a constantly-wiggling
4-year-old, dependency-free, and cheap. The field is packed into an **RG8**
texture (R = motion, G = silhouette/luminance) and summarised into three
numbers — `energy` (total motion), `heightY` (centre-of-motion height), and
`spawn` (count of hot cells) — that drive everything else.

## Output — raw WebGL2 fragment-shader dusk meadow

`meadow-gl.ts` renders the whole scene in raw WebGL2 (`#version 300 es`), no
three.js. Two programs over a full-screen quad:

- A **trail accumulation** pass: ping-pong RGBA8 framebuffers compute
  `newTrail = max(oldTrail·decay, freshMotion)`, so motion leaves **glowing
  light-trails** that fade gently.
- A **scene** pass: a dusk sky→meadow gradient with a low setting-sun glow and
  quiet stars, swaying grass, **flower blooms** from hot motion cells, the
  accumulated trails, and a faint low-res **self-silhouette composite** (a cool
  glowing presence, never a hard cutout) so the child sees themselves in the
  meadow. The image is mirrored so it reads like a mirror.

## Audio — warm Lydian meadow, never harsh

`meadow-audio.ts` is fully synthesised Web Audio (no files):

- A breathing **pad** (two sines a Lydian colour-interval apart) always
  underneath — it is never silent once started.
- **Blooms** ring out as triangle+octave voices on a **G Lydian** scale across
  three octaves — Lydian's raised 4th gives that floaty dusk feeling, and every
  note is consonant, so **there are no wrong notes**.
- **Mapping:** `energy` → pad swell + lowpass filter opening + faster/denser
  blooms + occasional stacked harmonies; `heightY` → pitch register (low motion
  = low notes, high motion = high notes); `spawn` → how many blooms fire.
- A look-ahead scheduler keeps timing smooth. The master bus runs through a
  soft lowpass and a **`DynamicsCompressor` limiter**, so however wildly the
  child dances the sound can **never** get harsh or loud.

## Graceful degradation

- **No camera / permission denied / unavailable:** a hand-authored **ghost
  dancer** (a soft blob that figure-eights, jumps, and flails its limbs across
  the grid) drives the *identical* motion-field → audio + visual pipeline, so
  the piece is fully demoable and never silent. A readable `text-amber-300/95`
  notice invites the child to dance along with the ghost.
- **No WebGL2:** a readable `text-rose-300` notice appears and the audio keeps
  playing — "close your eyes and dance to the sound."
- Audio always fades in/out gently; all rAF, audio nodes, and camera tracks are
  cleaned up on unmount.

## Diversity tags

INPUT = camera / whole-body · OUTPUT = raw-WebGL2 shader meadow · TECHNIQUE =
frame-difference optical-flow motion-field · VIBE = kids / dusk / embodied.

## Named references

- **Émile Jaques-Dalcroze**, *Eurhythmics* — learning music through whole-body
  movement; the spirit of "move your whole self, the music follows."
- **Frid & Bresin**, interactive sonification of children's movement
  (*Frontiers in Neuroscience*, 2016).
- **Myron Krueger**, *Videoplace* (1985) — foundational full-body video
  interaction, silhouette-as-interface.
- Recent: CHI 2026 workshop "From Movement to Sound and Back" confirms
  movement-sonification is a current, living research thread.

## Files

- `page.tsx` — client component: Start button, camera request, the per-frame
  pump wiring motion → meadow + audio, fallbacks, design-notes panel.
- `motion-field.ts` — frame-difference motion field (camera + ghost dancer).
- `meadow-gl.ts` — raw WebGL2 trail-accumulation + dusk-meadow scene shaders.
- `meadow-audio.ts` — Web Audio Lydian meadow ensemble with limiter.
