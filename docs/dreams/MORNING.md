# Morning digest — last updated 2026-05-19 UTC (Cycle 39)

## New since yesterday

- **Cycle 39 was a research sweep** (no new prototype). 8 new entries in RESEARCH.md (§§53–60).
  5 new prototype ideas added to IDEAS.md. Next cycle (40): build `36-pluck-field`.

- **Most interesting find**: Karplus-Strong plucked-string synthesis is 3 Web Audio nodes per
  string (`DelayNode` feedback loop + `BiquadFilter(lowpass)` + `GainNode`) — and 35 prototypes
  exist in the sandbox without a single physical-modeling prototype. `36-pluck-field` fixes that.
  Click a canvas cell to pluck a virtual string; it rings and decays like a real string.

- **Surprise find**: MusicGen (`facebook/musicgen-small`) runs entirely in-browser via
  Transformers.js + ONNX. Zero API cost, zero FAL_KEY. 5s to first audio chunk with streaming.
  ~390MB model download (browser-cached after first load). Could make the long-queued `6-compose`
  prototype possible with no API dependencies. Needs Karel OK on model size.

## In progress / partial

- **Build queue (top 3):**
  1. `36-pluck-field` — Karplus-Strong harp (zero deps, one cycle, no research gap to fill first)
  2. `37-ratio-lab` — Tonnetz just intonation lattice (first tuning-theory prototype)
  3. `38-mood-xy` — Russell circumplex emotion synthesis (drag a dot, hear the mood as music)

- **Existing prototypes still due for polish:**
  - `35-loop-station`: true overdub mixing (sum AudioBuffers), waveform-while-recording
  - `34-spectral-morph`: phase propagation across hops, instrument spectral templates

## Research findings worth a look

- **ReaLJam (arxiv 2502.21267, CHI 2025)** — AI jamming with "anticipation": AI shows its
  planned next notes as ghost bars *before* playing them. Reduces latency surprise; creates
  genuine dialogue. Inspires `39-anticipate`: same Markov chain as `33-aria-companion` but with
  ghost-note preview rendering. "Watch Aria decide before she plays."

- **LIMITER (arxiv 2507.08675, Jul 2025)** — gamified just intonation interface using color +
  geometric transformations. Inspires `37-ratio-lab`: Tonnetz lattice where clicking a node
  plays the just-intonation interval against a drone; mic pitch detection highlights where you are.
  First Resonance prototype about *tuning systems*, not just frequency.

- **ASTRODITHER** (Three.js forum) — TSL audio-reactive experiment combining fluid sim,
  selective bloom, **dithering**, and **time warp**. Dithering gives a film-grain or halftone
  visual that none of the 35 existing prototypes use. Worth adding as a post-processing pass to
  `21-three-mesh-av` or a new prototype.

- **AffectMachine-Pop (arxiv 2506.08200, Jun 2026)** — real-time emotion-parameterized music
  generation using arousal × valence axes. Inspires `38-mood-xy`: drag a dot on a 2D emotion
  plane; rule-based Web Audio synthesis changes tempo, chord quality, and density in real time.
  No ML, no API, pure synthesis.

## Open questions for Karel

- **`30-lyria-jam`** still needs your Gemini API key (infinite steering AI music, most
  live-performance-relevant AI prototype in queue).
- **`31-gesture-music`** still needs OK on ~8MB MediaPipe CDN load.
- **`40-browser-musicgen`** needs OK on ~390MB Transformers.js model download (cached after
  first load, zero API cost per generation after that).
- **`iPlug3`** — worth a dedicated cycle for Resonance-as-installation (MCP server support
  confirmed, mirrors web audio APIs)?

## Sandbox: 35 prototypes + dashboard (cycle 38 — Cycle 39 was research)
