# 13248 · Rubatoline

## The one question

**What if you could SEE the breathing rubato of Karel's own piano playing — the
elastic push-and-pull of his tempo — drawn as a living line of ink?**

Karel Barnoski's _Welcome Home_ is rubato-rich solo piano. Rubatoline runs
real-time, causal onset detection on one of his actual recordings and draws the
expressive timing: where his time is steady the ink marks fall evenly; where he
pushes and pulls, they bunch and spread and a breathing tempo-curve baseline
stretches and compresses to match. A rhythmic-stability readout distinguishes
intentional expressive push-pull from steady, metronomic time.

## How the technique works (all causal, past + present frames only)

Audio is always Karel's real recorded catalog — an `AudioBufferSourceNode`
routed into the `SafeMaster` ear-safety bus (never `ctx.destination`, never a
synth, tone, or microphone). Analysis is driven from `master.analyser`.

1. **Spectral-flux novelty.** Each frame calls `getByteFrequencyData` on the
   tamed master. The novelty function is the sum of _positive_ frame-to-frame
   magnitude differences across bins — energy that has newly appeared, which is
   what a piano hammer produces.
2. **Adaptive peak-pick → onsets.** The flux is compared against a running
   local threshold (`mean + 1.7·std` over a short trailing window, plus a small
   floor). Crossing it — subject to a ~90 ms refractory gate and a loudness gate
   — fires a **note onset**. Nothing looks into the future.
3. **Inter-onset intervals → local pulse.** Successive onset times give IOIs.
   IOIs outside `[0.11, 1.9] s` (chord simultaneities, long rests) are ignored,
   and the **median** of the last eight is inverted to a BPM — a robust,
   lightweight causal version of a Predominant Local Pulse. That estimate is
   smoothed each frame and becomes both the vertical height of the breathing
   baseline and the spacing of the predicted-pulse gridlines: they **compress**
   when he accelerates and **stretch** when he relaxes.
4. **Rhythmic stability.** The **coefficient of variation** (std / mean) of the
   last eight IOIs is the stability metric. Near-zero ⇒ metronomic time; high ⇒
   expressive rubato. It drives the meter and the STEADY / PUSH-PULL / RUBATO
   label.

## Output — SVG only

The score is inline SVG DOM (no Canvas2D, no WebGL): an ink-on-warm-paper
scrolling staff. Each onset drops an inked notehead at its moment; a flowing
`<polyline>` is the breathing tempo-curve baseline; faint `<line>` verticals are
the predicted pulse. The world scrolls under a fixed writing head via a single
`transform` translate updated in `requestAnimationFrame`; the tempo curve and
camera update by direct attribute writes, while the (infrequent) note and beat
elements come from throttled React state.

## Muted seeded demo

Because an `AudioContext` needs a user gesture, the first painted frame is
already alive: a deterministic, fixed-seed (`0x13248`, `mulberry32`) synthetic
onset/tempo sequence drives the _identical_ pipeline, alternating steady phrases
(even marks, flat line, low CV) with rubato phrases (bunching marks, an
undulating baseline, high CV). Pressing **Play** switches to Karel's real
analysed audio. If a track fails to load, the demo simply keeps running and an
on-brand notice appears. All timing comes from `performance.now()` and the
`AudioContext` clock — no `Math.random`, `Date.now`, or `new Date` anywhere.

Default track: **Bath** (rubato-rich). A selector switches among the 16 verified
tracks (13 Welcome Home + 3 Snowflake), imported from the shared arrays.

## Named references

- **Grosche & Müller**, "Predominant Local Pulse (PLP)" — the periodicity-driven
  local pulse whose causal spirit the tempo estimate follows.
- **"Rubato: Transcribing Piano Music with Timestamps"** (arXiv:2605.24291,
  2026) — expressive-timing transcription that motivates drawing rubato directly.
- **Simon Dixon**, "Onset Detection Revisited" — the spectral-flux + adaptive
  peak-picking onset method this prototype implements in real time.

## Files

- `page.tsx` — the `"use client"` prototype (default export).
- `README.md` — this file.
