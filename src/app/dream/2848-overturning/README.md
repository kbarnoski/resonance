# 2848 — Overturning

### The "what if"

**What if you could HEAR the ocean's great conveyor belt approach a tipping
point** — the deep overturning drone wobbling wider and recovering slower as
freshwater builds up (critical slowing down), then the circulation shutting down
in a sudden collapse, and a return that does **not** retrace (hysteresis)?

A long-form (~10 min), self-playing sonification of a **real** fast–slow
stochastic dynamical system with a **fold catastrophe**, built so you literally
hear the **early-warning signals** of a tipping point.

---

### The dynamics (this is a real model, not a scripted fade)

**Core model — Stommel two-box thermohaline circulation** (`engine.ts`), in the
Marotzke non-dimensional form:

```
dx/dt = η1 − x·(1 + |x−y|)      x = ΔT  (low↔high latitude temperature contrast)
dy/dt = F  − y·(η3 + |x−y|)     y = ΔS  (salinity contrast)
q = x − y                        overturning strength (density-driven flow)
```

With `η1 = 3`, `η3 = 0.3`, integrated by **Euler–Maruyama** with additive noise
`σ·√dt·ξ`, ξ a Box–Muller Gaussian drawn from a **mulberry32** PRNG seeded with
`0x2848`. The system is genuinely **bistable**: a strong thermally-driven "on"
overturning state and a collapsed salinity-dominated "off" state, separated by a
**saddle-node (fold)**. Numerically verified fold locations: **on→off at
F ≈ 1.2** and **off→on at F ≈ 1.0** — a hysteresis window.

**The slow arc.** The freshwater forcing `F` (a freshening North Atlantic)
drifts from `0.6` up past the upper fold (the overturning **collapses**), then
back down past the lower fold (a **transformed** restart). Because the "off"
state stays stable over a range of `F`, the circulation does **not** restart at
the `F` where it collapsed — the return path differs from the outward path.

**Early-warning signals (real, and they drive the sound).** A rolling window
(300 samples) of `q` yields live **variance** and **lag-1 autocorrelation
(AC1)**. As the fold nears, recovery slows → variance ↑ and AC1 → 1 (critical
slowing down). A **resilience** meter tracks the local well curvature `−G'(q)`
(≈ distance to the fold), and **flickering** near the edge is detected when the
window straddles both basins. All three appear in the live readout and modulate
the audio.

**The landscape.** The stability panel draws the effective potential
`U(q;F) = −∫G dq` (the ball-in-a-well of Scheffer et al.), whose two minima are
the on/off states and whose barrier vanishes at the fold. The ball sits at the
**real** `q`; its rattle width is the **real** √variance.

---

### Sonification (Web Audio — continuous pitch, never scale-snapped)

`audio.ts` voices the layered ocean, all mapped **continuously**
(`freq = f0 · 2^(k·norm)`, never quantized to a scale/JI/pentatonic):

- **Deep abyssal overturning drone ← q** — twin oscillators that detune into
  audible **beating** as resilience drops; on collapse the drone drops an octave
  and shuts down (a phase transition, not a fade).
- **Mid thermocline voice ← ΔT.**
- **Surface salinity voice ← ΔS** — rises and **takes over** when q collapses.
- **Turbulence bed** — band-passed seeded noise that swells as resilience falls.
- **Feedback delay** whose tail **lengthens** as the system loses resilience.
- Near the fold, **flickering** stutters the deep gain between basins (audio
  only). Signal path → `DynamicsCompressor` limiter → master gain `0.15`.

---

### Controls

Visuals animate on mount. **Begin** creates the `AudioContext` inside the user
gesture (autoplay policy). **Pause/Resume** freezes both clocks. **Jump ahead**
deterministically fast-forwards the arc by 45 s. Honors
`prefers-reduced-motion`; no luminance oscillation above 3 Hz. Web-Audio- or
canvas-unavailable degrade to an on-brand notice with visuals still running.

---

### References

- **Scheffer et al., "Early-warning signals for critical transitions,"
  _Nature_ 461 (2009)** — variance & lag-1 autocorrelation as generic leading
  indicators; the ball-in-a-potential-well picture.
- **Stommel, "Thermohaline convection with two stable regimes of flow,"
  _Tellus_ 13 (1961)** — the original bistable two-box model.
- **Rahmstorf** — thermohaline-circulation hysteresis and the AMOC collapse
  threshold.
- 2026 frontier on tipping-point sonification: **arXiv:2603.14944**,
  **arXiv:2605.12308**, **arXiv:2509.04683**. (A 2026 paper sonified a tipping
  system but snapped it to a pretty scale; this piece does the honest opposite —
  continuous pitch that is allowed to sound unstable.)

---

### Files

- `page.tsx` — client component: rAF loop, controls, live EWS readout, modal.
- `engine.ts` — Stommel model, Euler–Maruyama, PRNG/Gauss, EWS, potential, arc.
- `audio.ts` — the layered-ocean Web Audio engine.
- `viz.ts` — Canvas2D: stability landscape + q time-series + hysteresis inset.
