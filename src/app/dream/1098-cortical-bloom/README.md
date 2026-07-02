# 1098 · Cortical Bloom

*state: DMT/psilocybin geometric form-constant emergence · pole: intense-hypnotic*

**What if the geometric hallucinations of a psychedelic state weren't painted, but
GROWN — emerging as the natural pattern of a simulated sheet of excitable neurons,
exactly the way real visual-cortex hallucinations arise?**

Klüver's four "form constants" (lattices/honeycombs, cobwebs, tunnels/funnels,
spirals) are not decorations laid on top of the image here. They are the emergent
Turing pattern of an excitatory–inhibitory neural field, read out through the map
the brain actually uses between the retina and the visual cortex.

## The mechanism (Ermentrout–Cowan)

A sheet of cortical neurons is simulated as an **excitatory–inhibitory neural
field** — a Gray-Scott activator/inhibitor reaction (an equivalent of the
**Wilson–Cowan / Amari** lateral-inhibition system) tuned near its **Turing
instability**. On a toroidal grid it spontaneously self-organises into stripes,
spots and hexagons: emergent *cortical* activity patterns, not drawn shapes.

The retina→V1 cortical map is (approximately) a **complex logarithm / log-polar**
map. The render pass exploits this: for every screen pixel it computes the
cortical coordinate `(log r, θ)` and samples the neural field *there*. Under that
inverse map:

- cortical **stripes** become **spirals and tunnels/funnels**,
- cortical **hexagons** become an **expanding honeycomb lattice**,
- the radial log-tiling gives the characteristic **inward tunnel motion**.

This is the actual **Ermentrout & Cowan (1979)** explanation, extended by
**Bressloff, Cowan, Golubitsky, Thomas & Wiener (2001/2002)**, for *why* drug,
migraine, flicker and hypnagogic hallucinations all look the way they do: it is a
property of visual cortex + its map, not of any particular drug.

A slow autonomous drift walks the feed/kill (excitation/inhibition) balance
through those form-constant regimes over ~30 s, so the piece evolves on its own.

## Subsystems

1. **GPU compute neural-field simulation** — WGSL compute shader, two ping-ponged
   `array<vec2f>` storage buffers (activator U, inhibitor V), a 9-point Laplacian,
   ~12 reaction sub-steps per frame. First Wilson–Cowan/Gray-Scott neural-field on
   the lab's WebGPU-compute path.
2. **Log-polar retino-cortical render map** — a second compute pass warps the
   cortical field to the screen with the complex-log map and writes a colour
   storage texture, blitted to the swap chain.
3. **Field-statistics readback** — a single-workgroup reduction computes mean
   activity, energy and spatial-gradient density, copied to a mappable buffer and
   read back **asynchronously** (never awaited in the render loop → no GPU stall).
4. **Coupled just-intonation audio** — those statistics drive a JI drone/pad:
   denser/finer patterns brighten the timbre and open the filter, a slow rotating
   stereo pan gives the spiral regime its shimmer, taps bloom a swell. Everything
   runs through a soft `tanh` limiter so it stays meditative-to-intense, never
   harsh.

## Interaction

- **Autonomous by default** — it lives on its own.
- **Tap / click the field** — injects a local excitation nucleus (seeds a new
  pattern) at the tapped cortical location and blooms an audible swell.
- **Slider / arrow keys** — nudge the excitation↔inhibition balance toward the
  lattice pole or the tunnel pole.
- **"Turn on sound"** — audio needs a user gesture to start (also armed by the
  first tap).

No pointer-drag-as-primary-input: tap-to-seed and parameter nudge only.

## WebGPU → fallback path

Graceful degradation is mandatory. If `navigator.gpu` is missing or
`requestAdapter()` / `requestDevice()` fails, the piece renders a **Canvas2D**
stand-in: a CPU value-noise cortical field grown in `(log r, θ)` space and warped
by the same complex-log map, at lower resolution. It computes the same field
statistics and feeds the same drone — **never blank, never silent.** A readable
notice explains which path is active.

## Safety

- **No strobe / no flicker.** The pattern changes over seconds (slow reaction +
  slow log-radial drift), and mean screen luminance is held roughly constant by a
  calm low-luminance palette plus a gentle vignette — no full-screen luminance
  flashing.
- `prefers-reduced-motion` slows the drift and reduces sub-steps further.

## Limitations

- The cortical stripe *orientation* is emergent and isotropic, so the balance
  slider biases spots↔worms↔stripes (lattice ↔ spiral/cobweb ↔ tunnel) rather
  than dialing an exact single form constant — which is faithful to the science
  (real hallucinations mix the constants) but less of a hard switch.
- Field statistics are read back a few frames late (async, to avoid stalls), so
  the audio tracks the pattern with a small, deliberate lag.
- The WGSL programs only compile at runtime in a WebGPU browser; TypeScript and
  ESLint are clean, but shader correctness is verified in-browser.

## Reference

Ermentrout, G.B. & Cowan, J.D. (1979). *A mathematical theory of visual
hallucination patterns.* Biological Cybernetics 34, 137–150.
Bressloff, P.C., Cowan, J.D., Golubitsky, M., Thomas, P.J. & Wiener, M.C.
(2001/2002) on Turing instabilities in a cortical neural field and the
retino-cortical (log-polar) map. Technique lineage: WebGPU compute
reaction-diffusion (Robert Leitl / Codrops 2024; ShaderVine 2026 Turing-pattern
demos).
