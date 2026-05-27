# 174-kids-raindrop-rhythm

**For**: kids 3+ · Zero permissions · Zero API · Zero deps · ~2.4 kB

## Concept
Three colored clouds hang in a dark night sky. Tap any cloud — a burst of 3-5
glowing raindrops scatter and fall. Each drop drifts gently downward (gravity +
sine wobble). When it hits the water surface, it rings a bell note and leaves an
expanding ripple. Tap a cloud and hold for continuous rain. Auto-rain cycles
through the three clouds every second so the canvas is never silent.

"The note plays when the drop lands, not when you tap."

## Audio
- Violet cloud → **C3** (130.81 Hz) — low, warm
- Amber cloud  → **G3** (196 Hz)   — mid, bright
- Rose cloud   → **C4** (261.63 Hz) — high, clear

C3 + G3 + C4 form a C major arpeggio. Any combination of clouds sounds consonant.
Waveform: triangle wave, bell-like envelope (8ms attack, ~1.8s exponential decay).
Ambient pad: C3 + G3 sine drones, barely audible, fade in over 2.5s.

## Interaction
- **Tap** a cloud → burst of 3-5 drops
- **Hold** a cloud → continuous rain (one drop per 200ms)
- Auto-rain: 1 drop/second cycles through the three clouds (visual from start;
  audio starts after first tap, browser policy)
- Drop falls with gravity (280 px/s²) + sine horizontal drift (±12 px)
- **Landing = the note** — gravity delay (~0.5-0.9s) teaches cause-and-effect
  with temporal separation

## Visual
- Deep navy background (#070714), 28 twinkling background stars
- Teardrop-shaped drops: circle + upward tail, glow shadow
- Water surface: blue gradient strip at 82% canvas height
- Expanding ripple rings at each landing point
- Clouds: three overlapping circles + filled base, glow flashes on tap

## Design lineage
| Principle | Seen in |
|-----------|---------|
| Landing is the musical event | `133-kids-ripple-pond` ❤️, `171-kids-snow-globe` |
| Physics delay = pedagogy | `133-kids-ripple-pond` ❤️, `143-kids-seed-song` |
| Three-voice polyphony from simple gestures | `133-kids-ripple-pond` ❤️ |
| Construction/action → consequence | `169-kids-marble-run` ❤️ |

Extends the loved "tap → physics → note" lineage. Different from marble-run
(construction) and snow-globe (scatter) — here the child has agency over
**which pitch** (which cloud) and **how much rain** (tap vs hold).

## Polish ideas
- Thunderstorm mode: all three held simultaneously → heavier rain + louder
  notes + canvas lightning flash
- Add E3 (164.81 Hz, emerald cloud) for full pentatonic set
- Raindrop trails (fading line behind each drop)
- Floor wave animation (gentle sine ripple on the water surface line)
- Count-down puddles: after many drops in one spot, a "puddle" glow grows —
  visual accumulation reward for sustained play
