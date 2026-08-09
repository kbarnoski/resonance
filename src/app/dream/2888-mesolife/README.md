# Mesolife — a liquid crystal that is alive

An **active nematic** that stirs itself forever: a director field on the GPU in
perpetual turbulent churn, endlessly birthing and annihilating topological
defects, rendered as glowing **crossed-polarizer birefringence** — oil-film
iridescence you can tilt and shear. A drug-free visionary piece in a
material-iridescent register (soap-film color, not kaleidoscope geometry). The
screen and the sound do the work.

## The one question

> What if a liquid crystal were *alive* — a self-stirring active nematic that
> never stops churning, breathing, birthing and annihilating topological
> defects, rendered as glowing crossed-polarizer birefringence iridescence you
> can tilt and shear?

## The director field and its defects

A nematic is a fluid of rod-like molecules with an orientation θ(x, y) but no
head or tail — the rod at θ and the rod at θ+π are identical. We store the
**doubled-angle vector** `u = (cos 2θ, sin 2θ)` in the RG channels of a GPU
texture (encoded as `u*0.5+0.5` so the exact same decode works for `RGBA16F` and
the `RGBA8` fallback). Doubling the angle is *why* ±½ defects — the physically
real ones — appear naturally: a full 2π loop of **u** corresponds to only a ±½
winding of θ. These half-integer defects behave like little self-propelled rods:
comet-shaped +½ cores that swim, three-fold −½ cores that spin.

## The GPU technique (WebGL2 ping-pong field simulation)

Each step is a fragment shader writing into a ping-pong framebuffer:

1. **Elastic relaxation** — **u** diffuses toward its neighborhood average
   (Frank one-constant elasticity ≈ a Laplacian of **u**), then the local angle
   is renormalized. This heals distortion.
2. **Active self-stirring** — the source of life. Active stress is
   `∝ ∇·Q`; with the Q-tensor built directly from **u** this reduces to a flow
   velocity read straight off the gradients of **u**
   (`v = activity·(∂ₓuₓ + ∂ᵧu_y, ∂ₓu_y − ∂ᵧuₓ)`). The field advects itself by
   that velocity (semi-Lagrangian back-sample). Seeded noise perpetually
   nucleates new defects, tuned so the field never freezes to uniform and never
   explodes — it stays in living turbulent churn.
3. **Tilt / shear input** — a `uShear` uniform (device tilt or pointer drag)
   adds an anisotropic advection bias, so tilting shears the material and the
   defects respond.
4. **Confinement** — a soft radial mask biases the director tangential near the
   dish edge, organizing the chaos into circulating cells. Raise *Confinement*
   to coil the churn into orbits.

## Crossed-polarizer birefringence render

The image is real optics. Through crossed polarizers a birefringent film
transmits

```
I = sin²(2(θ − α)) · sin²(Γ / 2)
```

where α is the (slowly rotating) polarizer angle and Γ is the optical
retardation. Γ is scaled with the local distortion energy `|∇θ|²`, so stressed
regions and defect cores blaze. Γ is then mapped through an **iridescent
thin-film cosine palette** (violet → magenta → gold → cyan) for the jeweled
oil-film color, with gentle feedback bloom for luminous smear. Defect cores read
as bright jeweled points.

## Audio mapping (Web Audio)

A coarse CPU mirror of the same field runs alongside the GPU sim and yields
cheap global scalars every frame:

- **mean flow speed → drive/brightness** — opens the master gain and a lowpass
  cutoff;
- **turbulence / distortion energy → roughness** — partial detune beating plus a
  deterministic filtered-noise bed;
- **defect birth / annihilation → a soft inharmonic bell ping** — pitch is a
  *continuous* consequence of the event's location, **never** snapped to any
  musical scale.

Five to eight inharmonic partials, master gain ≤ 0.15 through a compressor.
Audio starts only after the Start-button gesture and also self-plays under the
seeded auto-demo with no sensor.

## Input and fallbacks

Primary input is **device tilt** (`DeviceOrientationEvent`; on iOS the Start
button calls `requestPermission()`). No sensor? **Drag on the canvas** to set the
shear vector. And a **seeded auto-demo** always breathes a slow Lissajous shear
so the piece is alive and audible with no sensor and no interaction (it is
reviewed headless). If WebGL2 is unavailable, an on-brand notice appears and a
**Canvas2D fallback** renders the coarse field's birefringence — still churning,
still sounding.

## Determinism & safety

All randomness is seeded with `mulberry32(0x2888)`; there is no `Math.random`,
`Date.now`, or `new Date` in the logic (`performance.now` is used only for
animation timing). No strobe — luminance modulation stays ≤ 3 Hz, and
`prefers-reduced-motion` slows everything down.

## Self-assessment

With no sensor and no touch the field visibly self-stirs: the active flow plus
seeded nucleation keep defects being born and annihilated in perpetual turbulent
churn, and the auto-demo shear adds a slow organic drift on top. It sounds alive
— the drone's brightness and roughness track the flow while defect events ping
soft inharmonic bells at continuously-varying pitches, so quiet spells and busy
churn are audibly different. Tilting the phone (or dragging on desktop) shears
the material and the defects immediately respond, and raising Confinement coils
the whole dish into circulating cells.

## References

- PNAS 2026, *Chaos-generating periodic orbits of topological defects in
  confined active nematics*.
- A. Doostmohammadi & J. M. Yeomans, work on active nematics and defect
  self-propulsion.
- Crossed-polarizer birefringence and the Fréedericksz transition (liquid-crystal
  optics).
