# FM Explorer — design notes

**Route**: `/dream/79-fm-explorer`  
**Cycle**: 94  
**Status**: demoable  
**Deps**: zero (Web Audio API + Canvas2D only)

## What is this

2-operator FM synthesis: one oscillator (the **modulator**) connects to the
`frequency` AudioParam of a second oscillator (the **carrier**). The Web Audio
API implements this in three nodes:

```
OscillatorNode (modulator, freq = fc × C:M)
  → GainNode (modDepth, gain = β × fc)         ← this IS the modulation
     → OscillatorNode.frequency (carrier, fc)
        → GainNode (ADSR envelope)
           → GainNode (master 0.26)
              → AudioContext.destination
```

The single parameter `β` (modulation index) controls how far the carrier's
frequency deviates on each cycle. At β = 0, you hear a pure sine. At β = 2.5
with C:M = 1:1, you get the classic Yamaha DX7 electric piano — where most of
the energy has shifted out of the carrier into the sidebands.

## The math (Bessel functions)

FM synthesis produces sidebands at `fc ± n·fm` for integer n. The amplitude at
each sideband is given by the Bessel function of the first kind:

```
|J_n(β)| = amplitude at carrier ± n × modulator
```

This is what the spectrum canvas draws. The bars are the actual Bessel
coefficients — not a simulated FFT, but the mathematical prediction. For
β = 2.5:
- J₀(2.5) ≈ 0.048 (carrier almost gone)
- J₁(2.5) ≈ 0.497
- J₂(2.5) ≈ 0.446
- J₃(2.5) ≈ 0.217

That's why the electric piano sounds the way it does: the fundamental is nearly
absent and energy lives in the 1st and 2nd sidebands.

The Bessel functions are computed via Miller's backward recurrence — stable for
all β including large values. Parseval normalization: J₀² + 2(J₁² + J₂² + ...)
= 1.

## C:M Ratio families

The ratio of carrier frequency to modulator frequency (C:M) determines which
harmonic series appears:

| C:M   | Sound family       | Why                                      |
|-------|--------------------|------------------------------------------|
| 1:1   | Piano, bells, EP   | Integer harmonics — each sideband is on a harmonic |
| 1:2   | Brass, horn        | Every other harmonic — open-fifth series |
| 1:3.5 | Tubular bell       | Inharmonic ratio — non-integer series    |
| 3:2   | Reed, clarinet     | Odd-numbered harmonics predominate       |
| 2:1   | Metallic shimmer   | Very dense sideband series               |
| 7:1   | Harsh metallic     | Extreme density, all close together      |
| 0.25  | Glass harmonica    | Sparse sub-harmonic series               |

## Audio-reactive mode

In mic mode: bass band energy (60–250 Hz) drives β upward by up to +14.
Loud playing → richer harmonics → more complex timbres. Onset events
re-trigger the ADSR envelope — your rhythm shapes the attack.

In demo mode: a slow LFO (period ~25s) breathes β between 50% and 130% of
the dial value. The spectrum visibly shifts as the LFO runs.

## Polish ideas

- **Operator waveform selector**: triangle/sawtooth modulator produces more
  complex spectra (Bessel theory only strictly applies to sine modulators, but
  the perceptual result is interesting).
- **Detune**: slight (±0.5 Hz) carrier vs. modulator drift creates slow AM-like
  beating inside the FM tone.
- **Multiple carrier frequencies**: play a chord by running multiple FM pairs
  at different notes simultaneously.
- **β automation envelope**: draw a curve for β over time, so the timbre
  evolves without holding the slider.
- **Scope view**: show the carrier waveform alongside the spectrum — at β = 0
  it's a sine; at β = 2.5 it's distinctly non-sinusoidal.
- **C:M ratio lock**: snap to harmonic ratios only (1:1, 1:2, 2:3, 3:4...) and
  show the resulting interval name.
