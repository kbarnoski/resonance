# 4120 · Brine

**What if you could sing a body of water into motion — your voice churning a real,
GPU-simulated fluid whose viscosity, gravity, and turbulence are set by the pitch
and loudness of what you sing?**

Brine is a 2D **Smoothed-Particle Hydrodynamics (SPH)** fluid — ~8,192 particles when
WebGPU is present — simulated **entirely on the GPU** in WGSL compute shaders. Each
frame runs three compute passes per substep (density/pressure → force → integrate),
then an instanced additive render pass draws the particles as glowing violet metaballs.
Your voice is the current, and the fluid sings back.

### Tags

- **INPUT** — mic (optional; falls back to a seeded synthetic voice).
- **OUTPUT** — WebGPU compute + render (WGSL), sing-back drone via Web Audio.
- **TECHNIQUE** — GPU SPH fluid simulation. *Lab-first: no prior WebGPU fluid sim in
  the lab used a particle-based SPH solver on the GPU.*
- **VIBE** — liquid / organic / physical.

---

## The one line

> Sing a body of water into motion — pitch steers the swirl, loudness churns the
> breath, brightness thins the fluid. A GPU fluid that sings back.

---

## How the voice drives the fluid

| Feature | Extracted from | Maps to |
| --- | --- | --- |
| **Loudness (RMS)** | time-domain waveform, `sqrt(mean(x²))` | an upward **breath force** injected at the bottom-centre (louder = more violent churn) + gravity is lightened |
| **Brightness (spectral centroid)** | `Σ(f·mag) / Σ(mag)` over the byte FFT | **viscosity** — bright/high sounds thin the water to a splash (`VISC_THIN ≈ 40`), dark/low sounds thicken it to a gloop (`VISC_THICK ≈ 460`) |
| **Pitch (dominant frequency)** | parabola-interpolated FFT peak (50–4000 Hz) | the signed **vortex** coefficient about a 220 Hz pivot — below pivot swirls clockwise, above reverses counter-clockwise, so a rising glissando visibly turns the current around |

The fluid **sings back**: its aggregate kinetic energy (summed on the GPU via an atomic
`u32` reduction, read back one frame late through a mapped staging buffer) swells a soft
two-oscillator low drone (46 + 69 Hz) and opens a lowpass filter. The churn you cause
becomes an audible wash under your voice. No drums, no scale-snap — continuous timbre only.

---

## SPH math notes (Müller, Charypar & Gross, 2003)

Each particle *i* carries position, velocity, density ρ and pressure *p*. The three
passes implement the standard smoothing kernels:

**1. Density / pressure** — Poly6 kernel over neighbours within smoothing radius *h*:

```
ρ_i = Σ_j  m · POLY6 · (h² − r²)³           POLY6  =  4 / (π h⁸)
p_i = k · (ρ_i − ρ₀)                          (k = GAS, ρ₀ = REST_DENS)
```

**2. Forces** — Spiky-gradient pressure force + viscosity Laplacian:

```
f_press_i = −Σ_j  r̂_ij · m · (p_i + p_j)/(2ρ_j) · SPIKY · (h − r)³   SPIKY = −10/(π h⁵)
f_visc_i  =  Σ_j  μ · m · (v_j − v_i)/ρ_j · VLAP · (h − r)            VLAP  =  40/(π h⁵)
```

plus the audio-driven external field: gravity `(0, g)`, a radial breath impulse near the
bottom-centre, and a tangential vortex about the tank centre. All are added as
`f_ext · m / ρ_i` to match the gravity term convention.

**3. Integrate** — semi-implicit Euler with a velocity clamp and damped box walls:

```
v_i += Δt · f_i / ρ_i        (clamped to VMAX)
x_i += Δt · v_i
```

Constants follow the classic pixel-scale regime (Schuermann's 2D SPH tuning of the
Müller kernels): `h = 16`, `m = 2.5`, `ρ₀ = 300`, `k = 2000`, `Δt = 0.0008`, 3 substeps
per frame, wall damping `−0.5`. The solver is brute-force O(N²) per pass — no spatial
grid — which is why the GPU count sits at the low end of the range (a hash-grid neighbour
search is the obvious next-cycle upgrade to reach 20k+).

### Named references

- **Müller, Charypar & Gross — "Particle-Based Fluid Simulation for Interactive
  Applications" (SPH, 2003).** The kernel set (Poly6 / Spiky / viscosity-Laplacian) and
  the pressure-from-density formulation are taken directly from this paper.
- **Robert Borghesi — *ASTRODITHER*** (WebGPU TSL fluid, July 2026) — the aesthetic
  contemporary that frames this current-era revival of real-time particle fluids on the
  GPU. Brine reaches for the same glowing, additively-composited liquid look.

---

## Fallbacks (load-bearing)

- **No WebGPU** (`navigator.gpu` missing, or adapter/device request fails, or WGSL fails
  validation) → a **CPU SPH sim of 1,200 particles** rendered to a Canvas2D `<canvas>`
  with additive pre-rendered violet blob sprites, driven by the *same* audio mapping. An
  on-brand `text-destructive` notice reads *"WebGPU unavailable — running the CPU fallback
  fluid"*. The piece still sounds and animates with no WebGPU.
- **No mic** (denied or unavailable) → a deterministic **`mulberry32(0x4120)`** synthetic
  envelope (a slow glissando that reverses the swirl, a pulsing RMS, a sweeping centroid)
  drives the fluid so it self-demos hands-free from the first frame. A `text-destructive`
  notice appears only on genuine mic denial. **No `Math.random()`, `Date.now()`, or
  `new Date()` anywhere** — all stochasticity comes from the seeded PRNG, and time is a
  monotonic frame counter.
- The visual sim starts on mount (synthetic voice); **Enter** creates and resumes the
  `AudioContext` inside the user gesture, wires the sing-back drone, and requests the mic.

**Teardown** on unmount is complete: `cancelAnimationFrame`, stop every `MediaStream`
track, `audioCtx.close()`, destroy the WebGPU device and release every buffer, disconnect
the `ResizeObserver`.

---

## Next-cycle deepening

- **Spatial hash-grid neighbour search** on the GPU (counting-sort into cells + atomic
  bucket offsets) to lift the particle count from ~8k toward 40k+ at 60 fps.
- **Surface reconstruction** — a screen-space density blur + threshold pass for a true
  liquid meniscus and specular highlights instead of additive blobs.
- **Two immiscible brines** (a colour/ID per particle) so two singers churn distinct
  fluids that refuse to mix, with an interfacial-tension force.
- **Formant → local viscosity fields**: map vowel formants to spatially-varying viscosity
  so "oo" pools thick in one region while "ee" splashes in another.
- **Foam & spray**: spawn short-lived bright particles where local kinetic energy or
  divergence spikes, so loud crests literally throw spray.
- **Vorticity confinement** to keep the swirl crisp at low viscosity instead of diffusing.
