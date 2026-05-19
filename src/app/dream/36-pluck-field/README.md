# pluck field — design notes

**Route**: `/dream/36-pluck-field`  
**Cycle**: 40  
**Status**: demoable

## What it is

A 4×6 grid of 24 virtual strings, tuned to C pentatonic from C2 to G6. Click
any cell to pluck that string. Enable mic — percussive onsets pluck strings in
the octave range matching the detected spectral centroid.

## How it works — Karplus-Strong synthesis

Each string is three Web Audio nodes wired in a feedback loop:

```
[noise burst] → DelayNode(1/freq) → BiquadFilter(lowpass, 4kHz) → GainNode(g)
                     ↑                                                    │
                     └────────────────────────────────────────────────────┘
```

**Pluck**: inject one buffer-length (N = sampleRate / freq samples) of white
noise into the delay line. The feedback loop sustains it: the delay recirculates
the signal, the low-pass filter absorbs high harmonics each pass (physically:
energy lost at the bridge), and the gain node sets the decay rate.

**Web Audio cycle**: the Web Audio spec allows cycles if at least one `DelayNode`
is in the cycle — which ours is. No AudioWorklet needed.

**Feedback gain formula**: the gain per cycle that gives -60 dB in `tau` seconds
is `g = exp(-6.908 / (tau × freq))`. Lower strings have tau = 3s, highest strings
have tau = 1.5s — physically accurate (low strings sustain longer).

## Visual

Each string is a horizontal line across its grid cell. When plucked:
- Animates as a **standing wave**: sinusoidal displacement with zero amplitude at
  both ends and 1–4 half-waves depending on the string's position in the grid
  (bottom row = 1 half-wave; top row = 4). Higher strings oscillate visually faster.
- Amplitude decays exponentially at `visualTau` (matching audio decay).
- Color: pitch hue from violet (C2) to orange (G6), same mapping as `1-live`.
- Additive glow (`shadowBlur`) scales with amplitude — active strings bloom.

## Mic mode

When mic is enabled, `useMicAnalyser` runs the FFT + onset detection. On each
detected onset, the prototype plucks a random string weighted to the current
spectral centroid:
- Centroid < 300 Hz → pluck from rows 0–1 (C2–D4, strings 0–11)
- 300–900 Hz → pluck from rows 1–2 (D3–G5, strings 6–17)
- > 900 Hz → pluck from rows 2–3 (E4–G6, strings 12–23)

## Interaction

- **Click**: pluck one string
- **Touch + drag**: sweep across cells to pluck multiple strings — like running
  a finger along harp strings
- **Mic onset**: plucks a random string in the centroid-appropriate range

## Polish ideas (future cycles)

- **Chord mode button**: pluck all strings in a selected chord (C maj, A min, etc.)
- **Strum sweep**: animate a diagonal pluck across all 24 strings over 200ms
- **Sustain pedal**: spacebar holds all current resonances (locks feedback gain to 1.0)
- **Alternate filter curves**: guitar (sharpest LP), piano (medium), harp (gentle LP)
- **Waveform display**: small time-domain trace per cell while ringing
- **Scale picker**: switch from C pentatonic to major, minor, whole-tone

## Known quirks

- Very lowest strings (C2, D2) ring for 3+ seconds at full volume. If many are
  plucked simultaneously the master gain can clip. Future: compressor on master bus.
- Highest strings (C6–G6) have short delay times (~28–40 samples). KS works
  fine at this range; the "fundamental" is slightly flat due to sample rounding,
  which is inaudible.
