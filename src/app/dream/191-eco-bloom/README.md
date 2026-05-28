# 191-eco-bloom

**L-system fractal plant · Karplus-Strong string synthesis**

Open `/dream/191-eco-bloom`. Press **grow** — a fractal plant unfolds branch by branch, each iteration playing a pentatonic chord of plucked strings. Tap again to advance iterations; the prototype auto-cycles every 3–5 seconds.

---

## What this is

An L-system (Lindenmayer System) is a formal grammar for describing self-similar structures. The rule here is simple:

```
F → FF+[+F-F-F]-[-F+F+F]
angle = 22.5°
```

Each "F" means "draw a segment." `+`/`-` turn the turtle ±22.5°. `[`/`]` push and pop the turtle state (creating branches). Applying the rule 4 times produces a 7,600-character sentence that draws a 2,401-segment plant.

The plant grows animated — segments appear roughly 50 per frame over ~1 second, trunk first then tips. Depth sets color: violet trunk (depth 0) → deep violet → teal → emerald → light emerald (depth 4). Each depth level also has decreasing line width and glow intensity, so the tips look like bioluminescent leaf-edges.

## The sound

Each iteration plays a 4-note Karplus-Strong chord:
- 4 notes drawn from the C pentatonic scale (C D F G A across 3 octaves)
- Which notes change with iteration (cycles through the scale)
- Slight stereo spread (±0.45 pan)
- Notes strum with 78ms between them (slight arpeggiation, left-to-right)

**Karplus-Strong** uses 3 Web Audio nodes per string: a one-shot noise burst (N samples, where N = sample_rate/frequency), a `DelayNode` (delay = N/sample_rate ≈ 1/frequency), a `BiquadFilterNode(lowpass, 3600Hz)` in the feedback path, and a `GainNode(0.994)` for energy decay. The noise enters the delay, gets low-pass filtered on each round trip (damping the high harmonics), and the feedback sustains the resonance as a decaying pitched tone. No external libraries.

## Visual language

- Background: `#0a0a0f` — near-black with slight purple tint
- Trunk: `#7c3aed` (Resonance violet), glow 12px
- Branches transition through deep violet → teal → emerald
- Leaf-tips: `#34d399` (light emerald), glow 2.5px
- The color gradient from root to tip traces the Resonance palette arc: violet base → emerald growth

## Why this fills a gap

190 prior prototypes react to mic input, generate audio via API, or synthesize from oscillators. None map a **self-similar geometric algorithm** to sound — where the visual recursion and the harmonic series share the same "growth as iteration" metaphor. The plant's branching IS the chord; deeper branches = higher harmonics.

First prototype where the visual structure is autonomously generative (not reaction, not AI) and the audio is triggered by the structure, not by user input.

## Lineage

- `105-pluck-field` ❤️ — Karplus-Strong as the synthesis method
- `13-piano-canvas` — session-as-artifact aesthetic (the plant is the record of its own growth)
- `163-paths-visualizer` ❤️ — dark canvas, patient contemplative pace

## Polish ideas (future cycles)

- **Mic input**: amplitude increases branch angle (louder = more sprawling plant)
- **Seed control**: let the user choose the initial angle or rule variant to get different plant shapes
- **Spectral coloring**: map the currently-playing chord's fundamental to the trunk hue
- **Multiple plants**: each tap spawns a new plant at the tap position, overlapping
- **Different rules**: Sierpinski triangle, dragon curve, coral branch variants selectable from a menu
