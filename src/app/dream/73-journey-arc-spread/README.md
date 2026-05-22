# 73 — Journey Arc Spread

**Route**: `/dream/73-journey-arc-spread`  
**Cycle**: 105  
**Status**: demoable

## What it is

Five of Karel's published journey themes — Cosmic Drift, Mycelium Dream, Sacred Resonance, Abyssal Dive, Snowflake — each rendered as a distinct audio-visual arc. Tab between them; each has its own phase structure, color palette, and visual vocabulary.

This is the "spread across journeys, not just Ghost" directive made literal. Each journey gets a different 60-second demonstration arc, tied to the phase names from the real published journeys (Starfield→Nebula→Supernova for Cosmic Drift; Spore→Branching→Canopy for Mycelium Dream; etc.).

## Visual differentiation per journey

| Journey | Visual mode | Background element |
|---|---|---|
| Cosmic Drift | `cosmic` | 200-dot star field, twinkling alpha |
| Mycelium Dream | `mycelium` | Particle network lines (mycelium connections) |
| Sacred Resonance | `sacred` | 4 rotating hexagonal rings (mandala geometry) |
| Abyssal Dive | `ocean` | 5 horizontal sine-wave bands |
| Snowflake | `winter` | 10 drifting 6-arm snowflake symbols |

All five share the same particle engine (orbit/rise/scatter/grid/wave/dissolve modes), but the background element and color palette make each feel like a different world.

## Phase arc design

Each journey's 6 phases map to the actual phase labels from `src/lib/journeys/journeys.ts` (e.g., `phaseLabels: { threshold: "Starfield", expansion: "Nebula", ... }`). The color palette is tuned to match each journey's published AI imagery — Cosmic Drift uses deep indigo/violet building to supernova white-pink; Sacred Resonance uses amber/gold building to bright communion-white.

## Interaction

- Tab at top: switch journey (works while running — restarts the arc for the new journey)  
- Demo / Mic buttons: Demo uses synthetic LFO bands; Mic mode hooks into the existing `useMicAnalyser` shared hook
- Phase timeline at bottom: click any phase to jump there instantly
- Side panel (desktop): active phase name + description, journey summary, visual mode label

## Design notes

- Embedded journey data (names, phase labels, descriptions) rather than importing from `src/lib/journeys/journeys.ts` directly. Direct import would pull in a large module tree (shaders, adaptive engine, localStorage utils). Self-contained embedding is the correct approach for prototype stability.
- Mycelium network lines use O(n²) but capped at first 50 particles: max 1225 comparisons/frame, ~0.1ms at 60fps.
- Sacred hexagonal rings rotate in alternating directions (±1) per ring, with a slight per-ring phase offset. At high amplitude the rings scale outward, connecting to the particle cloud.
- Star field initialized once on first run; 200 stars in [0..cw, 0..ch] CSS-pixel space, twinkle via sin(t * 0.001 + phase).
- Winter snowflakes use `(t * 0.012 + i * h/count) % h` for y — guaranteed wrap-around drift at ~0.72 px/frame (60fps → 43px/s). Horizontal sway via sin(t * 0.0004 + i).

## Polishing ideas for future cycles

- Journey-specific audio (synthesize the right tonal palette per journey: deep bass drones for Abyssal, pentatonic bell tones for Snowflake, complex organ-like chords for Sacred Resonance)
- Background images: FLUX.2 scene at journey start, AI image as canvas backdrop
- Crossfade transition between journeys (blend particles from old → new instead of instant clear)
- Each journey could use Karel's actual piano recordings (`76-cymatics-on-piano-path` variant) as audio input
