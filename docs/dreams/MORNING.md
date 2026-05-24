# Morning digest — last updated 2026-05-24 UTC (Cycle 147)

## New since yesterday

- **[/dream/124-image-chord](/dream/124-image-chord)** — Image Chord · *Cycle 147* · `demoable`
  Drag any photo, screenshot, or artwork onto the canvas → JS extracts the dominant hue/saturation/brightness from pixel data → maps directly to a chord + arpeggio: warm reds = C major, yellows = C7, greens = Cm, cyans = Cm7, violets = Cmaj7, magentas = Cdim. Saturation drives harmonic richness (desaturated image = 1 pure sine; vivid = 4 triangle oscillators with subtle detuning). Brightness drives register + tempo (dark = bass C2, 35 BPM; bright = treble C5, 120 BPM). 8 journey-palette swatches (Cosmic, Earth, Sanctuary, Ocean, Snowflake, Ghost, Fire, Mycelium) let you instantly hear each journey's musical character. The 6-band bloom ring animates to the synthesized chord output. Chord name shown centered in large monospace. Zero deps, zero API, zero ML. **Why open this**: drop a Ghost scene screenshot and hear the chord of that scene. Drop a landscape photo. Compare swatches. The Snowflake swatch (icy pale blue) → Cm7 at 120 BPM; the Cosmic swatch (deep violet) → Cmaj7 at 35 BPM — already feels like those journey worlds.

- **[/dream/116-kids-bloom-garden](/dream/116-kids-bloom-garden)** — Bloom Garden polish · *Cycle 146* · `polished`
  Added a growing press-ring to the hold mechanic. A violet arc sweeps clockwise over the 480ms hold — "keep holding" feedback without text. Give to Maia.

- **[/dream/123-landscape-resonance](/dream/123-landscape-resonance)** — Landscape Resonance · *Cycle 145* · `demoable`
  Raw WebGL terrain fly-through. Bass lifts mountains. On a projector this is a stage piece.

## In progress / partial

Nothing in-progress. Cycle 148 (even) is a kids cycle.

## Research findings worth a look

- **Image-chord's mapping is deterministic + instant**: no server round-trip, no ML model — it's just a hue histogram over a 64×64 downsampled canvas. Could be extended to video frames (webcam feed → continuously changing chord as scene changes). Related: `110-webcam-compose` already does zone-based HSL → synth; image-chord does whole-image dominant-hue → chord quality, which is different and arguably more musical.
- **Press-ring pattern from Cycle 146** is reusable for any prototype with a timed-hold mechanic.

## Open questions for Karel

1. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Any update?
2. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Still waiting for OK.
3. **Welcome Home track IDs** — needed for `72-paths-visualizer` and `76-cymatics-on-piano-path` (blocked ~70 cycles).
