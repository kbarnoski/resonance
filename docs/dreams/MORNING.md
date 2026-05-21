# Morning digest — last updated 2026-05-21 UTC (Cycle 83)

## New since yesterday

- **[/dream/66-chatterbox-ghost](/dream/66-chatterbox-ghost)** (Cycle 83, `demoable`) — voice-cloned Ghost narration.
  Click the preview URL. Click **"● record 5–10s reference"** and speak one sentence aloud. Then **"Generate Ghost voices"**
  — all six scenes fire concurrently. Hear the Ghost speak the journey lines in your own voice, with
  `[sigh]`, `[gasp]`, `[slowly]`, `[flatly]`, `[long pause]` as physical vocal actions mid-sentence.
  Exaggeration slider (0–1) controls dramatic intensity across all scenes.
  This completes the four-way TTS study: Gemini (global style) / Orpheus (per-word XML) / ElevenLabs V3
  (per-phrase acting) / Chatterbox Turbo (voice-clone + physical action tags).
  ⚠ API parameters are best-guess — paste any error text and the agent fixes next cycle.
  Cost: ~$0.009 for a full 6-scene generation.

- **[/dream/65-dialogue-score](/dream/65-dialogue-score)** (Cycle 81, `demoable`) — contour-mirroring AI piano dialogue.
  Play ascending → Aria responds ascending. Ghost notes preview before she plays. Zero deps.

## In progress / partial

- Nothing in-progress.
- **Next build** (Cycle 84): `structure-viz` — self-similarity matrix showing musical structure.
  Novel: first sandbox prototype that shows STRUCTURE (does the chorus come back?) not content.
  Zero deps, zero API. Also queued: `wgsl-synth` (WGSL shader editor + audio uniforms).

## Research findings worth a look

- **Chatterbox Turbo (RESEARCH.md §137)** — built this cycle. Voice cloning from 5s reference, physical
  action tags, cheapest TTS in the sandbox ($0.025/1000 chars).
- **Self-similarity matrix (§143)** — zero-dep browser section detection. N×N cosine similarity colormap.
  If you play an ABA melody, the return of A lights up as a bright off-diagonal square. First "music as a map
  of itself" prototype. Building next cycle.
- **ImprovNet (§138, arxiv 2502.04522)** — AI generates a full 32-bar structured improvisation from your seed
  phrase. No API yet; when one arrives, this is the most compelling "AI completes your composition" prototype.
- **Pianist Transformer (§139, arxiv 2512.02652)** — human-level expressive MIDI rendering, Apache 2.0.
  HuggingFace demo. Could make a `expressive-render` prototype once a proxy route is in place.

## Open questions for Karel

- **Chatterbox voice reference**: want to bundle a short (~5s) public Ghost character voice? Currently the user
  must record their own reference each session; a bundled clip makes the demo work without mic permissions.
- **`GEMINI_API_KEY`?** → `lyria-jam`, `lyria-ghost`, `binaural-lyria` all waiting.
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM-generated audio-reactive GLSL shaders).
- **Vercel COOP headers?** → SharedArrayBuffer → `27-gpu-additive` GPU audio synthesis upgrade.
- **`lyrics-journey` budget OK?** ~$2.40/generation (ElevenLabs Music, full Ghost journey as a sung piece).
