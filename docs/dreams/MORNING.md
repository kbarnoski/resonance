# Morning digest — last updated 2026-05-19 UTC (Cycle 48)

## New since yesterday

- **Cycle 48 was a research sweep** (no new prototype). Cleared the 3-cycle research threshold.
  8 new RESEARCH.md entries (§§69–76). 4 new prototype ideas queued. See highlights below.

## Research findings worth a look

- **Lyria 3 (Google DeepMind, Feb 2026)** — image-to-music via Gemini API. Send a Ghost scene
  photo → get a 30s ambient MP3 shaped by that image's mood. Same API key as `lyria-jam`.
  **Prototype ready to build**: `lyria-ghost`. One cycle, admin-only, free tier.
  Endpoints: `lyria-3-clip-preview` (30s) · `lyria-3-pro-preview` (full song, WAV).

- **Stable Audio 2.5 (Stability AI, 2026)** — audio continuation on fal.ai at **$0.20/audio**.
  Record a piano phrase → AI extends it into a 30s track. Open source, FAL_KEY already works.
  **Prototype ready to build**: `stable-extend`. One cycle, no new approvals needed.
  Build this next if Gemini key isn't available yet.

- **Music as "controlled hallucination"** (Frontiers Psychology, 2026) — new theoretical
  framework: the brain simulates a "virtual body" inside music via active interoceptive inference.
  Scientifically validates Resonance's "transcendent listening" thesis. The `42-binaural` prototype
  is one of the most direct implementations of this effect. Worth reading (linked in §74).

- **MindMelody** (arxiv 2605.01235, May 2026) — closed-loop EEG-driven music therapy. Inspires
  `binaural-lyria`: binaural beats at the target brainwave frequency + Lyria 3 ambient music tuned
  to match (delta=vast drones, alpha=calm piano, gamma=bright gamelan). Needs Gemini key.

- **Suno Generative Stems** — 12 stems from any AI track (vocal, drums, bass, piano...). API
  stems endpoint not yet public. When it ships: `suno-stems-spatial` places each stem in 3D HRTF.

- **ONNX Runtime Web 1.26** — WebGPU EP now default. `neural-pitch` CREPE-tiny at ~1ms/frame.
  More reason to ask: CDN ONNX dep (~2MB) OK?

## In progress / partial

- Nothing in progress. Cycle 49 picks up from this queue:
  1. **`stable-extend`** — no new approvals (FAL_KEY exists). Best immediate next build.
  2. **`lyria-ghost`** — waiting on GEMINI_API_KEY.
  3. **`binaural-lyria`** — also waiting on GEMINI_API_KEY.
  4. **Polish `42-binaural`** — session timer + journal + pink noise (no APIs needed, good fallback).

## Open questions for Karel

- **GEMINI_API_KEY?** → unlocks `lyria-ghost` (Ghost image → 30s music), `30-lyria-jam`
  (infinite steering AI music), `binaural-lyria` (meditation + Lyria ambient), `piano-to-ghost`
  (play piano → Ghost world generated). One key, four prototypes.
- **CDN ONNX dep (~2MB)?** → enables `neural-pitch` — neural pitch detection at 1ms/frame via
  ONNX Runtime Web 1.26 WebGPU EP. Upgrades accuracy in 6+ existing prototypes.
- **Suno API stems endpoint?** — currently UI-only. Flag when it becomes API-accessible.

Preview URL: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app
