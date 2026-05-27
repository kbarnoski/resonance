# 180 — Cellular: Conway Life as Musical Composer

**For**: adults · **Permissions**: none · **API**: none · **Deps**: zero · **Size**: ~3.5 kB

## The idea

Conway's Game of Life runs on a 64 × 16 grid. Each of the 64 columns maps to a musical
pitch (C2–C5, log-spaced). On every generation tick, any column with at least one live cell
sounds its triangle-wave note. Emergent Life patterns become emergent melodies.

- **Gliders** — a 3-note motif that walks right and rises in pitch as it moves
- **Pulsars** — period-3 oscillators; their two symmetric clusters make a repeating 2-bar loop
- **Acorn** — tiny seed that grows chaotically for 5,206 generations; melodically unpredictable
- **R-pentomino** — 5 cells that evolve for 1,103 generations; sounds like free-jazz improvisation
- **Random 20%** — starts dense, self-organizes over tens of seconds into rhythmic clusters

## Controls

- **Click / drag** the grid to draw or erase cells (click a live cell to enter erase mode)
- **Pause / Play** — freeze evolution mid-pattern; drawing still works in pause
- **BPM** (40–120) — how fast each generation ticks; 40 = slow meditative, 120 = frantic
- **Presets** — load a classic pattern; each has a distinct sonic character
- **Random** — reset to 20% random fill; always produces a unique performance
- **Clear** — empty grid; draw your own patterns and invent new music

## Audio

64 triangle-wave oscillators (one per column, C2–C5). Short decay: 8 ms attack, 220 ms release.
Gain normalized by 1/√(voice count) so perceived loudness stays roughly constant whether 1 or
40 columns are active. A DynamicsCompressorNode catches peaks on extremely dense states.
Columns are continuous frequencies (not quantized to semitones), so adjacent active columns
create subtle beating — alive cells near each other sound "chorused."

## Visual

64 × 16 grid with 5% opacity cell borders. Alive cells: colored circles with screen-blend glow,
hue shifting violet (C2, col 0) → rose (C5, col 63) — the same frequency→color mapping as
`1-live`. On each tick, active columns flash briefly in their pitch color. Glow via `shadowBlur`
in screen compositing mode.

## What surprised me

The acoustic difference between patterns is immediately apparent to the ear:

- A **blinker** (period-2 oscillator) sounds like two alternating notes — the world's simplest
  sequencer. It never changes. It never tires.
- A **glider** sounds like a rising 4-note melody that plays once, then goes silent. The spatial
  movement through the grid IS the melody — this is the only prototype where pitch is determined
  by position in space rather than audio analysis.
- **R-pentomino** sounds like a pianist playing without a plan — brief stable chords interrupted
  by rapid unpredictable runs, then sudden silences, then chaos again.
- **Pulsar**: both clusters are exactly symmetric, so the two sides play the same notes at the
  same time — a perfect unison, rich with additive beating at near-identical frequencies.

The column-to-pitch mapping makes visual space feel audible. Patterns in the left half sound
bass-heavy; patterns in the right half sound treble-forward. A symmetric Life pattern (Pulsar)
sounds harmonically balanced because visual symmetry = acoustic symmetry.

## Polish ideas

- **Toroidal grid** — wrap edges so gliders travel forever instead of dying at the boundary
- **Highlight still lifes** — detect period-1 patterns and mark them with a dim amber ring
- **Recording mode** — capture a generation sequence as a WAV download (like a composed piece)
- **Karel's recordings** — drive random births from amplitude peaks in `/api/audio/[id]` tracks;
  onset events trigger glider injections at the detected pitch column
- **Species coloring** — color live cells by how many neighbors they have (loneliness, comfort,
  overcrowding), independent of their column pitch
