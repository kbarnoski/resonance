# Morning digest — last updated 2026-05-20 UTC (Cycle 62)

## New since yesterday

- **[/dream/51-diatonic-harmony](/dream/51-diatonic-harmony)** — Diatonic Harmony `demoable` (Cycle 62)
  Play a melody → the key is detected from what you play → each note gains its diatonic third
  and fifth as sine voices, panned ±28° for spatial separation. Three-color scrolling piano roll:
  **orange** = melody, **light blue** = third, **deep blue** = fifth.
  **Demo plays Bach BWV 772 with harmonies** — watch how scale degree 7 (B) gets a *diminished fifth*
  (the leading-tone dissonance), while all other degrees get a perfect fifth. That's the first
  prototype to show music theory in action via color + position. Zero deps, zero API.

- **[/dream/](/dream/)** — Dashboard `demoable` (Cycle 60)
  Full MORNING.md renders at the preview URL. No more GitHub needed for the morning digest.

## In progress / partial

- Nothing in-progress. All prototypes demoable.
- **Next build candidates** (in priority order):
  1. `concept-steer` — 6-axis hexagonal radar chart synthesizer (Brightness/Density/Regularity/
     Complexity/Energy/Mode). Same vocabulary as music AI internal representations. Zero deps.
  2. `ghost-sfx` — ElevenLabs SFX for Ghost scene spatial audio. FAL_KEY in use, endpoint
     needs confirming.
  3. `claude-shader` — needs `ANTHROPIC_API_KEY` in Vercel env (see Open questions).

## Research findings worth a look

- **`concept-steer` (§94, arxiv 2505.18186)** — Sparse autoencoders on transformer music
  models found 6 interpretable axes: **Brightness, Density, Regularity, Complexity, Energy, Mode**.
  Prototype: hexagonal radar chart as a synthesizer. These are the same words a musician uses.
  Build next cycle — zero deps.

- **`claude-shader` (§93, arxiv 2512.08951)** — Proven that LLMs can generate compilable,
  audio-reactive GLSL shaders from text descriptions. Claude generates a shader; it runs on a
  fullscreen quad with Web Audio FFT uniforms (`uBass`, `uMid`, `uTreble`, `uOnset`).
  Self-referential: Claude writes the code that reacts to your music. **Needs ANTHROPIC_API_KEY.**

- **Diatonic harmony research basis (§96, arxiv 2506.18143)** — The AI Harmonizer paper
  (Anticipatory Music Transformer) does 4-part harmony. Cycle 62 built the browser version
  without ML — pure key detection + interval lookup. The diminished fifth on scale degree 7
  is audible in the demo.

## Open questions for Karel

1. **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader`. One-cycle build, admin-only.
2. **`GEMINI_API_KEY`** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`.
3. **`arc-compose` (`/dream/48-arc-compose`)** — if API error shows in red, paste it and it
   gets fixed next cycle (MiniMax endpoint naming needs confirmation).
4. **Tap Rhythm feedback** — amplitude thresholds are tunable; say if kick/snare/hat
   feels off on your setup.
