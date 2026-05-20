# Morning digest — last updated 2026-05-20 UTC (Cycle 63)

## New since yesterday

- **[/dream/52-concept-steer](/dream/52-concept-steer)** — Concept Steer `demoable` (Cycle 63)
  A hexagonal radar chart synthesizer. Six axes, each labeled with the vocabulary that music AI
  models use internally (from sparse autoencoder research, arxiv 2505.18186):
  **Brightness** (filter fc) · **Density** (BPM + voices) · **Regularity** (grid vs. free timing) ·
  **Complexity** (unison→9th chord) · **Energy** (attack speed) · **Mode** (major→minor→dim).
  Drag any vertex handle. The synthesizer follows in real time.
  Try the presets: **Jazz Improv** → fast bright major 9th arpeggios. **Dark Ambient** → sparse
  dim atmospheric drift. **Drone** → single held unison tone barely moving.
  **The axis labels are music theory vocabulary** — a pianist who doesn't know what a lowpass
  filter is still knows what "Brightness" means. Different from `38-mood-xy` (emotional
  coordinates): this is music-theorist vocabulary as the primary synthesizer UI.
  Zero deps, zero API.

- **[/dream/51-diatonic-harmony](/dream/51-diatonic-harmony)** — Diatonic Harmony `demoable` (Cycle 62)
  Play a melody → key detection (Krumhansl-Kessler) → diatonic third + fifth voices generated
  per note. Demo plays Bach BWV 772 with auto-harmonies. Scale degree 7 (B) gets a *diminished
  fifth* — audibly and visually distinct from the other degrees. Zero deps, zero API.

## In progress / partial

- Nothing in-progress. All prototypes demoable.
- **Next build candidates**:
  1. `ghost-sfx` — ElevenLabs SFX for Ghost scene spatial audio (FAL_KEY in use, endpoint TBC)
  2. `claude-shader` — needs `ANTHROPIC_API_KEY` in Vercel env (see Open questions)
  3. `concept-steer` polish — mic mode that shows where your playing sits on the radar
  4. Research due at cycle 64–65

## Research findings worth a look

- **`claude-shader` (§93, arxiv 2512.08951)** — Proven that LLMs can generate compilable,
  audio-reactive GLSL shaders from text descriptions. Claude writes a shader; it runs on a
  fullscreen WebGL quad with Web Audio FFT uniforms (`uBass`, `uMid`, `uTreble`, `uOnset`).
  Self-referential and high-surprise. **Needs ANTHROPIC_API_KEY in Vercel env.**

- **Concept Steer observation**: dragging Mode 0→1 at Complexity=0.85 walks through
  major 9 → minor 9 → diminished 7 as a continuous audio experience. The diminished end
  is genuinely tense in a way that the 2D `38-mood-xy` can't cleanly reach (bright+energetic+dim
  is not a natural quadrant of the valence/arousal plane).

## Open questions for Karel

1. **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` (LLM-generated GLSL shaders).
   One-cycle build, admin-only. High surprise value.
2. **`GEMINI_API_KEY`** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `piano-to-ghost`.
3. **`arc-compose` (`/dream/48-arc-compose`)** — if API error shows in red, paste it and it
   gets fixed next cycle (MiniMax endpoint naming needs confirmation).
4. **Concept Steer feedback** — does "Regularity" as a control feel natural? The timing jitter
   at low values creates a looser feel. Is the axis label right, or is "Swing" or "Groove" better?
