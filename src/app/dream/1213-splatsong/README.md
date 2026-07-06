# 1213 · splatsong

**The one question:** *What if a cloud-of-light sculpture had a material you could hear?*

A procedural "resonant cairn" of ~4,500 anisotropic 3D Gaussians, rendered with
**true 3D Gaussian splat rasterization** (not loose additive particles). You
**orbit** it by dragging and **strike** a cluster by tapping it — each cluster
carries an *inferred material* and rings a physically-modelled modal impact.

Route: `/dream/1213-splatsong`

---

## How it works

### 1. Splat rasterization (`splat-gl.ts`, WebGL2)

Each Gaussian has a position, a 3-vector scale and a rotation quaternion, from
which we build a 3×3 covariance **Σ = R·S·Sᵀ·Rᵀ** on the CPU (`scene.ts →
covFromScaleQuat`). Rendering is **EWA splatting**, the real technique:

- The instanced vertex shader transforms the splat centre to view space, then
  projects Σ to a 2D screen conic through the **Jacobian J of the perspective
  projection**: `T = Wᵀ·J`, `Σ2d = Tᵀ·Σ·T` (with a small low-pass dilation so
  sub-pixel splats stay resolvable).
- The 2D conic's eigenvalues give the ellipse axes; the shader emits a
  camera-facing quad sized to ~2σ.
- The fragment shader evaluates the projected Gaussian falloff
  `α = opacity·exp(−‖d‖²)` and outputs **premultiplied** colour.
- Splats are **depth-sorted back-to-front on the CPU** whenever the camera moves
  (typed-array `sort` of indices by view-space z, throttled to ~12 Hz) and
  composited with `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` — soft volumetric "over"
  alpha. This is the antimatter15 / WebSplatter projected-conic formulation.

A neutral studio light-box backdrop (soft gray sweep + faint hotspot, not a dark
void) is drawn first as an opaque fullscreen pass.

### 2. Material inference (`scene.ts`, SonicGauss-inspired, no ML)

After a cluster is generated we **derive its material purely from splat
statistics** — mean scale, positional spread, anisotropy, luminance, hue,
saturation — the way SonicGauss reads a material off a Gaussian field:

| stats | material |
|---|---|
| tight · small · bright · cool hue | **glass** |
| large · diffuse · dark · desaturated | **stone** |
| strongly elongated · metallic hue | **metal bar** |
| mid · warm · medium | **wood** |

Verified: the six blueprints classify as glass, metal, wood, stone, glass, stone.

### 3. Modal impact synthesis (`modal-synth.ts`, Web Audio)

Striking excites a bank of **5–8 parallel exponentially-decaying sinusoids** —
the modal model of a struck rigid body, `y(t) = Σ aᵢ·sin(2πfᵢt)·e^(−t/τᵢ)`.
Partial ratios + per-partial decay times come from the material preset (glass =
bright near-harmonic, ~3 s; stone = low inharmonic, ~0.5 s; metal = free-bar
modes 1 : 2.756 : 5.404 …, ~4 s; wood = woody, ~0.4 s). A short filtered-noise
**mallet transient** provides the contact click. The **fundamental comes from
cluster size** (bigger ⇒ lower); **strike velocity** sets loudness and
brightness. Polyphony is bounded at 10 voices with oldest-voice stealing; the bus
runs `sum → DynamicsCompressor limiter → master gain`, and the master gain ramps
from 0 on Begin.

### Interaction & degrade

- **Drag** = orbit the camera; **tap** = strike the nearest cluster (screen
  distance weighted by depth); quicker taps hit harder. Pan follows screen x.
- **Shimmer all** arpeggiates a soft strike across every cluster.
- Slow **auto-orbit** and a faint per-cluster **idle shimmer** keep it alive on a
  cold glance; an occasional very soft ping sounds if left untouched.
- If WebGL2 is unavailable, a **Canvas2D fallback** (`splat-2d.ts`) draws a
  subsampled, depth-sorted set of radial-gradient blobs — still strikeable and
  audible — behind a `text-rose-300` notice.

### Safety

No strobe. Auto-orbit, idle shimmer and backdrop drift are all slow continuous
motion (≪3 Hz); every strike flash is a smooth exponential ramp, never a
full-screen flash. Respects `prefers-reduced-motion`. Audio is gesture-gated
behind **Begin** (resumes the AudioContext). Full teardown on unmount:
`cancelAnimationFrame`, stop + disconnect every audio node, `ctx.close()`, delete
GL programs / buffers / VAOs, remove listeners, and handle `webglcontextlost`.

---

## References

- Kerbl, Kopanas, Leimkühler, Drettakis — *3D Gaussian Splatting for Real-Time
  Radiance Field Rendering*, SIGGRAPH 2023.
- *WebSplatter* — arXiv 2602.03207 (Feb 2026), browser-side projected-conic
  splat rasterization.
- *SonicGauss* — arXiv 2507.19835, inferring material characteristics from
  Gaussian ellipsoids to synthesize impact sound.

## Honest limits

- The renderer faithfully reproduces the canonical EWA projected-conic shader,
  but I have **no display or speakers in this environment** — the exact splat
  sizes, sort quality during fast orbits, and audio mix balance are reasoned, not
  eyeball-tuned. Splat radii were estimated analytically (~35–70 px at the
  default framing) rather than viewed.
- Depth sorting is per-splat but throttled and re-used between camera nudges, so
  very fast drags can show transient mis-ordering (acceptable per the brief;
  premultiplied alpha keeps it graceful).
- Material inference is a hand-tuned scored heuristic over the six authored
  clusters, not a learned model; it is deterministic and verified for this scene.
- The Canvas2D fallback uses isotropic blobs (no true anisotropic conic) and a
  subsampled splat count for responsiveness.
