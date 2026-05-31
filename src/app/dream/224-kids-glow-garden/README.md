# Glow Garden

**For**: kids (4+)  
**Route**: `/dream/224-kids-glow-garden`  
**Status**: `demoable`  
**Cycle**: 258

## What it answers

*What if a child's garden layout was also their musical composition?*

Planting two flowers near each other is a musical act — not just a visual one. WHERE you put each flower determines which pairs resonate, which intervals form, and what the garden sounds like. The spatial arrangement IS the chord chart.

## How it works

- **Tap anywhere** → a glowing flower grows from the soil over 1.4 seconds. As it grows, its stem extends upward and 6 petals unfurl.
- **Each flower sings** a sustained pentatonic note (C3 → C4 from left to right). BANDIMAL sizing: biggest flower = lowest pitch (violet C3), smallest = highest (rose C4).
- **Plant two flowers within 34% of the canvas width** → a glowing arc connects their heads, both flowers brighten, and a 3-note resonance chord rings out (both pitches + the perfect fifth above the lower note).
- **Tap a flower head** to remove it (generous tap radius for small fingers).
- Up to 7 flowers simultaneously. When the 8th is planted, the oldest is evicted.

## Audio design

- **Sustained tone**: triangle oscillator, gain 0.055, fades in over the grow time so the flower appears to "wake up" musically.
- **Resonance chime**: three sine waves — hz1 + hz2 + (lower × 1.5) — short exponential decay over 2.4 s. The third tone is a perfect fifth above the lower flower, creating a stable consonant triad.
- **Ambient pad**: C2 + G2 sine drones at gain ~0.010 — the "garden's breath," barely audible, makes the canvas feel inhabited before first tap.
- AudioContext created on first user gesture. Demo flowers planted at 900 ms and 1600 ms are visual-only until the first tap, which retroactively starts their audio and fires the resonance chime.

## Loved signals that influenced this build

- `111-kids-shape-loop` ❤️ — spatial composition: where you draw shapes determines how the loop sounds. Glow Garden applies the same principle to flower placement.
- `160-kids-paint-loop` ❤️ — multiple simultaneous looping voices that the child constructs; garden flowers are the same but persistent + position-determined.
- `140-kids-string-bridge` ❤️ — proximity as a musical parameter; Glow Garden is the non-contact version (flower proximity instead of finger distance).
- `133-kids-ripple-pond` ❤️ — spatial tap → musical event; Glow Garden adds permanence (flowers stay) and social structure (the pair relationship).

## What's new

No prior kids prototype creates harmony through **the spatial layout of placed objects**. Prior proximity prototypes:
- `149-kids-color-mix`: you drag circles INTO each other — active, transient, no persistence
- `205-kids-bubble-bath`: bubbles drift INTO each other — passive, physics-driven, not composable

Glow Garden is the first where the child intentionally places objects (flowers) and the ARRANGEMENT determines the music. It's a spatial score.

## Polish ideas for future cycles

- **Pollen drift**: tiny sparkle particles drift along the resonance arc between close flowers.
- **Bloom-from-seed animation**: brief Bézier arc of a "seed falling" from tap point before the stem grows.
- **Zone glow on soil**: the soil strip under a zone glows with that zone's color when a flower of that pitch is growing there.
- **Multi-touch**: two fingers = two simultaneous flower plants, creating an instant pair.
- **Season timer**: after 3 minutes, all flowers slowly fade to black (winter), then the canvas resets for a new garden.
