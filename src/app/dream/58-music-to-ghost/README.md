# music-to-ghost — design notes

Route: `/dream/58-music-to-ghost` · Cycle 72

## What it does

8 seconds of audio → chroma analysis + energy → emotion quadrant → Ghost LoRA image.

The four quadrants map to four Ghost narrative scenes:
- **Energetic + bright** (loud, major chord) → Cosmic Ascension — golden particle streams, infinite space
- **Energetic + dark** (loud, minor chord) → Underground Pool — turbulent bioluminescent cavern
- **Calm + bright** (soft, major chord) → Forest Dawn — misty ancient forest, morning light
- **Calm + dark** (soft, minor chord) → Stone Chamber — single candle, moonlit arched window

Demo mode plays C major (energetic enough with 5 oscillators → energetic-bright or calm-bright
depending on RMS level, usually calm-bright since gain is 0.3).

## How the classification works

Each 100ms frame computes:
- **Energy**: RMS amplitude, normalized to 0–1
- **12-bin chroma**: FFT magnitude summed per pitch class (60–4000 Hz), normalized per-frame
- **Pitch**: autocorrelation (same algorithm as `13-piano-canvas`)

Over 8 seconds (~80 frames):
- Average energy → arousal threshold at 0.35
- Accumulated chroma → dominant root note → major/minor quality (majorE vs minorE at root+4 vs root+3)
- Quadrant = {arousal, valence} pair

Chord detection is deliberately simple. It works cleanly on piano chords and fails gracefully on
drums/noise (reports "ambient" and defaults to calm-dark). On complex polyphonic material, it picks
the strongest chroma peak. A pianist playing a clear C major gets a reliable detection; a guitarist
strumming with lots of overtones is less reliable but still directional.

## Difference from 57-sound-to-image

`57-sound-to-image` maps acoustic character to generic scenes (sea cave, sunlit courtyard, cosmic
nebula) via `fal-ai/flux/schnell`. This prototype maps to Ghost-LoRA-specific scenes via
`fal-ai/flux-lora` — the figure is the Ghost character with white spiral hair, mist dress, face
typically hidden. The scene is Ghost-narrative-specific: the same five narrative waypoints
(stone chamber, underground pool, forest dawn, cosmic ascension, tiny planet) as the journey.

`57-sound-to-image` shows you what your music looks like. `58-music-to-ghost` shows you WHERE
in the Ghost journey your music puts you. These are different semantic mappings of the same signal.

## Ghost LoRA parameters

- Model: `fal-ai/flux-lora`
- LoRA URL: same as `2-ghost-lab`, copied to avoid production import
- LoRA scale: 1.2 (matches prod; 1.0 was too loose, 1.4 starts ignoring scene prompt)
- Steps: 28, guidance: 3.5
- Image size: portrait_4_3

## Polish ideas (future cycles)

- Expose a "try again" button after generation — same quadrant, new seed, different composition
- Add more quadrant subdivisions: current 4 is coarse (could add a "neutral" center for truly tonal
  music, a "chaotic" bucket for noisy/atonal input)
- Show the chroma vector as a 12-bar chart during capture (like `28-chord-canvas`)
- After the Ghost image appears, trigger a spatial audio soundscape from `29-scene-spatial` for
  the matching scene — the image and sound arrive together
- The tiny-planet scene is missing from the quadrant map; could add it as a 5th bucket for
  "very calm + very bright" (high tonal clarity, extremely low energy)
