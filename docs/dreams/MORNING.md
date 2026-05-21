# Morning digest — last updated 2026-05-21 UTC (Cycle 87)

## New since yesterday

- **[/dream/69-oracle-music](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/69-oracle-music)** (Cycle 87, `demoable`) — Oracle Music.
  Three coins cast six times → one of 64 hexagrams → music shaped by its archetypal qualities.
  Watch the animated coin sequence build the hexagram line-by-line. The synthesis maps traditional I-Ching
  qualities to audio: Hexagram 1 (The Creative) plays bright major arpeggios at 80 BPM; Hexagram 2
  (The Receptive) plays a single pentatonic tone at 35 BPM through a 400 Hz filter at C2.
  Moving lines (6 or 9) glow amber — the hexagram is in transition. No mic needed, no API, no deps.

- **[/dream/68-wgsl-synth](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/68-wgsl-synth)** (Cycle 85, `demoable`) — WGSL Synth.
  Write raw WGSL that responds to your piano — edit any line, recompiles in 400ms, no black frame.
  Default shader: rings expanding with bass, grid shimmer with mids, white flash on onset.

- **[/dream/67-structure-viz](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/67-structure-viz)** (Cycle 84, `demoable`) — Structure Viz.
  Self-similarity matrix: your music as a map of itself. ▶ ABA demo shows the classic three-block
  diagonal pattern in ~48s. First prototype showing musical form rather than signal content.

## In progress / partial

- Nothing in-progress. Next builds: `pitch-algo-compare` (Cycle 88, zero deps), then `shader-evolve` (Cycle 89).

## Research findings worth a look

- **Demucs in the browser** (§§149, 154): htdemucs via ONNX Runtime Web + WebGPU — 4-min song
  splits into 4 stems in ~3–5 min, fully locally (audio never leaves device). `browser-stems` prototype:
  upload any audio → drums/bass/other/melody in 3D HRTF space. Needs your OK on ~200MB CDN model.

- **ShaderVine genetic evolution** (§147): breed audio-reactive WGSL shaders by natural selection.
  `shader-evolve`: 4 mutated variants of `68-wgsl-synth` running simultaneously, select + evolve.

- **Inworld TTS viseme timestamps** (§155): Inworld TTS returns mouth-shape timing per phoneme.
  `ghost-lip`: animated Ghost face (abstract oval, eyes, morphing mouth) synced to narration.
  ~$0.005/narration, FAL_KEY already in use, one-cycle build.

## Open questions for Karel

- **`browser-stems` model size OK?** — ~200MB ONNX, CDN-cached, enables private in-browser stem separation.
- **ANTHROPIC_API_KEY** in Vercel → `claude-shader` (Claude writes WGSL for you, pairs with `wgsl-synth`)
- **GEMINI_API_KEY** → `lyria-jam`, `lyria-ghost`, `binaural-lyria`, `piano-to-ghost` (4 prototypes waiting)
- **`lyrics-journey` budget?** — ~$2.40/generation for Ghost journey as a sung piece (ElevenLabs Music)
