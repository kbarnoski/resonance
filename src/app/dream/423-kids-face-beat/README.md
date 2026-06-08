# 423-kids-face-beat — Face Beat Drum Kit

> "What if a 4-year-old could make a BEAT with their FACE — open your mouth for a boom, raise your eyebrows for a tick, big smile for a shaker — a drum kit you play by making funny faces?"

This is the **Resonance lab's first face→PERCUSSION mapping**. Every prior face piece mapped expression to pitch or melody; this one maps to a quantized drum kit. The subject is **RHYTHM, not tuning** — no chords, no melody, no scale, pure percussion.

---

## How the face drives the beat

Five drum voices, each triggered by a specific facial expression via MediaPipe FaceLandmarker blendshape scores:

| Face | Emoji | Blendshapes | Drum | Sound |
|------|-------|-------------|------|-------|
| Open mouth | 😮 | `jawOpen` | **KICK** | Deep sine boom + click transient |
| Raised eyebrows | 🤨 | `browInnerUp`, `browOuterUpLeft/R` | **HI-HAT** | High-passed noise tick |
| Big smile | 😁 | `mouthSmileLeft` + `mouthSmileRight` | **SHAKER/CLAP** | Double-layer bandpassed noise sparkle |
| Puffed cheeks | 😗 | `cheekPuff` | **TOM** | Lower pitch-enveloped sine pop |
| Deliberate blink/wink | 😉 | `eyeBlinkLeft` + `eyeBlinkRight` (both high) | **RIM** | Short bandpassed click tick |

### Threshold and smoothing

- Each blendshape score (0..1) is **EMA-smoothed** (α = 0.25) each frame so jittery micro-expressions don't fire the drum constantly.
- **Rising-edge detection**: a drum triggers only when the smoothed score crosses *above* the threshold (not while it stays above).
- **Per-voice cooldown** (180–350 ms) prevents a held expression from machine-gunning.
- The rim/blink threshold is set high (0.55) so normal blinking doesn't constantly fire.

### Quantized to the groove

Every triggered hit is placed into a pending queue. The **look-ahead scheduler** (25 ms `setInterval`, schedules 100 ms ahead) picks up pending hits at the next 16th-note grid slot of the steady 100 BPM groove clock. The result: even a flailing toddler's random face movements lock into a musical beat. This is the same quantization technique used in the lab's 419-kids-body-band piece.

A soft always-on backbone (quiet kick on beat 1, tom on beat 3, hat pulse) keeps the groove alive even when no faces are detected, so the piece always sounds musical.

---

## Why rhythm, not tuning

Previous Resonance face pieces (413-kids-mouth-mirror, 393-kids-vowel-color) mapped LPC formants or landmark geometry to pitched frequencies — the face controlled *melody*. Here:

- All five drum voices are **purely percussive**: sines use pitch envelopes only for thump character (not musical pitch), noise is shaped by filters for timbre (not tone).
- No note, no scale, no chord is implied or possible.
- The groove clock ensures temporal structure comes from **time**, not frequency.
- A 4-year-old making a funny face creates **rhythm**, not a tune.

---

## Audio (Web Audio API, `audio.ts`)

- **Kick**: 150→45 Hz pitch-enveloped sine + highpassed noise click transient
- **Hat**: short highpassed (>8 kHz) noise burst
- **Shaker/Clap**: two bandpassed noise layers (1.1 kHz + 3.2 kHz) 22 ms apart + bright shimmer
- **Tom**: 100→55 Hz pitch-enveloped sine (softer, deeper than kick)
- **Rim**: short bandpassed (800–2 kHz) noise tick

All voices summed through:
`voices → DynamicsCompressor (-8 dB threshold, 12:1 ratio) → master GainNode (0.6) → destination`

The limiter ensures it **can never blast small ears**, even on maximum hit density.

---

## Visuals (raw WebGL2, `page.tsx`)

- **Fullscreen quad** renders the mirrored webcam frame as a WebGL2 texture (flipped X so it's a mirror).
- On each drum hit: a colored **radial Gaussian glow** (soft sparkle) is drawn additively at the face region anchor point (mouth, brow, cheek, eye). Additive blending means multiple simultaneous hits blend together without harsh clipping.
- **No Canvas2D, no SVG, no three.js** — everything is raw `WebGL2RenderingContext` with hand-written GLSL shaders.
- Seizure-safe: glows are soft radial fades, never harsh white strobes or full-screen flashes.
- DPR-aware: canvas is resized to `clientWidth × devicePixelRatio` each frame.

---

## Graceful degradation

| Failure | Behaviour |
|---------|-----------|
| Camera denied / absent | `text-rose-300` notice + ghost face auto-demo starts within ~2s |
| MediaPipe CDN fails to load | Falls back to ghost demo + tappable drum pads (≥64px) |
| Detected but still face (>4s) | Ghost face blendshapes feed the same detector, play a beat |
| WebGL2 unavailable | `text-rose-300` notice; audio + tap pads still work |

The **ghost face** is a pre-programmed 2-bar pattern (32 steps at 100 BPM) that emits synthetic blendshape arrays through the *exact same* `FaceDetector` + `Groove` path as real camera data. There is zero special-casing — the reviewer always hears a beat within ~2s of pressing Start regardless of camera or network access.

---

## Privacy

The camera stream is piped to MediaPipe's `detectForVideo()` only. **No frames are recorded, stored, transmitted, or displayed directly** — the WebGL canvas shows a dimmed copy rendered via a texture upload, analysis-only. MediaPipe inference runs entirely in the browser (WASM + WebAssembly).

---

## References

- **Expotion** (arXiv:2507.04955, 2025) — facial-expression music control; the key reference for face→music mapping
- **Ekman & Friesen** — Facial Action Coding System (FACS), 1978; the scientific basis for blendshape naming
- **MediaPipe FaceLandmarker** — Google, 2023; 52 blendshape scores per face per frame
- **Daniel Rozin** — soft-mirror lineage (Wooden Mirror 1999; Shiny Balls Mirror 2003): camera-as-instrument, the viewer's body as the brush
- **Chris Wilson** — "A Tale of Two Clocks" (Web Audio scheduler pattern) — look-ahead scheduling for tight Web Audio timing

---

## Build notes

- `"use client"` — Next.js App Router client component
- No new npm dependencies — MediaPipe loaded via CDN `import()` with `webpackIgnore`
- Self-contained: no imports from other dream folders
- **Build-verified, not browser-verified** — the code compiles cleanly under Next.js + TypeScript strict + ESLint `next/core-web-vitals`; WebGL2 + camera access require a real browser environment to test end-to-end
