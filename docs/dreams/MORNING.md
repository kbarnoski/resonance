# Morning digest — last updated 2026-05-20 UTC (Cycle 56)

## New since yesterday

- **Cycle 56 was a research sweep** (no new prototype — research was overdue at 4 cycles).
  8 new RESEARCH.md entries (§§85–92). 4 new IDEAS queued. Highlights below.

## Research findings worth opening

- **MiniMax Music 2.6 — section tags now available** (RESEARCH.md §86)
  14+ structural tags: `[Intro]` `[Build Up]` `[Chorus]` `[Outro]` etc. $0.03/generation.
  FAL_KEY already in use. This makes `arc-compose` buildable **today** — write a Resonance
  journey arc in musical language, get a 60–90s AI piece with exactly that structure.
  _What to open_: nothing yet — `arc-compose` is the next cycle's build. But the spec is in
  IDEAS.md if you want to read what this would look like.

- **Google Flow Music + Lyria 3 Pro — Stem Splitter** (RESEARCH.md §85)
  Flow Music (flowmusic.app, April 2026) now has a Stem Splitter: any AI-generated track
  breaks into isolated vocals/drums/bass/piano. Same Lyria 3 model, same Gemini API key.
  This unlocks `stem-spatial`: generate a 30s AI track → split stems → HRTF spatial placement
  (drums above, bass below, piano left, melody right). Waiting on GEMINI_API_KEY.

- **`anemone-av` — organic bioluminescent 3D form, zero new deps** (RESEARCH.md §92)
  Three.js community is building organic audio-reactive forms: sea-anemone-like meshes where
  sub-bass sways the trunk and treble flickers the tips, with bloom glow. All Three.js deps
  already installed in Resonance. This is a one-cycle build — and would be the most visually
  striking prototype in the sandbox.

- **`tap-rhythm` — clap your rhythm, hear your drum loop** (RESEARCH.md §89, §90)
  Inspired by DARC (arxiv 2601.02357). None of the 47 prototypes accept rhythm as primary
  input. Mic onset detection → 2-bar step sequencer → Karplus-Strong drum hits. Zero deps.

## In progress / partial

- Nothing currently in-progress.

## Open questions for Karel

1. **GEMINI_API_KEY** — still the single highest-leverage action. Unlocks:
   - `lyria-ghost` (Ghost scene → 30s ambient score)
   - `binaural-lyria` (binaural beats + matched AI ambient music)
   - `piano-to-ghost` (your playing generates Ghost image + music simultaneously)
   - `stem-spatial` (Lyria 3 Pro generate + stem split + HRTF 3D positioning)
   - Upgrade `lyria-ghost` → 3-minute structured Ghost ambient piece (Lyria 3 Pro)

2. **`44-vocal-bgm` API status** — did the ACE-Step endpoint work? If you saw a fal.ai
   error, paste the message (shown in the UI) and we fix `route.ts` next cycle.

3. **CDN deps still pending approval**:
   - `ghost-xr` — A-Frame CDN ~1MB → WebXR spatial audio inside a Ghost scene
   - `neural-pitch` — ONNX Runtime Web CDN ~2MB → 10× more accurate pitch for 6+ prototypes
   - `browser-musicgen` — Transformers.js ~390MB → offline MusicGen, zero API cost
   - `claude-canvas` — ANTHROPIC_API_KEY in dream zone → AI generates canvas sketches from text

4. **Next cycle build: which?**
   - `arc-compose` — hear what a Resonance journey arc actually sounds like ($0.03/gen, FAL_KEY)
   - `anemone-av` — organic living 3D form dancing to audio (zero new deps, zero API)
   - `tap-rhythm` — clap a groove, get a drum loop (zero deps, zero API)
   All three are one-cycle builds. Agent will pick `arc-compose` unless you say otherwise.
