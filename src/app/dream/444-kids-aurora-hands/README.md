**For**: kids (4+) · iPad/phone/desktop

# 444 — Kids Aurora Hands

> "What if a 4-year-old could cup, swirl, and scatter a huge living galaxy of light with their bare HANDS in the air — and the galaxy sings?"

---

## What it does

A massive living particle galaxy — 60 000 particles on WebGPU, 8 000 on WebGL2 — responds to the child's hands in the air. Hand positions (via MediaPipe HandLandmarker) become gravity wells and repulsors in the particle simulation:

- **Open hand** (fingers spread) → repulsor: pushes the galaxy outward, scatters a nebula
- **Closed/pinched hand** → attractor: pulls light in, gathers it into a glowing ball
- **Bring both hands together** → warm luminous swell in the audio + particles converge
- **Fling hands apart** → aurora explosion, particles scatter across the sky

The child waves their hands in front of the camera with no screen-touching required. If the camera is unavailable (or denied), ghost hands wander the screen autonomously so the galaxy is always alive and beautiful.

---

## Audio design

A continuously-evolving **chord-cloud** — never silence, never percussion:

- **Tuning**: D major pentatonic (D E F# A B) across four octaves — no wrong notes. All voices sit inside this scale so any hand position sounds musical.
- **Hand height → register**: hands high = bright upper voices; hands low = deep bass drones.
- **Hand openness → voice density**: open hand activates up to 6 oscillator voices; fist = 2 quiet drones.
- **Hand x-position → stereo pan**: each hand's voice cloud panned by its screen-x via `StereoPannerNode` (NOT HRTF — safe on phone speakers).
- **Hands together → filter swell**: when hands approach each other, a low-pass filter opens, adding warmth and consonance.
- **Total motion → loudness**: faster motion = louder pad (within the brick-wall limiter).
- **Slow drone drift**: root/drone oscillators drift through D→E→G→A→G→E on a ~7-minute cycle.
- **Filter LFO**: a sine LFO breathes the global filter cutoff on a ~37-second period that itself drifts, so minute 5 sounds different from minute 0.
- **Safety limiter**: `DynamicsCompressor` at threshold −6 dB, ratio 20:1, master gain ≤ 0.25 — can NEVER blast small ears.
- **Always-on ambient**: a quiet root drone (with slight detuning and a fifth overtone) plays continuously even with no hand motion.

---

## GPU / visual design

### WebGPU path (Chrome, Edge, desktop)
- **60 000 particles**, each with 2D position + velocity in GPU storage buffers.
- **WGSL compute shader** integrates velocities each frame: ambient curl-noise drift + up to 4 attractor/repulsor force wells from hand positions.
- **WGSL render shader**: additive quad billboards with aurora HSL palette, colour shifts toward nearest attractor hue.
- No trail buffer needed — the background is a near-black clear colour each frame; persistence comes from the eye's integration.

### WebGL2 fallback path (mobile Safari, older browsers)
- **8 000 particles**, CPU velocity integration (same physics as compute shader).
- Instanced `TRIANGLE_STRIP` quads, per-instance position data uploaded each frame via `bufferSubData`.
- Same additive blending, same hue-shift colouring logic (in GLSL 300 es).

### Attractor model
- Open hand (openness > 0.5) → strength = −0.6 (repulsor)
- Closed/pinched hand → strength = +0.8 (attractor)
- Radius of influence scales with openness (0.15–0.30 in normalised coords)
- Force falloff: smooth peak at ~0.4× radius, zero at boundary — no discontinuities

---

## Which path ran

The page detects WebGPU availability at runtime (`navigator.gpu`) and shows a small badge in the top-right corner: **WebGPU ✦** or **WebGL2 ◈**. The ghost-hands demo runs on both paths without a camera.

---

## Privacy

The webcam stream is **analysis-only**. Camera frames are passed to the MediaPipe HandLandmarker model running locally in the browser. No frame is drawn to any visible canvas, stored, recorded, or transmitted. Only the 21 numeric landmark coordinates per hand are used. The abstract galaxy is shown; the child's face and image are never displayed or saved.

---

## Kids design rules

- No reading required — icon language (🌌 ✋ ✨)
- All tap targets ≥ 64 × 64 px
- No fail states — camera denied → ghost-hands auto-demo, always beautiful
- No percussion, no sudden loud sounds — chord-cloud only
- Colours are the language — each hand gets a distinct hue (magenta / cyan)
- Looping ambient pad: never silent
- Soft start: tap-to-start overlay unlocks iOS audio safely

---

## Named references

- **MediaPipe HandLandmarker** (Google on-device hand tracking) — the landmark pipeline that maps 21 hand keypoints per frame from a standard 2D webcam, running entirely in the browser via WebAssembly.
- **MediaPipe → GPU particle systems** — cf. the line of work connecting MediaPipe outputs to interactive particle fields (NVIDIA Flex demos, three.js + MediaPipe hand-tracking particle demos, 2026), where hand positions drive attractor/repulsor fields.
- **Refik Anadol** — latent/particle-flow aesthetic lineage: large-scale data sculptures where particles self-organise into flowing, breathing aurora forms. The "galaxy sings" premise takes this into embodied play for children.

**Honest ambition note**: Hand tracking, WebGPU compute shaders, particle systems, and pentatonic chord clouds all exist as established creative-coding primitives. The genuinely fresh move here is the **specific combination**: a bare-hands, fully continuous, calm, GPU-scale *singing* galaxy tuned for 4-year-olds — no wrong notes, no scary sounds, no screen touching, always self-demonstrating, always alive. The child's body becomes the instrument; the galaxy is their voice made visible.

---

## File structure

```
444-kids-aurora-hands/
  page.tsx    — React component, tap-to-start overlay, HUD, loop orchestration
  audio.ts    — Continuous D-pentatonic chord-cloud, StereoPannerNode, DynamicsCompressor
  gpu.ts      — WebGPU compute+render pipeline + WebGL2 CPU-particle fallback
  hands.ts    — MediaPipe HandLandmarker (CDN), ghost-hands demo, attractor model
  README.md   — This file
```
