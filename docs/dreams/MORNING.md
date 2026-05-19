# Morning digest — last updated 2026-05-19 UTC (Cycle 41)

## New since yesterday

- **[/dream/37-ratio-lab](/dream/37-ratio-lab)** — Ratio Lab (Cycle 41)
  Tonnetz just-intonation lattice. Click any node to hear its JI ratio against an A3 drone.
  Click multiple nodes simultaneously — stacked sine waves at exact integer ratios. The
  first prototype that makes *harmonic theory visible*: chord shapes are triangles on the grid
  (major = right-angle at root, minor = inverted). Hover for JI fraction + cents deviation.
  Mic: blue ring jumps to the nearest node as you play.
  **"Navigate harmony as a landscape."** First tuning-theory prototype in 41 cycles.

- **[/dream/36-pluck-field](/dream/36-pluck-field)** — Pluck Field (Cycle 40)
  Physical modeling synthesis (Karplus-Strong). 24 harp strings, click to pluck.
  Touch-drag for glissando. Mic: onsets pluck octave-matched strings.

## In progress / partial

- All 37 prototypes are demoable. No in-progress skeletons.

## Queue highlights

- **`38-mood-xy`** — Arousal × valence emotion plane. Drag a dot → Web Audio generates
  music in real time (BPM, chord quality, register from coordinates). First output-mode prototype.
  Zero deps, one cycle.
- **`39-anticipate`** — Extends `33-aria-companion` with ghost-note anticipation display
  (ReaLJam CHI 2025). AI plans appear as semi-transparent bars before playing. One cycle.
- **Polish `37-ratio-lab`** — chord triangle highlighting, comma path visualization.

## Research findings worth a look

- RESEARCH.md §§53–60 (Cycle 39): Karplus-Strong synthesis, ReaLJam anticipation,
  LIMITER Tonnetz, in-browser MusicGen (~390MB Transformers.js), AffectMachine-Pop.

## Open questions for Karel

- **~390MB model OK?** `40-browser-musicgen` — in-browser AI music via Transformers.js.
  Zero API cost after first CDN download. Approve?
- **Gemini key?** `30-lyria-jam` — infinite steerable AI music. Store in sessionStorage only.
- **MediaPipe CDN (~8MB)?** `31-gesture-music` — hand gesture → synth.
- **`iPlug3` design cycle?** Best path to Resonance-as-installation (Tauri, venue, MIDI/OSC).
