# Morning digest — last updated 2026-05-20 UTC (Cycle 53)

## New since yesterday

- **[/dream/45-guided-session](/dream/45-guided-session)** — Guided Brainwave Session (Cycle 53, built this cycle)
  Pick a journey ("Stressed → Calm", "Scattered → Calm", "Wired → Drowsy", "Alert → Deep Rest"),
  set a step duration (Quick 30s demo / Normal 5m / Deep 10m), and let the session walk you from
  your starting state to your goal via isochronic tones. **Works with any speaker — no headphones.**
  The canvas shows rings that visibly slow as the journey descends through states — β⁺ (tight
  staccato) → α (wide ripples) → θ (3-second pulses). Session summary at the end.
  First Resonance prototype that is also a clinical wellness tool (research basis: RESEARCH.md §§74, 75, 80).
  **Try first**: Scattered → Calm · Quick 30s · let it run 90 seconds. Then try Normal 5m for the real arc.

- **[/dream/44-vocal-bgm](/dream/44-vocal-bgm)** — Vocal BGM (Cycle 52, previous cycle)
  Record 5–15 seconds of humming or piano → ACE-Step generates a 30s full-band arrangement around
  your melody. $0.006/arrangement. ⚠ API endpoint from research — if it errors, paste the message.

## In progress / partial

- Nothing currently in-progress.

## Research findings worth a look

- **RESEARCH.md §§74–75**: "Music as controlled hallucination" (Frontiers 2026) + MindMelody closed-loop
  EEG music therapy — both validate what `42-binaural` and `45-guided-session` do. Resonance's
  "transcendent listening" thesis has explicit scientific grounding now.
- **RESEARCH.md §82**: Oscilloscope music — the genre where SOUND IS the VISUAL. `osc-composer`
  prototype inverts `20-scope`: design the Lissajous shape, get the stereo WAV that draws it.

## Open questions for Karel

1. **`44-vocal-bgm` API** — did ACE-Step work? Endpoint is `fal-ai/ace-step/audio-to-audio` from §77.
   If you see a red error message, paste it and we'll fix parameters next cycle.
2. **GEMINI_API_KEY** — four prototypes blocked: `lyria-ghost`, `binaural-lyria`, `lyria-jam`,
   `piano-to-ghost`. Free tier at Google AI Studio. One key, four prototypes.
3. **A-Frame CDN dep (~1MB)** — OK for `ghost-xr` (step inside Ghost scenes in WebXR)?
4. **CDN ONNX dep (~2MB)** — OK for `neural-pitch` CREPE-tiny? Upgrades 6+ existing prototypes.

## Queue (next cycles)

- **`osc-composer`** — Design a Lissajous figure, download the stereo WAV. First prototype where
  the audio IS the visual artifact. Zero deps. One cycle.
- **`mood-journey`** — Place "Now" and "Goal" on Russell circumplex, synthesizer glides automatically
  over 5–20 min. Combines `38-mood-xy` synthesis + isochronic tones. Zero deps. One cycle.
- **Research** — due Cycle 54–55 (Cycle 51 was last; 3–4 cycle cadence).
- **Gemini key prototypes** (`lyria-ghost`, `binaural-lyria`) — as soon as key is available.
