# Morning digest — last updated 2026-05-21 UTC (Cycle 80)

## New since yesterday

- **[/dream/64-eleven-dialogue](/dream/64-eleven-dialogue)** (Cycle 80) — `demoable` · ElevenLabs V3 · FAL_KEY · ~$0.02/scene

  **"The Ghost is no longer alone."**

  Six Ghost scenes each become a three-line dramatic exchange between Ghost and Visitor.
  ElevenLabs V3's inline audio tag system puts acting beats mid-sentence:

  - `[slowly, reverently] The resonance here [pauses] is ancient.` — Ghost (Stone Chamber)
  - `[nervous, awed] I didn't know it would feel [pauses] this alive.` — Visitor
  - `[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.` — Ghost

  Ghost = Adam voice (deep, measured). Visitor = Alice voice (lighter, questioning). Three separate
  API calls played sequentially with 550ms silence between turns.

  **What to open on your phone**: `/dream/64-eleven-dialogue` → Stone Chamber → **▶ Perform scene**. Wait ~10s for generation. Listen to the pauses inside the sentences — `[pauses]` is an acting beat, not punctuation.

  **Different from all prior Ghost voice prototypes**: `56-ghost-voice` = monologue. `61-orpheus-voice` = A/B comparison. This is drama — two distinct voices, a scene, a relationship.

  ⚠ Endpoint is a naming-convention best-guess; paste any error text for a fix next cycle.

- **[/dream/63-synesthetic-sketch](/dream/63-synesthetic-sketch)** (Cycle 79) — `demoable` · Zero deps · Zero API

  Six audio features → six simultaneous visual dimensions. Shape type (circle/hexagon/star) from bandwidth.
  Scatter radius from rhythm regularity — steady playing = tight center cluster, improvisation = scattered field.
  Canvas accumulates additively. Download as PNG.

## In progress / partial

- Nothing in-progress. Next build: `dialogue-score` — contour-constrained AI piano dialogue, extends
  `33-aria-companion`. Zero deps. The AI responds ascending when you play ascending, descending when
  you play descending. First prototype where the AI's response has musical logic (not just Markov statistics).

## Research findings worth a look

- **Eleven V3 inline tags** (RESEARCH.md §§127, 134) — `[pauses]` mid-sentence IS the acting. Different
  paradigm from global style direction (Gemini) or per-word XML (Orpheus). Now implemented in `64`.
- **CHI 2026 creative AI taxonomy** (§136) — reactive / compositional / dialogic / generative. Sandbox
  covers first two well. `dialogue-score` fills dialogic; GEMINI_KEY unlocks generative.
- **musicolors** (§131) — multiple visual dimensions simultaneously = better than color alone. Validated.

## Open questions for Karel

- **`GEMINI_API_KEY`?** → `lyria-jam` (infinite steerable AI music, live-performance-relevant), `lyria-ghost`, `binaural-lyria`. "Generative" is the most underrepresented CHI taxonomy category.
- **Vercel COOP headers?** (`Cross-Origin-Opener-Policy: same-origin` + COEP) → SharedArrayBuffer → GPU audio for `27-gpu-additive`.
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM-generated audio-reactive GLSL).
- **`lyrics-journey` budget OK?** ~$2.40/generation (ElevenLabs Music, sung Ghost journey, 6 sections).
