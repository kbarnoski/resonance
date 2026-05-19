# 37 — Ratio Lab

**Route**: `/dream/37-ratio-lab`  
**Shipped**: Cycle 41 (2026-05-19)  
**Status**: `demoable`

## What it is

A 9×5 Tonnetz lattice visualizing just-intonation frequency relationships. Each node is a JI
ratio relative to A3 (220 Hz). Click any node to hear it as a sustained sine tone against
a soft A3 drone. Multiple nodes can ring simultaneously — the drone reveals the intervals.

**Right = perfect fifth (×3/2). Up = major third (×5/4). Diagonal = minor third (×6/5).**

## Why the Tonnetz

The Tonnetz (from German: *tone network*) maps harmonic relationships spatially so that:
- Neighboring nodes are consonant (P5, M3, m3)
- Distant nodes are complex/dissonant (tritone at [−2,+2], pythagorean comma at [+12,0])
- Chord shapes are triangles: major = right-angle at root, minor = inverted right-angle

This makes chord quality *visible* as geometry. Play A+C#+E (nodes (0,0), (0,+1), (+1,0)) —
they form a right-angled triangle. That IS a major chord, visually.

## JI math

Frequency at grid position (x, y):
```
freq = 220 × octNorm( (3/2)^x × (5/4)^y )
```
where `octNorm` brings the ratio into [1, 2) (single audible octave). The minor third arises as
a derived interval: (+1, −1) = (3/2) ÷ (5/4) = 6/5. Two triangular relationship types emerge:
- Major triangle: (0,0)→(+1,0)→(0,+1) = root + P5 + M3
- Minor triangle: (0,0)→(+1,0)→(+1,−1) = root + P5 + m3

## Cents deviation labels

Each node shows its pitch class name (12-TET approximation) and the deviation from that
equal-tempered pitch in cents. For example:
- `E +2¢` — this node's ratio (3/2) is 2¢ sharp of 12-TET E (actually it's exactly 2¢ flat;
  3/2 ≈ 701.96¢, 12-TET P5 = 700¢ → deviation = −2¢)
- `C −14¢` — the JI minor third 6/5 ≈ 315.64¢ vs 12-TET m3 = 300¢ → +15.64¢ sharp

The deviation shows where JI diverges from equal temperament — the distinctive "color" of each
interval.

## Mic mode

Autocorrelation pitch detection (NSDF algorithm, same as `13-piano-canvas` and `24-piano-roll`)
on a 2048-sample buffer, polled every 80ms. The detected fundamental frequency is matched to the
nearest Tonnetz node via octave-normalized log2 distance. A pulsing blue ring marks the closest node.

Playing a sustained piano pitch reveals its position in harmonic space. A just-intonation fifth
(E) sits exactly one step right of A; the equal-tempered piano E is 2¢ off — a difference the
detector can't distinguish, but the lattice position shows where the ratio lives.

## Color coding

Node color: hue 45° (amber) at the center → hue 220° (cool blue) at maximum distance (|x|+|y|=6).
Node size: largest at the root, shrinks proportionally with `|x|+|y|`. Simple ratios = large,
warm, easy to find. Complex ratios = small, cool, distant.

Connection line colors:
- Green: P5 relationships (horizontal)
- Amber: M3 relationships (vertical)
- Blue: m3 relationships (diagonal)

## Polish ideas

- Highlight chord triangles: click-drag to select a triangle → the three nodes play simultaneously,
  chord name appears ("A major", "E minor")
- Show comma paths: follow the Pythagorean comma trail (12 P5s up ≈ 7 octaves, landing +24¢ sharp)
- Interactive tuning systems: overlay equal temperament, Pythagorean, meantone as semi-transparent
  dot rings showing the gap between JI and each tuning
- Rotate the lattice: diagonal presentation (traditional Tonnetz orientation vs this rectangular one)
- MIDI out: playing nodes fires MIDI notes to external instruments tuned in JI
- Inspired by: LIMITER (arxiv 2507.08675) — gamified JI Tonnetz learning
