# 513 — Kids Shadow Still

## The One Question

**What if a child's movement in front of the camera pulled a sound apart from its own echo — and going still let the two line up and cancel into a hollow hush?**

---

## How to Play

1. Press **Start**. A continuous shimmer-tone begins playing.
2. **Move** in front of your device's camera — your shadow and its echo-shadow split apart, and the sound fills with a rich swooshy flanging.
3. **Go still** — the shadows slide back together, and the sound hollows toward a near-silent hush.
4. No win, no score. Just explore the space between moving and still.

No camera? The demo runs automatically, cycling through motion → stillness → motion so you hear and see the full arc hands-free.

---

## The Science (kid-framed)

Your voice in a cave always comes back as an echo. Imagine two copies of the same sound playing at once — if they're exactly opposite (one goes up when the other goes down), they cancel each other out and you hear almost nothing. That's called **phase cancellation**.

This piece mixes a tone with a tiny delayed copy of itself. The delay is so small (a fraction of a millisecond) that the two copies are nearly simultaneous. When you're still, the delay slides to *exactly* half a wavelength: the copies are perfectly opposite, and the sound all but disappears. When you move, the delay shifts away from that sweet spot, and the two copies swirl around each other in a "comb filter" — you hear the full, flanging swoosh.

The comb-teeth strip at the bottom shows the sound's spectrum being bitten into deep notches as you hush the sound.

---

## The Comb Filter / Flanging Mechanism

A **comb filter** is what you get when you add a signal to a slightly delayed copy of itself. The frequency response looks like a comb: spikes at multiples of `1/delay`, with deep notches in between. When you set the delay to `1/(2·f₀)` for a fundamental frequency f₀, the fundamental falls right in a notch — near-silence.

Flanging (the classic tape-flange effect) is just a slowly varying comb filter, achieved by slowly modulating the delay time — exactly what this piece does in response to body motion.

---

## References & Influences

- **Comb filtering / flanging** — foundational DSP; used in every chorus, flanger, and phaser effect. See Julius O. Smith III, *Introduction to Digital Filters* (CCRMA, Stanford).

- **Alvin Lucier — "I Am Sitting in a Room" (1969)** — records a voice repeatedly in a room until the room's resonant frequencies dominate and the speech dissolves. This piece inverts that logic: stillness collapses the resonance to a hollow hush.

- **Pauline Oliveros — Deep Listening** — Oliveros's practice of attending to silence and the space *between* sounds frames stillness not as absence but as a musical state to inhabit. Her instruction scores often use the stillness of a practitioner's body as a generative parameter.

- **Frame-difference motion detection** — the classic webcam-as-controller technique, tracing a lineage from **Myron Krueger's Videoplace (1974)** through **Golan Levin's** real-time video performance works. Computing the per-pixel luminance difference between consecutive frames gives a simple, robust measure of scene motion that avoids the computational cost of ML-based pose detection.

---

## Subsystems

| Module | Description |
|---|---|
| `page.tsx` | Single-file React component; all UI, animation loop, and wiring |
| Offscreen `<canvas>` | Created inside `makeMotionDetector()`, 64×48, never displayed — only used to `drawImage(video)` then `getImageData()` for frame-diff |
| `buildAudioRig()` | Web Audio: 3-partial shimmer source → comb filter (dry + DelayNode copy + feedback) → lowpass ≤ 8 kHz → DynamicsCompressor → master gain ≤ 0.45 |
| `makeMotionDetector()` | Requests camera, ticks every frame, computes smoothed energy from mean absolute luminance diff |
| SVG `runFrame()` loop | `requestAnimationFrame` loop that reads energy, updates delay, computes comb bars, mutates SVG element attributes directly (no React state updates per frame) |
| Auto-demo | Sinusoidal "motion energy" oscillation (period ~4.8 s) that drives the same comb filter when no real motion is detected — runs on load, resumes after idle |

---

## Honest "Unverified Surface" Note

This prototype was built without live browser testing. The following are first-guess parameters that may need tuning:

- **Frame-diff threshold** (currently `/ (64 × 48 × 30)`): may need scaling depending on actual camera contrast and frame rate. If the demo never exits auto-demo when moving, lower the divisor; if it's too noisy, raise it.
- **Motion smoothing** (`MOTION_SMOOTH = 0.08`): controls how quickly the energy tracks actual motion. 0.08 is a first guess.
- **Anti-phase delay target** (`1 / (2 * BASE_FREQ) ≈ 4.5 ms`): correct for 110 Hz fundamental, but the hush depth also depends on the harmonic content and feedback gain. Adjusting `feedbackGain.gain.value` changes how deep the notches bite.
- **iOS AudioContext unlock**: wired to the Start button `onPointerDown` handler as required, but not browser-tested.

---

*Resonance dream lab — prototype 513*
