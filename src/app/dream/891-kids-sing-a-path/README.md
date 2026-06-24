# 891 — Kids: Sing a Path

A warm storybook-night sandbox where a young child sings and **their own voice
draws a glowing path that a firefly flies along**.

## The one question

> What if a 4-year-old could SING and watch their own voice draw a glowing path
> that a little firefly flies along — and it always sounds beautiful because we
> follow the SHAPE of their voice, not whether they hit a "correct" note?

## Tags

- **INPUT:** mic / voice
- **OUTPUT:** animated `<svg>` / DOM (deliberately **no** canvas, **no** webgl, **no** three.js)
- **TECHNIQUE:** real-time pitch tracking (autocorrelation / NSDF / YIN-lite) + contour-relative mapping
- **PALETTE / VIBE:** warm storybook night — fireflies, soft glow, moon, stars

## Subsystems

1. **Mic pitch tracker** (`pitch.ts` → `trackPitch`)
   `getUserMedia` → `AnalyserNode` (time-domain) → fundamental-frequency estimate
   via a normalized-square-difference function (NSDF / YIN-lite) with parabolic
   peak interpolation. Tracks **RMS loudness** too, so quiet = no draw. A
   log-domain `PitchSmoother` calms the contour without lagging playful swoops.

2. **Contour-relative engine** (`pitch.ts` → `ContourEngine`)
   Converts the pitch stream into **relative** motion against a slow-drifting
   baseline ("is the voice going up/down/holding vs its own center?") and maps
   that to a path height in `[-1, 1]`. The baseline drifts toward the current
   pitch so the child can wander up forever and stay on screen. **This is the
   PESTO insight in code: relative contour, not absolute Hz.**

3. **SVG renderer** (`page.tsx`)
   A scrolling glowing SVG `<path>` extended point-by-point each frame, with a
   firefly (glowing core + soft radial halo) riding the tip, trailing amber
   sparkles, a gradient night sky, moon and stars. Animated entirely by
   `requestAnimationFrame` mutating SVG attributes — **no canvas, no webgl.**

4. **Web Audio harmony voice** (`audio.ts` → `HarmonyVoice`)
   A soft sine + triangle companion tone that follows the child's contour
   **quantized to C-major pentatonic**, with portamento glides — so it can never
   clash. A gentle C-major **pad drone** sits underneath, sparkle "twinkles"
   fire on high points, and a master **compressor/limiter** with soft attack /
   release guarantees nothing is ever harsh or sudden (kids-safe ears).

## Named reference

**PESTO — *Real-Time Pitch Estimation with a Self-supervised
Transposition-equivariant Objective*** (arXiv 2508.01488).

The design law implemented from it: **pitch CONTOUR (relative up/down/hold
motion) is robust and meaningful; absolute pitch is not.** We therefore follow
the *shape* of the child's singing and never judge a "wrong note." A child who
sings out of tune still draws a beautiful, valid path. The harmony we sing back
IS quantized to a safe scale (C-major pentatonic) so the audio is always
consonant, but the VISUAL follows their raw contour.

> RESEARCH §532 (2026-06-24) — PESTO transposition-equivariant real-time pitch
> (arXiv 2508.01488): track contour, not absolute pitch.

## How it degrades (graceful fallback)

- On mount the page enters a **hands-free auto-demo** (~0.6s after load): a
  pre-scripted gentle sung contour (`demoHeight`) drives the **same**
  path + firefly + harmony pipeline, so the page sings and animates within
  ~1.5s with **zero hardware**.
- A visible `text-rose-300` notice says it is in demo mode, with a giant
  **🎤 Sing!** button to request the mic.
- If mic permission is denied/unavailable, a clear `text-rose-300` error appears
  and the auto-demo keeps the page alive — it never goes silent.
- All AudioContext nodes, animation frames, and media-stream tracks are cleaned
  up on unmount.

## Kids design rules honored

- One giant primary button (`min-h-[96px]`, `min-w-[260px]`), no reading
  required, immediate response.
- Tap targets ≥ 64px (primary) / ≥ 44px (secondary).
- Soft, never-harsh audio: master limiter, gentle attack/release, portamento,
  pad fade-in — no sudden loud onsets.
- Big friendly visuals; feedback the instant a sound is made ("singing!" badge).

## Next-cycle deepening ideas

- **Catch the firefly:** let the child tap the firefly to "scoop up" a star,
  banking their drawn phrase into a little constellation gallery.
- **Two-part contour:** record one path, then sing a second over it; harmonize
  the companion voice against the saved contour (call-and-response duet).
- **Replay-the-journey:** after a phrase, the firefly retraces the whole drawn
  path while the pentatonic melody plays back — a tiny "watch your song" moment.
- **Color seasons:** swap the palette (autumn embers, winter aurora) without
  touching the contour engine.
- **On-device PESTO:** replace the NSDF estimator with a true
  transposition-equivariant model for cleaner contours on noisy tablets.
