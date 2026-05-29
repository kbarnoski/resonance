# 201 — Glow Worms

**For**: kids (4+)  
**Status**: demoable  
**Cycle**: 234  
**Zero permissions · Zero API · Zero deps**

Three autonomous glowing caterpillars crawl across a dark canvas. Each body segment is a
pentatonic note. Tap any segment to ring it; head plays C4 (high), tail plays C3 (low) —
the BANDIMAL rule applied to a living creature.

## What's new

All prior kids prototypes use tap-targets that are static objects (circles, bars, fish,
jellyfish) or fixed grid cells. Glow Worms is the first where the **instrument is a moving
creature**. The body segments aren't in a fixed place — you have to watch and reach for them.
This creates light physical engagement without any game mechanic or scoring.

Chain-link physics makes the worms undulate as they walk (each segment follows the previous
with a simple distance constraint), so each worm carves a different melodic path across the
screen over time.

## Sound design

- **Synthesis**: triangle oscillator + exponential decay (1.5s). Warm and safe for kids.
- **Pan**: worm 0 = left (−0.52), worm 1 = center, worm 2 = right (+0.52). Three simultaneous
  taps produce a stereo chord that fills the space.
- **Auto-beats**: after first tap, each worm's head rings C4 on its own interval (2.1 / 2.4 /
  2.9s), creating a gentle polyrhythmic background.
- **Ambient pad**: C2 + G2 sine at gain 0.007 — barely audible, prevents "is it broken?" silence.

## Interaction map

| Gesture | Result |
|---------|--------|
| Tap any segment | Ring that segment's note + flash |
| Drag across multiple segments | Arpeggio |
| Tap head segment (cyan) | High C4 |
| Tap tail segment (rose) | Low C3 |
| Wait | Worms auto-beat their heads rhythmically |

## Polish ideas

- Mic mode: RMS amplitude → worm speed (louder playing = worms crawl faster)
- Sparkle burst at tapped segment (16 particles)
- Worm-worm collision: when two worms pass close, they glow brighter + harmonize
- Add a 4th worm (smaller, faster, higher register)
