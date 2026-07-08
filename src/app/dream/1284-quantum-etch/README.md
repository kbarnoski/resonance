# 1284 · Quantum Etch

## The one question

**What if quantum probability drew itself as a living topographic ETCHING —
animated iso-contour lines of |ψ|² and glowing nodal curves — that you sculpt
with walls and wells, fire a packet through, and watch tunnel and settle into
shimmering scar-line figures, each a chord?**

This is the *line-drawing* sibling of a filled quantum-ripple field. The whole
reason it exists: instead of staring at a glowing probability blob, you read the
wavefunction as a **copper engraving** — nested contour rings and moving nodal
lines, like a bathymetric chart of |ψ|² that ripples and splits in real time.
The double-slit fringes, in particular, read as a clean fan of nodal lines that a
glow-fill would smear away.

## The technique (implemented for real)

The 2D **time-dependent Schrödinger equation**

    iħ ∂ψ/∂t = −(ħ²/2m) ∇²ψ + V·ψ        (natural units ħ = m = 1)

is integrated by the **split-step Fourier method** (Feit–Fleck–Steiger 1982).
Each step is the symmetric operator splitting

    ψ ← e^{−i V dt/2} ψ                  half potential kick   (real space)
    ψ ← FFT⁻¹ [ e^{−i k² dt/2} · FFT ψ ] kinetic drift        (Fourier space)
    ψ ← e^{−i V dt/2} ψ                  half potential kick

Every factor is a pure phase, so the scheme is **unitary** and conserves ∑|ψ|² by
construction. Grid 128×128 (64×64 under reduced motion), dx = 1, so L = N and the
Fourier wavenumbers are `k = 2π·[0..N/2−1, −N/2..−1]/N`, dt = 0.35. ψ is two
`Float32Array`s (re, im).

- **FFT** (`fft.ts`): a hand-written zero-dependency **radix-2 Cooley–Tukey** FFT
  — iterative, in-place, precomputed bit-reversal + twiddles; the 2D transform
  runs it over rows then columns. No npm FFT dependency.
- **Absorbing boundary**: a raised-cosine mask tapering to ~0 over an ~8-cell
  border ring, applied every step, so packets leave the frame instead of wrapping.
- **Self-check** (console, on load): a stationary centred packet conserves ∑|ψ|²
  to **~0.005%** over 300 steps on the 128 grid with no NaN/Inf — printed once,
  never rendered. (A *moving* packet legitimately loses norm to the absorbing
  border; that is physics, not integrator error, which is why the check uses k=0.)

## The etching (why lines, not a filled field)

`contour.ts` runs a hand-written **marching squares** over the |ψ|² scalar field
at ~9 **log-spaced** iso levels each frame (log spacing so both the bright crest
and the faint tail show as nested rings) and emits line segments. `render.ts`
strokes them in warm **copper→bone** on near-black ink — no bloom, no strobe, no
fill. The **nodal set** (Re(ψ)=0, extracted by the same routine at level 0) is
stroked as a finer bright curve on top: those moving zero-crossing lines *are* the
interference pattern made legible. Walls (V>0) and wells (V<0) are drawn in their
own line styles — bright barrier strokes and dashed basin contours. A near-opaque
ink wash each frame leaves the lines a short ghost so the map feels alive without
smearing into a glow.

## How it's played

- **Tool toggle** — Inject / Wall (+) / Well (−).
- **Tap with Inject** fires a momentum-aimed Gaussian wave-packet (momentum aims
  from the tap toward the field centre, so an edge tap heads inward).
- **Drag with Wall or Well** paints the potential V with a soft radial brush.
- **Four presets** — **double-slit** (the classic interference fan), **stadium**
  (Bunimovich billiard → Heller scars), **lattice** (periodic wells), **harmonic**
  (2D parabolic trap → breathing rings) — plus **Clear**.
- **Audio**: gesture-gated "Begin" creates the AudioContext. The wave's **radial
  k-spectrum** (|FFT(ψ)|² binned by |k|) drives a ≤5-voice **just-intonation
  partial bank** — a locked scar is a stable dark chord, a spreading packet a
  wider brighter cluster; overall presence opens a master lowpass. A pooled
  **mallet** (≤3 voices) pings when the packet strikes a wall. Everything routes
  through the shared drone bed + convolution void → limiter → master (≤0.3, 2 s
  fade-in), with full teardown on unmount.

## Cycle-2 ideas

1. **Stitched polylines + phase-tinted strokes** — chain marching-squares segments
   into ordered contours so each ring can be stroked as one variable-width path
   whose hue is tinted by the local phase arg(ψ), turning the etching into a true
   phase portrait while staying a line drawing.
2. **Time-integrated scar accumulation** — accumulate |ψ|² over many steps into a
   density buffer and contour *that*, so a stadium billiard slowly engraves its
   Heller scar figures as permanent standing lines (and sonify the settling as a
   chord that locks).
3. **Two-packet interferometry** — fire two coherent packets and expose a relative
   phase slider; the beat between their nodal fans becomes both a visible moiré of
   contour lines and an audible binaural beat.

## References

- E. Schrödinger, *Annalen der Physik* (1926) — the wave equation.
- M. D. Feit, J. A. Fleck Jr. & A. Steiger, "Solution of the Schrödinger equation
  by a spectral method," *J. Comput. Phys.* **47** (1982) — split-step Fourier
  propagation.
- E. J. Heller, "Bound-state eigenfunctions of classically chaotic Hamiltonian
  systems: scars of periodic orbits," *Phys. Rev. Lett.* **53** (1984) — quantum
  scars in the stadium billiard.

*Approximate model; not verified on real hardware or ears.*
