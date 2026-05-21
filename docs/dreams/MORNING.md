# Morning digest — last updated 2026-05-21 UTC (Cycle 75)

## New since yesterday

- **[/dream/60-music-palette](/dream/60-music-palette)** (Cycle 75) — Music Palette. `demoable`
  Your audio becomes a 5-color HSL palette in real time. Bass energy shapes lightness
  (energetic = bright, calm = muted); treble-to-total ratio shapes the hue anchor
  (happy/bright = warm yellows, sad/dark = cool blues). Five swatches at ±30°/±60° hue
  offsets breathe together via a slow EMA (~1.5s time constant) — the palette shifts feel
  like a mood changing, not a signal flickering.
  **Open**: click ▶ Demo — watch the palette drift from warm to cool as the LFOs cycle.
  The "↓ svg" button in the controls bar downloads the current palette as a labeled SVG.
  Try: start the demo, wait until a color you like appears, then download. That's a
  snapshot of what that audio moment looked like as color.
  Zero deps · zero API · 4.15 kB.

- **[/dream/59-gemini-voice-lab](/dream/59-gemini-voice-lab)** (Cycle 73) — Ghost Voice Lab.
  A/B style test for Gemini TTS. Stone Chamber contrast: A = "calm/solemn" vs B = "whispered/intimate".
  Cosmic Ascension contrast: A = "transcendent" vs B = "zero-affect, infinite distance". Try both.

## In progress / partial

- Nothing in-progress. Cycle 76 queued:
  - **`orpheus-voice`** — Orpheus TTS as a 3rd track in `59-gemini-voice-lab`. Phrase-level
    emotion tags (`<reverent>resonance</reverent>`, `<whispers>absorbed</whispers>`).
    Zero new deps, FAL_KEY in use. One cycle.

## Research findings worth a look

- **Music2Palette (§120, ACM MM 2025)** — researchers found audio emotion → 5-color palette
  is a real cross-modal alignment, validated with listeners. The `music-palette` prototype
  implements this insight in the browser. The treble/bass → valence/arousal mapping is a
  deliberate simplification that degrades gracefully for any audio source, not just piano.

- **Orpheus TTS phrase-level tags (§117)** — `<reverent>word</reverent>`, `<whispers>word</whispers>`.
  $0.001/Ghost scene line, FAL_KEY in use. This is a different register from Gemini's global
  style_instructions — you direct individual words, not the whole voice. Natural next step for
  Ghost narration work.

## Open questions for Karel

- **`59-gemini-voice-lab` vote results** — which Ghost voice direction won for Stone Chamber?
  Paste the winning `style_instructions` and the agent will hard-code it into `56-ghost-voice`.

- **`lyrics-journey` budget?** ~$2.40/generation for a 3-min Ghost journey song
  (ElevenLabs Music with Ghost narrative as lyrics, 6 sections). Worth it?

- **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
