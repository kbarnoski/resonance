# Morning digest — last updated 2026-05-19 UTC (Cycle 43)

## New since yesterday

- **[/dream/39-anticipate](/dream/39-anticipate)** — Aria Anticipate (Cycle 43) ← **start here**
  Extends `33-aria-companion` with ReaLJam-style ghost-note anticipation. After you play a phrase
  and pause, Aria's *entire planned response* appears as dashed blue outlines in the ARIA panel —
  all notes visible — **before a single sound plays**. Over the next 8 seconds, each note solidifies
  left-to-right with a brief glow flash as it sounds. You watch the AI decide, then execute.
  The canvas time window splits into past (left of center line) + future (right), making Aria's
  plan spatially visible. "Watch Aria decide before she plays." Zero deps.
  From ReaLJam (CHI 2025): showing AI intention before execution was the single highest-rated
  design feature in human-AI duet experiments.

- **[/dream/38-mood-xy](/dream/38-mood-xy)** — Mood XY (Cycle 42)
  Russell circumplex emotion plane: X = valence (sad ← happy), Y = arousal (calm ↕ energetic).
  Drag the dot. Web Audio synthesizes music in real time — entirely from position, no mic.
  Four quadrant sounds are immediately distinct: top-right = fast bright major arpeggios (120 BPM),
  top-left = dark diminished runs (110 BPM), bottom-right = sustained major pads (55 BPM),
  bottom-left = sparse minor chords (40 BPM). **First prototype where audio is generated FROM
  emotional coordinates, not analyzed from input.**

## In progress / partial

- All 39 prototypes are demoable. No in-progress skeletons.

## Queue highlights

- **Polish `39-anticipate`** — confidence shading (ghost bar brightness = Markov probability),
  chord connection lines (notes ≤50ms apart linked), anticipation delay slider.
- **Polish `38-mood-xy`** — chord progression cycling (I → IV → V → I), mic → arousal feedback.
- **`40-browser-musicgen`** — in-browser MusicGen. Awaiting Karel OK (see open questions).

## Research findings worth a look

- RESEARCH.md §53: ReaLJam (CHI 2025, arxiv 2502.21267) — anticipation in AI jamming.
  Seeing planned notes before execution was the highest-rated design feature. Ghost notes
  directly validated by human-AI experiment. `39-anticipate` tests this in browser, zero cost.

## Open questions for Karel

- **~390MB model OK?** `40-browser-musicgen` — in-browser AI music via Transformers.js.
  Zero API cost after first CDN load. Works offline after first download. Approve?
- **Gemini key?** `30-lyria-jam` — infinite steerable AI music via WebSocket. sessionStorage only.
- **MediaPipe CDN (~8MB)?** `31-gesture-music` — webcam hand gestures → synthesizer.
- **`iPlug3` design cycle?** Best current path to "Resonance as a venue installation."
