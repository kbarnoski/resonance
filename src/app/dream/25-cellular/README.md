# 25-cellular — Conway's Life as a musical instrument

**Route**: `/dream/25-cellular`  
**Cycle**: 29 (2026-05-19)  
**Status**: demoable

## The idea

Conway's Game of Life is usually a visual curiosity. Here it is an autonomous composer. The 64-column grid is a piano roll laid flat: column 0 = C2, column 63 = C5, log-spaced across 3 octaves. On each Life tick, every column with at least one living cell fires a triangle-wave note at that column's pitch. The *shape* of a pattern becomes the *melody* of its music.

## What each preset sounds like

**Glider** — 5 cells, translates diagonally across the grid. As it walks from left (bass) to right (treble) and wraps back, it leaves a rising then falling 4-note motif that repeats on every complete traversal. Period depends on grid width: ~15 generations per column-crossing.

**Pulsar** — 13×13 period-3 oscillator. Fires 12 columns simultaneously every 3 ticks in a strict rhythmic pattern. Sounds like a mechanical chord machine: 3-tick on, 3-tick off, 3-tick on. At 80 BPM, that's a dotted-quarter-note rhythm.

**Acorn** — 7-cell methuselah. Grows chaotically for 5206 generations before stabilizing. The first 20 generations are sparse and irregular; by generation 50, dense clusters create polyphonic chords. The pitch palette shifts as clusters migrate across the grid.

**R-pentomino** — 5-cell methuselah. Stabilizes after 1103 generations. Similar to Acorn but smaller final population. Good for 2-minute improvisation sessions.

**Random (20%)** — 205 cells distributed uniformly. Immediately chaotic; converges to stable + periodic patterns within 50–200 generations depending on density.

## Why triangle waves

Piano sounds best for this. Triangle waves have only odd harmonics with amplitude falling as 1/n² — warm, organ-like, not harsh. At the high BPM end (120 BPM = 2 ticks/second) with many simultaneous notes, sine waves would be too pure and square waves too harsh. Triangle is the right middle ground.

## Polyphony management

Volume per note scales by `min(1, 6 / activeCols)`. If ≤6 columns are active, each plays at full gain. If 20 columns fire simultaneously (common with Acorn at peak), each note plays at 30% gain. Total perceived loudness stays roughly constant regardless of pattern density.

## Polish ideas

- **Pitch labels** on column tops: mark C2, C3, C4, C5 with subtle text
- **Toroidal vs. fixed-edge toggle**: fixed edges change which patterns are achievable (common patterns like the glider die at borders)
- **Step-one button**: advance one generation at a time for analysis
- **Speed automation**: BPM follows population — dense grids slow down, sparse ones speed up (chaos has tempo)
- **MIDI out**: emit MIDI notes via the Web MIDI API — play into a DAW
- **Save/load grid**: encode the 1024-bit grid as a 256-hex-char string in the URL for sharing
- **Multiple simultaneous patterns**: drag different presets to different quadrants of the grid

## Technical notes

- Grid: `Uint8Array(ROWS × COLS)` = 1024 bytes. `stepLife()` allocates a new array each tick (1024 bytes every 750ms at 80 BPM) — GC impact is negligible.
- Tick is scheduled via `setTimeout` (not `setInterval`) to prevent queue buildup if a tick runs long.
- Canvas rendering: 60fps rAF, completely decoupled from the Life tick. Flash decay at 0.78/frame means 100ms visual feedback at 60fps.
- AudioContext created lazily on first Start click (browser autoplay policy).
