# /dream/6-compose — Compose

**Route**: `/dream/6-compose`  
**Status**: `demoable`  
**Cycle shipped**: 65 (2026-05-20)

## What this is

Type a mood, a scene, an atmosphere — ACE-Step generates 30 seconds of matching music. The oldest queued idea in the sandbox (Cycle 4, 61 cycles in the queue).

The question this answers: *what if you could describe a Resonance journey in words and hear it?*

## How it works

1. Pick a Ghost scene preset (or write your own tags)
2. Click Compose
3. Server route calls `fal-ai/ace-step` with `tags` (your description), `lyrics: "[inst]"` (instrumental — no AI vocals), `duration: 30`
4. 30s MP3 returned, decoded, played through the 6-band radial bloom visualizer
5. Waveform strip shows the generated audio with a playhead sweep

The tags textarea is always visible — you can see exactly what's sent to the model. This makes the model's input legible rather than hiding it.

## ACE-Step vs arc-compose

Both are music generation, different paradigms:

| | 6-compose | 48-arc-compose |
|---|---|---|
| Model | ACE-Step | MiniMax Music 2.6 |
| Input | Free-form mood tags | Structural section tags ([Intro] [Build Up] etc.) |
| Duration | 30s sketch | 60–90s structured piece |
| Use case | "Vibe this scene" | "Architect an arc" |
| Cost | $0.006 | $0.03 |

## Ghost scene presets

The five presets map to the Ghost narrative scenes:

- **Forest Dawn** — ceremonial drums, reverbed piano, morning mist, birdsong
- **Stone Chamber** — single piano chord, long stone reverb, 50 BPM
- **Underground Pool** — water drip rhythm, low drone, ethereal pads, 40 BPM  
- **Cosmic Ascension** — orchestral strings, ascending phrases, 80 BPM, cinematic
- **Tiny Planet** — music box bells, wind atmosphere, sparse piano, 55 BPM

## API note

`fal-ai/ace-step` (base endpoint, text-to-music) is distinct from `fal-ai/ace-step/audio-to-audio` (used by `44-vocal-bgm`). The endpoint name follows fal.ai's naming convention for ACE-Step. If it returns an error, the raw error text is shown — paste it for an endpoint fix next cycle.

## Polish ideas for future cycles

- **Duration control**: 15s / 30s / 60s slider
- **Temperature / creativity slider**: if ACE-Step exposes this parameter
- **Session cache**: store last 3 generations in sessionStorage (no re-generation on revisit)
- **Journey integration**: link "Use as soundtrack" → opens `5-arcs` with this audio as the background track
- **Multi-generate**: generate 3 variations at once, pick your favorite
