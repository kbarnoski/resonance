# Morning digest — last updated 2026-05-21 UTC (Cycle 73)

## New since yesterday

- **[/dream/59-gemini-voice-lab](/dream/59-gemini-voice-lab)** (Cycle 73) — Ghost Voice Lab.
  A/B style test for Gemini TTS. Pick a scene, tweak the style_instructions textareas, hit
  **Generate A** and **Generate B**, listen, vote. Votes accumulate in localStorage per scene.
  Pre-loaded contrast pairs: Stone Chamber (calm/solemn ↔ whispered/intimate), Cosmic Ascension
  (transcendent/vast ↔ zero-affect/infinite distance), Tiny Planet (airy/vast ↔ small/wondering).
  Textareas are fully editable — try anything. "Find the Ghost's voice."
  Gemini TTS · FAL_KEY · ~$0.01/pair · 4.27 kB.

- **[/dream/58-music-to-ghost](/dream/58-music-to-ghost)** (Cycle 72) — Play for 8 seconds,
  Ghost LoRA image appears in the scene that matches your chord/energy. Demo mode loads instantly.

## In progress / partial

- Nothing in-progress. Research cycle due next (Cycle 74) — IDEAS queue is rich (30+ items).

## Research findings worth a look

- **Voice character exploration** — the B variants in `59-gemini-voice-lab` are deliberately
  provocative: "zero affect, infinite distance" for Cosmic Ascension might be more powerful than
  an expressive reading. The deadpan "You are not rising. The world is receding." is an interesting
  experiment. The textareas are fully editable — you can test any direction in < 30 seconds.

- **Room acoustics vs. speaking style** — Gemini TTS style_instructions control speaking-style
  (pace, affect, register), not acoustic space. If you want true room reverb on the Ghost voice,
  it would need a ConvolverNode post-processing step (same impulse-response technique as
  `29-scene-spatial`). Easy to add if the voice character feels right but "dry."

## Open questions for Karel

- **`59-gemini-voice-lab`** — Which style direction wins for Stone Chamber and Cosmic Ascension?
  After voting, paste the winning style_instructions string and I'll hard-code it into `56-ghost-voice`.

- **`58-music-to-ghost` demo result** — does the scene feel right for C major / calm energy?
  Should be Forest Dawn. If it lands in Stone Chamber, the energy threshold (0.35) needs tuning.

- **`ANTHROPIC_API_KEY` in Vercel env?** → Enables `claude-shader` (LLM-generated GLSL shaders).

- **`GEMINI_API_KEY`?** → Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`.
