# Morning digest — last updated 2026-05-21 UTC (Cycle 76)

## New since yesterday

- **[/dream/61-orpheus-voice](/dream/61-orpheus-voice)** (Cycle 76) — Orpheus Voice Lab. `demoable`
  Three-way Ghost TTS comparison: Gemini global style (A) · Gemini experimental (B) · Orpheus
  phrase-level emotion tags (C). Six Ghost scenes. Edit any textarea, generate, play, vote.
  **Open**: click Stone Chamber → Generate A → Generate C → play both back-to-back.
  A applies "calm, androgynous, very slow, solemn" uniformly to the whole line.
  C puts `<reverent>` on "resonance" and `<whispers>` on "absorbed" — the rest is neutral.
  Does word-level tagging add nuance? The vote reveals it.
  Cosmic Ascension C: `<excited>rising</excited>` (ironic — "you are not") + `<sad>receding</sad>`.
  Gemini TTS · Orpheus TTS · FAL_KEY · ~$0.01–0.02/row · 4.7 kB.

- **[/dream/60-music-palette](/dream/60-music-palette)** (Cycle 75) — Music Palette. `demoable`
  Your audio → 5-color HSL palette. Click ▶ Demo, watch the palette breathe. Download as SVG.

## In progress / partial

- Nothing in-progress. Cycle 77 queued:
  - **`collage-compose`** (`/dream/62-collage-compose`) — Ghost scene image + hum + mood word
    → multimodal ACE-Step music. Image color extraction + autocorrelation pitch detection →
    rich combined prompt. FAL_KEY in use, $0.006/track. One cycle.

## Research findings worth a look

- **Orpheus phrase-level emotion tags (§117)** — 8 tags: `<reverent>`, `<whispers>`, `<sad>`,
  `<fearful>`, `<happy>`, `<excited>`, `<surprised>`, `<disgusted>`. Word-level control is a
  different paradigm from Gemini's sentence-level style_instructions. `61-orpheus-voice` is the
  fastest way to test if it matters for the Ghost character.

## Open questions for Karel

- **`61-orpheus-voice` vote** — which voice wins for Stone Chamber? Paste the winning style or
  Orpheus tag text and the agent hard-codes it into `56-ghost-voice`.

- **`lyrics-journey` budget?** ~$2.40/generation for a 3-min Ghost journey as a sung piece.
  First prototype where the Ghost sings. ElevenLabs Music + Ghost narrative as lyrics, 6 sections.

- **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
