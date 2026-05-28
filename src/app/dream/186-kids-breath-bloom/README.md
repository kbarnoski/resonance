# Breath Bloom

**For**: kids (3+), also adults seeking calm · Cycle 218

## What it is

A breathing flower. Five glowing petals arranged in a circle — each one a note in the
C-major pentatonic scale (C3 / E3 / G3 / A3 / C4). Each petal breathes autonomously:
expanding slowly on inhale (4.5s), contracting on exhale (4.5s). The petals are
staggered so they don't all peak together — the wave motion ripples around the flower
perpetually, even before the first tap.

Tap any petal → sparkle burst + that note pulses louder for ~1.5s before settling back
into the breath rhythm. Tap the open canvas → all five petals bloom at once.

Audio starts on first tap (Web Audio autoplay policy). Before that: silent visual breathing.

## Sound spec

- Five triangle-wave oscillators at C3 / E3 / G3 / A3 / C4
- Shared 3.5s impulse-response reverb (exponential decay noise, stereo)
- Gain per oscillator follows the per-petal cosine breath phase (peak ~0.22 continuous)
- On petal tap: spike to 0.42, exponential decay τ=0.55s
- On open-canvas tap (all-bloom): spike to 0.20 all channels, τ=0.50s
- Stagger: each petal's offset = (index / 5) × 9.0s × 0.35 — visible wave around the ring

## Design principles applied (KIDS.md)

- **Immediate response** (rule 3): sparkle + note within one rAF frame (~16ms) of tap
- **No "wrong"** (rule 4): every tap produces a reward; all notes are pentatonic
- **Safe sounds** (rule 7): no sudden loud transients; continuous gain ≤0.22, tap peak ≤0.42
- **Looping ambient** (rule 6): the breath cycle never stops; gap between notes ≤ half the cycle
- **Tap targets ≥64px** (rule 2): hit radius is 45% of minDimension, covering the entire flower area
- **No reading required** (rule 1): hint text is optional decoration, not a gate

## Design lineage

- `166-kids-lantern` ❤️ — dark canvas, glowing objects that beckon before first touch
- `133-kids-ripple-pond` ❤️ — circular spatial arrangement, wave motion
- `182-kids-crystal-song` — autonomous shimmer before first touch, glass-bell sustained tones
- `116-kids-bloom-garden` — slow emergence as the interaction mode; flowers as musical units
- KIDS.md "breathing with music" seed (proposed in Cycle 217 STATE.md)

## What's new about this prototype

**First prototype where the system breathes before any interaction.** All 185 prior prototypes
are either fully static (tap to begin) or start their autonomous motion after first touch. Breath
Bloom breathes from the moment the route loads. A child opens the URL and sees the flower already
alive — no "start" required. The first tap changes the sound but not the visual rhythm, which
continues uninterrupted.

The staggered wave is the key design insight: each petal's phase is offset by (i / N) × 35% of
the cycle. This means the petals never all peak or trough simultaneously — the flower is always
in some intermediate state, always moving. Visually this creates a ripple that feels biological.

## Polish ideas for future cycles

- Mic mode: RMS amplitude from microphone drives breath speed (louder = faster breathing)
- Color-tap variant: each tap cycles the tapped petal through 3 alternate hue families
- Lullaby mode: after 12 minutes the cycle slows to 14s and all notes descend one octave
- Harmonic overtone: +12 semitone partial at 8% gain per oscillator for warmer timbre
- Second ring: 5 additional petals one octave higher (C4–C5), offset 18° from inner ring
