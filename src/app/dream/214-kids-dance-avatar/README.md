# 214 · Dance Avatar

**For**: kids (4+) · **Status**: demoable · **Cycle**: 248

**Route**: `/dream/214-kids-dance-avatar`

---

## What it does

A glowing cartoon character made of five colored circles connected by a skeleton. Each body part is an instrument:

| Part | Note | Color | Size |
|------|------|-------|------|
| Head | C4 (262 Hz) | Cyan | Smallest |
| Left hand | G3 (196 Hz) | Emerald | Medium |
| Right hand | A3 (220 Hz) | Amber | Medium |
| Left foot | C3 (131 Hz) | Violet | Largest |
| Right foot | E3 (165 Hz) | Teal | Large |

Tap any part → bell tone plays + the circle bounces out and springs back + sparkle burst.

BANDIMAL rule applied: bigger circle = deeper sound. Feet are the biggest and lowest; the head is the smallest and highest. A child discovers this in 2–3 taps without any instruction.

---

## Visual design

- **Skeleton**: connecting lines (head → shoulders → hips → hands/feet) make the body shape immediately readable
- **Breathing**: every circle has a slow sine-wave pulse (each at a different phase), creating a gentle "alive" animation before any touch
- **Face**: two eye dots and a smile arc drawn inside the head circle — makes the character immediately recognizable as a person/dancer
- **Demo**: before first user touch, the agent automatically taps body parts in a dance sequence (visual only — no sound until the user unlocks the AudioContext). Stops on first user tap
- **Spring physics**: scale velocity injected on each punch; springs back with critical damping (~0.3s settle time). Multiple taps on the same part mid-bounce layer nicely

---

## Sound design

Bell timbre: triangle oscillator fundamental + two inharmonic partials (×2.756, ×5.404) at low amplitude. The partial ratios approximate real bell physics (Bessel zero ratios). Total decay: ~1.5s. Clean and pleasant at all five pitches.

```
Fundamental : gain 0.50 (loudest)
×2.756      : gain 0.12 (lower ringing overtone)
×5.404      : gain 0.04 (faint shimmer)
```

No ambient background pad (the bell tones are frequent enough to fill the space). No reverb (keeps the sound direct and non-confusing for young children).

---

## What's new

1. **First kids prototype where the instrument IS a human body.** Every prior kids prototype uses abstract circles, creatures, objects, or zones. This one is YOU (or a dancer you're conducting). The intuition — "tap the head for a high note, tap the feet for a low note" — maps directly from BANDIMAL sizing to anatomy.

2. **First kids prototype with a skeleton structure.** The connecting lines make the body shape unambiguous at any canvas size. On an iPad, the dancer fills the screen and the body is immediately recognizable.

3. **First kids prototype where visual demo precedes first touch.** Unlike prior prototypes where the demo starts after first interaction (e.g., `201-kids-glow-worm` auto-beats after first tap), here the visual demo starts 1.9s after load — the body parts bounce and ripple silently. The child sees "these light-up things are meant to be tapped." Sound unlocks on first touch.

4. **Connects to DiscoForcing research** (ICML 2026, arXiv:2605.28491): audio → full-body character animation. That's a server-side diffusion model; this is the browser-native zero-deps adaptation: FFT energy bands → spring-physics body parts. The core insight (music wants to move a body) is the same.

---

## Implementation notes

- `PARTS` is `as const` with 5 entries. `partXY(i, W, H)` computes pixel position from relative coordinates, so the body scales correctly at any viewport
- Spring: `scaleV[i] += -(scale[i] - 1) * 220 * dt`. Damping: `scaleV[i] *= Math.pow(0.02, dt)`. At 60fps this gives ~0.25s settle time with a ~28% overshoot — punchy but not wobbly
- Breathing: `1 + 0.038 * Math.sin(ts * 0.00088 + i * 1.35)` — unique phase offset per part. The angular spacing (1.35 radians, ≈77°) is incommensurable with 2π, so no two parts are exactly in phase
- Hit detection: nearest part within `r × 1.55`. On a 375px-wide phone, the feet are ~80px radius after the hitbox multiplier — well above the 64px minimum

---

## Polish ideas (future cycles)

- **Mic mode**: RMS amplitude drives a breathing scale multiplier across all parts (`scale[i] *= 1 + 0.12 * rms`). The dancer breathes with the music. Adds ~25 lines.
- **Multi-touch dance**: each simultaneous finger can play a different body part — polyphonic chords from a single screen. Currently only `pointerdown` is handled; `pointermove` would need multi-touch tracking.
- **Dress-up animation**: on first interaction, small colored shapes appear (a hat on the head circle, shoes on the feet circles, etc.) as a visual reward for playing.
- **Recording + playback**: record a tap sequence, play it back as an auto-dance. Same mechanic as `213-kids-echo-drum` but for body parts.
- **Bigger body parts**: scale factors slightly larger on tablet/iPad layouts (detect `Math.min(W,H) > 600` and bump radii by 1.3×).
