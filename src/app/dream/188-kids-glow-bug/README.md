# 188 — Glow Bugs

**For**: kids (3+)  
**Built**: Cycle 220 (2026-05-28)  
**Status**: demoable  
**Route**: `/dream/188-kids-glow-bug`

---

## The idea

Five glowing garden lamps sit on stems in a dark garden. Tap anywhere to release a glow-bug — a warm amber firefly. The bug drifts upward with organic sinusoidal flight, attracted to the nearest lamp. When it reaches the lamp: a sparkle burst, a bell-chime note, the lamp glows brighter. Demo bugs auto-spawn every 3.2 seconds so the garden is alive from the first render.

"What if the fireflies brought music to the garden?"

---

## Design decisions

**Why directed flight?** All 187 prior kids prototypes respond to WHERE the user taps (pitch = position) or WHEN (rhythm). This is the first where the interaction creates a *journey* — the bug travels from here to there, and the note fires when it arrives, not when it's released. The 1–2 second flight delay creates anticipation: the child watches the bug move toward its lamp. The note feels like a *completion*, not an immediate reaction. Different emotional register from instant tap feedback.

**BANDIMAL rule applied to lamps.** Bigger lamp = lower pitch (C3 = r32, C4 = r16). The visual difference is clear: the leftmost violet lamp is twice the size of the rightmost sky lamp. After releasing a few bugs, a child discovers "the big purple one makes the deep sound." No labels needed — the size is the lesson.

**Auto-demo before first tap.** Bugs emerge from the soil every 3.2 seconds before the user touches anything. The garden demonstrates its mechanic without instruction: watch two bugs arrive and chime, then imitate. Zero cold-start confusion.

**C-major pentatonic across 5 lamps.** C3, E3, G3, A3, C4. Every combination of simultaneous arrivals is consonant. The child cannot produce dissonance by releasing many bugs at once.

**Nearest-lamp targeting** means tapping near a lamp sends the bug straight to it (the child can aim) while tapping far away produces a more exploratory flight path (the child can be surprised). Both interactions are rewarded.

---

## Audio

- Triangle wave oscillator at lamp pitch
- 2nd harmonic at `freq × 2.013` (slightly detuned for shimmer), gain 0.09
- Exponential decay: fundamental 2.0s, harmonic 1.0s
- Reverb: impulse response (1.4s) via ConvolverNode, shared wet bus at gain 0.30
- Ambient pad: C3 + G3 pure sine at gain 0.012 (barely audible, "garden breathes")

---

## Visual

- Five glowing lamp orbs on thin stems. Lamp radius = BANDIMAL size (32 / 27 / 23 / 19 / 16 px)
- Each lamp: outer radial halo + inner radial gradient orb + CSS shadow blur
- Slow ambient pulse per lamp (`sin(ts × 0.0006 × (1 + i × 0.22))`) so lamps breathe independently
- `glow` state (0→1, decays at −0.020/frame) added on bug arrival for bright flash
- Bugs: two concentric radial gradients (amber outer halo + white core) with additive blending
- Sinusoidal x-drift (`sin(phase) × 0.85`) creates organic non-linear flight
- Arrival sparks: 14 radial particles in lamp color, with gravity + damping

---

## What's new about this prototype

1. **Directed flight as interaction paradigm.** The user releases an agent (bug) that navigates autonomously to a destination. All prior kids prototypes create sound at the interaction point. Here the sound fires at the destination, after a visible journey.

2. **Visual anticipation.** The child sees the bug flying toward the lamp before the note fires. For 1–2 seconds, the outcome is visible but not yet heard. This is the first kids prototype with pre-sound visual anticipation.

3. **Garden as persistent world.** The lamps pulse continuously, bugs emerge from the soil, sparks decay. The scene feels inhabited before and after any interaction. Not just a canvas waiting for input.

---

## Polish ideas (future cycles)

- **Bugs can carry a color.** If the child taps a lamp and then the canvas, the released bug could carry that lamp's color — visual indication of which pitch it will deliver.
- **Sustained glow per lamp.** Count how many bugs have arrived; lamps that have received more bugs glow slightly brighter permanently (the garden gets warmer as more bugs arrive).
- **Multi-tap chord.** Tapping 3 different spots quickly releases 3 bugs to 3 different lamps; they arrive within ~200ms of each other and fire a chord. Could highlight this with a special "chord burst" effect.
- **Night-sky parallax.** Tiny drifting stars in the background, moving slowly with device tilt (if permission granted), adding depth.
