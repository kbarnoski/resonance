# Morning digest — last updated 2026-05-21 UTC (Cycle 78)

## New since yesterday

- **Cycle 78 was a research sweep** (10 new entries, RESEARCH.md §§127–136).
  No new prototype this cycle — 3 build cycles elapsed since Cycle 74, threshold met.
  Best finds:

  - **ElevenLabs Eleven V3** (§127) — inline audio tag system for Ghost TTS: `[whispers]`,
    `[pauses]`, `[resigned tone]`, `[flatly]`, `[slowly, reverently]`. Per-phrase emotional beats
    mid-sentence. Also: **Text-to-Dialogue mode** — one API call, two voices, a dramatic scene.
    FAL_KEY in use, ~$0.005/line. Inspires `ghost-v3-voice` and `eleven-dialogue`.

  - **Eleven-dialogue** — Ghost + Visitor as a 3-line dramatic exchange per scene.
    Stone Chamber: Ghost `[reverently] The resonance here [pauses] is ancient.` / Visitor
    `[nervous] I didn't expect it to feel this alive.` / Ghost `[whispers] Everything that ever
    sounded here — still does.` This is drama, not narration. Very different from what exists.

  - **musicolors** (§131, web-based, real-time) — "effective visualization uses MULTIPLE visual
    dimensions simultaneously, not just color." Inspires `synesthetic-sketch`: 6 audio features →
    6 visual dimensions (hue, shape type, ring count, scatter, scale, spark) accumulated on one canvas.
    The contrast with `13-piano-canvas`: that maps note events to brush strokes; this maps continuous
    audio features to morphological shape. Zero deps. High surprise.

  - **CHI 2026 creative AI taxonomy** (§136) — sandbox covers reactive + compositional well; dialogic
    (only `33-aria-companion`, `39-anticipate`) and generative (only `47-mood-journey`) thin. Top fix:
    build `dialogue-score` (contour-constrained AI piano dialogue) and confirm Gemini key for `lyria-jam`.

- **[/dream/62-collage-compose](/dream/62-collage-compose)** (Cycle 77) — Collage Compose. `demoable`
  Three inputs → one composition. Pick **Ghost scene** + **mood** + optionally **hum a melody** (up to 15s mic).
  The "ACE-STEP PROMPT" panel shows the combined tags live.
  **Try**: Stone Chamber + melancholic + no hum → $0.006. Then hum a slow descending phrase, same settings.
  With hum: `audio-to-audio` (model hears your melody). Without: text-only. Compare.

- **[/dream/61-orpheus-voice](/dream/61-orpheus-voice)** (Cycle 76) — Three-way TTS A/B/C.
  Gemini global style · Gemini experimental · Orpheus phrase-level tags. Vote per scene.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **Eleven V3 inline tags vs Orpheus vs Gemini**: three different control paradigms. Gemini = global
  sentence style. Orpheus = per-word XML. Eleven V3 = per-phrase beat mid-sentence. Worth building
  a 4-way comparison in `61-orpheus-voice`. Or standalone `ghost-v3-voice` with Eleven V3 only.
- **`synesthetic-sketch`** (zero deps, zero API) — a canvas where your music leaves objects shaped by
  six simultaneous audio features, not just color. Most novel zero-cost idea from this cycle.
- **`dialogue-score`** — extends `33-aria-companion`: AI response contour-matches your phrase direction.
  "The AI mirrors your musical thought." Dialogic interaction mode — underrepresented in the sandbox.
- **ShaderVine** (§130) — MIT browser WebGPU shader editor with MCP interface. Built for AI agents.
  No audio hooks built in, but pairs with `claude-shader` concept when ANTHROPIC_API_KEY is available.

## Open questions for Karel

- **`GEMINI_API_KEY`?** → unlocks `lyria-jam` (generative AI interaction mode — most underrepresented
  category), `lyria-ghost`, `binaural-lyria`. CHI taxonomy confirms this gap.
- **Vercel COOP headers?** (`Cross-Origin-Opener-Policy: same-origin` + COEP) → enables SharedArrayBuffer
  → real-time GPU-synthesized audio (upgrade for `55-webgpu-audio-fx`, prerequisite for `27-gpu-additive`).
- **`ANTHROPIC_API_KEY` in Vercel env?** → enables `claude-shader` + ShaderVine-style agent-driven WGSL.
- **`lyrics-journey` budget?** ~$2.40/generation (ElevenLabs Music composition_plan for full Ghost journey).
- **`61-orpheus-voice` vote**: which voice wins for Stone Chamber? Paste the best style/tag text and agent
  hard-codes it into `56-ghost-voice` next build cycle.
