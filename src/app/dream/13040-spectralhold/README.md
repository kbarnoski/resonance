# Spectral Hold

**Route:** `/dream/13040-spectralhold`

> What if you could freeze a single instant of your own voice or piano into an
> endless, still chord — and stack those frozen instants into a self-choir you
> conduct?

The microphone is the instrument. There is no seeded drone and nothing plays
until you freeze something. You sing, hum, or play a note; you tap **Freeze**;
that exact instant of spectrum is caught and rung forever. Freeze again on a
different pitch and the two held instants sound together. Up to six frozen
instants stack into a still, luminous choir made entirely of your own breath.

## How to use it

1. Press **Start mic** and allow microphone access.
2. Make a sound and tap **Freeze** (or press the **spacebar**) at the instant
   you want to hold. The frozen tone sustains on its own.
3. Repeat to stack layers (up to six). **Release last** fades the newest layer;
   **Clear** releases them all. **Volume** rides the master level.
4. If the mic is unavailable the page degrades to a silent, slowly drifting
   vowel synth you can still freeze, so it is never dead.

The near-black canvas is deliberately austere: the live spectrum is a faint
moving line along the bottom, and each frozen layer is a persistent horizontal
"shelf" of thin, glowing violet lines standing at its partial frequencies,
shimmering slowly. The sound is the art; the screen is almost incidental.

## The DSP — a phase-vocoder spectral freeze

A continuous **Short-Time Fourier Transform** runs on the incoming signal inside
a `ScriptProcessorNode`: every hop (512 samples, 75% overlap) the last 2048
samples are Hann-windowed and passed through a hand-rolled radix-2 complex FFT
(`pv.ts`, `class FFT`). This gives, every ~11 ms, the current magnitude and
phase spectrum — used both for the live display and as the material to freeze.

**Freeze** snapshots the magnitude spectrum `|X[k]|` together with a per-bin
**frozen phase-advance** `Δφ[k]`, measured as the raw phase difference between
two successive analysis frames (i.e. each bin's own instantaneous per-hop
rotation). Resynthesis is a true **overlap-add IFFT**: every hop the engine
rebuilds a complex frame from the frozen magnitudes and a running phase, inverse-
FFTs it, applies a Hann synthesis window, and overlap-adds it into the output
(normalised by the constant `wa·ws` overlap sum, then soft-clipped for
headroom). Because each bin's phase keeps advancing by its own frozen `Δφ[k]`,
the held frame *rings* smoothly instead of producing the metallic buzz of a
naive "hold the frame" freeze.

**Identity phase-locking (Laroche & Dolson).** Locking every bin independently
would let partials drift out of vertical phase and smear. Instead, on freeze we
pick the spectral peaks (local magnitude maxima above a relative floor) and
assign every bin to its nearest peak (its *region of influence*). Each hop only
the **peak** phases advance; every neighbouring bin's phase is then re-derived as
`φ[peak] + (φ_frozen[bin] − φ_frozen[peak])`, so the whole partial rotates as one
rigid body and stays coherent. This is the identity phase-locking of Laroche &
Dolson applied to a static (zero-stretch) freeze.

**Resynthesis path chosen:** the real overlap-add IFFT phase vocoder described
above — not the oscillator-bank approximation — because with phase-locking it is
click-free and keeps the full timbre (all bins, not just detected peaks) of the
frozen instant.

### References

- M. Dolson, "The Phase Vocoder: A Tutorial" (1986); R. Portnoff, phase-vocoder
  STFT analysis/synthesis foundations.
- M. Puckette / R. Dobson, phase-vocoder freeze and resynthesis lineage.
- J. Laroche & M. Dolson, "Improved Phase Vocoder Time-Scale Modification of
  Audio" (IEEE TSAP, 1999) — identity phase-locking / peak region-of-influence.

## Next-cycle deepening

- Move the STFT into an `AudioWorklet` to shed the deprecated ScriptProcessor,
  drop latency, and free the main thread.
- Give each held layer its own gain fader, transpose, and slow spectral-blur
  drift so the choir can be voiced and conducted, not just stacked.
- Add per-peak parabolic frequency interpolation so partials land dead-on pitch
  and the held chord tunes itself to the room.
