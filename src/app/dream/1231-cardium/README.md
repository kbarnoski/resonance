# 1231-cardium

**The one question it answers:** what does a heart-like sheet of excitable
tissue *compose* if you let it organise itself for five minutes — and can the
listener be its conductor rather than its trigger?

**How to use:** press **Begin**; it self-plays. Drag on the sphere to pace a
beat or drop an excitation (which can seed reentry), and move the *refractory
period* slider from calm heartbeat toward fibrillation. Then mostly listen — the
piece walks its own arc.

## Mechanism

A geodesic **icosphere** (subdivision level 4 → 2562 vertices, 5120 faces) is
treated as a closed sheet of cardiac-like tissue. Each vertex carries two state
variables — a fast **excitation** `u` ("voltage") and a slow **recovery** `v`
("refractoriness") — integrated with the **FitzHugh–Nagumo** model in its
**Barkley reduction**, the numerically robust member of the FHN family that
reliably supports spiral waves:

```
du/dt = D·∇²u + (1/ε)·u·(1−u)·(u − (v + b)/a)
dv/dt = u − v
```

The Laplacian `∇²u` is a graph Laplacian over the mesh edges (`mean(neighbours)
− u`), so depolarisation **waves diffuse and sweep across the curved surface**.
Because the surface is closed and boundaryless, a wave can wrap around and
re-excite tissue behind it — the pre-condition for **genuine reentry**, not a
decorative animation.

`b` is the excitation-threshold / refractoriness knob: high `b` makes waves fail
(calm, dissolution); low `b` destabilises spiral tips into multi-wavelet chaos
(fibrillation). Small fixed per-vertex heterogeneity plus a random re-seed
orientation each cycle mean the medium **evolves and never loops identically**.

### The long-form arc (`arc.ts`)

An internal clock (one cycle ≈ 320 s, comfortably past 5 minutes) drives `b` and
emits events so the piece self-organises through phases:

1. **calm** — the north pole is paced at a slowing heartbeat; single fronts
   sweep the globe and annihilate cleanly.
2. **onset** — a **reentrant rotor** is seeded via the classic cross-field
   initial condition (an excited hemisphere crossed with a perpendicular
   recovery gradient); the broken free end curls into a sustained spiral that
   wraps the sphere. External pacing stops — the rotor self-sustains.
3. **fibrillation** — refractoriness shortens; the spiral tip meanders and
   breaks into multi-wavelet chaos.
4. **dissolution** — refractoriness lengthens; wavelets collide and die, and a
   slow heartbeat returns. The field then clears and re-seeds with a fresh
   random orientation.

The slider adds a gentle conductor **bias** on top of the arc's drive, and
pointer stimuli can seed reentry directly.

### The voice (`audio.ts`) — a rhythmic pulse engine

Three fixed **listening regions** watch `u` at their vertex. When a wavefront
sweeps past (a rising-edge threshold crossing) the region fires a **low resonant
thud** (a pitched body with a fast downward glide) plus a **brief harmonic
shimmer** whose pitch/interval track the local wave period. **Tempo is the
primary expressive axis** and it transforms across the arc: calm → one slow
~1 Hz heartbeat; rotor → two regions at different periods desynchronise into
**polyrhythm**; fibrillation → three regions fire fast and irregularly into
**dense stochastic patter**; dissolution → the patter thins back toward the
heartbeat. Gains ramp from silence, voices are capped, and a compressor acts as
a soft limiter. It is not a drone, choir, Karplus-Strong, granular, or
scanned-synthesis voice — it is pulse timing driven by wave dynamics.

### Rendering (`viz.ts`)

A small custom shader maps excitation to colour: cool **slate-teal** resting
tissue with **oxblood → ember** excitation fronts (saturated chromatic
chiaroscuro), a faint **violet refractory scar** trail, and a soft fresnel rim
for form. The camera orbits slowly. All change is carried by smooth sweeping
fronts — there are **no full-frame luminance flashes**, even during
fibrillation, so it is safe for photosensitive viewers (global luminance change
stays well under 3 Hz).

## Files

- `page.tsx` — client component: mount, render loop, conductor input, UI.
- `mesh.ts` — icosphere generation and neighbour adjacency.
- `fhn.ts` — the FitzHugh–Nagumo / Barkley excitable medium.
- `arc.ts` — the long-form self-organising clock.
- `viz.ts` — three.js scene and per-vertex shader.
- `audio.ts` — the rhythmic pulse engine.

## Named references

- **FitzHugh, R. (1961).** "Impulses and physiological states in theoretical
  models of nerve membrane." *Biophysical Journal* 1(6): 445–466.
- **Nagumo, J., Arimoto, S., & Yoshizawa, S. (1962).** "An active pulse
  transmission line simulating nerve axon." *Proc. IRE* 50(10): 2061–2070.
- **Barkley, D. (1991).** "A model for fast computer simulation of waves in
  excitable media." *Physica D* 49: 61–70.
- **Winfree, A. T.** — cardiac **reentry** and **spiral / scroll waves** in
  excitable media (e.g. *When Time Breaks Down*, 1987; *The Geometry of
  Biological Time*).
