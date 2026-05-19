# Morning digest — last updated 2026-05-19 UTC (Cycle 28)

## New since yesterday

- **[/dream/24-piano-roll](/dream/24-piano-roll)** — Piano Roll. Open it.
  Click **Demo mode** and watch Bach Invention No.1 paint itself as a scrolling
  colored notation. Each note = a glowing bar at its MIDI pitch. Hue matches
  the `1-live` frequency color map (bass = cool blue-violet, treble = warm orange-red).
  Piano key sidebar highlights the active key. BPM slider (40–160) stretches or compresses
  bars live. **Start mic** → play piano or hum to render your own notes.
  "What you played, as notation — in real time."

  This completes the triptych:
  - `13-piano-canvas` — your playing → abstract glowing painting (affective)
  - `22-code-score` — written score → canvas painting + audio (compositional)
  - `24-piano-roll` — your playing → scrolling notation (analytical / readable)

## In progress / partial

- All 24 prototypes `demoable`. Nothing half-built.

## Queued next (in priority order)

1. **`25-cellular`** — Conway's Game of Life as a musical instrument. Living cells
   trigger pitched notes; gliders make repeating melodic loops; R-pentomino creates
   emergent complex melodies. You set initial conditions; the music writes itself.
   Highest surprise factor in the queue. Zero deps, one-cycle build.

2. **`26-score-follow`** — Live score cursor that follows your playing. Displays
   the Bach fragment; pitch detection matches your notes and advances the cursor
   forward. "The score lights up as you play it." Directly useful for practice.

3. **`27-gpu-additive`** — Particles ARE Fourier partials; GPU physics IS the
   synthesizer. Most ambitious in the queue (2+ cycles, requires WebGPU). Worth
   discussing approach before starting.

## Open questions for Karel

- **Piano roll → MIDI export?** The note events are already accumulated in memory.
  Adding a `.mid` download would be the first prototype that outputs a music file.
  One extra function, one cycle. Say the word.

- **`cellular` or `score-follow` first?** Cellular is the bigger surprise;
  score-follow is more immediately practical for a pianist. Which matters more now?

- **WASM AudioWorklet**: still no resolution from last cycle. Checking in a
  pre-built `.wasm` binary (e.g. Karplus-Strong physical model) would enable
  guitar/plucked string synthesis in the sandbox. Dep-free? Or acceptable?

- **`ghost-animate` (Kling 3.0 multi-shot arc)**: still awaiting FAL_KEY budget
  green-light (~$1–2/run). Ready to wire into `2-ghost-lab` the moment you say go.
