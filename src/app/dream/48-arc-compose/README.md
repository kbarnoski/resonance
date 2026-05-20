# Arc Compose — design notes

**Route**: `/dream/48-arc-compose`  
**Cycle**: 57  
**Status**: demoable

## The question

What does a Resonance journey arc *sound like* — as a real, generated 60–90s musical piece?

`5-arcs` describes five arc types in prose (EDM Build-and-Drop, Cinematic, Ritual, etc.). `47-mood-journey` automates emotional traversal on the Russell circumplex. Neither generates actual music that follows the arc's shape. `arc-compose` closes this gap: write the arc as a structured text spec, hear MiniMax Music 2.6 interpret it.

## Section tags

MiniMax Music 2.6 supports 14+ structural section markers:

| Tag | Meaning |
|---|---|
| `[Intro]` | Opening section |
| `[Verse]` | Verse/narrative section |
| `[Pre-Chorus]` | Pre-chorus build |
| `[Build Up]` | Tension/energy rise |
| `[Chorus]` | Peak/hook section |
| `[Bridge]` | Contrasting middle section |
| `[Outro]` | Closing section |
| `[Inst]` | Instrumental section (no vocals) |

Each tag can be followed by free-text description on the same line: `[Build Up] cello drone enters, pad swells, 20 seconds`. The model reads this as both a structural anchor and a musical instruction.

## Architecture

**Client** (`page.tsx`): 
- Arc textarea + section-tag buttons + style field → "▶ Compose"
- POST to `/dream/48-arc-compose/api` with `{ arc, style }` JSON
- Receives `{ url }` → fetches MP3 → decodes via AudioContext → plays
- Bloom visualizer (same six-band radial gradient as `1-live`) during playback
- 200-peak waveform strip with playhead sweep
- AudioBuffer cached for replay without re-calling the API

**Server** (`api/route.ts`):
- Calls `fal-ai/minimax/music-01` with `prompt: style, lyrics: arc`
- Returns `{ url }` or `{ error }`

**Cost**: $0.03/generation. FAL_KEY already in use.

## Default arc

```
[Intro] single piano note in vast reverb, long silence between phrases
[Build Up] low cello drone enters slowly, pad swells underneath, tension builds
[Chorus] full orchestral peak, bright major resolution, drums and strings
[Outro] instruments fade one by one, piano alone, then silence
```

This directly encodes the Resonance Ghost journey's four-act emotional arc: isolation → gathering → peak → return.

## What makes it different from other prototypes

- `6-compose`: text description → music. No structural control — "a 30s cinematic piece" is opaque.
- `18-elevenlabs-compose` (never built): section-level streaming at $1.13/generation — prohibitively expensive.
- `arc-compose`: section-level control at $0.03. The architecture of the arc IS the prompt.

The key insight: musical structure is a first-class parameter, not a style hint. `[Intro] → [Build Up] → [Chorus] → [Outro]` is the difference between "give me a dramatic piece" and "give me a piece that starts sparse, builds to a peak, then resolves."

## Polish ideas

1. **Arc presets**: Resonance Journey (current default) / EDM Build-and-Drop (`[Intro] four-on-the-floor kick, [Build Up] filter sweep, [Chorus] drop with full bass`) / Sleep Prep (`[Intro] soft piano, [Outro] silence`) / Morning Activation (`[Intro] single piano, [Chorus] bright strings at 120 BPM`).
2. **Section timing display**: parse "N seconds" from each line, show estimated duration per section and total.
3. **Section colorbar**: waveform strip divided by section boundaries, each section a different hue.
4. **Re-generate section**: select a section tag in the arc, regenerate just that region using audio inpainting (would need the full output and section timestamps).
5. **Arc as journey trigger**: play the generated piece + drive `47-mood-journey` traversal simultaneously so the music and the circumplex position track each other.
