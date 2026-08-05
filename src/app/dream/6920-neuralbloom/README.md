# 6920 — Neural Bloom

**Walk the bifurcation of your own visual cortex with your voice.**

Hum up and down and hear your pitch slide the emergent hallucination from
**stripes (tunnels)** → **spots (cobwebs)** → **hexagons (honeycombs)**. In a
Wilson–Cowan neural field the Turing pattern's *symmetry class* is set by one
wavelength, and the retino-cortical log-polar map turns each class into a
different Klüver form-constant. Your voice is the axis — this is embodied, not a
self-playing scalar arc.

## What it is

A WebGL2 ping-pong fragment-shader simulation of a 256×256 cortical sheet, warped
to the screen through the complex-logarithm retino-cortical map, sonified by a
just-intonation drone. The microphone is the primary sensor: **spectral centroid
(pitch) is the headline control.**

## The model

Two coupled fields, E (excitatory) and I (inhibitory), packed into the R/G
channels of an RGBA8 texture (rates live in [0,1], so 8-bit is enough — and,
unlike float targets, always renderable *and* reads back for the regime meter, so
no float-texture extension is required). Euler update per substep:

```
Ec = wEE·(KE*E) − wEI·(KI*I) + P + DRIVE + asym
Ic = wIE·(KE*E) − wII·(KI*I) + Q
E += (dt/tauE)(−E + f(Ec));   I += (dt/tauI)(−I + f(Ic))
f(s) = 1 / (1 + exp(−a·(s − theta)))
```

Constants: `wEE=10, wEI=10, wIE=10, wII=−2, tauE=1, tauI=2, dt=0.15, P=−0.2,
Q=−0.9, a=8, theta=0.15`. The **Mexican-hat** coupling is approximated by two
8-tap rings: short-range excitation at radius `rE≈1.2`, longer-range inhibition
at radius `rI`. **`rI` is the mic-centroid-driven control** — it sets the Turing
wavelength and therefore the symmetry class. The field is seeded with
deterministic per-cell noise (`mulberry32(0x6920)`) so symmetry breaks
reproducibly.

**Display:** for each screen pixel, cortical coord `c = (log|p|, atan(p.y,p.x))`
(via `screenToCortex` spliced from `_shared/psych/logpolar`), sampled into the
field over `u ∈ [−3.5, 1.5]`, `theta` wrapping; a slow inward `u`-drift gives the
tunnel motion; tone-mapped to the house violet ramp.

## The bifurcation walk (the interaction)

`mu ∈ [0,1]` is the pitch axis. Mic spectral centroid over ~320–1600 Hz maps to
`mu`; `mu` then drives **`rI = lerp(2.2, 5.6, mu)`** (the Turing wavelength) and a
hexagon-favouring excitatory bias **`asym = lerp(0, 0.34, mu)`** that breaks the
up/down symmetry stripes need. So low pitch → symmetric long-scale → **stripes /
tunnels**; mid → **spots / cobwebs**; high → asymmetric lattice → **hexagons /
honeycomb**. Amplitude → DRIVE (bias across the bifurcation); onset → a localized
excitation burst (breakthrough flash). A live readout estimates the dominant
form-constant from the field's own **structure-tensor coherence** on a 48×48
patch (high coherence = oriented = stripes); pitch position breaks the
spots↔hexagon tie, which a cheap CPU pass can't cleanly separate.

**Alive on load / degrade:** the field animates on mount and auto-sweeps `mu`
(self-demoing the stripes↔hex morph) *before* any mic permission. **Begin**
starts audio; **Hum to the cortex** starts the mic. No mic → the manual pitch
slider drives the same axis. No WebGL2 → an on-brand `text-destructive` notice,
never a white screen.

## Audio

`audio.ts` runs the shared `startDroneBank` just-intonation bed whose
brightness/level track DRIVE, plus one extra upper partial that fades **in** as
the pattern reaches honeycomb and **out** toward stripes — so the ear tracks the
visual morph. No network, no new deps, full teardown on unmount.

## Safety

Continuous smooth field motion, **no strobe**. Global brightness drifts well
under 3 Hz (routed through the shared `SafeFlicker`, which stays disabled by
default — the inward drift is the motion) and honours `prefers-reduced-motion`
(fewer substeps + slower drift). Clean teardown: rAF cancelled, WebGL2 context
lost, mic stopped, audio disposed.

## References

- Wilson & Cowan (1972), excitatory/inhibitory neural populations.
- Ermentrout & Cowan (1979), *A mathematical theory of visual hallucination
  patterns* — Turing instability yielding stripes AND hexagons/squares depending
  on parameters.
- Bressloff, Cowan, Golubitsky, Thomas & Wiener (2001), the retinocortical map.
- bioRxiv 2026-02-18, *A Large-Scale Computer-Vision Mapping of the Geometric
  Structures of Stroboscopically-Induced Visual Hallucinations* — translational-
  symmetry cortical patterns → rotational percepts under the map; lattices stay
  translational.

## Honest limitations

- **How convincingly pitch morphs the symmetry class:** the morph is *legible and
  continuous* but partly *guided*. `mu` drives both the honest physical control
  (Turing wavelength via `rI`) and a deliberate hexagon-favouring `asym` bias, so
  the stripes→spots→hexagons sequence is engineered to be readable rather than
  left entirely to whichever mode the bare PDE happens to select. A pure "let the
  wavelength alone pick the class" version is scientifically cleaner but far less
  reliably shows all three classes on demand.
- The Mexican-hat kernel is a coarse 8-tap-ring approximation, not a true
  Gaussian convolution; and 8-bit field precision quantizes very small near-
  equilibrium increments (fine for the visible dynamics, not for quantitative
  neural-field work).
- The regime readout is a *coarse* estimate: coherence cleanly separates stripes
  from blobs, but spots vs. hexagons is disambiguated using the pitch position
  rather than a true lattice-count, so it reflects intent as much as measurement.
- Voice spectral centroid is noisy in untreated rooms; the sensitivity slider and
  the manual pitch slider exist for when the mic mapping drifts.
