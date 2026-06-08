# 419 — Body Band 🥁

**What if a 4-year-old's whole-body dance, seen through the camera, generated a
live DRUM groove — no melody, no tuning, just the beat their body is making?**

This is the headline of a 3-way exploration of that one question. Two siblings
attack the same idea differently; this one is the **MediaPipe-Pose
zone-triggered DRUM KIT**.

## What it is

The front camera shows a mirrored, dimmed video of the child with glowing limb
markers drawn over their joints (Canvas2D). [MediaPipe Pose
Landmarker](https://ai.google.dev/edge/mediapipe) tracks 33 body landmarks in
real time, and the child's whole body becomes a drum kit. A **groove engine**
keeps a steady internal tempo grid; every gesture-triggered hit is **quantized**
onto the nearest 16th-note slot, so even a wildly flailing toddler locks into a
beat. A soft always-on pulse keeps a groove going even when the child is still,
and overall motion energy raises the groove's fullness.

Everything is **pure percussion / noise** — there is NO melody, NO chord, NO
scale, NO tuning. Drums are synthesized with the Web Audio API:

- **kick** — pitch-enveloped sine + a tiny high-passed click transient
- **snare / clap** — bandpassed white-noise burst + a short tonal thwack body
- **hi-hat** — very short high-passed noise
- **tom** — pitch-enveloped sine (percussive thump, not a tuned note)
- **crash** — long bright noise through a bandpass + high-pass

Every voice is summed through a brick-wall `DynamicsCompressor` limiter
(threshold −6 dB, ratio 12, knee 0) plus a soft master gain, so the output can
**never blast small ears**.

## How to play

1. Tap the big **"Start the band 🥁"** button (this single tap starts audio,
   asks for the camera, and loads MediaPipe — required by autoplay/permission
   rules).
2. Stand back so the camera can see your whole body.
3. **Dance.** Throw your arms, bounce, lift your knees. Every move is a drum.
4. You can also **tap the colored buttons** along the bottom to play drums with a
   finger — no body needed.

No reading is required: drums are emoji + color, tap targets are ≥76 px, and
every action gets an immediate flash + sound.

## Gesture → drum map

| Gesture                                   | Drum            | Visual flash      |
| ----------------------------------------- | --------------- | ----------------- |
| Left hand raised above the shoulders      | 🥁 **TOM**      | yellow at L wrist |
| Right hand raised above the shoulders     | 👏 **SNARE**    | pink at R wrist   |
| Both hands thrown up / wide **fast**      | 💥 **CRASH**    | blue between hands|
| Knee lift **or** quick downward body drop | 🦵 **KICK**     | rose at hips      |
| Head bob / steady bounce                  | 🤘 **HI-HAT**   | teal at head      |

Hit velocity = how fast/big the motion was. Thresholds are deliberately
forgiving and each gesture has a short cooldown, so a flailing kid triggers lots
of fun hits without machine-gun retriggering. (Because the display is mirrored,
the left/right flash swaps are mirrored too, so the burst appears on the hand
the child sees moving.)

## Graceful degradation (the important part)

AudioContext + `getUserMedia` + the MediaPipe load all happen **inside the first
user tap**. If the camera is denied, or MediaPipe fails to load, the prototype
catches it, shows a readable `text-rose-300` notice, and runs an **auto-demo
"ghost dancer"** — a synthetic looping pose (sine-driven limbs, with periodic
"both hands up" crash phrases and alternating knee lifts) that drives the **same**
gesture detector + groove engine. A reviewer with no camera hears and sees a
full groove, hands-free, within ~2 seconds. The drum pads remain tappable as a
direct fallback input the whole time.

On unmount everything tears down cleanly: the rAF loop is cancelled, the groove
scheduler is stopped, `landmarker.close()` is called, the camera MediaStream
tracks are stopped, and the AudioContext is closed.

## Named references

- **"Dance Motion-Guided Music Generation via RVQ"** — *Electronics* (MDPI), May
  2026. Generating music conditioned on dance motion via residual vector
  quantization; the spiritual parent of "the body's movement makes the beat."
- **BlazePose** — Bazarevsky et al., 2020. The on-device pose-estimation
  architecture behind MediaPipe Pose Landmarker (33 landmarks, real-time on
  phones).
- **Lee et al., "Dancing to Music"** — NeurIPS 2019. Cross-modal dance ↔ music
  generation; foundational work on coupling movement and rhythm.

## Honesty

**Build-verified, not browser-verified.** This prototype passes `tsc --noEmit`,
ESLint, and the Next.js production build (its route compiles to a static page).
It has **not** been run against a live camera or a real device in this
environment. The MediaPipe model + WASM load from CDN at runtime, so live
behavior depends on network access and a WebGL-capable browser; the ghost-dancer
fallback is the guaranteed-audible path if any of that is unavailable.

## Tech

Fully client-side. Web Audio API + Canvas2D only — no three.js, no WebGL2, no
SVG, no new npm dependencies. MediaPipe is **not** an npm dependency; it is
loaded at runtime from `cdn.jsdelivr.net` via a dynamic import with a non-literal
specifier + `webpackIgnore`. No API route, no microphone, no secrets.

- `page.tsx` — the React client component (camera, canvas render loop, gesture
  wiring, pad UI, degradation).
- `drums.ts` — pure-percussion Web Audio synthesis + the limiter/master chain.
- `groove.ts` — ~100 BPM 16th-note grid, look-ahead scheduler, quantization,
  always-on pulse.
- `pose.ts` — landmark types, the stateful gesture detector, motion energy, and
  the ghost dancer.
