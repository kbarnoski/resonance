# Synesthetic Sketch

**Route**: `/dream/63-synesthetic-sketch`  
**Cycle**: 79 · **Status**: demoable

Six audio features → six visual dimensions. Every musical moment deposits a shaped object on a persistent accumulated canvas.

## The six mappings

| Audio feature | Visual dimension | Low value | High value |
|---|---|---|---|
| Spectral centroid | Hue | 60 Hz = violet/blue | 8 kHz = orange/red |
| Spectral bandwidth | Shape type | Circle (pure tone) | Star (wide spread) |
| Harmonic peak count | Inner ring count | 0 rings (1 band lit) | 4 rings (5+ bands lit) |
| Amplitude | Object scale | Small (quiet) | Large (loud) |
| Rhythm regularity | Scatter radius | Tight center cluster | Wide scatter |
| Onset events | Spark burst | — | Radial flash at random position |

**Shape progression**: `circle` (bandwidth < 28%) → `hexagon` (28–62%) → `7-pointed star` (> 62%).

## What to try

**Demo mode**: Watch 6 incommensurable LFOs (0.07–0.28 Hz, never repeating) cycle through all six dimensions. Observe the shape type shift from circle → hex → star as bandwidth changes. Notice that the demo produces sparse clusters (regular LFO rhythm) rather than scattered fields.

**Mic mode**:
- Whistle or play a single sustained note → tight circles clustering near center
- Play a full piano chord (many harmonics) → multi-ringed hexagons or stars
- Tap a steady metronomic rhythm → shapes cluster tightly near center  
- Improvise freely with irregular timing → shapes scatter across the canvas
- Strike the keys loudly → large objects; play softly → small objects
- Any percussive hit fires an onset spark burst at a random canvas position

The canvas accumulates additively — each new object adds light where it overlaps prior objects, building a luminous layered field. A slow 0.4%/frame decay prevents permanent burn-in. Download the current canvas as PNG at any moment.

## Design notes

The key insight from musicolors (arxiv 2503.14220, ACM MM 2025): effective music visualization should use **multiple visual dimensions simultaneously**, not just color. The 62 existing dream sandbox prototypes primarily use color, motion, and fluid dynamics. This is the first that uses *morphology* — the shape of objects, their complexity, their inner structure — as the primary visual language.

A pure sine tone → a clean single circle. A chord with 4 active harmonic bands → a hexagon with 3 inner rings. A rhythmically precise performance → a bright concentrated bloom at center. An improvisational session → a scattered field of varied shapes.

The canvas IS the acoustic record of the session, readable by shape as much as by color. Two different musical moments with the same centroid (same hue) but different harmonic complexity (different ring count) look visually distinct — something color-only systems can't achieve.

**Inspired by**: musicolors (RESEARCH.md §131, Cycle 78 research sweep).
