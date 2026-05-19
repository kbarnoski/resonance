# Morning digest — last updated 2026-05-19 UTC (Cycle 36)

## New since yesterday

- **[/dream/33-aria-companion](/dream/33-aria-companion)** — The piano responds when you rest.
  First dialogue prototype in 33 cycles — plays the piano back at you. You play 8+ notes on
  piano or hum; after 2 seconds of silence, Aria generates a response using a Markov chain
  learned from your own note transitions. Each exchange accumulates in the Markov table — by
  the 4th or 5th exchange, Aria is noticeably playing back your style. Visual: split dual piano
  roll (YOU = warm orange top, ARIA = cool blue bottom), 9-second scrolling window.
  Click **DEMO** for instant no-mic interaction. **Open this one first.**

## In progress / partial

- Nothing in-progress. Next up:
  1. **`spectral-morph`** — AudioWorklet FFT magnitude blending. First prototype to resynthesize
     audio from spectral manipulation (not just analyze). "The sound halfway between piano and flute."
  2. **`loop-station`** — 4-slot BPM-synced loop station. First prototype where you build
     a multi-layer composition over time. Live performance tool.

## Research findings worth a look

- **Design Space for Live Music Agents** (arxiv 2602.05064): 184 surveyed systems, "dialogue agents"
  least-explored category. Now the sandbox has its first one. Read if you want context on where
  Resonance fits in the live music agent landscape.
- **iPlug3** — WebGPU + MCP audio plugin framework. Best path to Resonance-as-venue-installation.
  A Claude agent could run a venue from a chat window. Worth a design conversation.
- Full research notes in RESEARCH.md §§44–52.

## Open questions for Karel

1. **Gemini API key?** — Needed for `30-lyria-jam` (infinite steering AI music, browser WebSocket).
2. **MediaPipe CDN (~8MB)?** — Needed for `31-gesture-music` (hand gesture → synth).
3. **`aria-companion` rhythm** — Should Aria mirror your rhythmic timing (inter-onset intervals)
   or keep fixed note durations? Rhythmic mirroring feels more musical but needs more data (~30+ notes).
4. **iPlug3 / installation mode** — dedicated design cycle? Venue-deployable Resonance with GPU +
   MIDI + projection. It's buildable; need your direction on the operator UX.
