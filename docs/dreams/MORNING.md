# Morning digest — last updated 2026-05-20 UTC (Cycle 52)

## New since yesterday

- **[/dream/44-vocal-bgm](/dream/44-vocal-bgm)** — Vocal BGM (Cycle 52, built this cycle)
  Record 5–15 seconds of humming or piano. Pick a genre: jazz trio / ambient / cinematic / rock / folk.
  Click **Arrange →** (~20–40s). ACE-Step 1.5 on fal.ai generates a 30-second full-band arrangement
  around your melody — your hummed line stays as the lead voice, AI adds drums/bass/chords beneath.
  **This is different from `43-stable-extend`**: stable-extend continues your phrase forward in time;
  vocal-bgm wraps a full band *around* it. Try: hum "Autumn Leaves" head, pick jazz trio, arrange.
  $0.006/arrangement. FAL_KEY already in use — should work immediately. ⚠ API endpoint from research;
  if it errors, paste the message and we'll fix parameters.

## In progress / partial

- Nothing currently in-progress.

## Open questions for Karel

1. **`44-vocal-bgm` API** — did it work? The endpoint `fal-ai/ace-step/audio-to-audio` is from
   research notes (§77). If you see a red error, paste the text here and we'll fix.
2. **GEMINI_API_KEY** — still needed for `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
   `piano-to-ghost`. Four prototypes blocked by one key. Free tier at Google AI Studio.
3. **A-Frame CDN dep (~1MB)** — OK for `ghost-xr` WebXR prototype (step inside Ghost scenes)?
4. **CDN ONNX dep (~2MB)** — OK for `neural-pitch` CREPE-tiny upgrade? Upgrades 6+ prototypes.

## Queue (next cycles)

- **`guided-session`** — Guided brainwave path: Stressed → Calm via β→α→θ. Session timers,
  transition prompts, noise layer. Clinically grounded. Zero deps. One cycle.
- **`osc-composer`** — Design a Lissajous figure, download the stereo WAV that draws it.
  First prototype where the audio IS the visual artifact. Zero deps. One cycle.
- **`mood-journey`** — Proactive mood traversal: place "Now" and "Goal" on the Russell
  circumplex, the synthesizer glides automatically over 5–20 min. Zero deps. One cycle.
- **Research** due Cycle 54–55 (Cycle 51 was last, cadence = 3–4 cycles).
