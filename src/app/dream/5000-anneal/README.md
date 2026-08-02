# 5000 · anneal

**The one question:** *What if a solid could MELT as you play it — and you heard the melting itself?*

A crystalline mass-spring lattice fills the screen. Press and drag on it, or tilt
your phone, to inject force. Under enough sustained force the lattice **yields and
melts**: local spring stiffness collapses, the ordered grid slumps into liquid
slush, then **anneals** (re-stiffens toward crystal) when you release. The audio is
**physics-based sonification** — you are not playing notes, you are hearing the
material deform.

## How it works

**Physics (`physics.ts`).** A ~38×38 grid of masses connected by structural and
shear (diagonal) springs, integrated with Verlet (2 substeps/frame,
`performance.now()` timing). Each node carries a `melt` scalar in `[0,1]`. When a
spring's relative strain exceeds a yield threshold it *heats* its two nodes toward
melting; melting softens the effective spring stiffness (`kEff → 0`), so the grid
sags. When force is removed, strain drops and `melt` decays back to zero
(annealing). Per-node **strain energy** (`½·k·Δ²`) is exported every frame — the
lattice is the composer.

**Sonification (`audio.ts`).** The whole screen is treated as ONE struck crystal
bell whose six modes map to six lattice regions (2×3). Signal chain per voice:
`noise → excitation gain → bandpass resonator → low-pass smear → voice gain →
master → limiter`.
- **Strain-energy RATE** per region = an impact; it feeds a strike envelope into
  that mode's excitation gain (ring-down in JS).
- **Melt** per region reshapes the timbre: a hard crystal rings **bright, high-Q,
  inharmonic** (bell partials `0.5, 1, 1.2, 1.5, 2, 2.667 × 196 Hz`); as the region
  melts the mode **detunes downward, its Q collapses, and the low-pass closes**,
  smearing it into a soft watery wash. A slow deterministic wobble adds the liquid
  shimmer.

A `DynamicsCompressor` limits the master so the wash never clips.

**Rendering (`render.ts`).** WebGL2 additive point + line glow (Canvas2D fallback
if WebGL2 is missing). Colour encodes state: cool violet crystal on the ordered
grid, warm liquid-ember where it has melted; strain adds bloom.

**Self-demo.** On load a seeded (`mulberry32(0x5000)`, never `Math.random`)
force sweep presses the lattice, melts it, and lets it anneal on a 12 s loop — so a
reviewer sees the whole arc, and hears it after pressing **Start** (audio must begin
on a user gesture per autoplay policy). Any real pointer or tilt hands control over.

## Reference

**BioSonix: Physics-Based Sonification of Tissue Deformations** (arXiv:2508.14688,
2026). There, 3D tissue displacements compute excitation forces for a modal sound
model whose partials encode material stiffness/density, for surgical guidance. This
prototype **inverts** it — from a surgical tool into a drug-free psychedelic
instrument where the **deformation is the composer**.

## Tags

- **INPUT:** pointer press/drag + `deviceorientation` tilt (iOS
  `requestPermission`-gated, degrades to pointer-only).
- **OUTPUT:** WebGL2 (Canvas2D fallback).
- **TECHNIQUE:** mass-spring / soft-body physics whose per-node strain energy drives
  modal-resonator excitation ("physics-based sonification") — not an FFT visualizer,
  not a played note-grid.
- **POLE:** intense. **VIBE:** liquid-light / material-melt.

## Safety

Slow luminance drift only — **no strobe or flicker**. Respects
`prefers-reduced-motion` with a gentler slump, reduced jitter, and fewer points.
