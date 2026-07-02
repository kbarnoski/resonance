# 1105 · Hidden Eye

**The one question:** *What if a field of pure random-dot noise could reveal a
living, breathing 3-D psychedelic surface that exists nowhere in the image —
only in your own visual cortex?*

A real-time animated **autostereogram** (SIRDS — Single Image Random-Dot
Stereogram). What looks like static noise contains a hidden depth surface that
has **no monocular cue whatsoever**: the 3-D structure is manufactured entirely
by binocular fusion in your brain. It sits squarely in the psychedelic
phenomenology of "a hidden dimension emerges from noise" — sudden, hyper-vivid
depth.

## How it works

The main visual is **raw WebGL2**. The CPU builds the stereogram; the GPU
composites it.

1. **Procedural hidden-depth field** (`sirds.ts` · `computeDepth`) — a
   `depth(x, y, t)` heightfield (0 = far, 1 = near) that slowly morphs through
   four form-states over ~48 s: a **breathing dome**, a **receding tunnel/
   funnel**, **radial ripples**, and a **mandala of bumps**. Adjacent forms are
   cross-faded (hold → morph → hold) so states read as distinct. It evolves on
   its own and can be nudged by the viewer.

2. **SIRDS encoder** (`sirds.ts` · `encodeSirds`) — for each scanline, walking
   left→right, the horizontal separation of two dots that must share a colour is
   `sep = round(E · (1 − μ·depth))`. Pixel `x` copies the colour of pixel
   `x − sep`; pixels with no left partner are seeded from a **positional hash**
   of their lattice point. A nearer surface shrinks the period and pops toward
   you. Because colours are hashed by the *root* of each equality chain rather
   than drawn from a running PRNG, the dot field is stable frame-to-frame — only
   the links shift as depth changes, which is what keeps it from strobing. The
   encoder runs on a downscaled 512×320 buffer at ~18 fps.

3. **WebGL2 render** (`gl.ts`) — the RGBA dot buffer and a single-channel depth
   texture are uploaded each encode; the fragment shader blits full-screen with
   a gentle vignette + faint mean-preserving film grain + a subtle violet tint.
   `prefers-reduced-motion` slows the morph and damps the sway.

4. **Audio** (`audio.ts`) — the surface's per-frame **relief** (mean horizontal
   gradient) drives a soft just-intonation drone: filter brightness ∝ relief, a
   slow chord that **retunes with each form-state**, and a soft FM bell "pop"
   when a new form locks in. Everything routes through a `DynamicsCompressor`
   limiter. Audio starts on the Start gesture and always sounds, whether or not
   you can fuse. (We roll our own oscillator bed rather than the shared
   `droneBank` because this piece needs to retune the chord, which the shared
   bank doesn't expose.)

This integrates all four subsystems.

## The reveal mode (legible without free-fusing)

Many people can't free-fuse a magic-eye, and a phone glance must still *see* the
surface. There are two modes, toggled by an on-screen button (≥44px) and the `R`
key:

- **Reveal / wiggle** (default) — the shader shades the hidden heightfield
  directly (Lambert lighting off the depth gradient) with a small horizontal
  parallax sway, so the surface is unmistakable hands-free.
- **Stereogram** — the real random-dot thing, for those who want to fuse. Two
  convergence-guide dots appear near the top ("make the two dots become three").

## How to view

- **Reveal:** nothing to do — the shaded surface sways on its own.
- **Stereogram:** relax and diverge your eyes (look *through* the screen) until
  the two top dots become three; the surface floats up out of the noise.

## Input (no pointer-drag, no webcam, no tap-to-play)

Keyboard + device tilt + autonomous evolution:

- `1`–`4` — sculpt / jump to a form state (manual)
- `A` — resume autonomous evolution
- arrow keys — steer the surface centre
- `[` `]` — depth intensity (μ)
- `,` `.` — eye-separation (E, px)
- `R` — toggle reveal ↔ stereogram
- device tilt (`deviceorientation`) subtly steers on mobile
- untouched, it fully self-evolves and demos hands-free

## Degrades gracefully

If WebGL2 is unavailable, a `text-rose-300` notice appears and the piece falls
back to a shaded 2-D-canvas heightfield reveal, so it is never blank. If audio
fails, a notice appears and visuals continue.

## Safety (no strobe / photosensitivity)

Re-encoding random dots can flicker; mitigated by hashing colours once
(positional, stable pattern), keeping mean luminance ~constant, morphing depth
slowly (well under a few Hz), and honoring `prefers-reduced-motion`.

## Limitations

- Free-fusing is genuinely hard and not everyone can do it — hence the default
  reveal mode.
- The morph/encode timing constants are hand-tuned, not perceptually validated
  headless; comfort and fusibility will vary by display size and viewing
  distance.

## Next-cycle deepening (grafts from the parallel `wallpaper-deep` explorer)

This shipped as the **random-dot** half of a DEEP fire; its sibling built a
**wallpaper autostereogram** (cycle 633, banked in IDEAS §633). The strongest
ideas to fold in next:

- **A "texture" mode** — offer a *repeating-pattern (wallpaper) autostereogram*
  alongside the random-dot one: replace the hashed dots with a tileable,
  colour-palette psychedelic motif whose **local horizontal period** is
  modulated by the same depth field (`period = P0·(1 − μ·depth)`, evaluated as a
  per-row phase prefix-sum `phase(x) = ∫ dx'/period(x')`, `colour =
  pattern(fract(phase))`). Wallpaper stereograms are markedly **easier to
  free-fuse** than random dots and read as far more overtly psychedelic — best of
  both: keep the pure-noise version for the "depth from nothing" hit, add the
  textured version for accessibility + colour.
- **Sharper parallax reveal** — the sibling re-samples each pixel at
  `x' = x − sway·(depth − 0.5)` so nearer points translate *more* than far ones
  (true motion parallax) rather than shading off the gradient; adopting that in
  reveal mode gives a stronger hands-free depth pop.
- **Single-source depth** — the sibling duplicated `depth()` in JS and GLSL and
  flagged the drift risk; when adding the wallpaper mode, keep one canonical
  depth definition and generate the GLSL from it.

## References

- Béla Julesz, *Foundations of Cyclopean Perception* (Univ. of Chicago Press,
  1971) — random-dot stereograms; cyclopean depth without monocular cues.
- Christopher W. Tyler & Maureen B. Clarke, "The autostereogram", *SPIE
  Proceedings* Vol. 1256, Stereoscopic Displays and Applications (1990) — the
  single-image random-dot stereogram and its per-scanline construction.
- David Brewster, the "wallpaper illusion" (1844) — the periodic-pattern route
  (basis of the banked sibling's texture mode above).
