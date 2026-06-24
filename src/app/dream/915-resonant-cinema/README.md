# Resonant Cinema (915)

**The one question it answers:** What if your playing could dream a short film
of itself — your music distilled into a single still image, then bloomed into a
living video, which your own live sound keeps animating?

This is an **AI-pipeline-chain** piece: a true two-model series,
**audio → image → video**. The AI generates a *seed*; the live audio is the
*ongoing animator*. The human plays; the AI only dreams the canvas.

## How the two-model chain works

1. **Audio (Web Audio API).** On load, a generative ambient piano-pad bed
   plays — detuned saw/triangle/sine stacks over **one fixed drone root**
   (A2, 110 Hz). There is deliberately no chord / interval / just-intonation
   engine: pitch is intentionally dumb, because the idea lives in texture and
   image, not in pitch. A slow LFO sweeps a lowpass; a feedback-delay reverb
   send adds depth. The master gain sits at ≤ 0.26 into a
   `DynamicsCompressor` limiter. A **"use microphone"** toggle swaps the
   analysis source to live mic input (`getUserMedia`), with graceful fallback
   if permission is denied. An `AnalyserNode` (FFT 2048, smoothing 0.72) is
   read every animation frame to extract **energy/RMS**, **spectral centroid**
   (brightness), **spectral flux** (frame-to-frame motion), and a rough
   **dominant hue** from the spectrum (color only).

2. **Prompt synthesis.** The current mood is mapped through a small table to a
   poetic cinematic prompt — e.g. bright + energetic → *"luminous cinematic,
   golden particulate light, soaring volumetric rays"*; dark + calm → *"deep
   indigo nebula, slow drift, glassy reflections, cinematic"*. The dominant hue
   is appended as a degree value.

3. **The 2-model FAL chain (`api/route.ts`, guarded).** On an **explicit click**
   of the "Dream the film" button, the prompt is POSTed to the route, which:
   - runs the shared `guard(req)` first (origin + rate-limit + daily quota),
   - **(a)** calls `fal-ai/flux/schnell` (4 steps, 16:9) → a still `imageUrl`,
   - **(b)** feeds that still + a gentle drifting-motion prompt into
     `fal-ai/ltx-video/image-to-video` → a `videoUrl`,
   - returns `{ imageUrl, videoUrl }`, wrapped in try/catch.

4. **Client compositing (GPU).** The returned `videoUrl` is loaded into a
   looping, muted, autoplaying `<video>` and drawn as a `THREE.VideoTexture`
   on a fullscreen three.js plane. A **live fragment-shader pass** driven by
   the ongoing FFT runs every frame: displacement/ripple ∝ energy,
   bloom/exposure ∝ centroid, chromatic-aberration / RGB-split ∝ flux. The AI
   video is the **seed**; the live audio is what keeps it moving.

5. **Fallback (always alive).** Before the first dream, while "dreaming…", if
   `FAL_KEY` is absent, or on any error, a synthesized three.js GPU nebula
   (a domain-warped, audio-driven shader cloud) renders instead. A hands-off
   glance always shows a living, sounding scene.

## Hard cost safety

The FAL chain costs real money (~$0.003 still + ~$0.02 video per run) on
Karel's paid FAL account. It fires **only** on an explicit "Dream the film"
click — never on page load, never on idle, never on any timer/auto-demo. The
auto/idle state uses only the synthesized fallback nebula, and the button is
disabled while a generation is in flight.

## Reference

**Refik Anadol's latent cinema** (e.g. *Machine Hallucinations*) — the
AI-dreamed image as a living, breathing projection rather than a static frame.
Resonant Cinema borrows that posture but hands the animating force back to a
live human performer: the AI dreams the canvas; the player keeps it alive.

RESEARCH §541 (2026-06-24): the real-time generative-media field is converging on making the MODEL fast enough to generate live — arXiv:2606.24307 'Real-Time Interactive Music Generation via Data-Free Streaming Consistency Distillation' (24 Jun 2026) and fast image-to-video distillation such as FSVideo (arXiv:2602.02092, ByteDance, Feb 2026, ~42× faster I2V). This piece inverts that trend: instead of the AI generating the whole artifact with the human as a prompter, the human plays the music live and a fast multi-model AI chain (flux-schnell → LTX-Video) only SEEDS a canvas, which the live audio then animates in real time.
