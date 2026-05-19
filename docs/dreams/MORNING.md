# Morning digest — last updated 2026-05-19 UTC (Cycle 40)

## New since yesterday

- **[/dream/36-pluck-field](/dream/36-pluck-field)** — Pluck Field (Cycle 40)
  24 Karplus-Strong virtual strings. Click a cell → physical plucked-string sound + standing
  wave animation. Low strings ring 3s; high strings decay in 0.5s — from the physics, not
  tweaked by hand. Touch-drag for harp glissando. Mic: onsets pluck octave-matched strings.
  **First physical modeling synthesis prototype.** "What if the canvas was a harp?"

## In progress / partial

- All 36 prototypes are demoable. No in-progress skeletons.
- Polish candidates: `36-pluck-field` (add compressor + strum-sweep button),
  `33-aria-companion` (add anticipation layer from ReaLJam), `35-loop-station` (overdub).

## Queue highlights (what's next)

- **`37-ratio-lab`** — Tonnetz just-intonation lattice. Click any ratio node to hear it
  against a drone; mic highlights your pitch on the lattice. First prototype about *tuning
  theory*. High surprise value. Zero deps, one cycle.
- **`38-mood-xy`** — Arousal × valence emotion plane. Drag a dot → Web Audio generates music
  in real time (tempo, chord quality, register all driven by coordinates). First output-mode
  prototype. Zero deps, one cycle.
- **`39-anticipate`** — Extends `33-aria-companion`: AI response notes appear as ghost bars
  *before* they play (ReaLJam CHI 2025 insight: transparency improves perceived collaboration).

## Research findings worth a look

- RESEARCH.md §§53–60 (Cycle 39): Karplus-Strong, ReaLJam anticipation, LIMITER Tonnetz,
  in-browser MusicGen via Transformers.js (~390MB), AffectMachine-Pop arousal×valence.
- Most actionable: `37-ratio-lab` (no deps, 1 cycle) and `38-mood-xy` (no deps, 1 cycle).

## Open questions for Karel

- **~390MB model OK?** `40-browser-musicgen` needs `facebook/musicgen-small` ONNX weights
  via CDN (Transformers.js). Zero API cost after first load. Approve CDN dep + download size?
- **Gemini key?** `30-lyria-jam` (infinite steerable AI music) needs a Gemini API key.
  Store in sessionStorage only, never committed. Most live-performance-relevant AI music
  prototype in the queue.
- **MediaPipe CDN (~8MB)?** `31-gesture-music` — webcam hand gestures → synth. Needs CDN.
- **`iPlug3` design cycle?** Best current path to Resonance-as-installation (Tauri, venue
  deployment, MIDI/OSC). Worth a dedicated planning cycle?
