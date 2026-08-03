# 6072 — Membrane

> **The one question:** can a crowd of gaussian splats stop being a frozen
> sculpture and become a single _organism_ — a luminous skin that blooms, buds,
> and melts with the harmony?

A living audio-driven gaussian-splat cloud, but not a free cloud: the splats
live **on** a moving implicit iso-surface. The felt result is that you are
floating just outside a breathing luminous creature whose skin is re-sculpted
every frame by the music.

## How it works

### The metaball iso-surface

The surface is the iso-contour (`f = iso`, ~1) of a sum of 6–10 moving
metaballs:

```
f(p) = Σ  wᵢ / (|p − cᵢ|² + ε)
```

Each metaball orbits on a **seeded** path (all randomness comes from a
`mulberry32` PRNG seeded with `0x6072` — no `Math.random`, no `Date.now`). The
music re-shapes those orbits every frame (`updateMetaballs` in `mat.ts`):

- **low bands →** big, slow lobes (the body swells; bass also lowers `iso`, so
  the whole skin _breathes_ outward on a swell);
- **high bands →** fast, small buds on tight orbits that make the surface bud
  and tear.

The centers are computed on the CPU (only ~8 of them) and uploaded as a uniform,
so the WebGPU path and the Canvas2D fallback read from the exact same surface.

### The compute pass (the "living" core)

Every frame a WebGPU `@compute` pass (`gpu.ts`) runs one thread per gaussian
(20 000 of them) and:

1. adds a small seeded **tangential shimmer** so points never freeze or clump;
2. **relaxes** the gaussian onto the iso-surface with a few Newton steps along
   the analytic field gradient `∇f`, and writes the new position back to a
   persistent storage buffer (the skin has memory, it flows rather than
   teleporting);
3. builds an outward **normal** `n = −∇f/|∇f|` and a tangent frame `(t₁, t₂)`;
4. sets a **tangent-flattened covariance** — broad along `t₁,t₂`, thin along
   `n`:
   `Σ₃ = s_t²(t₁t₁ᵀ + t₂t₂ᵀ) + s_n²(nnᵀ)`, `s_n ≈ 0.13·s_t`. This is the
   "true 3DGS surface" look: thin discs hugging a skin, disc size swelling with
   loudness so the membrane blooms;
5. tints from curvature + surface normal + a slowly rotating iridescent cosine
   palette, with a fresnel rim brightening at grazing angles.

### Projection & compositing

The 3D covariance is projected to a 2D screen-space gaussian with the standard
EWA Jacobian (`Σ₂ = J·W·Σ₃·Wᵀ·Jᵀ`), eigen-decomposed into major/minor screen
axes, and emitted as a camera-facing quad instance. The render pass rasterizes
each quad as `exp(−½·9·|c|²)` (corner `c ∈ [−1,1]` maps to 3σ).

**Compositing choice: additive.** I composite additively (`one, one`) rather
than doing alpha-over with a depth sort. This is the sanctioned simplification —
it glows, reads as a volumetric skin, and is order-independent, so I skip the
per-frame sort of 20 000 splats. The trade-off is less opaque occlusion; the
tangent-thin discs plus fresnel rim keep enough surface read.

### Audio

A self-playing generative bed (`audio.ts`) demos on load after the first
gesture: two detuned saw drones + a sub sine through a swept low-pass, an airy
band-passed noise layer, and a seeded Lydian arpeggio of bell voices, all fed
through a code-generated impulse-response convolver. Master gain `0.16` into a
`DynamicsCompressor` limiter. An `AnalyserNode` extracts 8 log-spaced band
energies. An optional **Use mic** toggle swaps in `getUserMedia` for live
performance and degrades gracefully if denied.

### Graceful degradation

If `navigator.gpu` / `requestAdapter` / `requestDevice` is missing or throws,
the page never white-screens: a Canvas2D pass (`fallback.ts`) relaxes ~900 soft
gaussian sprites onto the same metaball field, rotates them with a virtual
camera, and composites them with `globalCompositeOperation = "lighter"`, plus a
small on-brand "WebGPU unavailable" notice. Both paths are alive on load before
any click and respect `prefers-reduced-motion` (motion damped to 0.35×).

## References

- Kerbl, Kopanas, Leimkühler & Drettakis — _3D Gaussian Splatting for
  Real-Time Radiance Field Rendering_ (SIGGRAPH 2023).
- The 2026 WebGPU compute-splatting moment: SuperSplat compute-splatting with
  streamed LOD; GSCache real-time radiance caching (arXiv, Jul 2026).
- Refik Anadol — latent-cloud / "machine hallucination" installations.

## What I'd deepen next cycle

- **Alpha-over with a coarse GPU depth sort** (bucketed by camera-space z) for a
  true opaque skin read, keeping additive as a toggle for the glow look.
- **Curvature-driven density**: spawn/merge gaussians where the surface tears so
  buds get more splats and flat lobes fewer, instead of a fixed 20 000.
- **Surface-tangent flow field** so splats advect _along_ the skin with the
  melody rather than only relaxing to the nearest surface point.
- A genuine **anisotropic sprite** in the Canvas2D fallback (currently isotropic
  sprites) to hint at the tangent-flattening even without WebGPU.
