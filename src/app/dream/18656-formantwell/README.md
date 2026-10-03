# 18656 · Formantwell

**Status**: demoable — cycle-3 merge of 18384-throatmorph (shipped) + vowelbend (banked), tsc-clean, audio bussed through `createSafeMaster`.

## What if?

What if your two hands could reshape the vocal tract of your OWN piano recording —
morphing its timbre continuously glassy → woody → vowel-like at exactly-fixed
pitch — by extracting the recording's OWN formants with a real cepstrum AND
rendering the morph through a provably-stable, hiss-free ordered biquad cascade?

This is a **cycle-3 merge** that fuses the best of two siblings:

- **throatmorph** (shipped, cycle-2) extracts the recording's OWN log-spectral
  envelope with a real cepstrum — its winning advantage — but applies the morph
  as a per-bin STFT gain inside an AudioWorklet, which _can_ hiss on resynthesis.
- **vowelbend** (banked, never shipped) renders the morph through a cascade of
  five ordered peaking biquads morphed via line-spectral-frequency (LSF) style
  ordering — unconditionally stable, cannot hiss — but imposes FIXED target
  formants without reading the recording's own body.

Formantwell = read the recording's OWN formants (cepstral extraction) AND apply
the morph through the ordered biquad cascade. No STFT resynthesis. It reads the
recording's own body and it cannot hiss.

## Two-hand mapping (exact)

The same three axes drive camera tracking, the pointer fallback, and the
autonomous demo drive:

- **Midpoint x of the two hands → morph position `m`** (glassy → woody → vocal).
- **Average hand height → morph depth `depth`** (hands low = untouched original
  piano; hands high = fully morphed).
- **Separation between the hands → vowel position** (/u/ → /o/ → /a/ → /e/ → /i/).

Pointer fallback: mouse x = glassy↔vocal, up/down = vowel, click = morph deeper.

## Design notes

**Cepstral source-formant extraction (from throatmorph).** A main-thread
analysis loop runs on `requestAnimationFrame` (no worklet) on an `AnalyserNode`
tapping the _dry_ source. Each frame: take the live log-magnitude spectrum
(`getFloatFrequencyData`, converted to natural-log nats), form the real cepstrum
(`IFFT` of a symmetric log-magnitude spectrum), apply a low-quefrency symmetric
lifter (keep ~44 coefficients), and `FFT` back to a smooth source log-envelope
`Es`. Peak-pick `Es` into five ordered **source formants** — the strongest
prominent local maxima in the envelope, greedily separated and sorted strictly
increasing. These are the recording's OWN formants, discovered live.

**Ordered biquad cascade (from vowelbend).** Each of the three timbre targets —
glassy (rising high-frequency tilt), woody (low-mid emphasis), and the continuous
Peterson–Barney vowel row — is a strictly-increasing five-formant list
(frequency, gain-dB, Q). The morph interpolates each formant componentwise in
**log-frequency** between the recording's own value and the target by `depth`,
blended glassy↔woody↔vocal by `m` and across the vowel manifold by `separation`.
A belt-and-braces min-spacing pass forces `F(n+1) ≥ 1.12·F(n)`, so the five peaks
can never cross. The morphed set drives five `"peaking"` `BiquadFilterNode`s
(gains capped ±12 dB, Q clamped 2–10) plus a low/high shelf tilt, every parameter
ramped with `setTargetAtTime(…, 0.12)`.

**Why pitch is preserved.** There is no STFT resynthesis and no rate change: the
buffer plays at `playbackRate 1.0` and only passes through a linear,
time-invariant filter cascade. A biquad reshapes _relative loudness per frequency
region_ — the resonant body — and leaves the harmonic fine structure that the ear
reads as pitch and melody exactly where Karel played it. At `depth = 0` every
biquad gain is 0 dB: the cascade is flat and you hear the untouched piano.

**Why it cannot hiss.** Because the five formants are kept strictly ordered with
enforced min-spacing, the cascade is unconditionally stable at every point on the
morph — biquads cannot produce the narrow-band resynthesis artefacts a per-bin
STFT gain can when phase and overlap-add fight each other. All parameter moves are
one-pole smoothed, so there is no zipper noise. Every audible node terminates in
`createSafeMaster(ctx).input`; the visuals read `safeMaster.analyser`.

**Visual.** An achromatic three.js "ultrasound / sonogram" formant-surface
waterfall. The newest front ridge is the current morphing cascade response × the
live analyser magnitude, so it reshapes as you move the hands and dances to the
actual sound; older rows flow back into fog. Grayscale with a faint warm-neutral
tint only in the brightest crests, soft `FogExp2` depth, a barely-there scan-mesh
grid. No colour, no film grain, no prismatic rainbow — the throatmorph-lineage
palette.

**Graceful degradation.** No camera / permission denied / model-load fail →
pointer fallback + a visible notice, while a labelled `demo · autonomous` drive
keeps the whole chain audible and visible. No WebGL/three.js → the audio keeps
morphing and a readable notice replaces the surface. The tracking-status line
always states `tracking · live`, `demo · autonomous`, `pointer · fallback`, or a
`tracking lost` hint.

## Cycle-4 notes (not yet built — from the DEEP sibling `tractblend`)

The losing DEEP-×2 sibling ran throatmorph's cepstral-STFT worklet **and** this
ordered-biquad cascade in parallel on the same take, with a fourth hand axis
(vertical tilt between the hands) driving an equal-power crossfade **between the
two engines** — an A/B of DSP character you can hear by ear, live. Formantwell
won because a single fused engine (own-body formants rendered through the
hiss-proof cascade) is the more rigorous _finish_ than running both side by side,
and it carries none of the STFT resynthesis risk. But the audition idea is worth a
cycle-4: add a "character" axis that blends formantwell's biquad render toward the
full cepstral-STFT envelope morph, so Karel can pick the body that fits each piece
without leaving the instrument. (Banked here as a note, not added to the backlog.)

## References

- **zplane TIMBRE** — real-time poly-formant shaper, announced 2026-09-16: shifts
  formants while leaving pitch intact. Formantwell reshapes the recording's _own_
  formants (discovered by the cepstrum) rather than shifting all of them
  uniformly.
- **Line-spectral-frequency (LSF) interpolation** gives the most linear
  spectral-envelope morph — the stability guarantee behind the ordered,
  strictly-spaced five-formant cascade.
- **Source–filter model (Fant)** — the recording is the source; the morphing
  formant cascade is the filter. Reshaping the filter changes timbre without
  touching the source's excitation (pitch/melody).
- **Grey, J. M. (1977)** — _Multidimensional perceptual scaling of musical
  timbres_ (JASA 61:1270): the timbre space the glassy↔woody↔vocal continuum
  traverses.
