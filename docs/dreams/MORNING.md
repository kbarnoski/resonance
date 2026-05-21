# Morning digest — last updated 2026-05-21 UTC (Cycle 82)

## New since yesterday

- **Cycle 82 was a research sweep** (no new prototype — research was due after 3 build cycles since Cycle 78).

  **10 new RESEARCH.md entries (§137–§146). 4 new prototype ideas added to IDEAS.md.**

  The standout find:

  **Chatterbox Turbo (§137) — Ghost narration with voice cloning.**
  Resemble AI's open-source TTS on fal.ai at `fal-ai/chatterbox/text-to-speech`. $0.025/1000 chars (cheapest TTS in the sandbox). Key capability none of the other four TTS models have: **5-second voice cloning** — pass a short audio URL and the output is rendered in that person's voice. With paralinguistic tags `[sigh]`, `[gasp]` mid-sentence.
  Prototype queued: `chatterbox-ghost` — record 5s of any voice → hear the six Ghost scene narrations in that voice. First prototype where Karel can hear the Ghost speak in **his own voice** (or any chosen voice). FAL_KEY in use; directly buildable next cycle.

- **[/dream/65-dialogue-score](/dream/65-dialogue-score)** (Cycle 81, `demoable`) — contour-mirroring AI piano dialogue.
  Play ascending scale → Aria responds ascending. Ghost notes appear before she plays. Third generation of the Aria dialogue series. Zero deps.

## In progress / partial

- Nothing in-progress. **Next build** (Cycle 83): `chatterbox-ghost` — voice-cloned Ghost narration.
  After that: `structure-viz` (self-similarity matrix showing musical structure — zero deps, novel), then `wgsl-synth` (WGSL shader editor with pre-wired audio uniforms).

## Research findings worth a look

- **Chatterbox Turbo (§137)** — voice cloning from 5s reference. The Ghost speaks in the voice you chose. $0.025/1000 chars. Different from all 4 prior TTS prototypes.
- **ImprovNet (§138, arxiv 2502.04522)** — play a seed phrase → AI generates full 32-bar structured improvisation in any genre (jazz/classical/blues). No API yet, but when one arrives this is the strongest "AI completes your composition" prototype in the queue.
- **Pianist Transformer (§139, arxiv 2512.02652)** — 135M-param transformer, human-level expressive piano rendering from flat MIDI. Apache 2.0. HuggingFace demo. No inference API yet → needs proxy server route.
- **Self-similarity matrix (§143)** — zero-dep browser section detection: FFT → N×N cosine similarity matrix → colormap → section boundaries. Novel: first sandbox prototype that shows STRUCTURE (does A come back as A'?) not content. Buildable in one cycle, zero deps.
- **D3PIA (§140, arxiv 2602.03523)** — AI piano accompaniment from melody + chord symbols. "Play the melody, AI fills the accompaniment." No API yet.
- **PianoFlow (§141, arxiv 2604.12856)** — 3D animated bimanual piano hands from audio. Could produce the most visually surprising prototype yet — seeing ghost hands play your recording.

## Open questions for Karel

- **`GEMINI_API_KEY`?** → `lyria-jam` (infinite steerable AI music), `lyria-ghost`, `binaural-lyria`.
- **Vercel COOP headers?** (`Cross-Origin-Opener-Policy: same-origin` + COEP) → SharedArrayBuffer → GPU audio.
- **`ANTHROPIC_API_KEY` in Vercel env?** → `claude-shader` (LLM-generated audio-reactive GLSL).
- **`lyrics-journey` budget OK?** ~$2.40/generation (ElevenLabs Music, sung Ghost journey arc).
- **NEW: OK to bundle a short (~5s) Ghost voice reference clip for `chatterbox-ghost`?** Could be Karel's own voice, a purposely-recorded Ghost character, or any public-domain recording. Chatterbox Turbo clones the voice from that sample. Zero additional cost beyond the $0.025/1000-char generation price.
