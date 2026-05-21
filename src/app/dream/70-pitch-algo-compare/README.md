# Pitch Compare — design notes

**Route**: `/dream/70-pitch-algo-compare`
**Cycle**: 88
**Status**: demoable

## What it does

Three pitch detection algorithms run simultaneously on every audio frame. You can see where they agree (gold consensus cursor) and where they diverge (individual colored cursors spread apart on the piano roll).

## Algorithms

### Autocorrelation (orange)
Classic normalized ACF: computes r(tau) = sum(x[i] * x[i+tau]) / r(0), then finds the first local maximum between the lag bounds for MIN_HZ and MAX_HZ. Fast. Works reliably on pure tones and simple pitched signals. Prone to octave errors when harmonics are strong — can lock onto a sub-multiple of the true period.

### YIN (blue)
The YIN algorithm (de Cheveigné & Kawahara, 2002) computes the cumulative mean normalized difference function (CMNDF) and finds the first tau where it dips below a threshold (0.15). Includes parabolic interpolation for sub-sample accuracy. Aperiodicity check gives roughly 15% fewer octave errors than plain ACF on real-world piano and voice signals.

### HPS — Harmonic Product Spectrum (green)
Multiplies 4 harmonically downsampled copies of the magnitude spectrum: HPS[k] = |X[k]| × |X[2k]| × |X[3k]| × |X[4k]|. The fundamental frequency gets a very high product because all its harmonic multiples also have energy. Piano, violin, and most harmonic instruments produce strong results. Pure sine tones (no harmonics) produce unreliable results — HPS basically guesses at the fundamental.

## Why this matters for Resonance

Nine prototypes (`13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`, `37-ratio-lab`, `39-anticipate`, `51-diatonic-harmony`, `65-dialogue-score`, `28-chord-canvas`) use autocorrelation pitch detection. Seeing all three algorithms running simultaneously on the same signal makes it empirically clear when and how they differ:

- **Single clean note**: all three agree, gold consensus cursor appears
- **Low C2 on piano**: ACF often lands on the wrong octave; YIN and HPS are better
- **C major chord**: HPS correctly identifies the bass note; ACF and YIN may jump to a harmonic
- **Silence / room noise**: all three drop below confidence threshold, no cursors shown

The `neural-pitch` upgrade (CREPE-tiny ONNX, ~2MB CDN) is the logical next step — the `pitch-algo-compare` canvas would be the ideal place to add a 4th cursor once Karel approves the CDN dependency.

## Implementation notes

- FFT is hand-rolled Cooley-Tukey (in-place, bit-reverse permutation + butterfly). The same buffer feeds all three algorithms each frame — one `getFloatTimeDomainData` call, three different algorithms.
- The EMA on `smoothMidi` (α = 0.76) prevents cursor jitter while still tracking pitch changes quickly. Confidence < 0.25 suppresses the cursor entirely.
- Demo uses a `sawtooth` oscillator (all harmonics present) so HPS performs well and the comparison is meaningful.
- No external dependencies. Pure Web Audio API + Canvas2D.
