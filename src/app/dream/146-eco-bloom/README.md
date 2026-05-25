# Eco Bloom — procedural rainforest

**For**: adults / all ages
**Route**: `/dream/146-eco-bloom`
**Status**: `demoable`
**Cycle**: 173
**Question**: "What does a Resonance journey sound like before the human starts playing?"

---

## What it does

Three tree species grow simultaneously from seeds at the canvas bottom. Each is an L-system (recursive branching structure) with species-specific parameters:

| Species | Branch angle | Max depth | Character |
|---------|-------------|-----------|-----------|
| 0 (deep green) | 20° | 6 | Tall, narrow — like a conifer |
| 1 (yellow-green) | 30° | 5 | Medium spread — deciduous |
| 2 (amber-green) | 40° | 4 | Short, broad — like an oak |

As each branch segment unfolds, it plays a **Karplus-Strong pluck** — a physical model of a plucked string using a delay-line feedback loop. Depth maps to pitch: shallow branches = lower register (C3–C4), deep terminal twigs = higher (C4–C5). All pitches are C-major pentatonic, so the evolving forest is always consonant.

Leaf clusters accumulate at terminal branches, slowly rotating as if in wind.

## Audio layers

1. **Root resonance**: C1 sine (32.7 Hz) — felt rather than heard. 0.08 Hz LFO on gain creates a subtle breath.
2. **Branch plucks**: Karplus-Strong on each new segment. Three trees = three-voice polyphony.
3. **Wind**: brown noise through a bandpass filter, fades in over ~28 seconds as the canopy fills.
4. **Rain** (toggle): white noise through a lowpass at 1.1 kHz. Toggle the Rain button.
5. **Bird calls** (toggle): every 8 seconds, a rapid 5-note pentatonic arpeggio — like a bird call from the canopy. Appears after ~18 seconds.

## Interaction

- **Tap canvas** to plant a new tree (up to 6 simultaneous).
- **Clear** removes all trees and starts fresh with 3 new seeds.
- Trees are deterministic: each seed value produces the same tree structure every time.

## Design notes

**Patient growth as the primary metaphor.** 142 prototypes existed before this one; none treated slow, accumulating growth as the central musical idea. Eco Bloom rewards watching. You plant once and step back.

**Inspired by Refik Anadol's DATALAND: Machine Dreams: Rainforest** (Los Angeles, opening June 20, 2026 — 26 days away at time of build). Anadol uses ecological data — birdsongs, plant growth patterns, weather — as generative material for large-scale data sculptures. Eco Bloom is a browser-native interpretation: the biological patterns of tree branching become the musical pattern directly.

**Karplus-Strong** (1983) is the simplest physical model that still sounds organic. A delay line seeded with noise, with a lowpass feedback path — the "string" rings at the natural resonant frequency of the delay line (1/frequency seconds). Here we build 10 AudioBuffers at startup (5 pitches × 2 octaves) and reuse them on each pluck, keeping the rAF loop allocation-free.

**tBirth-relative timing**: each tree tracks its own `startedAt` time, so newly planted or cleared trees always grow from zero — no instant-appearance when the canvas has been running for 30+ seconds.

## Polish ideas for future cycles

- Mic mode: bass energy → growth rate multiplier; onset → immediate bird call
- Fog/mist layer: perlin-noise-driven translucent overlay at canopy level
- Day/night cycle: background slowly brightens then dims over ~90 seconds, shifting canopy hue
- Second tree row: smaller trees in the foreground parallax layer
- Rainfall particles: animated white specks falling when rain is enabled
