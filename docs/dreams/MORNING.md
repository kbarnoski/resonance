# Morning digest — last updated 2026-05-23 UTC (Cycle 129)

## New since yesterday

- **Cycle 129 — adult research sweep** (no new prototype; research was 12 cycles overdue)
  Scanned arxiv (May 2026), WebGPU GitHub trending, fal.ai/replicate, Gray Area SF, DATALAND LA.
  **7 new RESEARCH.md entries (§§184–190). 4 new IDEAS.md prototype seeds.**

  Top find: **Break-the-Beat!** (arxiv 2605.14555, published this month) — MIDI pattern + a reference
  drum audio sample → drum synthesis that adopts the reference's timbre. Freshest paper in the sweep.
  Inspires `midi-drum-forge` (step sequencer with timbral imprinting; browser-native approximation).

  Most buildable new seed: **`webcam-compose`** (Cycle 131 target) — webcam image analysis
  (no ML, no API) → synthesizer control: dominant hue → chord quality, brightness → register,
  saturation → harmonic richness, frame delta → tempo. Camera is the instrument.
  Directly inspired by LUMIA (arxiv 2512.17228, Dec 2025).

  Other new seeds added:
  - **`bio-echo`** — mic audio → ecological canvas: bass=soil tendrils, mid=canopy, treble=bird arcs.
    "Your music grows a forest." Zero deps, one cycle. Inspired by Refik Anadol's DATALAND / LNM.
  - **`landscape-resonance`** — WebGL simplex-noise terrain flying forward, audio deforms peaks.
    Bass=mountain height, treble=roughness, onset=terrain inversion. Inspired by Superradiance (Memo Akten).
  - **`live-harmonize`** — mic pitch detection → predict chord that harmonizes your partial phrase
    (not detect what you played — predict what chord fits). Distinct from `28-chord-canvas`.

- **[/dream/108-kids-kalimba](/dream/108-kids-kalimba)** — Kalimba (kids) · *Cycle 128* · `demoable`
  Eight colorful height-varied bars; tap any bar to pluck it with Karplus-Strong synthesis.
  Taller bar = lower note — the physical law of the kalimba tine. Drag for glissando.
  **Why open it**: hand to a child immediately after start. The bar heights teach pitch without words.
  Zero permissions · Zero API.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **Break-the-Beat!** (arxiv 2605.14555, May 2026 — this month): MIDI + reference audio timbre →
  drum synthesis. First drum-specific research in the sandbox. The timbral imprinting paradigm
  (reference WAV colors the synthesized output) is novel. Browser approximation: spectral envelope
  estimation via FFT + AudioBuffer resampling.
- **Superradiance** (Memo Akten + Katie Hofstadter, Gray Area SF, Feb 2026): multi-channel immersive
  film using embodied simulation — invisible dancers in AI-generated forests/oceans/deserts. Viewers
  feel the dancers' movements in their own bodies. Technique: biometric data drives procedural
  landscape deformation. Inspires `landscape-resonance` (audio → terrain height/roughness).
- **DATALAND** (Refik Anadol, opens June 20 2026, downtown LA): world's first AI arts museum.
  Inaugural exhibition "Machine Dreams: Rainforest" uses the open-source Large Nature Model (LNM)
  trained on 16 rainforests + Smithsonian/Cornell Lab data. Data becomes pigment — ecological
  images and sounds become continuously evolving digital sculptures. Inspires `bio-echo`.
- **WebGPU SPH fluid** (GitHub 2025–2026): two independent open-source projects (jeantimex/fluid,
  matsuoka-601/WebGPU-Ocean) run 10K–50K particles with proper Navier-Stokes physics at 60 FPS.
  Neither is audio-reactive — `sph-ocean-av` would fill that gap. Two-cycle build.
- **`webcam-compose`** is the highest-novelty zero-API seed in the queue. No prior prototype uses
  camera input as a synthesizer controller. One-cycle build, Cycle 131 target.

## Open questions for Karel

1. **`webcam-compose`** — comfortable with webcam access in the dream lab? It's permission-gated
   with graceful fallback to LFO demo mode. Want me to build it Cycle 131?
2. **`sph-ocean-av`** (WebGPU SPH fluid) — two-cycle build, more complex than standard prototypes.
   Worth the investment for the physically accurate fluid physics? Or keep the ping-pong texture
   approach from `107-ocean-presence`?
3. **Kalimba tuning** — C3–A4 (two octaves). Want it lower (C2–A3) for a deeper resonance?
4. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`, `45-piano-to-ghost`.
5. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
