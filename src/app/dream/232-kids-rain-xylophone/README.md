# 232 — Rain Xylophone

**For**: kids (4+)  
**Cycle**: 266 (2026-06-01)  
**Status**: demoable  
**Zero permissions · Zero API · Zero deps**

---

## What it is

Coloured raindrops fall from the top of the screen toward BANDIMAL xylophone bars at the bottom.

- **Tap a falling drop** → big bell note + 20-sparkle burst + bar flashes brightly
- **Let it land** → quiet bell note + 10-sparkle splash + bar flashes softly
- **Tap a bar directly** → note + sparkles, any time

Two demo drops auto-spawn at load; a new drop appears every 1.5 seconds automatically.

---

## Design decisions

**Chase mechanic is new in the kids zone.** All 231 prior kids prototypes respond to WHERE you tap. This one challenges WHETHER you catch a moving target before it lands. After a few catches a 4yo starts aiming for the drops rather than the bars — the physics teaches the mechanic without any instruction.

**Three feedback tiers**: catch (loud, 20 sparks), uncaught land (quiet, 10 sparks), bar tap (medium, 10 sparks). The difference is immediately perceptible. The child optimises toward catches without score counters or explanations.

**BANDIMAL layout**: left bar is C3/violet/tallest, right is C4/cyan/shortest. Bigger = lower = left. The physical analogy teaches itself.

**Gentle gravity drift**: drops drift toward their column center at 5%/frame. Makes the catch zone predictable while keeping a satisfying arc. Fall time ≈ 3–4 seconds — generous for 4yo motor control.

**Pentatonic notes only** (C3, E3, G3, A3, C4): no wrong catches, no dissonance.

**Ambient pad** (C3 + G3 sine, gain ≈0.006/0.004): space feels alive before first tap; sound never goes fully silent.

---

## Audio

Bell timbre: triangle oscillator at fundamental + inharmonic 2nd partial at ×2.756 (Bessel zero ratio, same as membrane-drum and crystal-song). Short 6ms attack, 1.0–1.8s exponential decay.

---

## Inspired by

- `169-kids-marble-run` ❤️ — falling physics = music
- `83-kids-tilt-rain` ❤️ — rain + catching mechanic
- `166-kids-lantern` ❤️ — journey + reward at destination
- `202-membrane-drum` — Bessel inharmonic partial ratio for ×2.756
