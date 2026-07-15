# 1700 · Bloom Field

**state: DMT-threshold chrysanthemum · pole: INTENSE**

> What if your bodily presence in front of a webcam drove a DMT-threshold
> *chrysanthemum* — the dense unfolding fractal "flower" that opens the DMT
> visual sequence — where stillness lets it unfold slowly and movement makes it
> bloom and reorganize faster?

A psychedelic / altered-states piece that evokes the *phenomenology* drug-free:
a dense fractal bloom in neon-iridescent jeweled colour, ultra-saturated and
breathing, that responds to your presence in front of the camera.

## Tags

- **INPUT — camera.** A downsampled luminance **frame-difference** (64×48,
  CPU) produces `motionEnergy` (0..1, smoothed). No MediaPipe, no skeleton or
  face model — a light, dependency-free presence signal.
- **OUTPUT — raw WebGL2** fragment shaders (no three.js).
- **TECHNIQUE — Gray-Scott reaction-diffusion** (ping-pong FBO) →
  **inverse log-polar form-constant warp** → **N-fold kaleidoscope** bloom.
- **PALETTE — neon-iridescent jeweled**: thin-film-ish iridescence, radial
  chromatic aberration, high saturation. Not a cosmic starfield.

## The technique chain

1. **Camera → motion energy.** The webcam frame is drawn to a small offscreen
   canvas each frame; the mean absolute luminance difference versus the
   previous frame is `motionEnergy`. This is the REBUS "cortical-entropy"
   driver: more motion → feed/kill pushed toward the pattern-forming regime,
   more injected noise, faster kaleidoscope fold. Stillness → slow unfold.
2. **Gray-Scott reaction-diffusion** (Du≈0.16, Dv≈0.08) ping-ponged through a
   half-float FBO pair (8-bit fallback). Feed/kill are animated by motion around
   the coral/mitosis regime (~f=0.037, k=0.06). Seeded deterministically — a
   centred blob plus four fixed spots, no `Math.random`.
3. **Display shader.** The field is read, then an **inverse log-polar warp**
   makes it read as a radial chrysanthemum, then an **N-fold kaleidoscope** fold
   (6→12 petals with motion). Colour comes from a saturated
   violet→magenta→cyan→gold ramp with a slow hue cycle, thin-film iridescence
   and mild radial chromatic aberration.
4. **Audio (Web Audio).** Seven partials on a stretched, mildly-inharmonic
   series whose spread/detune GROWS with motion, so it grits up as the bloom
   reorganizes — deliberately not a clean JI consonant drone. Amplitude follows
   bloom intensity. Everything routes through a `DynamicsCompressor` then a
   master `GainNode` at 0.12 to `destination`.
5. **Deterministic ghost self-demo.** With no camera (denied or headless),
   `motionEnergy` is driven by a frame-counter `Math.sin` breathing swell, so
   the piece is never blank or silent. No `Math.random`, `Date.now`, `new Date`
   or `performance.now` in the audio or determinism-sensitive paths.

## Safety

No strobe. Slow luminance drift only. The optional shimmer flicker is **off by
default** and gated through the shared `safeFlicker` engine at ≤3 Hz.
Photosensitive-epilepsy risk is real.

## References

- **Klüver's form constants** — the four recurring geometric hallucination
  categories (lattices, cobwebs, tunnels/funnels, spirals).
- **Bressloff & Cowan (2001)** — cortical pattern-formation: the retina→V1
  cortical map is a complex logarithm, so a plane Turing pattern seen through a
  log-polar warp yields the form constants. This piece warps a Gray-Scott field
  the same way.
- **Gray & Scott** — the reaction-diffusion system; the coral/mitosis feed/kill
  regime used here.
- **Carhart-Harris — entropic-brain / REBUS** — raised cortical entropy relaxes
  high-level priors; here bodily motion is the entropy proxy that unfreezes the
  pattern into a faster, denser bloom.
