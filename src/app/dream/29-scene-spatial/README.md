# 29-scene-spatial — Ghost Scenes as 3D Spatial Audio

**Route**: `/dream/29-scene-spatial`  
**Cycle shipped**: 33  
**Status**: demoable

## What it does

Six Ghost narrative scenes (Stone Chamber → Cosmic Ascension), each with a hand-authored 3D
soundscape built from synthesized oscillators, filtered noise, and FM bird chirps. No audio files.
Sources are placed on a sphere using Web Audio HRTF PannerNode; drag any colored dot to reposition
a sound source in real time.

Wear headphones. The HRTF illusion is most vivid for high-frequency sources (birds, water trickle).

## Scene audio maps

| Scene | Sources | Reverb |
|-------|---------|--------|
| Stone Chamber | Piano (front-left), stone perc (above), resonance drone (behind) | 3.5s, heavy decay |
| Root Portal | Earth drone 41Hz (below), forest noise (front), bird chirp (front-right-above) | 2s |
| Underground Pool | Water trickle (right), cave drone 38Hz (below), slow-attack echo (left-behind) | 5s |
| Tiny Planet | Wind left + wind right, two birds above at different pitches | 1.2s, open sky |
| Forest Dawn | Canopy birds (above), stream (left-front), piano (right-front) | 2s |
| Cosmic Ascension | Root pad 55Hz, octave pad 110Hz (above), two-octave pad 220Hz (high) | 6s, slow swell |

## Audio architecture

Each source → `dryGain` (70–80%) → `PannerNode` (HRTF) → destination  
Each source → `wetGain` (20–30%) → shared `ConvolverNode` → destination

Impulse responses generated procedurally: `Math.random() × 2 − 1` × `(1 − i/len)^decay`.
No external library, no audio files. Reverb decay exponent ranges from 1.5 (cosmic, longer tail)
to 3 (stone chamber, drier attack).

## Synthesis types

- **drone**: Continuous sine at `freq`. Low pass, gains 0.15.
- **pad**: 4 harmonics (1×, 2×, 3×, 5× freq), 2s slow attack, 50/50 wet.
- **piano-loop**: Sine with ADSR envelope (12ms attack, 2s exponential release), fires every 3–5s.
  Occasionally voices a perfect fifth (+1.5× freq) for modal texture.
- **perc-loop**: Bandpass-filtered noise burst (Q=8), 220ms decay. Stone hit character.
- **noise-wind**: Looped white noise through lowpass at `freq`. Soft ambient texture.
- **noise-water**: Looped noise through highpass + bandpass cascade. Sharper trickle character.
- **bird-loop**: FM synthesis — carrier + 9Hz modulator at 8% depth. Gated with 220ms chirp
  envelope, 50% chance of double-chirp. Realistic warble.

## Canvas interaction

Top-down sphere view. X-axis = left/right, Z-axis = front(−)/back(+). Elevation (Y) shown by
dot size and glow brightness: larger+brighter = higher above you. Drag any source dot to update
both its canvas position and its HRTF PannerNode in real time.

Preview mode (idle): scene sources shown at spec positions. Dragging in preview resets on next
scene load.

## What works well

- **Forest Dawn** has the clearest HRTF demo: three distinct azimuths at the same time. Canopy
  above → stream left → piano right. Moving one source makes the shift obvious.
- **Cosmic Ascension**: the three pads (55/110/220Hz) are pure octaves. The 6s reverb smears
  them but the harmonic series survives. 2s slow attack means the first two seconds are near-silent.
- **Underground Pool**: 38Hz cave drone is felt as much as heard. The 5s reverb gives a huge sense
  of space. Moving the echo source from behind-left to behind-right changes the sense of the room.

## Polish ideas

- Second canvas showing side view (elevation axis) — harder to imagine Y-position without it
- Elevation drag: click+drag vertically on a dot to change Y position
- Scene narration text overlay that scrolls as the scene plays (like subtitles)
- Slowly drift source positions over time (Lorenz attractor as position driver)
- MIDI control: CC knobs map to source X/Y/Z positions for live performance
- Add 7th/9th chord tones to piano-loop for richer harmony in stone chamber / forest dawn
- `28-chord-canvas` integration: detect what chord the piano-loop is playing and display it
