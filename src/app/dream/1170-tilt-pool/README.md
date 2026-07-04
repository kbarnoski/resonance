# Tilt Pool

**One-liner:** A liquid harmony instrument you play by *balancing* — tilt your device (or move the pointer, on desktop) and sound pools like water to the lowest corner.

## The question

What if you played chords by balancing, letting sound pool like water to the lowest corner of the screen?

## How to play

1. Press **Begin** to unlock audio and start the basin. On desktop it plays immediately with the **pointer** as your tilt vector — move the cursor over the pool.
2. On a phone, press **Enable tilt** to grant `DeviceOrientationEvent` permission (iOS asks on this gesture). Then physically tilt the device.
3. Hold near **level** to let several pools coexist — a full chord. Tilt gently to swell some pitches and drain others. Tilt **steeply** to collapse everything into one deep, low pool.
4. The spirit-level bubble (top-right) shows which way is "downhill." The active input mode is shown top-left.
5. **Stop** tears everything down (RAF, oscillators, audio context, listeners).

Degrades gracefully: no sensor or denied permission falls back to pointer control and says so on screen (emerald = fallback active, rose = permission denied).

## Named reference

Toshio Iwai's playful sensor-instrument lineage — *Electroplankton* — and physical balance / liquid instruments, via the "pour sound like water" metaphor.

## Tag line

input = tilt / pointer · output = canvas2d-bright · technique = shallow-water-pooling + JI-drone · palette = aqueous-daylight

## How it works

- **Tilt sensor / pointer** produce a gravity vector `(tx, ty)`, smoothed each frame.
- **Shallow-water pooling model:** each of six pools projects its basin position onto the gravity direction; downhill pools deepen, uphill pools drain toward silence. Level tilt keeps them all near base depth.
- **JI drone bank:** one voice per pool (sine + soft detuned triangle) over a just-intonation major scale on F3, each voice's gain driven by pool depth via `setTargetAtTime`. A slow LFO on a shared lowpass plus a feedback delay tail give the liquid shimmer. Master chain ends in a `DynamicsCompressor` limiter → 0.2 master gain.
- **Canvas2D fluid render:** translucent radial-gradient blobs that slump toward the low corner, with additive foam highlights, ripple rings on swell, and a bright daylit basin. Respects `prefers-reduced-motion` (calmer smoothing, no wobble/ripple).
