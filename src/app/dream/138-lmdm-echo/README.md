# Echo Chamber — design notes

## The idea

You record a piano phrase (up to 15 seconds via mic). While you play, the system accumulates:
- **Chroma vector** (12-bin FFT → pitch-class energy) → chord quality (major / minor / neutral)
- **Onset times** (RMS threshold crossings) → tempo estimate (BPM)
- **Spectral centroid** (weighted mean frequency) → register (low / mid / high)

After you stop, those three features are combined into a style prompt for ACE-Step (`fal-ai/ace-step`). The model generates a 30-second instrumental piano piece that shares the harmonic character, approximate tempo, and register of what you played. Both tracks play back simultaneously: your original panned left (−35°), the AI echo panned right (+35°), through a shared six-band bloom visualizer.

## What makes it different

`44-vocal-bgm` uses `fal-ai/ace-step/audio-to-audio` — your raw audio signal is the seed. This prototype uses `text-to-audio` where the prompt is derived from harmonic analysis, not signal content. The echo responds to the musical *meaning* of the phrase rather than its literal timbre: same key, same tempo, same register — but a freshly composed response.

`33-aria-companion` does Markov-chain response to individual notes, immediately. This prototype waits for a complete phrase, then generates a longer (30s), richer AI response. The timescales are different: Aria is a back-and-forth sentence; Echo Chamber is a reply letter.

## Audio architecture

```
Mic → MediaRecorder → Blob
    → AnalyserNode → accumulate chroma / onset / centroid

Blob → decodeAudioData → origBuf → StereoPanner(−0.35) → AnalyserNode → destination
API URL → fetch → decodeAudioData → echoBuf → StereoPanner(+0.35) → AnalyserNode → destination
AnalyserNode → bloom canvas (six-band radial fill)
```

## Prompt construction

Given analysis result `{quality, bpm, register}`:
```
"solo piano, [mood], [tempo] BPM, [register], reverb, instrumental"
```

Examples:
- minor / 68 BPM / mid → `"solo piano, melancholic introspective, gentle moderate 68 BPM, mid piano register vocal quality, reverb, instrumental"`
- major / 120 BPM / high → `"solo piano, bright hopeful, flowing 120 BPM, treble register crystalline piano, reverb, instrumental"`

## Polish ideas

- Show a mini chromagram (12-bin bar chart) of the detected chroma vector
- "Variation" mode: slightly randomize tempo ±8 BPM for a looser echo
- Let the user edit the style tags before generating (textarea overlay)
- Add a mix slider: dry/wet blend between original and echo
- Download both tracks as separate WAV files

## Research basis

Inspired by "generative delay" concept from Live Music Diffusion Models (arXiv:2605.22717, May 2026) — the idea that AI-generated music can function as an expressive delay unit: you play → the system processes the musical meaning → a transformed version returns. Like a studio delay pedal, but the echo is semantically related to the original rather than physically time-shifted.
