# Bubble Bath

**For**: kids (4+)  
**Route**: `/dream/205-kids-bubble-bath`  
**Status**: `demoable`  
**Cycle**: 238

Tap anywhere to blow a soap bubble. Bubbles drift upward slowly. When two bubbles overlap, both their notes play together as a harmony chord — a brief white glow marks the contact point. Bubbles pop at the top of the canvas with a sparkle burst and a bell chime.

## What's new

**First kids prototype where harmony arises from spatial proximity** — not from designing a chord or pressing two specific buttons, but from where floating objects happen to meet. A child tapping two bubbles nearby will hear them harmonize as they drift together. Multiple taps in one area create a cluster of harmonic chimes.

Contrast with:
- `133-kids-ripple-pond` (❤️) — ripple *rings* meet → chord (transient collision)
- `162-kids-bubble-pop` — tap/drag to *destroy* bubbles (destruction is the musical act)
- `109-kids-bounce-notes` — physics drives notes, no spatial harmony

Here the bubble is a *sustained entity*: it floats for ~15–30 seconds, making it a player in the acoustic field. Two taps placed close together guarantee harmony quickly; taps far apart rarely meet.

## Sound design

- **Spawn**: triangle oscillator, 25ms attack, 0.85s exponential decay, gain 0.13
- **Chord** (collision): two triangle oscillators (both pitches), 1.4s decay, gain 0.08 — softer than spawn to avoid loudness on repeated collisions
- **Pop** (exit top): bell pair — fundamental ×2 + ×4 octave, 1.1s and 0.55s decays
- **Ambient**: C3 + G3 sine pad at gain 0.006, from first tap

Chord fires once per pair collision onset (tracked via `colPairs` Set keyed by min/max bubble ID). If two bubbles separate and re-converge, the chord fires again.

## Visual details

Each bubble has: translucent colored fill, colored rim with outer glow (shadowBlur), an iridescent inner ring (shifted hue), and two radial-gradient highlights simulating soap bubble optics (top-left crescent + small bottom glint). The body wobbles gently via `sin(ts × 0.0018 + phase)` applied to the radius (±2.5 px), each bubble at its own phase.

## Pitch / color mapping

| Zone (X position) | Pitch | Hue | Radius |
|-------------------|-------|-----|--------|
| far left          | C3    | violet (270°) | 60 px |
| left-center       | E3    | emerald (160°) | 52 px |
| center            | G3    | amber (42°)   | 44 px |
| right-center      | A3    | rose (345°)   | 38 px |
| far right         | C4    | cyan (195°)   | 32 px |

BANDIMAL rule: bigger = lower pitch.

## Polish ideas

- Mic mode: RMS amplitude → bubble spawn rate (louder playing → more bubbles appear)
- Bubble drift direction randomized ±5° from vertical for organic paths
- Magnetic attraction: bubbles slowly drift toward each other when within 1.5× combined radius (makes chords happen more organically without extra taps)
- Color chase: when two bubbles collide, they briefly swap a small percentage of their hue (soap bubbles iridescently take on neighboring colors)
