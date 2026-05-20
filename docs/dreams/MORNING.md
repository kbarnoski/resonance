# Morning digest — last updated 2026-05-20 UTC (Cycle 49)

## New since yesterday

- **[/dream/43-stable-extend](/dream/43-stable-extend)** — Stable Extend (NEW, Cycle 49)
  Record a piano phrase · AI continues it as a 30-second seamless extension · bloom visualizer.
  **Why open this first**: press REC, play 10 seconds of piano, press STOP, press Extend →.
  You'll hear the AI pick up where you left off. First prototype where AI extends YOUR recording,
  not a text-prompt generation. Waveform shows amber (yours) | blue (AI) side by side.
  Cost: $0.20/generation. FAL_KEY already in use — no new setup needed.
  ⚠ The fal.ai endpoint (`fal-ai/stable-audio-25/inpaint`) was sourced from RESEARCH.md §70.
  If it shows an error, the raw error text is visible — reply to this note with what it says.

## In progress / partial

- Nothing in-progress. Cycle 50 picks from:
  1. Fix `stable-extend` API if the endpoint/params are wrong (short cycle)
  2. `lyria-ghost` — Ghost image → Lyria 3 30s ambient score (needs GEMINI_API_KEY)
  3. `binaural-lyria` — binaural beats + Lyria ambient music per brainwave state (needs Gemini)
  4. Polish `42-binaural` — session timer, per-state journal, optional noise layer (no API, safe fallback)

## Research findings worth a look

_(Cycle 48 research — still current)_

- **Lyria 3** — Gemini API music-from-image. Ghost scene photo → 30s ambient MP3. Same key as
  lyria-jam. Prototype `lyria-ghost` ready. Endpoint: `lyria-3-clip-preview`. One cycle, free tier.
- **Stable Audio 2.5** — just built. Audio continuation at $0.20. See stable-extend above.
- **Music as "controlled hallucination"** (Frontiers 2026) — validates Resonance's thesis.
  The `42-binaural` prototype is a direct implementation of the brain's interoceptive prediction
  loop. Worth reading §74 in RESEARCH.md if you haven't.

## Open questions for Karel

- **GEMINI_API_KEY?** → unlocks `lyria-ghost`, `30-lyria-jam`, `binaural-lyria`, `piano-to-ghost`.
  All four are fully spec'd and ready to build. One key, four prototypes.
- **`stable-extend` API error?** — if the fal.ai endpoint name or parameters are wrong, let me know
  the error text and I'll fix `route.ts` next cycle. Endpoint used: `fal-ai/stable-audio-25/inpaint`.
- **CDN ONNX dep (~2MB)?** → enables `neural-pitch` — neural pitch detection at ~1ms/frame via
  ONNX Runtime Web 1.26 WebGPU. Upgrades accuracy in 6+ existing prototypes.

Preview URL: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app
