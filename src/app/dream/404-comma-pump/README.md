# Comma Pump

**Route:** `/dream/404-comma-pump`

An autonomous long-form generative piece in adaptive 5-limit just intonation. Every chord is voiced with pure frequency ratios and every root motion is a pure interval, so the repeating progression accumulates the syntonic comma (~21.5 ¢) downward per cycle — the music slowly drifts away from its starting pitch indefinitely, and you can both see and hear it never quite come home.

## How to use

1. Press **Start** — the piece begins immediately, playing softly.
2. Watch the **pitch river** canvas: time scrolls left → right; the vertical axis is log-frequency. The dim blue line is the original home tonic (A3 = 220 Hz, fixed forever). The bright violet line is the current drifting root — watch it sink.
3. Read the **cents-from-home** counter in the HUD. It should begin near 0 ¢ and drift to −21.5 ¢ after the first full cycle, −43 ¢ after the second, and so on indefinitely.
4. Press **JI → 12-TET** (or 12-TET → JI) to toggle the tuning system. In **JI** mode every voice is tuned to its exact pure ratio — the chords lock in with zero beating. In **12-TET** mode each frequency is snapped to the nearest equal-tempered pitch — you should immediately hear rough beating and a slightly tenser, sharper quality. Toggling back to JI removes it. That contrast is the demo's payoff.
5. Drag the **Tempo** slider to speed up or slow down the harmonic rhythm without affecting the tuning math.
6. Press **Stop** to silence the piece and reset the drift counter.

## The JI / comma-pump math

### 5-limit just intonation

The 5-limit system uses only prime factors 2, 3, and 5. The nine scale intervals above a root are:

| Name | Ratio  | Cents |
|------|--------|-------|
| P1   | 1/1    | 0 ¢   |
| M2   | 9/8    | 204 ¢ |
| m3   | 6/5    | 316 ¢ |
| M3   | 5/4    | 386 ¢ |
| P4   | 4/3    | 498 ¢ |
| P5   | 3/2    | 702 ¢ |
| m6   | 8/5    | 814 ¢ |
| M6   | 5/3    | 884 ¢ |
| m7   | 9/5    | 1018 ¢|
| M7   | 15/8   | 1088 ¢|

Chords are stacked purely above the current root: a major triad is `[1, 5/4, 3/2]`; a minor-seventh is `[1, 6/5, 3/2, 9/5]`; a dominant seventh is `[1, 5/4, 3/2, 9/5]`.

### The syntonic comma pump

The progression `I → IV → ii → V → I` is executed via pure ratio **root motions**:

| Step | Root move | Reason |
|------|-----------|--------|
| start → I  | × 1 | stay |
| I → IV | × 4/3 | up a pure P4 |
| IV → ii | × 5/6 | down a pure m3 |
| ii → V | × 4/3 | up a pure P4 |
| V → I' | × 2/3 | down a pure P5 |

After one full loop, the root has been multiplied by:

```
1 × (4/3) × (5/6) × (4/3) × (2/3)
= (4 × 5 × 4 × 2) / (3 × 6 × 3 × 3)
= 160 / 162
= 80 / 81
```

`80/81` is exactly **1/SYNTONIC_COMMA**, or ≈ −21.506 ¢. The progression cannot resolve back to a true unison in 5-limit JI — every cycle it sinks by one comma. This is the classic comma pump: a chain of locally perfect, pure-ratio intervals that adds up to an irrational return.

The `currentRootHz` float is never quantized or snapped back — it accumulates the drift indefinitely. `centsFromHome = 1200 × log₂(currentRootHz / homeHz)` tracks this in cents.

### Why 12-TET eliminates it

Equal temperament tempers out the syntonic comma by making the M3 = 400 ¢ (instead of 386 ¢) and the m7 = 1000 ¢ (instead of 1018 ¢). This closes the comma pump at the cost of slight mistuning on every interval. When you switch to 12-TET mode in this piece, the drift stops — but you immediately hear the beating that results from those impure fifths and thirds.

## Architecture

- **`tuning.ts`** — 5-limit JI ratios, chord voicings, progression steps, `centsDrift`, `octaveNorm`, `snapToET`, `buildChordFreqs`
- **`audio.ts`** — `SynthEngine` class: additive pad synth (5 sine/triangle partials per voice), synthetic reverb via `ConvolverNode`, `DynamicsCompressor` brick-wall limiter on master bus
- **`page.tsx`** — React component: `"use client"`, Canvas2D scrolling pitch river, rAF render loop, `setTimeout`-based progression scheduler, JI/ET toggle, tempo slider

## Named references

- **Syntonic comma / comma pump** (Ptolemy's comma, 81/80): the specific 5-limit comma that this piece makes audible. The loop I → IV → ii → V → I in pure JI descends by 81/80 per cycle.
- **Pivotuner (arXiv:2306.03873)** — Fischler & Schörkhuber, "Pivotuner: Adaptive Real-Time Just Intonation"; a key reference on practical adaptive JI retuning in real-time contexts.
- **Ben Johnston / Harry Partch** — Both developed extended JI notation and composition in 5-limit (and higher) tuning systems. Johnston's string quartets use 5-limit adaptive tuning throughout; Partch built bespoke instruments for his 43-tone JI scale.
- **La Monte Young, *The Well-Tuned Piano*** (1973–present) — A solo piano work using a fixed 7-limit JI tuning that, like this piece, is designed for very long-form listening, making drift and stasis over time the musical subject itself.

This prototype is the lab's first *dynamic/adaptive* just intonation piece. Prior JI prototypes (e.g., 37-ratio-lab, 212-diatonic-harmony) use fixed ratio sets tied to a static tonic. Here the tonic itself floats, driven purely by the arithmetic of the progression.
