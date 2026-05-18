# 7-spatial — Binaural HRTF Spatial Audio

**Route**: `/dream/7-spatial`  
**Status**: demoable  
**Cycle shipped**: 7

## What it does

Six frequency bands (sub-bass → high) are routed through independent Web Audio `PannerNode`s using the HRTF panning model. Each panner sits at a fixed 3D position around the listener — bass to the front-left, treble above, etc. You see a sphere showing where each band lives; dragging a dot moves that band's sound in real-time.

**Default layout (audible with headphones):**
- Sub-bass (40 Hz): directly below
- Bass (125 Hz): front-left
- Low-mid (350 Hz): directly in front
- Mid (1 kHz): front-right
- High-mid (3 kHz): right and above
- High (10 kHz): directly above

## Three input modes

1. **Demo oscillators** — six sine waves, one per band center frequency, through their panners. Instant. Sounds like a test tone but you can clearly hear spatialization with headphones.
2. **Microphone** — your voice or instrument split into 6 bands, each band spatialized. Strange and interesting: bass of your voice rises from below while treble floats above.
3. **Audio file** — upload any audio (mp3, wav, ogg). The file loops and splits into the same 6 spatial channels.

## How the audio graph works

```
source → BiquadFilter(bandpass, 40Hz, Q=0.8) → AnalyserNode → PannerNode(HRTF) → destination
       → BiquadFilter(bandpass, 125Hz, Q=0.8) → AnalyserNode → PannerNode(HRTF) → destination
       ... × 6
```

Bandpass filters separate frequency content. Each band feeds its own HRTF panner. The panners use `rolloffFactor = 0` so all bands have equal volume — we want spatial awareness, not distance attenuation.

## Visualization

Orthographic projection with 24° downward camera tilt (so you see the sphere from slightly above). Visual convention: dots closer to you = brighter = sound coming from that direction relative to listener at center. Dot size pulses with that band's RMS energy.

Z-axis: audio convention has z < 0 = "in front of listener". The projection flips z so "in front" appears at the visual front of the sphere (higher depth in the render order). Inverse projection for dragging unflips z correctly.

## What surprised me

The HRTF effect is subtle at low frequencies (sub-bass and bass don't localize well — human hearing uses inter-aural time differences and pinnae reflections which are frequency-dependent). Above ~2kHz, the elevation effect is clearly audible with good headphones. Moving the high-frequency bands above/below is the most convincing demo.

## What to try next

- **Arc integration**: run the 5-arcs journey engine and route its phase-specific frequency emphasis through spatial positions. Low phase = bass front and center; peak phase = treble above and all around.
- **Mic feedback loop suppression**: when using mic mode, loopback from headphones can cause feedback. Add a notch filter or gate.
- **SOFA HRTF file loading**: the browser uses a generic HRTF. Web Audio supports loading custom SOFA files — Karel's personalized HRTF would be more convincing but requires measurement.
- **Spatial reverb**: late reflections at room-scale positions (walls at ±3m) would add presence without changing the direct-sound positions.
