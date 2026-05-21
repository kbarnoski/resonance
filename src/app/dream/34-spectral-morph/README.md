# Spectral Morph — design notes

**Route**: `/dream/34-spectral-morph`  
**Cycle**: 37  
**Status**: demoable

## The question

What if you could dissolve one timbre into another, not by mixing them, but by blending
their spectral shapes?

A crossfade at 0.5 gives you both sources simultaneously — you hear them together.
Spectral magnitude interpolation at 0.5 gives you a genuinely different timbre — you hear
something that doesn't exist at either extreme. The harmonics are there but at different
proportions, the texture is new.

## How the FFT morphing works

Every 256 samples (one "hop"), the AudioWorklet:

1. Copies the 1024 most-recent samples from each input ring buffer
2. Applies a Hann window to both (reduces spectral leakage at frame boundaries)
3. Runs a 1024-point Cooley-Tukey FFT on each windowed frame
4. For each frequency bin k:
   - Computes magnitude of A: `|A[k]| = sqrt(re² + im²)`
   - Computes magnitude of B: `|B[k]|`
   - Blends: `|out[k]| = (1-t)|A[k]| + t|B[k]|`
   - Keeps Source A's phase: `φ = atan2(im_A[k], re_A[k])`
   - Reconstructs: `out[k] = |out| * e^(iφ)`
5. IFFT → time-domain output frame
6. Applies synthesis Hann window + overlap-adds into the output ring
   (OLA scale = 2*hop/N = 0.5 for proper reconstruction with 4× overlap)

This is a simplified phase vocoder operating on static frames (no phase propagation
across hops). It produces correct magnitude blending; phase artifacts are mild for the
demo and demo oscillators because A's phase is self-consistent.

## Demo: sawtooth → sine (C3)

Sawtooth at C3 (130.81 Hz): harmonics at 1×, 2×, 3×, ... with amplitude falling as 1/n.
Sine at C3: only the fundamental (n=1), amplitude 1.

At t=0.0: pure sawtooth buzz.
At t=0.5: fundamental unchanged; harmonics n=2,3,... reduced by 50%. Distinctly different
texture — somewhere between a sawtooth and a filtered square.
At t=1.0: pure sine. Single frequency component.

The spectrum panels show this in real time: Source A has many bars lit; Source B has one
tall bar; Blend shows the continuously fading harmonic series as you drag the slider.

## Visual

Three stacked spectrum strips (Source A = bottom, Blend = middle, Source B = top).
Each strip shows 200 frequency bins (up to ~8 kHz). Hue encodes frequency: violet (low)
→ orange (high), matching the `1-live` palette. A vertical dashed cursor shows the
current morph position.

## AudioWorklet structure

The worklet uses two ring buffers (one per input channel) of size N=1024. The write head
advances per sample; every `hop=256` samples the morph() function runs. The OLA output
ring is 2×N to avoid write-ahead collision with the read head.

FFT is a hand-rolled Cooley-Tukey radix-2 DIT with precomputed bit-reversal and twiddle
LUTs. No external deps — pure JavaScript inside the Blob URL.

## Polish ideas

- **Phase propagation**: carry previous-frame phase advance across hops for smoother
  output (full phase vocoder). Reduces the mild metallic quality on mic input.
- **Power-domain blending**: interpolate magnitude² (power) instead of magnitude —
  would give a perceptually more linear loudness blend.
- **Source A = mic + Source B = preset instrument**: clarinet → piano spectrum morphing.
  Could pre-record FFT magnitude templates for different instruments and let the user
  morph from mic input toward any template.
- **Pitch preservation**: when B is shifted to a different pitch, keep A's pitch while
  morphing the harmonic structure (requires frequency stretching in the bin domain).
- **Two-way mic**: let both A and B be mic input (two separate mic tracks or L/R channels
  of a stereo input) and morph between two performers.
