**For**: kids (4+)

# 866 · Rainstick Sky 🌧️✨

> "What if a 4-year-old could make a calm rainstorm of music by gently **shaking**
> the tablet like a rainstick — and **stillness** settles it into a sleepy drone of
> glowing stars?"

This is the lab's **calm bedtime** kids piece. There are no wrong notes, no
fail states, and it is never silent. Hold the tablet and shake it gently — soft
rain falls and warm pentatonic wind‑chime / marimba droplets sprinkle down. The
harder/faster you shake, the **denser** the rain (more droplets per second) but
**never louder or harsher** — the safe sound envelope is fixed. Hold still and the
rain thins to a few slow drops over a warm low drone, while the screen fills with
slowly drifting glowing stars: a sleepy "goodnight."

## Controls (no reading required)

- **Tap the glowing cloud** to start (one big ≥72px button; creates audio + asks
  for motion permission inside the tap, as iOS requires).
- **Shake the tablet gently** → more rain, more chimes. The on‑screen color meter
  goes indigo → violet → warm gold as it gets busier. Color is the language.
- **Hold still** → rain thins, stars drift, the drone settles. Sleepy.
- **No sensor / desktop?** Drag a finger across the sky to "shake" it, and an
  **auto‑demo** makes the rain fall + chime + drift on its own within ~1 second so
  a reviewer always both sees and hears it.

## The auditable safe‑envelope design

Input (shake) is bounded **deterministically** so it can *never* become harsh.
The accelerometer drives **only**:

- **rain density** — `densityToRate()` maps shake‑energy 0→1 to ~1.2→14 droplets/sec
  (hard‑capped); and
- **drift / sparkle** in the particle field.

It does **not** touch loudness or brightness of tone. Every voice runs through one
fixed, auditable chain:

```
voice → masterGain (≤0.28) → BiquadFilter lowpass (≤6.5 kHz)
      → DynamicsCompressor(threshold −10 dB, ratio 20:1) → destination
```

Soft attacks ≥40 ms, warm sine partials only, droplets snapped to a **C pentatonic**
(no wrong notes), plus an always‑on warm drone (C2 + G2 + C3) so it is never silent.
A hard shake just makes *more* gentle drops, not *louder* ones. The `AnalyserNode`
is tapped off the master and is **never** routed to `destination`.

## How shake is detected (not tilt)

`DeviceMotionEvent.accelerationIncludingGravity` (falling back to `acceleration`)
is sampled, and shake‑energy is the **jerk** = magnitude of the *change* in
acceleration between samples (a high‑pass of accel magnitude), then smoothed with a
fast attack / slow release so stillness gently settles. This is deliberately
distinct from device‑orientation **tilt**.

## Subsystems (ambition criterion #2 — ≥3)

1. **DeviceMotion shake‑detection** (jerk/high‑pass energy → 0..1, smoothed).
2. **Rain‑density granular chime scheduler** (density → droplets/sec, pentatonic
   marimba/bell voices on the fixed safe envelope).
3. **WGSL `@compute` particle rain** — 60k falling raindrop/star particles
   integrated each frame on the GPU (gravity + gentle curl wind + wrap‑around),
   rendered as additive glowing point‑quads in a cool‑night → warm‑gold palette.
4. **WebGL2 fallback** — a hand‑written ~3k‑particle GLSL version on the *same*
   shake→density mapping.

## How it degrades (criterion: glance‑able unattended)

- `navigator.gpu` / adapter / device unavailable → **WebGL2** point‑sprite rain on
  the identical mapping; **audio keeps playing**.
- WebGL2 also null → a `text-rose-300` notice ("the rain is still playing"), and
  **audio still keeps running** — never a dead screen.
- No motion sensor / permission denied / desktop → pointer "shake" affordance **plus**
  an auto‑demo that rains + chimes on its own within ~1s. All failure notices use
  visible `text-rose-300`, never dim opacity.
- The main visual is **never** Canvas2D and never three.js — raw WGSL + GLSL by hand.

Full teardown on unmount: cancels rAF, removes the `devicemotion` listener, stops
the drone oscillators, destroys the `GPUDevice` (or `WEBGL_lose_context`), and
closes the `AudioContext`.

## Named references

- **Chilean rainstick / *palo de agua*** — Exploratorium, *"Make Your Own Rainstick"*:
  random clicks as falling grains strike interior pins. The droplet scheduler is the
  audio analogue — stochastic warm clicks whose *rate* follows the shake.
- **arXiv 2602.22813 (Feb 2026), *"Input–Envelope–Output: Auditable Generative Music
  Rewards in Sensory‑Sensitive Contexts."*** The *auditable safe‑envelope* framing:
  the shake input is bounded deterministically by a fixed safe envelope so the output
  can never become harsh — which is exactly this piece's safety design.
- **Brian Eno**‑style generative ambient — the always‑on, slowly evolving still drone
  that the piece settles into.
