# 2728 · Bifurcation

**Route:** `/dream/2728-bifurcation`

## The one question

What if a piece of music WERE the route to chaos — you sweep one control knob
and hear a single held tone period-double into an ostinato, into polyrhythm,
into noise, and back out through the periodic windows — and the bifurcation
diagram is the score?

## What it does

A self-playing, stateful long-form piece. On **Begin**, the logistic map

```
x_{n+1} = r · x_n · (1 − x_n)
```

is iterated live and sonified. A single control parameter `r` creeps on
autopilot from `2.8 → 4.0` over ~5.5 minutes and mirrors back down (period
≈ 11 minutes, looping), with **zero interaction required**. Optionally, drag
left↔right across the canvas to scrub `r` directly; release to hand control
back to the autopilot. Pause/Resume holds the autopilot in place.

## The mapping — attractor → pitch & rhythm

Rhythm rides **one-iterate-per-step** (~6.7 steps/s), so the attractor is heard
directly as the loop it forms:

| region of `r` | attractor | what you hear |
|---|---|---|
| `r ≈ 2.8–3.0` | one fixed point | one steady held tone |
| `r ≈ 3.0–3.45` | 2-cycle | two pitches alternating (a 2-step ostinato) |
| `r ≈ 3.45–3.57` | 4-, 8-, 16-cycle… | the loop lengthens, texture thickens |
| `r ≳ 3.5699` | chaos | a never-repeating wash approaching noise |
| `r ≈ 3.83` | period-3 window | a clean triplet surfacing out of the static |

Each orbit value `x ∈ [0,1]` maps **continuously** to frequency across ~2.8
octaves: `freq = 110 · 2^(x · 2.8)` Hz. The pitches are **never snapped to a
scale** — that is deliberate. The danger of the piece (that chaos sounds like
noise, that the pitches sit in no key) is the whole point; quantizing to a
scale would hide the mathematics under a false consonance.

A sustained triangle drone glides (portamento) between successive pitches to
give the wash continuity, while plucked sine notes mark each iterate and pan
by `x`. The master chain is lowpass + a dynamics limiter so the chaotic zone
stays tamed and never blasts.

## The long-form arc

The autopilot's slow creep of `r` is the form: at second zero it is a single
tone; by the accumulation point near `r ≈ 3.5699` (approached at the Feigenbaum
rate `δ ≈ 4.669`) it is dense chaos; deeper in it opens the periodic windows;
then it retraces the whole cascade backward. Minute five is audibly a different
piece from second zero — it travels the entire road to chaos and back.

## The visual — bifurcation diagram as score (Canvas2D)

Canvas2D, deliberately (no WebGL). The classic bifurcation diagram draws
**itself** as the score:

- **x-axis** = `r` (2.8 → 4.0), **y-axis** = attractor value `x` (0 → 1).
- As `r` sweeps, each column's settled orbit is stamped into a persistent
  accumulation layer, so the pitchfork cascade, chaotic bands and periodic
  windows fill in over time.
- A vertical **playhead** marks the current `r`; the current attractor points
  **pulse** as they sound, with a marker on the exact sounding `x`.
- A small **inset** shows the live orbit time-series ("what's sounding now"):
  a flat line for a fixed point, a zig-zag for a p-cycle, noise for chaos.

Clinical near-black ground, violet ramp for the art. 60fps
`requestAnimationFrame`, cancelled on unmount; the AudioContext and all nodes
are disposed on unmount.

## Reference

Robert May, "Simple mathematical models with very complicated dynamics,"
*Nature* 261 (1976) — the origin of the logistic map as a model of chaotic
dynamics; the period-doubling route to chaos and the Feigenbaum constant
`δ ≈ 4.669`.

This is the lab's first **period-doubling cascade rendered as musical form**.
Strange attractors appear elsewhere in the lab; this piece is different — it
makes the *cascade itself* — the successive doublings of the attractor — the
musical structure and the visible score.

## Files

- `logistic.ts` — pure map: `stepLogistic`, `computeAttractor` (distinct
  values + detected period), `sampleOrbit` (raw cloud for one diagram column).
- `audio.ts` — `LogisticSynth`: live iteration → continuous pitch, drone wash,
  lookahead scheduler, tamed master chain.
- `viz.ts` — `BifurcationRenderer`: accumulating bifurcation diagram, playhead,
  pulsing attractor highlight, live-orbit inset.
- `page.tsx` — client component: autopilot sweep, pointer scrub, transport,
  design-notes modal.
