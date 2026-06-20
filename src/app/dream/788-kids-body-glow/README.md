**For**: kids (4+)

# Body Glow — a UPIC score painted by a dancing body

## The one question
What if a 4-year-old's whole moving silhouette PAINTED a glowing UPIC score in
the air — the higher a part of their body, the higher the note it sings, and
their motion leaves luminous light-trails that keep singing and slowly fill the
sky?

This is the **literal full-body version of Iannis Xenakis's UPIC** (1977: *"music
becomes a game for children — they draw, they hear"*). UPIC let you draw a curve
and hear it; here the drawing tool is the child's whole dancing body, and the
canvas is the sky above them.

## How to play (no reading required)
Tap the big **Start dancing** button. Move. Reach a hand up high → that hand
sings a high note; drop it low → a low note. Every part of your body that's
tracked paints its own colour of light that lingers and keeps singing, so after
a few minutes the sky is full of the glowing shape of your dance.

## Body → sound mapping
- Front camera → **MediaPipe Pose** (33 landmarks). The video is mirrored so it
  feels like a mirror.
- Tracked parts each drive **ONE continuous sung voice** (triangle osc + gentle
  vibrato + per-voice lowpass for a choir-ish blend):
  - left wrist (gold), right wrist (coral), head/nose (bright cream lead),
    left ankle (sky blue), right ankle (lavender), left elbow (amber),
    right elbow (rose).
- **Vertical position = continuous pitch.** Screen-y in `[-1, 1]` maps onto a
  ladder of **C-major pentatonic** notes from **C3 to A5**. The pitch is **glided
  with `setTargetAtTime` (portamento)** between adjacent pentatonic notes — the
  voice slides, it is *never* retriggered as discrete steps, and every landing
  point is a real pentatonic note, so **there are no wrong notes**.
- Voice loudness follows presence/visibility of that landmark (smoothed, soft
  attacks/releases) so appearing/disappearing limbs never click or pop.

## Subsystems
- **`pose.ts`** — MediaPipe Tasks-Vision loaded from CDN at runtime via
  `webpackIgnore` (never enters `package.json`). Normalises landmarks into a
  mirrored `Body`. Provides **`makeGhostBody(t)`**, a synthetic dancing body for
  the no-camera path.
- **Renderer (raw WebGL2, GLSL ES 3.00)** — three passes, hand-written, no
  three.js:
  1. *Fade* pass: previous accumulation texture × `0.965` decay → light-trails
     persist and accumulate, then gently fade (never whites out).
  2. *Glow* pass: ~900 additive `gl_PointSize` glow sprites **per limb** (≈6300
     points/frame) seeded as a soft disc cloud, drawn with `SRC_ALPHA, ONE`
     additive blending into a **ping-pong feedback FBO**.
  3. *Present* pass: a warm **daylight→dusk** gradient base (drifts very slowly
     over minutes) + a small 5-tap bloom of the accumulation + a soft tonemap.
  This is a long-form, stateful feedback field: **minute 5 is visibly fuller
  than minute 1**, then decays so it stays luminous without blowing out.
- **Audio (Web Audio)** — kids-safe chain:
  `master Gain (≤0.3, swelled in) → BiquadFilter lowpass (7500 Hz) →
  DynamicsCompressor (threshold −10, ratio 20) → destination`. An **always-on
  warm ambient pad (C2 + G2)** with slow chorus shimmer guarantees it is never
  silent and never out of key.
- **Canvas2D fallback** — if WebGL2 is unavailable, an inline Canvas2D glow field
  with `lighter` compositing and a translucent gradient wash reproduces the same
  accumulating trails and the **identical body→sound mapping** (still paints +
  sings).

## Graceful degradation (unattended / straight-to-prod)
- **Camera denied OR MediaPipe fails** → everything is driven by
  `makeGhostBody(t)`: a reviewer sees the glowing body painting and **hears the
  choir hands-free within ~2 s**, plus a `text-rose-300` notice inviting the
  camera.
- **No WebGL2** → Canvas2D glow field (same mapping) + a small notice.
- **No 2D context either** → a minimal audio-only loop still sings (never a dead
  or silent screen).
- **iOS** → the `AudioContext` is created, resumed, and `getUserMedia` is called
  **inside the first user tap**.
- **Teardown on unmount** → cancels `requestAnimationFrame`, stops camera tracks,
  `landmarker.close()`, deletes WebGL programs/buffers/textures/FBO +
  `WEBGL_lose_context.loseContext()`, fades and stops all oscillators, and
  `audioCtx.close()`.
- Camera is **analysis-only**: frames are never recorded, stored, or transmitted.
  The only network access is the MediaPipe CDN + model.

## References
- **Iannis Xenakis — UPIC** (Unité Polyagogique Informatique du CEMAMu, 1977):
  drawing curves to compose sound; conceived partly as a music game for children.
- **MediaPipe Pose** (Google) — `pose_landmarker_lite`, 33 full-body landmarks.
- **CHI 2026, "Designing Interactive Movement Sonification for Hip-Hop Dance"** —
  grounding for continuous, glide-based body→sound mappings that reward motion
  without punishing it with wrong notes.
- **Refik Anadol** — reference for the painterly, luminous, slowly-accumulating
  flow register (here kept warm, bright, and daylit for kids).
