# Morning digest — last updated 2026-05-21 UTC (Cycle 79)

## New since yesterday

- **[/dream/63-synesthetic-sketch](/dream/63-synesthetic-sketch)** (Cycle 79) — `demoable` · Zero deps · Zero API

  **"Not just what color your music is — what shape it is."**

  Six audio features map to six completely separate visual dimensions at once:
  - Centroid → hue (violet=bass, red=treble — familiar from `1-live`)
  - Bandwidth → shape: circle (pure tone), hexagon (chord spread), star (wideband)
  - Harmonic peak count → inner ring count: 0 rings (one band lit) up to 4 rings (5+ bands)
  - Amplitude → scale
  - Rhythm regularity → scatter radius (steady rhythm = tight center cluster; improvisation = scattered field)
  - Onset → radial spark burst

  Objects accumulate additively. The canvas IS the record of your session. Download as PNG.

  **What to open on your phone**: `/dream/63-synesthetic-sketch` → tap **▶ Demo**. Watch it for 30 seconds — notice the shape shifting from circles to hexagons to stars as the LFOs interact. Then try **Start mic** and play something steady vs. something scattered.

  **The scatter dimension is the most surprising**: a metronomic performance builds a tight blazing cluster at center; an improvisation scatters shapes across the whole canvas. No other prototype encodes rhythm structure this way.

## In progress / partial

- Nothing in-progress. Next builds queued: `eleven-dialogue` (Ghost + Visitor dramatic scenes, Eleven V3 Text-to-Dialogue, FAL_KEY) then `dialogue-score` (contour-constrained AI piano dialogue, zero deps).

## Research findings worth a look

- **Eleven V3 Text-to-Dialogue** (§134) — one API call, two voices, a Ghost + Visitor 3-line dramatic scene. "Everything that ever sounded here — still does. If you know how to listen." This is drama, not narration.
- **CHI 2026 creative AI taxonomy** (§136) — four modes: reactive / compositional / dialogic / generative. Sandbox strong on first two; `dialogue-score` and `lyria-jam` (needs GEMINI key) are the missing categories.
- **musicolors** (§131, arxiv 2503.14220) — effective visualization uses multiple visual dimensions simultaneously. Validated by `63-synesthetic-sketch` which maps 6 features not just color.

## Open questions for Karel

- **`GEMINI_API_KEY`?** → `lyria-jam` (infinite steerable AI music, most live-performance-relevant), `lyria-ghost`, `binaural-lyria`. CHI taxonomy confirms "generative" is the most underrepresented mode.
- **Vercel COOP headers?** (`Cross-Origin-Opener-Policy: same-origin` + COEP) → SharedArrayBuffer → GPU audio synthesis for `27-gpu-additive` and `55-webgpu-audio-fx` upgrade.
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM-generated audio-reactive GLSL).
- **`lyrics-journey` budget OK?** ~$2.40/generation (ElevenLabs Music, full Ghost journey as a sung piece with Ghost narrative as lyrics, 6 sections).
- **`61-orpheus-voice` vote**: which voice wins for Stone Chamber? Paste the best tag text → agent hard-codes it into `56-ghost-voice` next cycle.
