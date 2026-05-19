# Morning digest — last updated 2026-05-19 UTC (Cycle 35)

## New since yesterday

- **Cycle 35 — research sweep** (no new prototype built)
  9 new entries in RESEARCH.md (§§44–52). 3 new prototype ideas queued. Top finds:

  - **`aria-companion`** — queued as next build. User plays a piano phrase; after 2s of silence,
    the system generates a Markov-chain response (built from the user's own note vocabulary) and
    plays it back as a piano sound. "The piano responds when you rest." This is the first
    **dialogue** prototype in the sandbox — all 32 current prototypes are *reactive* (every frame),
    none are *compositional* (listen → think → respond). Inspired by Aria-Duet from NeurIPS 2025.
    Zero deps, one-cycle build.

  - **`spectral-morph`** — queued. AudioWorklet FFT magnitude interpolation blends two audio
    timbres into a genuine acoustic hybrid. Morph slider at 0.5 produces a sound that can't exist
    in nature. "The sound halfway between your piano and a flute." First prototype to resynthesize
    from spectral manipulation. Zero deps, one cycle.

  - **`loop-station`** — queued. Four BPM-synced loop slots. Tap to record, tap to close + loop.
    Phase-locked playback. Overdub. "A Boss RC-1 in your browser." First prototype where you
    BUILD a multi-layer composition rather than just react to one. Zero deps, one cycle.

## In progress / partial

- Nothing in progress. Priority order for next builds:
  1. `aria-companion` (dialogue agent — novel paradigm, zero dep)
  2. `spectral-morph` (FFT resynthesis — novel audio technique, zero dep)
  3. `loop-station` (live performance looper, zero dep)
  4. `27-gpu-additive` (GPU physics = synthesizer, complex, WebGPU, 2 cycles)

## Research findings worth a look (RESEARCH.md §§44–52)

- **Design Space for Live Music Agents** (arxiv 2602.05064, Feb 2026): survey of 184 live music
  systems. Main finding for Resonance: of all interaction types, "dialogue agents" (listen then
  respond) are the least-explored. The entire sandbox is reactive; `aria-companion` is the first
  to respond compositionally. Worth reading if you want to understand where Resonance sits in the
  broader landscape.

- **iPlug3** (Jan 2026): new audio plugin framework using WebGPU + SDL3 + MCP natively. Scripts
  mirror browser web APIs (so dream sandbox code is transferable). 120 FPS visualizations. iPlug3
  plug-ins are MCP servers — a Claude agent could control a venue installation from a chat window.
  **If you're thinking about Resonance as a live installation**, iPlug3 is the clearest current
  path. Worth a design-focused conversation.

- **Kling 2.6**: Ghost image → 5s cinematic video + native audio + optional spoken line, $0.70/clip.
  "A king walks slowly and says 'I remember.'" — same syntax works for Ghost. Three ghost-animate
  options now: HappyHorse (cinematic quality), Kling 2.6 (audio + speech), Veo 3.1 Fast (cheapest
  at $0.75 with audio). All need FAL_KEY.

- **Web Audio API — Configurable Render Quantum** (Q4 2026): buffer sizes below 128 samples →
  sub-3ms audio latency. Will improve all pitch-detection prototypes (currently ~20ms detection
  lag). Lands in Q4 2026. Nothing to build yet — but `aria-companion` and `loop-station` will
  benefit when it ships.

## Open questions for Karel

1. **Gemini API key?** — Enables `30-lyria-jam` (infinite streaming AI music, steer live with
   text sliders: "jazz piano 1.5× + ambient drone 0.5×").
2. **MediaPipe CDN dep (~8MB)?** — Enables `31-gesture-music` (hand position → pitch, spread →
   reverb, curl → harmonics). One-time download.
3. **Aria-companion Markov strategy**: the prototype learns your pitch vocabulary while you play.
   Should it also accept a target style preset (pentatonic, chromatic, blues scale) to bias the
   response? Would that feel too curated or usefully constraining for live performance?
4. **iPlug3 / installation mode** — worth a dedicated conversation cycle? It's the clearest path
   to a venue-deployable Resonance with GPU + MIDI + projection at 120 FPS.
