// Design notes rendered inside the in-page panel. Kept in sync with README.md.
export const NOTES_MD = `# Bloom Field

state: DMT-threshold chrysanthemum · pole: INTENSE

What if your bodily presence in front of a webcam drove the dense unfolding
fractal "flower" that opens the DMT visual sequence — where stillness lets it
unfold slowly and movement makes it bloom and reorganize faster?

## The technique chain

- Camera → motion energy. A 64×48 downsampled luminance frame-difference (no
  MediaPipe, no skeleton/face model) gives a light, dependency-free presence
  signal. More motion → higher cortical entropy.
- Gray-Scott reaction-diffusion (Du=0.16, Dv=0.08) ping-ponged through a
  half-float FBO pair on the GPU. Feed/kill ride near the coral/mitosis regime
  (~f=0.037, k=0.06); motion nudges them toward pattern formation and injects
  noise so the field reorganizes faster. This is the breathing fractal.
- Inverse log-polar (form-constant) warp of the field, so the Turing pattern
  reads as a radial chrysanthemum bloom.
- N-fold kaleidoscope fold, animating 6→12 petals as you move — the flower
  opening.
- Neon-iridescent jeweled palette (violet → magenta → cyan → gold), thin-film
  iridescence and radial chromatic aberration.

## Sound

Seven partials on a stretched, mildly-inharmonic series — deliberately NOT a
clean just-intonation consonant drone. As motion rises the partials detune and
spread apart, so the tone grits up and reorganizes with the bloom. Everything
routes through a compressor and a master gain at 0.12.

## Presence, drug-free

With no camera the piece runs a deterministic breathing swell, so it is never
blank or silent. Nothing here uses a clock or randomness — it is driven by a
frame counter, so a headless review sees the same bloom every time.

## Safety

No strobe. Slow luminance drift only; any flicker is opt-in and gated below
3 Hz. Photosensitive-epilepsy risk is real and respected.

## References

- Klüver's form constants — the four geometric hallucination categories.
- Bressloff & Cowan (2001) — cortical pattern-formation; the retina→V1 map is a
  complex logarithm, so log-polar warping a plane pattern yields the constants.
- Gray & Scott — reaction-diffusion; the coral/mitosis regime used here.
- Carhart-Harris — the entropic-brain / REBUS model; motion as a proxy for
  raised cortical entropy relaxing the pattern into bloom.`;
