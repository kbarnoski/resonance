# Seed Song — design notes

**For**: kids 4+ · Zero permissions · Zero API · Zero deps · Cycle 170

## What it is

Tap anywhere on a dark forest canvas to plant a glowing seed. A procedural tree grows from the
seed over ~20 seconds: a violet trunk sprouts, branches fork left and right, sub-branches keep
splitting to depth 5. As each branch segment reaches its tip, it plays a **Karplus-Strong pluck**
— the same physical-modeling synthesis used in `105-pluck-field` and `108-kids-kalimba`. Plant
up to 4 seeds; their trees grow and sing simultaneously in gentle C-major pentatonic harmony.

Soft brown-noise wind (lowpass-filtered at 220 Hz, gain 0.038) plays continuously — felt rather
than heard.

## Audio design

Five C-major pentatonic pitches map to tree depth:

| Depth | Visual color | Pitch | Character |
|-------|-------------|-------|-----------|
| 0 — trunk | deep violet | C3 (131 Hz) | slowest, heaviest pluck |
| 1 — first fork | indigo | E3 (165 Hz) | resonant |
| 2 — second fork | sky blue | G3 (196 Hz) | mid ring |
| 3 — third fork | emerald | A3 (220 Hz) | lighter |
| 4 — tips | amber/gold | C4 (262 Hz) | brightest, quickest decay |

The trunk fires first (~2.5s after planting). The tree's 31 maximum branch segments fire
over ~20 seconds — one to four notes per second at peak density. With 4 trees: up to ~6
simultaneous notes per second at peak, all pentatonic, all consonant.

KS buffers are **pre-computed offline** at start (5 buffers, one per pitch) to avoid any
real-time computation during branch completion. Each buffer is an AudioBufferSourceNode played
once per pluck.

## Visual design

- Dark forest green background (`#060d06`)
- Branch colors warm from violet (trunk) → indigo → blue → emerald → amber/gold (tips)
- Line widths taper with depth: 4.5px trunk → 0.9px terminals
- Glowing seed dot (violet, shadowBlur=12) at each tap point
- Leaves: 3 small amber ellipses flutter at each terminal tip, position driven by
  `sin(ts × 0.0013 + offset)` so they move independently

## L-system branching

Not a formal L-system string rewrite — a direct recursive branching function instead (simpler
to implement, equally expressive for this use case). Each fork:
- Alternating spread: even depths fork at ±25°, odd depths at ±32° (from parent angle)
- Jitter: ±4° random per branch for organic asymmetry
- Length decreases per depth: 20% → 13% → 8.5% → 5.5% → 3.8% of canvas height
- Growth timing: each segment starts after parent completes + random 0–250ms jitter

## What makes it different

37+ prior kids prototypes respond to taps immediately. Seed Song is the first where the
reward is **patient growth over time** — you plant once and watch something living emerge.
The Karplus-Strong resonance gives branches a warm physical feel rather than a synthesized
buzz. Each tree sounds slightly different (KS buffers use random noise seeds, so no two
plucks are identical).

The 4-tree limit keeps voices clear. After the 4th seed, the canvas displays "your forest
is growing…" — no more taps accepted, focus shifts to watching and listening.

Inspired by Refik Anadol's Machine Dreams: Rainforest (DATALAND, opening June 20, 2026):
ecological data as generative musical and visual material.

## Polish ideas for future cycles

- Seed glow ring: expanding dashed circle at tap point for 300ms after planting
- Leaf rustling: increase wind gain slightly as canopy density grows
- Reset button: "Clear forest" to plant again (appears 25s after last seed)
- Ambient pad: very quiet C3+E3+G3 triangle oscillators at gain 0.010, starts at first tree
- Rain mode: togglable white noise at 1200Hz lowpass, slightly accelerates branch growth
- Mic mode: bass RMS increases growth speed; onsets trigger immediate branch completion
