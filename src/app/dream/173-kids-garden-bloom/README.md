# Garden Bloom 🌸

**For**: kids (3+) · Zero permissions · Zero API · Zero deps

## The idea

Hold the soil to grow a glowing flower. Each petal that unfolds plays a note. Hold longer = more petals = richer chord. Release = flower stays and softly loops its chord every few seconds.

Six flowers fill the garden. When the sixth blooms, all six play their notes simultaneously as a grand chord, then gently sway and fade over 12 seconds, and the garden resets.

## Interaction

- **Hold soil** → stem grows upward at ~14px/s; a new petal unfolds every ~0.75 seconds
- **0.75s hold** → 1 petal (single note)
- **2s hold** → 3 petals (short chord)
- **4s hold** → 5 petals (full pentatonic chord)
- **Release** → flower blooms; loops its chord softly every ~4s
- **6 flowers** → grand chord, then 12s sway-and-fade, garden resets

## X position = timbre + color

| Zone       | Color  | Timbre       | Sound character                      |
|------------|--------|--------------|--------------------------------------|
| Left 25%   | Violet | Piano        | Triangle wave, fast attack           |
| Center-L   | Amber  | Bells        | Triangle + 2nd harmonic, warm decay  |
| Center-R   | Teal   | Pluck        | Karplus-Strong string resonance      |
| Right 25%  | Rose   | Pad          | Sine, slow 70ms attack, long sustain |

## Pitches (C-major pentatonic C3→C4)

Petal 1 = C3, Petal 2 = E3, Petal 3 = G3, Petal 4 = A3, Petal 5 = C4.
All combinations are consonant — no wrong flowers.

## Design notes

**New gesture type for the kids zone.** All 172 prior prototypes trigger on tap-down (immediate) or drag (continuous). Garden Bloom is the first where *sustained hold = accumulating growth*. The reward is deferred and proportional: the longer you hold, the more petals, the richer the chord. A 3-year-old who holds 0.5s gets one note; one who holds 4s gets a full five-note chord. Same gesture, different patience, different musical result.

**The garden-fill-then-reset arc** gives a clear narrative without text: plant, grow, chord, fade, repeat. The 12-second grand fade is long enough to feel ceremonial — the flowers don't just disappear, they breathe out and dim.

**KS synthesis for "teal" pluck timbre**: each pluck computes a fresh KS buffer (~1.8s at the target frequency). At max 5 notes per flower × 6 flowers = 30 buffers during a grand chord, all short (< 200KB each), no perceptible stall.

**Demo flowers** (violet at 20%, rose at 80%) appear pre-bloomed at startup to show the mechanic before first touch. They loop their chords so the canvas is always alive from second 1.

## Polish ideas

- Leaf or small side-branch at stem midpoint for more botanical feel
- Rain drops (small falling dots) during the grand chord's 12-second fade
- Subtle soil particles animated as the stem emerges (digging feel)
- Second ambient oscillator (very faint C2 drone) under the wind layer
