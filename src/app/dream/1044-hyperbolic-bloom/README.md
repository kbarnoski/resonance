# 1044 · Hyperbolic Bloom

**The one question:** What if a screen could evoke the DMT "hyperbolic
hyperspace" — the reports that at breakthrough, experienced space stops being
flat and becomes negatively-curved: saddle surfaces everywhere,
"hyperdimensional bedsheets blowing in the wind," tiles that stream outward
forever and never run out, every wallpaper-symmetry group at once — drug-free?

**Tags:** `state: DMT-hyperbolic · pole: intense`
INPUT: analysis-only mic (FFT) with a self-sufficient drone fallback ·
OUTPUT: WebGL2 fragment shader ·
TECHNIQUE: Poincaré-disk hyperbolic {7,3} tiling rendered per-pixel ·
PALETTE: neon-iridescent jeweled.

## How it works

A single full-viewport WebGL2 fragment shader (`shader.ts`) does everything
per pixel:

1. **Screen → Poincaré disk.** The fragment is mapped to an aspect-correct,
   centred complex point `z`, then squeezed into the open unit disk. Points at
   the boundary (`|z| → 1`) fade to dark grout / black — the rim of hyperbolic
   space.
2. **Inverse Möbius for the moving viewer.** A continuous **hyperbolic
   translation along a geodesic**, `z' = (z − b) / (1 − conj(b)·z)`, with the
   offset `b` drifting along an arc (plus a slow whole-field rotation). This is
   the "perpetual hyperbolic fall": heptagons stream out toward the rim forever
   and never run out.
3. **Fold into the {7,3} fundamental domain.** ~6–22 iterations (depth-driven)
   that alternate a **straight 7-fold dihedral mirror reflection** (rotate into
   one sector via `atan`/sector `mod`, then mirror across the bisector) with a
   **geodesic circle inversion** `z → c + (z−c)·r²/|z−c|²` in a circle orthogonal
   to the unit disk.
4. **Jeweled colouring.** Fold count + cell position drive a palette-cycled
   iridescent cosine palette, with **dark grout** along the domain edges,
   **thin-film iridescence**, and **chromatic aberration** (per-channel hue
   offset). Saturation and gain rise toward the breakthrough.
5. **Breathing + travelling wave.** A slow fBm domain warp (LFO) on the input
   coords makes the surfaces breathe/melt, and a slow travelling-wave phase
   sweeps across the field.

### The journey arc (`arc.ts`)

A single non-looping `progress` clock (0 → 1 over ~5 minutes) drives the
shader/audio uniforms:

- **onset** (0–18%) — low recursion depth, slow fall, low saturation
- **come-up** (18–35%) — depth, fall speed and warp rise
- **breakthrough peak** (~35–60%) — max recursion depth, fastest geodesic
  fall, highest saturation + chromatic aberration
- **plateau** (60–80%) — slower morph, sustained intensity
- **return** (80–100%) — depth/saturation decay, soft landing (no abrupt cut)

### Audio (`audio.ts`)

The default is a **fully generative drone** — a detuned oscillator stack +
sub-bass + a slow opening low-pass that sweeps brighter into the breakthrough
and settles on the return. It sounds with **zero permissions**. Master gain
~0.15, click-free fades, a limiter on the intense pole, full teardown.

An **optional mic path is analysis-only**: the mic feeds an `AnalyserNode` and
nothing else — it is **never connected to `audioCtx.destination`** (no feedback
howl). When granted, FFT bands modulate the visuals: bass → fall speed, mids →
warp amplitude, highs → iridescence/chroma, loudness → saturation. With no mic,
the shader reacts to an FFT of the drone itself.

## The {7,3}-fold approximation (noted honestly)

This is a convincing **approximation** of a {7,3} hyperbolic tiling, not a
proven-exact triangle/reflection group:

- The inverting circle uses the correct **orthogonality relation**
  `|c|² − r² = 1`, so it really is orthogonal to the disk boundary (the defining
  property of a hyperbolic geodesic).
- However, a **single fixed inverting circle per 7-fold sector** is reused
  rather than solving the exact set of edge reflections of the {7,3} Coxeter
  group, and the screen→disk map is a smooth squeeze rather than an exact
  conformal embedding.
- The result **reads as a convincing negatively-curved {7,3} tiling** —
  heptagonal cells shrinking toward an unreachable rim — which is the
  phenomenological goal here. It is intentionally a perceptual proxy, not a
  mathematically exact Fuchsian fundamental domain.

## Safety

Intense pole, but **non-flicker**: only slow luminance/saturation drift and
smooth motion. No strobe, no >3 Hz full-screen luminance pulsing.

## Named references

- Andrés Gómez-Emilsson / QRI — *The Hyperbolic Geometry of the DMT Experience*
  (world-sheets folding into negatively-curved hyperspace, saddles, sheets).
- Bressloff & Cowan — geometric visual hallucinations / cortical **form
  constants**.
- M.C. Escher — *Circle Limit I–IV* (hyperbolic tilings on the Poincaré disk).

*Phenomenology, not medicine — no medical claims.*
