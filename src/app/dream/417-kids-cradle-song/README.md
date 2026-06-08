**For**: kids (4+)

# 417 — Kids Cradle Song

> "What if you could close your eyes, rock, and a tiny companion rocked with you — humming you down to sleep — with almost NOTHING on the screen?"

---

## How to use (no reading needed)

1. Put on headphones.
2. Tap **Begin**.
3. Rock the tablet gently side to side — like rocking a baby.
4. Close your eyes. Listen. The humming voice will find your rhythm and slowly, quietly, lead you toward sleep.

That's everything. No buttons to press. No pictures to watch. Just rocking and listening.

---

## What is happening (for grown-ups)

### The one question

**Can a device feel when you're rocking and hum along — slowing down gently, like a parent soothing a child to sleep?**

### Input

The tablet's accelerometer (DeviceMotion `accelerationIncludingGravity.x`) detects the slow side-to-side tilt of rocking. A low-pass filter (τ ≈ 150 ms) smooths out jitter and extracts the gravity component. Zero-crossings of the filtered signal estimate the rocking period.

**Fallbacks:**
- If motion permission is denied: drag left-right across the screen to simulate rocking.
- If no input is detected within 2.5 seconds: **auto-demo mode** synthesises a gentle 0.82 Hz rock automatically — a reviewer with no sensor hears the full experience hands-free.

### The Kuramoto phase-coupling engine (`entrain.ts`)

The core technique is a **Kuramoto-style single oscillator phase-coupling** model:

```
dθ_music/dt = ω(t) + K · sin(θ_rock − θ_music)
```

- **θ_music** — phase of the companion's hum oscillator (radians)
- **θ_rock** — phase of the detected rocking motion
- **ω(t)** — companion's *natural frequency*, which drifts **downward** over the 12-minute session from ~60 cycles/min to ~45 cycles/min (exponential ease)
- **K = 0.55** — coupling constant: firm enough to lock within ~4 rocks, gentle enough to never jar

This is a genuine coupled-phase model. The `sin(Δθ)` non-linearity means:
- Near phase-lock (Δθ ≈ 0): strong correction, stable lock.
- Far from lock: correction saturates smoothly — no discontinuities, no jarring jumps.

Because ω slowly drifts *below* the child's current rocking rate, the companion gently **leads** — the child's nervous system tends to entrain downward, slowing the rock toward sleep.

### Sound design

- **Companion voice**: additive synthesis — fundamental sine + triangle harmonic + sine overtone, shaped by two bandpass filters (formants at ~680 Hz and ~1150 Hz) for a soft, vowel-like "aah/ooh" timbre. NOT sampled, NOT AI — pure Web Audio oscillators.
- **Hum phrase**: 3-note whole-tone arpeggio (C3 → E3 → G#3) repeated each rocking cycle.
- **Tonality**: **whole-tone scale, just-intonation ratios** (1, 9/8, 5/4, 45/32, 25/16 …). Explicitly NOT D-Dorian.
- **Low drone**: triangle oscillators at C3 + E3, fading in slowly over the first few seconds.
- **Stereo sway**: a `StereoPannerNode` oscillates ±0.35 in time with the companion phase — the voice gently rocks left-right in the headphones.
- **Reverb**: a synthetic impulse response (exponential-decay noise) generated entirely in code via `ConvolverNode`.
- **Safety limiter**: a `DynamicsCompressor` (threshold −8 dB, ratio 12:1, attack 1 ms) followed by a master gain node prevents any transient from exceeding safe levels. All envelopes use `setTargetAtTime` for smooth attack/release — no pops, no clicks.
- **Optional haptic**: `navigator.vibrate(30)` on each rock cycle (iOS Safari ignores this; Android may pulse gently).
- **Fade to silence**: after 12 minutes the drone fades out and the app transitions to a quiet "Goodnight" screen.

### Visual design

Near-black background (`#030306`). The **only visual element** is a single faint breathing dot (a div with a radial-gradient glow) that pulses gently with the companion's phase. Its opacity ranges from ~0.12 to ~0.32 — just enough to confirm the app is alive. No canvas, no SVG, no WebGL, no animation libraries.

---

## Named references

- **Yoshiki Kuramoto (1975)** — Coupled non-linear oscillators; the sin(Δθ) phase-coupling equation used here. *Lect. Notes Phys.* 39, 420–422.
- **Moens, Leman et al. (~2014)** — D-Jogger: adaptive music player that entrains to the listener's walking rhythm and leads the cadence.
- **Hove et al.** — Interactive rhythmic auditory stimulation for gait and sensorimotor synchronisation.
- **Pauline Oliveros, *Deep Listening* (2005)** — The philosophical foundation for audio-first, eyes-closed experiential design. Sound as the primary sensory channel.
- **Repp, B.H. (2005)** — "Sensorimotor synchronization: A review of the tapping literature." *Psychon. Bull. Rev.* 12(6), 969–992. — empirical grounding for phase-coupling entrainment in humans.

---

## Notes

**Headphones strongly recommended** — the stereo sway panning and soft drone are much more effective in headphones than speakers, and the intimate low-level design can be lost to room noise.

**Unverified surface**: This prototype has been build-verified (TypeScript compilation, ESLint) but has not been tested on a physical device with a live DeviceMotion sensor or real audio output. The Kuramoto coupling, hum synthesis, and auto-demo logic are verified at the code level only.
