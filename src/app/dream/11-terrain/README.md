# Spectrogram Terrain

**Route**: `/dream/11-terrain`  
**Prototype question**: What if your audio history was a 3D landscape you could look across?

## What it does

FFT data accumulates as a rolling time-history grid (64 frequency columns × 80 time frames).
Each animation frame the newest spectrum row is pushed to the front and the oldest fades to
the horizon. The result is a 3D terrain where:

- **X axis**: frequency (log-spaced, 30 Hz left → 20 kHz right)
- **Z axis**: time (newest row nearest, oldest at horizon)
- **Y axis**: amplitude (louder = taller peaks)

Painter's algorithm renders rows back-to-front. Each row's ridge line is colored by frequency
(blue = bass, teal = mids, orange = treble) and brightness by amplitude. A filled silhouette
below each ridge occludes the rows behind it, creating natural depth.

## Rendering approach

Simplified fake perspective: `scale = 1 - row/ROWS` compresses x-width and y-height linearly
as rows recede. This avoids explicit perspective math and gives equivalent results to a
fixed-angle camera looking forward across the terrain.

Per frame:
- 80 `fill()` calls (silhouette occlusion, one per row)
- Up to ~5000 colored `stroke()` calls (ridge line segments, skipped when amp < 0.015)

Canvas 2D hardware acceleration handles this at 30–60 fps. The skip threshold eliminates
the majority of strokes when the spectrum is sparse.

## Audio pipeline

- **Demo**: 6 oscillators (55, 110, 440, 880, 3300, 9000 Hz) each with a slow LFO on gain.
  Silent at the speaker; the Web Audio graph feeds the AnalyserNode internally.
- **Mic**: getUserMedia → AnalyserNode (not connected to destination — no feedback).

Log-frequency bin mapping: `freq(c) = 30 × (nyquist/30)^(c/63)`. This places octaves at
equal visual width, matching perceptual frequency spacing. Otherwise the terrain's right
half would be almost invisible (20 kHz vs 10 kHz is one octave but a huge linear bin gap).

## Design questions

1. **Camera motion**: fixed camera now. Flying down into a peak on loud sections ("riding the
   mountain") would make the temporal relationship visceral. Doable by modifying `cy` and scale
   based on current-row max amplitude.
2. **3D WebGL version**: the fake perspective is convincing but a real WebGL 3D terrain with
   normals, directional light, and fog would let you orbit/fly through it. Worth prototyping
   as a follow-up if Karel wants to explore this further.
3. **Longer history**: 80 frames at 60fps ≈ 1.3 seconds. At 300 frames (~5s) you'd see
   phrase structure as ridgelines — chord changes would appear as terrain features. Needs
   WebGL for the fill-pass count.
4. **Color spectrum flip**: bass=blue, treble=orange is chosen as "deep=cool, bright=warm."
   Inverting (bass=red/lava, treble=ice-blue) gives a different aesthetic — volcanic.
