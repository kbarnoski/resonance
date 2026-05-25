# 157 — Concept Steer

**Route**: `/dream/157-concept-steer`
**Status**: demoable
**Cycle**: 185 (adult build)
**Zero deps · Zero API · Zero permissions**

---

## What is it?

A hexagonal radar chart where each of six vertices controls a named musical dimension.
Drag any vertex — the shape changes and the music follows immediately.

**The six axes (from top, clockwise):**

| Axis | Range | Effect |
|------|-------|--------|
| Brightness | dim → bright | Low-pass filter: 400 Hz → 6 kHz |
| Density | sparse → dense | BPM: 40 → 140 · Voices: 1 → 5 |
| Regularity | free → grid | Timing jitter: ±100ms → exact grid |
| Complexity | unison → polychord | 1 note → power5 → triad → 7th → 9th |
| Energy | soft → sharp | Attack: 800ms → 40ms · Gain: 0.3 → 1.0 |
| Mode | major → diminished | Chord quality: C → Cm → Cdim |

---

## Where the axes come from

Not invented — extracted. Sparse autoencoder research on transformer music model weights
(arxiv 2505.18186, May 2026) identified these six dimensions as the primary axes along
which music AI models organize their internal representations. The model doesn't "know" them
consciously; sparse probing reveals them as the dominant directions in activation space.

This prototype makes those same internal axes the explicit UI controls. The musician
navigates the same space the model navigates — but with hands.

---

## How the synthesis works

A `setTimeout`-based beat scheduler reads the concept state on every beat. No oscillators
are pre-created; each note spawns a fresh `OscillatorNode` + `GainNode` envelope, plays
through a shared `BiquadFilterNode` (lowpass, frequency set by Brightness), and is
garbage-collected when it stops.

The Density axis drives both BPM and voice count simultaneously. At Density=0: 40 BPM, 1
voice — a single slow pulse. At Density=1: 140 BPM, 5 voices — a dense chord cloud.

Regularity adds timing jitter: the Regularity axis controls how far from the grid each note
can drift. At Regularity=0, the ±100ms jitter makes any repeating pattern sound organic and
fluid. At Regularity=1, beats land exactly on the grid — metronomic, precise.

---

## Presets

- **Classical Fugue** — bright, moderately dense, near-perfect grid, complex (7th chords), major
- **Dark Ambient** — dim, very sparse, free timing, unison, diminished quality
- **Jazz Improv** — bright, dense, loose timing, complex voicings, major
- **Drone** — dim, very sparse, grid-locked, near-unison (power chord)

---

## Design notes

The radar chart is drawn in Canvas2D (pure, no Three.js). Vertices are draggable
via pointer capture — `setPointerCapture` ensures tracking works outside the canvas bounds.

The chord name displayed at top updates with Complexity × Mode:
`C` → `C5` → `C / Csus4 / Cm / Cdim` → `Cmaj7 / C7sus4 / Cm7 / Cdim7` → `Cmaj9 / C9sus4 / Cm9 / Cdim9`

Root is always C3 (130.81 Hz). Future: add a root-note selector or mic-detected root.

---

## What surprised me

The "Classical Fugue" preset — bright, regular, complex, major — produces something that
genuinely sounds like multiple voices in counterpoint. The Regularity axis doing that much
work was unexpected: strict grid timing + high Complexity creates the illusion of a fugue
even from single-attack sine tones. Jazz Improv preset, by contrast, feels loose and
improvisatory purely from the loose timing.

The Mode axis is doing musical heavy lifting at the edges. Diminished mode with high
Complexity (Cdim9) sounds genuinely unsettling — tritones and stacked semitones in the
upper voices. Moving the Mode vertex slowly from 0 to 1 is like walking from sunlight into
shadow: it happens one semitone at a time but the mood shifts dramatically.

---

## What's next

- **Root detection**: mic → autocorrelation → retune synthesis to detected pitch
- **Rhythm mode**: Regularity at 0.5 becomes a swing groove (eighth-note triplet grid)
- **Visual encoding**: color the polygon fill based on Mode (warm = major, cool = minor)
- **Export**: save the current concept coordinates as a JSON preset
