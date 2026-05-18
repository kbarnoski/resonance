# Granular Cloud — design notes

**Route**: `/dream/18-granular`  
**Cycle**: 20  
**Question**: what if Resonance transformed your audio rather than just visualizing it?

---

## What it does

Granular synthesis from live audio. The Web Audio analyser captures the last ~186ms of
audio in a Float32Array (fftSize = 8192 at 44100Hz). Every 1/densityHz seconds, it
samples a short "grain" from that window:

1. Pick a random start position (center-biased toward recent audio, jittered by scatter)
2. Extract `grainMs` samples from that position
3. Apply a Hann window (smooth fade-in/fade-out to prevent clicks)
4. Wrap in an AudioBuffer and play via AudioBufferSourceNode
5. Random detune (±pitchCents), random stereo pan
6. Gain scaled down by density (so total output stays constant as you increase grain rate)

## Visual scatter plot

Each grain appears as a glowing dot:
- **X axis** = where in the 186ms buffer the grain was sampled from (left = older, right = most recent)
- **Y axis** = pitch shift in cents (up = higher, center = unchanged, down = lower)
- **Color** = hue encoding buffer age: blue/indigo for older buffer positions, warm orange for recent
- **Size** = proportional to grain duration
- **Alpha** = decays as the grain plays out (lifetime = grainMs × 3.5 for visual persistence)

Additive blending (`globalCompositeOperation = "lighter"`) means overlapping grains
accumulate into bright regions — the cloud's density is the density of grain activity.

A faint waveform strip at y=83% shows the raw analyser time-domain data.

## Parameters

- **DENSITY** (5–50 grains/sec): rate of grain spawning. At 18/sec, average 1.26 overlapping
  grains (continuous but sparse). At 40/sec, ~2.8 overlapping (lush reverb texture).
- **PITCH ¢** (0–800 cents): random pitch shift range. 0 = no pitch scatter (echo).
  240¢ = ±2 semitones (shimmer). 800¢ = ±6.7 semitones (alien cloud).
- **GRAIN ms** (20–200ms): grain duration. Short grains = spectral blur without clear pitch.
  Long grains = audible individual pitch echoes.
- **SCATTER** (0–100%): how far from the center of the buffer grains can sample. 0% = all
  grains from the same moment (chorus). 100% = grains from across the full 186ms (smear).

## Demo mode

Five LFO-modulated sine oscillators (55, 165, 440, 880, 2200Hz) feed the analyser silently
(not connected to speakers). Grains sample from this oscillator mix — so demo sounds like
granular evolution of pure tones. LFOs at 0.08–0.19Hz make the oscillator mix shift slowly,
so the granular texture evolves on a 6–13 second cycle.

## What makes this different

All 17 prior prototypes react to audio (FFT → visuals, or FFT → particle behavior).
This prototype **transforms** audio. The output you hear is derived from your input, not
your input directly. The relationship is:

```
input audio → grain extraction → pitch shift + pan → output audio
```

The visual and the sound are the same object — each dot IS a grain playing.

## Polish ideas

- **Freeze button**: lock the analyser snapshot at a single moment. All grains sample from
  the frozen buffer → a sustained granular chord from a single instant in time.
- **Pitch envelope**: each grain can slide from detune=0 to detune=D over its duration
  (chirp). Short chirp grains with high density create a waterfall of gliding tones.
- **Buffer age coloring**: weight sampling toward a movable "playhead" (like tape scrubbing)
  rather than always center-biasing toward recent audio.
- **Density automation**: map mic amplitude to density — louder input = more grains → cloud
  gets denser in response to playing intensity.
- **3D scatter**: add a Z axis (grain amplitude at sampling position → depth) and project
  the cloud in 3D like acoustic-trail, making the cloud truly volumetric.
