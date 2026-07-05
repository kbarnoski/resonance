# 1209 · Alfvén Rack

**What if you could pluck a magnetic field line like a string — and hear the plasma sing?**

A 3D rack of glowing magnetic field-line loops floating over a deep-indigo sky.
Grab one, pull it sideways, and release: the loop whips and rings, and you hear
the plasma's voice — a sum of standing **Alfvén-wave** harmonics. Longer loops
sing lower; a **Field B** control turns up the whole magnetosphere at once.

## The one question

Magnetized plasma carries transverse vibrations that travel *along* magnetic
field lines and ring in standing modes exactly like a string under tension —
but the "tension" is the magnetic field and the "mass" is the plasma density.
This piece lets you pluck that string and listen.

## The Alfvén-wave / MHD string model (`mhd-core.ts`)

A magnetic field line threading a plasma behaves like a string. Transverse
Alfvén waves propagate along it at the **Alfvén speed**

```
v_A = B / √(μ₀ ρ)          B = field strength, ρ = plasma density
```

Reflecting at the anchored **footpoints** (where a coronal loop meets the
surface), they set up standing modes with a real string spectrum:

```
fundamental  f₁ = v_A / (2L)          harmonics  fₙ = n · f₁
```

Each loop is a semicircular arc of length `L = πR`. We model its displacement by
**modal superposition**: a triangular pluck at parameter `u₀` projects onto the
standing modes with the classic plucked-string coefficients
`bₙ = 2h / (π²n² u₀(1−u₀)) · sin(nπu₀)` (a ~1/n² spectrum). Those signed
amplitudes are stored as decaying envelopes; the transverse displacement is
`Σ aₙ(t)·sin(nπ s/L)` bent out of the loop plane.

**Why sight and sound share one model.** The *same* modal coefficients and the
*same* per-mode decay rates (`modeDecay(n)`, rising with n) feed both the tube's
whip and the audio partials, so what you see and what you hear are one object.
One honest concession: the true partials sit at hundreds of Hz — invisible to
the eye — so the *visual* motion is time-dilated to a few Hz while preserving the
exact modal spectrum, decays, and pitch ratios; the *audio* rings at the real
`fₙ`. Pitch is set physically by `L` and `B`, not an arbitrary scale — the loop
lengths are simply *tuned* so the seven fundamentals land on a C-minor
pentatonic set, and raising Field B scales `v_A`, lifting every pitch and
quickening every visible shimmer live (already-ringing voices retune too).

## The additive voice (`additive-voice.ts`)

Each pluck spawns one `OscillatorNode` per standing harmonic at `fₙ = n·f₁`,
each with its own exponential-decay gain envelope — the fundamental rings ~2.5 s,
the top partials ~0.4 s. This is genuine **additive / spectral resynthesis** of
the string modes (not a choir, drone, pad, granular cloud, or sampled pluck). A
faint band-passed noise transient gives the pluck its attack. Partials carry a
slight inharmonic "coronal" stretch for shimmer. Everything runs through a
master compressor and a gain bus ramped up from zero on the first gesture, with
a 72-partial voice budget across the rack.

## Palette

Aurora green ↔ violet across the rack of loops, over a deep indigo-to-near-black
radial gradient with real chiaroscuro — luminous and saturated, aurora-borealis
mood. The pluck fires a smooth (non-strobing) hot-magenta flash.

## References

- **Hannes Alfvén** — predicted magnetohydrodynamic (Alfvén) waves, 1942; Nobel
  Prize in Physics, 1970.
- **Coronal-loop seismology** — transverse loop oscillations in the solar
  corona (Nakariakov et al.), the direct physical analogue of a plucked string.
- **Chladni / Helmholtz** — the classical plucked-string / standing-wave
  acoustics lineage the modal model rests on.

## Next-cycle deepening

Add **field-line coupling**: let neighbouring loops share footpoints so plucking
one leaks energy into its neighbours (sympathetic resonance / mode conversion),
and introduce a density gradient ρ(s) along each loop so `v_A` varies with
height — bending the harmonics away from perfect integers into the genuinely
inharmonic spectrum real coronal loops show.
