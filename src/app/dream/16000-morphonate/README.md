# 16000 · morphonate

**A membrane his harmony grows** — Karel's full real recording feeds a living
GPU reaction–diffusion organism that his chords seed and steer, so the image is
never the same at minute five as at minute one.

## The one question

What if Karel's harmony literally *grew* the image — a living Turing
morphogenesis membrane that his chord changes seed and steer, so an
autonomous five-minute take paints an ever-different organism?

## How the RD sim works

A two-chemical **Gray-Scott reaction–diffusion** simulation runs entirely on
the GPU (`morphogl.ts`):

- Two chemicals — a substrate `U` and an activator `V` — live in a pair of
  `RGBA16F` float textures that are **ping-ponged** through a fragment shader.
- Each step applies a 9-point Laplacian (diffusion) plus the Gray-Scott
  reaction term `U·V²` with a **feed** rate `f` and a **kill** rate `k`. Six
  sub-steps run per animation frame (two if `prefers-reduced-motion` is set).
- The field is **never reset** — it carries its entire history, so the
  organism is genuinely long-form and evolves continuously across the take
  (spots, stripes, mitosis, coral growth).
- A display shader colours the `V` concentration into the ink look and adds a
  whisper of cold cyan on the active reaction fronts.

## How harmony → splats + feed/kill mapping works

The real recording plays start to finish; `page.tsx` walks the precomputed
analysis timeline against `audioCtx.currentTime - startTime`:

- **Note onset → splat.** Every note injects a soft gaussian of activator at a
  position from its **pitch-class → angle** and **register → radius**; a louder
  note (higher velocity) makes a bigger, stronger splat.
- **Chord change → bloom + climate.** Each chord change blooms a larger reagent
  seed at its **root**, and re-steers the RD climate: `feed`/`kill` shift with
  the analyser's **spectral energy** and the chord's **quality** — bright /
  major passages push toward fine coral, quiet / minor ones toward slow blobs,
  so the pattern's morphology tracks the music.
- **Human control is secondary:** a track selector, a *New membrane* re-seed,
  and two sliders that set the baseline feed/kill "climate".

**Graceful degrade:** if a take's analysis is missing or empty, splats fall
back to **analyser onset detection (spectral flux)** — centroid → angle,
loudness → size — so the membrane still lives. If WebGL2 with float render
targets is unavailable, an on-brand notice is shown. Audio is only ever Karel's
real recording, routed through the shared safe-master bus.

## Reference

- Alan Turing, *The Chemical Basis of Morphogenesis* (1952) — reaction–diffusion
  as the mechanism of biological pattern formation.
- The Gray-Scott model of reaction–diffusion.
- Karl Sims' GPU *Reaction-Diffusion* tutorial / work.

## Tags

`input: autonomous(his-take+harmony) · output: WebGL2-reaction-diffusion · technique: Gray-Scott-morphogenesis-steered-by-harmony · palette: achromatic-ink`
