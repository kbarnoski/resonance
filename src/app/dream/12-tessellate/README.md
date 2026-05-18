# Tessellate — design notes

**Route**: `/dream/12-tessellate`  
**Shipped**: Cycle 12  
**Status**: demoable

## What is this?

A 40×28 grid of Truchet tiles that rewires on every beat. Each tile holds one of two
quarter-arc orientations. Together, adjacent arcs form flowing connected curves across
the whole canvas — a topology that emerges from local two-state choices.

On a bass hit, ~12% of tiles flip their orientation simultaneously. A different set each
time. The global pattern rewires in a flash of white, then settles into new flowing curves.
Between beats, a continuous bass-driven "drizzle" of slower individual flips keeps the
grid in constant quiet motion.

## Why Truchet tiling?

The classic Truchet observation (1704): if you tile a square grid with two-state tiles
randomly, connected curves emerge spontaneously. The arcs don't "know" they should connect —
it just happens from the geometry. This makes flipping tiles feel like rewiring neural paths
rather than toggling pixels: a small local change can disconnect a long curve or join two
separate ones.

For Resonance specifically, the op-art aesthetic is the gap in the existing sandbox. All 11
prior prototypes use particles, fluid, terrain, or attractors — flowing physical simulations.
Tessellate is the first tile-based geometric prototype. It looks made, not grown.

## Rendering approach

The grid renders in two batched Path2D calls (one per orientation) plus a third pass for
flash overlays. This keeps frame time low — typically two `ctx.stroke(path)` calls instead
of 1120 individual stroke calls.

**Why `ellipse()` instead of `arc()`?**  
Classic Truchet arcs use quarter-circles of radius = half tile size. On a square tile,
this places arc endpoints exactly at edge midpoints. On a non-square tile (which happens
whenever the window is not exactly COLS:ROWS aspect ratio), `arc()` with radius=min(tw,th)/2
leaves a gap — arcs don't reach the edge. `ellipse()` with rx=tw/2 and ry=th/2 always
reaches the edge midpoints regardless of tile aspect ratio, so arcs from adjacent tiles
always connect.

## Audio mapping

| Input | Effect |
|-------|--------|
| Bass onset | 12% mass flip + full white flash |
| Bass energy (continuous) | Drizzle rate — bassEnergy² × 0.055 probability per tile per frame |
| Mid energy (500–3kHz) | Saturation (38–100%) |
| Overall amplitude | Lightness (22–74%) |

Demo mode adds a timer-based beat at ~85 BPM so the flip rhythm is always visible even
without a real audio source. Onset detection fires on top of this.

## Color scheme

Two complementary arcs (hue + 165°) rotate slowly through the spectrum (~40s per full
rotation). With 50/50 initial split between orientations, the canvas shows roughly equal
areas of each color — then audio redistributes the balance, creating color "drift" that
follows the music's energy.

## Open questions / polish ideas

- **Spatial audio correlation**: each column of tiles responds to a different frequency band,
  so the horizontal flip pattern reflects the spectral content of each beat.
- **Mode: inverted** — dark arcs on a light grid (like a photographic negative). Changes
  which curves read as foreground.
- **Progressive grid resolution**: start 10×7 (big tiles) and halve every 30 seconds until
  40×28. Watching the topology refine is a journey in itself.
- **Two-channel split**: left half driven by left channel, right by right channel. Stereo
  panning becomes visible grid asymmetry.
- **Tile weight bias**: instead of 50/50 random init, start 10/90 and let audio flip toward
  balance. Different starting topology = very different emerging curves.
