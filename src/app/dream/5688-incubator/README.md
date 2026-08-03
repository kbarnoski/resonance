# Incubator

_Route: `/dream/5688-incubator` · Canvas2D + Web Audio · self-runs deterministically from `mulberry32(0x5688)`_

## What it is

An autonomous **dream-director** drifts a lone visitor through the fragmentary,
self-morphing tableaux of sleep onset (hypnagogia) — drifting forms, receding
corridors, faces in the dark, warped landscapes, autobiographical fragments,
luminous fields, entoptic lattices. No drug, no input: the screen and sound do
the work. A short musical/visual **seed motif** is chosen at load and keeps
resurfacing, transformed, as the dream drifts. Pole: cosmic-ambient — slow,
weightless, luminous-dim.

## The one question it answers

**Can a dream feel _purposeful_ — a mind with shifting wants — rather than a
random Markov walk?** You can watch the director _want_ things, weigh its
options, and choose.

## The director: utility-AI over a blackboard

Not a random walk. The director is a **utility-based action-selection** system
(game-AI utility-AI lineage) over a **blackboard** of continuous drives:

- `seekCalm` — rises with time and depth; bled off by calming scenes.
- `seekNovelty` — accrues the longer we dwell; satisfied by switching scenes.
- `returnToSeedMotif` — the **incubation pull**; rises on a slow ~26 s cycle.
- `deepen` — tracks the global `depth` toward sleep.
- `settle` — spikes on a hypnic jerk, then decays.

Every few seconds all **8 scene-archetypes** are scored against the live drive
vector — each drive weighted by the rising `depth` (deeper ⇒ calm/deepen
dominate, novelty fades, dwell lengthens), plus a little **seeded exploration
noise** and a **recency penalty** so it never sticks. The best-satisfying scene
wins and its transition begins; the drives it satisfies are updated. Each scene
carries a **utility profile** (`satisfies`) and its own musical mode/timbre and
Canvas2D tableau. See `SCENES` and `scoreScenes`/`stepDirector` in
`director.ts`.

A global `depth` rises over a ~200 s arc; rare **hypnic-jerk** events spike
`settle` and force a single abrupt (non-flashing) transition.

## The incubated motif (TDI made literal)

A seed **motif** — a 3–5 note phrase + a small glyph — is fixed at load. Each
time `returnToSeedMotif` peaks on its slow cycle, the theme **recurs in a
transformed guise**: transposed, inverted, time-stretched, re-colored, or
retrograde (`makeRecurrence`). The recurrence plays as a bell-like phrase, the
glyph blooms over whatever scene is showing, and a line is added to the on-screen
**motif ledger**. This literalizes the finding that a theme seeded at sleep
onset keeps reasserting and developing — "a dream that is _about_ something and
keeps returning to it."

## Legibility (reads on a silent phone)

The director draws its own state as overlay chrome: **drive bars** (live level;
the winning drive highlighted), the **utility scores** of the last decision
(which scene won and _why_), a **depth** meter with a drowsy → near-sleep label,
the current scene name, the **motif ledger** of recurrences + their transform,
and a hypnic-jerk counter. Everything reads with zero audio.

## Safety

No strobe/flicker. Only slow luminance drift and soft dissolves; the hypnic-jerk
"snap" is a single abrupt transition with a brief, soft luminance lift (decays
in ~0.7 s), never a repeating flash. No full-screen high-contrast pulsing.

## Tech

Canvas2D + Web Audio API only. No three.js/WebGL/WebGPU, no SVG art surface, no
new npm deps. Fully self-contained (no imports from other `dream/` folders). All
randomness flows through a hand-written `mulberry32(0x5688)`; timing uses
`performance.now()` deltas. The visual arc self-runs from mount; one
"Begin the drift" tap starts audio (Web Audio needs a gesture). Degrades
gracefully: no audio ⇒ the visual dream still runs with a notice.

## Named references (framed as phenomenology, not medical claims)

- MIT **Dormio** / **targeted dream incubation** (Adam Haar Horowitz, MIT Media
  Lab).
- "Targeted dream incubation at sleep onset can influence later dream content in
  REM sleep," _Frontiers in Sleep_ (2026).
- Dave Mark, _Behavioral Mathematics for Game AI_ — utility AI / behavior
  selection.
- Andreas Mavromatis, _Hypnagogia_ (1987) — the phenomenology (faces, drifting
  forms, autobiographical fragments).
- Brian Eno — generative ambient.

## Known rough edges

- Scene tableaux are minimal/suggestive by design; the "faces" and
  "autobiographical fragment" scenes read as gestures, not detailed imagery.
- The audio is a soft pad triad + delay tail; it is deliberately sparse and does
  not attempt spatialization or convolution reverb.
- Utility scores are normalized for the bar display with a rough fixed range;
  the numeric value is the source of truth.
- Determinism holds for the drive/decision logic and assets; exact frame timing
  depends on the display refresh rate, which very slightly shifts _when_
  decisions land (not _what_ the logic computes).
