# 165 — Cymatics

**Question**: What if Resonance visualized the literal physics that gives it its name?

"Resonance" refers to acoustic resonance — the phenomenon Ernst Chladni demonstrated in 1787:
sprinkle sand on a vibrating plate, bow its edge, and the sand gathers at nodal lines (where
amplitude = 0), revealing the plate's standing-wave pattern. Every frequency produces a unique,
symmetric figure. These are Chladni figures. They ARE resonance made visible.

## How it works

The prototype uses the **symmetric 2D eigenmode formula** for a square plate with fixed edges:

```
Z(x, y) = sin(mπx) · sin(nπy) + sin(nπx) · sin(mπy)
```

The mode index `(m, n)` selects which harmonic pattern appears. Low modes (1,1) produce simple
four-lobed crosses. High modes (5,5) produce 50-cell grids with complex symmetry. The nodal
lines — where Z ≈ 0 — are dark; the anti-nodal regions glow with the dominant frequency-band
color (violet for bass, cyan for lower-mid, emerald for mid, amber for mid-high, orange for
high-mid, rose for treble). The coloring follows the same 6-band palette as `1-live`.

**Demo mode**: a sine oscillator sweeps from 55 Hz (mode 1,1) upward through all 25 modes
over ~87 seconds per cycle. Each mode dwells for 3.5 s; the oscillator linearly ramps to the
next eigenfrequency over 2 s. The listener hears a slow rising tone; the pattern transforms.

**Live mode**: Karel pastes a recording UUID → `/api/audio/[id]` returns a signed URL →
`MediaElementAudioSourceNode → AnalyserNode → destination`. The dominant FFT bin drives mode
selection; band energies drive color; overall amplitude drives brightness. Piano recordings
produce piano-colored Chladni figures.

## What surprised me

The symmetric combination `sin(mπx)sin(nπy) + sin(nπx)sin(mπy)` produces genuinely beautiful
figures for asymmetric modes (m ≠ n) — diagonal crosses, star bursts, rotational symmetry that
a pure grid pattern wouldn't have. For mode (2,3) you get a 6-petaled flower; for (3,5) an
asymmetric star with 15 cells. The mathematics is simple (just two sine products) but the visual
richness is unexpected.

The 1-second mode-switch cooldown prevents jitter on complex recordings while still letting the
pattern respond to sustained notes — a piano's note typically holds long enough to resolve a mode.

## Why now (Cycle 193)

1. "Resonance" literally = resonance = Chladni figures. A prototype that IS the phenomenon the
   app is named for feels overdue. Karel should be delighted to see his app's namesake visualized.
2. Continues the AGENT.md directive: "incorporate Karel's actual music from the Paths." The
   recording input uses the exact same `/api/audio/[id]` pattern as `163-paths-visualizer` (❤️).
3. Zero new dependencies, zero API calls, zero budget.

## Love signals

- `138-lmdm-echo` ❤️ — Karel's piano phrase analyzed + echoed. This extends that: full recordings
  drive the Chladni mode selection.
- `84-wave-fluid` ❤️ — fluid physics as visuals. Chladni patterns are the standing-wave cousin.
- `105-pluck-field` ❤️ — physical modeling synthesis. Chladni is physical acoustics made visual.

## Polish ideas (future cycles)

- **Continuous frequency slider**: drag a horizontal slider to manually set the plate frequency,
  watching the mode transition in real time — like a real Chladni demonstration.
- **Mic input**: autocorrelation pitch detection (from `13-piano-canvas`) drives the mode — sing
  a note and see your voice's Chladni pattern.
- **3D mode**: WebGPU displacement map on a flat mesh — the Chladni height field in 3D,
  rotatable.
- **Mode gallery**: small grid of all 25 modes as static thumbnails, clickable to audition.
