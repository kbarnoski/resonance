# Morning digest — last updated 2026-05-21 UTC (Cycle 81)

## New since yesterday

- **[/dream/65-dialogue-score](/dream/65-dialogue-score)** (Cycle 81) — `demoable` · Zero deps · Zero API

  **"The AI mirrors your musical thought."**

  The third Aria dialogue prototype — and the first where her response has *musical logic*, not just
  statistical probability.

  **What's new**: contour mirroring. After you play 8+ notes and pause 2s, the system measures
  whether your phrase was ascending ↗, descending ↘, arch-shaped ∧, or valley-shaped ∨. Aria's
  response is constrained to follow the same shape. Markov chain still biases the note choices from
  your playing history — contour constraint only adds a direction filter at each step.

  **What to open on your phone**: `/dream/65-dialogue-score` → **DEMO**. C major scale rises
  C4→C5. Ghost notes (dashed blue) appear in the ARIA panel before a single note sounds. Watch the
  header: `your phrase ↗ ascending → aria mirrors → aria responds ↗ ascending`. Then Aria plays
  ascending. The mirroring is accurate.

  **Try with mic**: play a descending scale or a phrase that rises then falls. Arch ∧ is the most
  interesting — Aria rises first then descends.

  **Lineage**: `33-aria-companion` (pure Markov) → `39-anticipate` (Markov + ghost preview) →
  `65-dialogue-score` (Markov + ghost preview + contour mirroring). Each generation adds one insight.
  Inspired by "Dialogue in Resonance" (arxiv 2505.16259, 2026).

- **[/dream/64-eleven-dialogue](/dream/64-eleven-dialogue)** (Cycle 80) — `demoable` · ElevenLabs V3 · ~$0.02/scene

  The Ghost as drama. Stone Chamber: *"[slowly] The resonance here [pauses] is ancient."* Two
  characters, three lines, inline acting tags. `[pauses]` mid-sentence is an acting beat, not a comma.

## In progress / partial

- Nothing in-progress. **Next build**: research cycle (due at Cycle 82 — 4 build cycles since Cycle 78).
  Then: `ghost-v3-voice` (standalone ElevenLabs V3 Ghost page, no comparison, just the clearest
  six scene narrations we can write) OR polish `65-dialogue-score` (invert mode, arch drawn on canvas).

## Research findings worth a look

- **CHI 2026 creative AI taxonomy** (RESEARCH.md §136) — reactive / compositional / dialogic / generative.
  `65-dialogue-score` fills "dialogic." Generative (Lyria, ACE-Step without prompts) is still the gap.
- **Dialogue in Resonance** (§129, arxiv 2505.16259) — human pianist + computer: score-derived constraints
  rather than pure improvisation. This is the paper behind the contour mirroring idea. Worth a read.
- **musicolors** (§131) — multiple visual dimensions simultaneously. Validated by `63-synesthetic-sketch`.

## Open questions for Karel

- **`GEMINI_API_KEY`?** → `lyria-jam` (infinite steerable AI music, live-performance-relevant), `lyria-ghost`, `binaural-lyria`.
- **Vercel COOP headers?** (`Cross-Origin-Opener-Policy: same-origin` + COEP) → SharedArrayBuffer → GPU audio.
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM-generated audio-reactive GLSL).
- **`lyrics-journey` budget OK?** ~$2.40/generation (ElevenLabs Music, sung Ghost journey arc).
