# Concept Steer — design notes

**Route**: `/dream/52-concept-steer`  
**Status**: demoable  
**Cycle**: 63 (2026-05-20)

## What it asks

"What if the vocabulary of music AI was also the vocabulary of a synthesizer?"

## Background

Cycle 61 research found a paper (arxiv 2505.18186, May 2026) that applied sparse autoencoders
to transformer music models and extracted the concepts the models use internally to represent
music. They didn't find "bass" or "kick drum" — they found:

- **Brightness** (spectral energy distribution)
- **Density** (event count per unit time, harmonic richness)
- **Regularity** (metric/rhythmic predictability)
- **Complexity** (harmonic and structural depth)
- **Energy** (loudness dynamics, attack intensity)
- **Mode** (tonal quality: major vs. minor vs. diminished)

These are the same words a musician or theorist would reach for. The AI learned them from data
with no labels. This prototype makes those six axes the primary synthesizer controls.

## Visual design

A hexagonal radar chart. Each vertex corresponds to one axis; each handle is draggable along
its axis ray. The polygon shape IS the current "concept position." Axis labels outside the
outer ring; current values in smaller text below each label. Color-coded per axis.

The background glow is driven by Brightness + Mode — a warm golden tint when bright+major,
a deeper blue when dim+minor.

## Synthesis design

Each chord event:
1. **Brightness → lowpass filter cutoff** (400 Hz at 0 → 6000 Hz at 1)
2. **Density → BPM** (40–140) **+ voice count** (1–5 simultaneous oscillators)
3. **Regularity → arpeggio timing jitter + note duration** (strict grid at 1; looser, shorter at 0)
4. **Complexity → chord voicing depth** (0 = unison, 0.25 = fifth, 0.5 = triad, 0.75 = 7th, 1 = 9th chord)
5. **Energy → note attack** (0.8s slow pad at 0; 0.04s sharp staccato at 1) **+ peak gain**
6. **Mode → chord quality** (0 = major, 0.5 = minor, 1 = diminished; interpolated)

All oscillators are triangle waves (middle warmth between sine and sawtooth). The chord
tones are the same C3 root — so the full range from Jazz Improv (dense, bright, irregular,
complex, energetic, major 9th chords at 110 BPM) to Drone (sparse, dim, regular, unison,
quiet) is all built from the same engine.

## Presets

Chosen to put most of the prototype's space into play immediately:

- **Classical Fugue**: bright + regular + complex + major → ordered harmonic richness
- **Dark Ambient**: dim + sparse + irregular + minor → quiet atmospheric drift
- **Jazz Improv**: bright + dense + irregular + complex + major → fast 9th-chord arpeggios
- **Drone**: dim + very sparse + regular + unison → a single held tone, barely moving

## What's interesting

The axis labels are **music theory vocabulary**, not signal-processing vocabulary. A musician
who doesn't know what a lowpass filter is still knows what "Brightness" means. This is what
made the research surprising: the AI learned to represent music with the same concepts a human
would use to describe it.

Dragging the Mode axis from left to right — 0 → 0.5 → 1 — walks through major → minor →
diminished as a continuous parameter. You can hear the tonal color change even when Complexity
is at maximum (9th chords): a major 9th sounds open; a minor 9th sounds darker; a diminished
9th sounds tense. The same voicing complexity, completely different emotional valence.

## Polish ideas

- **Mic mode**: extract audio features (centroid → Brightness, onset rate → Density, chroma
  entropy → Complexity, etc.) and display where your playing sits on the radar in real time
- **Axis cross-coupling display**: show which axes tend to correlate in real music (Density and
  Energy often co-occur; Regularity and Complexity are often inversely related)
- **Trajectory record**: let the radar trace a path over time and replay it as a musical arc
- **Add a 7th "Tempo" axis** for raw BPM independent from Density (currently they're coupled)
