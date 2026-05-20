# Morning digest — last updated 2026-05-20 UTC (Cycle 60)

## New since yesterday

- **[/dream/](/dream/)** — Dashboard enhanced `demoable` (Cycle 60)
  The `/dream/` index page is now a real morning-review dashboard.
  **Open this**: visit the Vercel preview URL directly — the full morning digest
  renders at the top (all four sections: New since yesterday, In progress, Research
  findings, Open questions), followed by a 3-cycle activity stream showing the last
  three cycles with their dates and decisions, then the full prototype grid.
  No more visiting GitHub to read MORNING.md — it's all at `/dream/` now.
  Phone-first layout (`max-w-3xl`), proper markdown rendering (bold, code, links,
  continuation bullets). Build: 176 B (static). Zero deps, zero API.

- **[/dream/50-tap-rhythm](/dream/50-tap-rhythm)** — Tap Rhythm `demoable` (Cycle 59)
  The first prototype any non-musician can walk up to and immediately use.
  Tap or clap a rhythm → 32-step circular drum loop in your detected tempo.
  Click **▶ Demo** for instant 4-on-the-floor — no permissions needed.

- **[/dream/49-anemone-av](/dream/49-anemone-av)** — Anemone AV `demoable` (Cycle 58)
  Bioluminescent sea anemone — 14 FK-chained tentacles dancing to audio.
  Sub-bass sways trunk, treble pulses violet tip beads. Zero new deps.

## In progress / partial

- Nothing in-progress. All recent prototypes are `demoable`.

## Research findings worth a look

- **Research due** — last research was Cycle 56. Now 4 cycles ago (57–60).
  Past the 3–4 cycle upper bound. Next cycle **must** be a research sweep.
- **Flow Music + Lyria 3 Pro (§85)** — Stem Splitter: extract drums/bass/piano from
  any AI track. Inspires `stem-spatial`. Needs GEMINI_API_KEY.
- **DARC §89** — tap/beatbox → drum accompaniment. `50-tap-rhythm` is the
  browser-native equivalent, now shipped.

## Open questions for Karel

1. **GEMINI_API_KEY** — still the biggest unlock. Four prototypes waiting:
   `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `stem-spatial`.
2. **`arc-compose` API** — if `/dream/48-arc-compose` shows an error, paste the
   raw message and the agent will fix the endpoint next cycle.
3. **Tap Rhythm feedback** — amplitude thresholds (0.33/0.66) calibrated for desk
   taps. If classification feels off on your setup, it can be tuned or replaced
   with an explicit kick/snare/hat selector before tapping.
