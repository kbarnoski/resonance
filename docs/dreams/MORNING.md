# Morning digest — last updated 2026-05-21 UTC (Cycle 86)

## New since yesterday

- **Cycle 86 was a research sweep** (no new prototype). 10 new entries in RESEARCH.md (§§147–156).
  5 new prototype ideas added to IDEAS.md. Highlights below.

- **[/dream/68-wgsl-synth](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/68-wgsl-synth)** (Cycle 85, `demoable`) — WGSL Synth.
  Write a raw WebGPU shader that responds to your piano. Six pre-wired audio uniforms (`uBass`, `uMid`, `uTreble`, `uOnset`, `uTime`, `uBPM`). Edit any WGSL line → recompiles 400ms later, no black frame. Default: rings that expand with bass + grid shimmer + white onset flash. Try the mic — bass notes grow the rings visibly.

- **[/dream/67-structure-viz](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/67-structure-viz)** (Cycle 84, `demoable`) — Structure Viz.
  Your music as a self-similarity map. ▶ ABA demo shows three bright diagonal blocks in ~48s. First prototype that reveals musical *form* (does the section come back?) rather than signal content.

## In progress / partial

- Nothing in-progress. Next build: `oracle-music` (Cycle 87).

## Research findings worth a look

- **I-Ching Musical Oracle** (§151, arxiv 2605.20386, May 2026): a research team combined I-Ching coin casting with Gemini LLM interpretation and Lyria music generation. "AI as interpretive intermediary." I want to build a zero-dep version: 64 hexagrams pre-mapped to musical parameters (mode, BPM, register, chord density). Animated coin toss → hexagram symbol → synthesized music shaped by its archetypal quality. High surprise; deeply aligned with Resonance's "transcendent" identity. `oracle-music` is the next build.

- **Demucs in the browser** (§§149, 154, April 2026): htdemucs running in-browser via ONNX Runtime Web + WebGPU — a 4-minute song splits into 4 stems in ~3–5 minutes, fully locally (audio never uploaded). This enables `browser-stems`: upload any audio → drums/bass/other/melody in 3D HRTF space. The same spatial experience as `54-maestro-stems` but with YOUR music — a recording you made, your favorite album track. Needs your OK on a ~200MB model cached from CDN on first use.

- **ShaderVine genetic evolution** (§147): a shader editor that breeds shaders via natural selection — display 4 mutated variants, you pick favorites, they breed. The `shader-evolve` prototype would bring this to the dream zone: 4 mutated versions of the `68-wgsl-synth` default shader running simultaneously, select + breed. Creative paradigm the sandbox hasn't seen.

- **Inworld TTS viseme timestamps** (§155): Inworld TTS-1.5 Max (FAL_KEY in use) returns mouth-shape timing data alongside audio — phoneme-level viseme IDs at exact timestamps. `ghost-lip` prototype: animated Ghost face (abstract oval + eyes + morphing mouth path) synced to narration. The Ghost would have a face that moves when it speaks. ~$0.005/narration, one-cycle build.

- **Pitch algorithm comparison** (§§148, 156): YIN and HPS (Harmonic Product Spectrum) are each ~30 lines of pure JS and each outperform our current autocorrelation on specific inputs (YIN: 15% fewer octave errors; HPS: better on harmonic-rich piano). `pitch-algo-compare` runs all three simultaneously, shows where they agree and disagree in real time. Educational + informs whether `neural-pitch` CDN dep is worth the cost.

## Open questions for Karel

- **`browser-stems` model size OK?** — ~200MB ONNX model, CDN-cached after first download, no network use afterward. Enables private in-browser stem separation of any audio.
- **ANTHROPIC_API_KEY** in Vercel env → `claude-shader` (Claude writes WGSL for you — the natural pair to `wgsl-synth`)
- **GEMINI_API_KEY** → `lyria-jam`, `lyria-ghost`, `binaural-lyria`, `piano-to-ghost` (4 prototypes waiting)
- **`lyrics-journey` budget OK?** — ~$2.40/generation for full Ghost journey as a sung piece (ElevenLabs Music)
