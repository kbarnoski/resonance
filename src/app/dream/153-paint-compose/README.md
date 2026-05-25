# Paint Compose

**Route**: `/dream/153-paint-compose`  
**Cycle**: 181 (adult build)  
**Status**: `demoable`

## What it asks

*What if painting and composing were the same act?*

## How it works

Paint strokes on a dark canvas. The moment you lift your finger, that stroke becomes a looping musical voice:

- **Hue → waveform**: warm hues (rose, amber) = sawtooth (buzzy, rich); cool hues (cyan, blue) = sine (pure, airy); mid hues (emerald, violet) = triangle (warm, mid)
- **Y position along the stroke → pitch**: points at the top of the canvas map to high notes (C5); points at the bottom map to low notes (C2). A horizontal stroke = a single repeated pitch; a diagonal stroke = an ascending or descending run; a wavy stroke = a melodic phrase
- **Stroke length → melody complexity**: short stroke (~50px) = 2–3 note motif; long stroke (~300px) = 8-note melody
- **X centroid → stereo pan**: strokes on the left play from the left speaker; strokes on the right from the right
- **Brush width → amplitude**: thin strokes are quiet; thick strokes are louder

All voices loop at the same BPM. Each active note-trigger point flashes as its note fires, making the melody visible as a traveling light sequence along the stroke.

## What you can paint

- **Straight horizontal line** → single pitch, repeating — good for drones
- **Diagonal stroke up-right** → ascending pentatonic run  
- **Wavy line** → oscillating melody that rocks between high and low
- **Short scribble in one register** → tight 2–3 note cluster
- **Layer strokes of different hues** → polyphonic texture, each color a different timbre and rhythm

## Controls

- **Color palette**: 7 hues → 7 timbres. Pick a color before drawing.
- **Brush size**: 3 sizes. Thin = quiet; thick = loud.
- **BPM**: 40–160. Controls how fast each melody loops through its notes. Slow BPM with long strokes → melodic phrases. Fast BPM with short strokes → rhythmic ostinatos.
- **Clear**: removes all voices and resets the canvas.
- **↓ PNG**: saves the current canvas state as a painting.

## Design notes

The central idea: **the stroke path IS the musical score**. Reading a painted stroke from left to right (following the arc-length-sampled note points) gives you the melody — the same way a pianist reads notes left-to-right on a staff.

This differs from `13-piano-canvas` (playing → painting) and `100-kids-paint-song` (drawing → one-shot playback). Paint Compose is bidirectional and persistent: painting is composing, and the composition keeps playing as long as the stroke is on the canvas.

Hue-to-timbre mapping follows a warm/cool emotional logic: warm colors (red, orange, amber) use sawtooth waves — richer, more aggressive, forward in the mix. Cool colors (cyan, blue) use pure sine tones — ethereal, glassy, receding. Violet and emerald use triangle waves — warmer than sine, gentler than sawtooth.

The max-6-voice limit creates a compositional tension: adding the 7th stroke evicts the oldest. You edit by painting over.

## Inspirations

- **ViTex (arXiv:2603.01984, March 2026)**: visual texture as musical parameter space
- `100-kids-paint-song` ❤️ (Karel's loved prototype): drawing path → melody
- `85-spectrogram-paint`: pitch detection → canvas painting (the reverse direction)

## Zero deps · Zero API · Zero permissions · 3.42 kB
