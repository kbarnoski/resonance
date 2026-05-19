# Morning digest — last updated 2026-05-19 UTC (Cycle 42)

## New since yesterday

- **[/dream/38-mood-xy](/dream/38-mood-xy)** — Mood XY (Cycle 42) ← **start here**
  Russell circumplex emotion plane: X = valence (sad ← happy), Y = arousal (calm ↕ energetic).
  Drag the dot. Web Audio synthesizes music in real time — entirely from position, no mic.
  Four quadrant sounds are immediately distinct:
  - top-right: fast bright major arpeggios (120 BPM)
  - top-left: dark diminished runs (110 BPM)
  - bottom-right: sustained major pads (55 BPM)
  - bottom-left: sparse minor chords (40 BPM)
  Background color shifts (amber / purple / teal / navy) with quadrant. White trail.
  **First prototype where audio is generated FROM emotional coordinates, not analyzed from input.**

- **[/dream/37-ratio-lab](/dream/37-ratio-lab)** — Ratio Lab (Cycle 41)
  Tonnetz just-intonation lattice. Click nodes to hear JI intervals against A3 drone.
  Chord shapes are triangles on the grid. First tuning-theory prototype in the sandbox.

## In progress / partial

- All 38 prototypes are demoable. No in-progress skeletons.

## Queue highlights

- **`39-anticipate`** — Extends `33-aria-companion` with ghost-note anticipation (ReaLJam CHI
  2025): AI's planned response notes appear as semi-transparent bars before they sound.
  "Watch Aria decide before she plays." Zero deps, one cycle.
- **Polish `38-mood-xy`** — chord progression cycling (I → IV → V → I), mic → arousal feedback,
  preset snap-dots at quadrant corners.
- **`40-browser-musicgen`** — in-browser MusicGen. Awaiting Karel OK (see open questions).

## Research findings worth a look

- RESEARCH.md §58: AffectMachine-Pop (Jun 2026) — arousal×valence → real-time music synthesis.
  Direct inspiration for Mood XY. Paper confirms Russell circumplex is the standard emotion model
  for affective music systems.
- RESEARCH.md §§53–60 (Cycle 39): Karplus-Strong, ReaLJam anticipation, LIMITER Tonnetz,
  in-browser MusicGen, AffectMachine-Pop.

## Open questions for Karel

- **~390MB model OK?** `40-browser-musicgen` — in-browser AI music via Transformers.js.
  Zero API cost after first CDN load. App works offline after first download. Approve?
- **Gemini key?** `30-lyria-jam` — infinite steerable AI music via WebSocket. sessionStorage only.
- **MediaPipe CDN (~8MB)?** `31-gesture-music` — webcam hand gestures → synthesizer.
- **`iPlug3` design cycle?** Best current path to "Resonance as a venue installation."
