# Morning digest — last updated 2026-05-31 UTC (cycle 259)

## New since yesterday

- **`/dream/225-aria-companion`** (cycle 259, adult) — Play a phrase on your piano. Pause.
  Aria responds with a phrase built from a **Markov chain trained on your own intervals** —
  then listens again. The longer you play, the more it mirrors your melodic habits. By exchange 4–5
  the response starts sounding like it studied you specifically (not just pentatonic fallback).
  Split piano roll: YOU in orange on top, ARIA in blue on bottom. Scrolls left in real time.
  **First dialogue prototype** — 224 priors all react continuously; this one waits for a complete
  thought before answering, the way jazz musicians actually trade phrases.
  Demo mode included. Zero deps · zero AI calls · 3.66 kB.

- **`/dream/224-kids-glow-garden`** (cycle 258, kids) — Tap to grow a flower; plant two nearby
  and a resonance arc connects them + a 3-note chord chimes. WHERE you plant = which harmonies form.
  First tap wakes demo flowers retroactively. Kids 3+ · zero permissions.

## In progress / partial

Nothing in-progress. Next: kids cycle 260.

## Research findings worth a look

- **Markov chain IS the feature, not a compromise.** The Aria Companion response quality is
  actually most interesting at exchanges 4–8. Earlier exchanges use the pentatonic fallback heavily
  (not enough data). Later exchanges, if Karel favors e.g. descending fifths, Aria will serve them
  back consistently. The "surprise" moment when a response sounds personally familiar is cycle 5–7.
  Worth trying a longer session.

- **Inharmonicity trick:** the 4.05× partial (slightly detuned from true 4th harmonic) creates
  subtle beating similar to real piano strings. Costs nothing computationally, noticeably warms
  the timbre vs. a pure 4× partial. Worth reusing in future piano-timbre prototypes.

## Open questions for Karel

- **`225-aria-companion`**: try playing a 10–12 note phrase that uses a lot of one specific interval
  (say, all ascending fourths). By exchange 3–4, watch if Aria starts preferring that interval in
  its responses. That's the Markov table working. If you play C→F→Bb→Eb the table should start
  serving ascending-fourth chains back at you.

- **`/api/audio/[id]`** — still pending your OK. Unlocks `paths-granular` (granular synthesis
  of your Welcome Home album tracks). One yes covers it.

- **`217-dance-avatar`** ❤️ + **`221-optical-flow-music`** follow-up — gesture-music prototype
  (hand landmarks via MediaPipe) is queued. Needs your OK on ~8MB CDN load for MediaPipe WASM.
  Say the word.

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.

- **Cycle 261 adult candidates**: `chord-canvas` (first music-theory-named prototype — mic →
  chord name + color timeline), `mood-xy` (2D valence/arousal → synthesis), or polish
  `225-aria-companion` with a Markov heatmap overlay (12×12 pitch-class grid showing your
  interval tendencies as a visual map). Which sounds most interesting?
