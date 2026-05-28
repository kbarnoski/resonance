# 189 — Voice Scene

**Question**: what if you could transform the audio-visual space by just saying a word?

## What it does

Six ambient scenes — Cosmic, Earth, Forest, Ocean, Fire, Crystal — each with a distinct
particle field, drone synthesis, and arpeggio pattern. Switch between them by:
- **Clicking a button** (always available)
- **Saying a trigger word** via the Web Speech API (Chrome/Edge only)

The particle field transitions gradually. The drone pitches glide. The arpeggio restarts.
The hue of the whole scene lerps toward the new scene's color over 2 seconds.

## Scenes

| Scene   | Icon | Trigger words                      | Particle behavior | Root | BPM |
|---------|------|------------------------------------|-------------------|------|-----|
| Cosmic  | ✦    | cosmic, space, star, void, galaxy  | Rise upward       | C2   | 24  |
| Earth   | ◉    | earth, ground, stone, cave, deep   | Fall downward     | F2   | 36  |
| Forest  | ✿    | forest, nature, green, tree, bloom | Random drift      | G3   | 72  |
| Ocean   | ◎    | ocean, wave, water, sea, calm      | Horizontal waves  | C3   | 42  |
| Fire    | ◈    | fire, bright, energy, warm, spark  | Radial burst      | C4   | 108 |
| Crystal | ◇    | crystal, snow, ice, clear, pure    | Clockwise swirl   | C5   | 80  |

## Technical

- **Canvas2D** with `globalCompositeOperation: "screen"` for additive particle glow
- **Web Audio** drone: two sine oscillators (root + fifth), gain-faded on scene switch
- **Arpeggio**: `setInterval`-scheduled OscillatorNode bursts at scene BPM
- **Web Speech API**: continuous recognition, word → scene mapping. Fallback buttons work on all browsers.
- Motion trail via semi-transparent background fill (0.20 alpha per frame)
- Zero external deps. Zero API calls.

## Live performance notes

This could work as a venue performance controller: a performer speaks a word into a live
microphone and the projected visual environment responds. Say "fire" at the build; say "cosmic"
at the peak; say "ocean" for the resolution. Voice as stage direction.

The word set is intentionally broad — "alive", "deep", "bright" all map to scenes. Natural
speech tends to trigger scene changes during evocative moments without breaking the performance.

## What's next

- Mic analysis layer: the voice input also drives FFT energy, so speaking at different volumes
  modulates particle density
- Custom words: let Karel define his own trigger vocabulary
- Transition duration slider: longer crossfades = ceremonial; shorter = reactive
