# 1145 · Critical Brain

**Route:** `/dream/1145-critical-brain`

## The one question

> What if you could *feel* your own brain being tuned toward the critical point —
> the edge-of-chaos phase transition that neuroscience associates with both
> consciousness and psychedelic ego-dissolution — by literally simulating it?

A drug-free psychedelic instrument built on a **genuine 2D Ising model** run as a
**Metropolis Monte-Carlo** simulation on the GPU. A single "consciousness
temperature" that you **drag** (vertical drag on the lattice, plus a visible
slider) sweeps the lattice temperature `T` through the critical temperature
`Tc ≈ 2.269`.

## How to use it

1. The lattice animates immediately on load — no interaction required.
2. **Drag up/down on the lattice** (or use the slider) to change temperature.
   - **Below Tc** — ordered, frozen, one dominant magenta/teal domain. Still and
     dull ("flatline / anaesthetized"). A single sustained low drone.
   - **Near Tc (the payoff)** — CRITICALITY. Scale-free self-similar domains of
     all sizes bloom, the correlation length diverges, the pattern shimmers and
     reorganizes endlessly. Domain walls glow white-hot; the palette hits maximum
     iridescence; a bank of consonant detuned partials blooms; large spin-cluster
     "avalanches" are sonified as bell events.
   - **Above Tc** — hot uncorrelated noise: a fast *spatial* shimmer (never a
     full-screen flash) and dissonant/noisy audio ("overload").
3. Press **Begin** to start sound (browsers require a user gesture). **Stop**
   instantly kills both audio and motion. **Reseed lattice** re-randomizes the
   spins.

## The physics (real, not decorative)

- **State:** a lattice of spins `s ∈ {-1,+1}` stored in the red channel of an
  RGBA8 texture (`gl.ts`).
- **Update:** single-spin Metropolis flip. The energy change of a flip is
  `ΔE = 2·s·(sum of the 4 nearest neighbours)`; the flip is accepted with
  probability `min(1, exp(-ΔE/T))`. `T` is in units of `J/k_B`.
- **Boundary:** a torus — neighbour lookups wrap (`GL_REPEAT`).
- **Parallelisation:** a **checkerboard** update. A cell's four neighbours always
  have the opposite `(x+y)` parity, so we update only the "black" cells in one
  ping-pong pass and the "white" cells in the next. No two interacting spins ever
  change simultaneously — the correct, race-free way to parallelise Metropolis.
  One sweep = two passes; several sweeps run per animation frame (fewer under
  `prefers-reduced-motion`).
- **Randomness:** a per-cell integer hash of `(x, y, frame)` — a GLSL PRNG. No
  `Math.random()` / `Date.now()` inside the simulation loop (only for the
  one-time initial seed).
- **Observables:** the magnetization `|M|` (the order parameter) and
  nearest-neighbour agreement are read back from the GPU every ~12 frames and
  used to drive the audio and detect avalanches.
- **Critical point:** Onsager's 1944 exact solution gives
  `Tc = 2/ln(1+√2) ≈ 2.269185`.

## Named references

- **Lars Onsager (1944)** — exact solution of the 2D Ising model; source of
  `Tc = 2/ln(1+√2)`.
- **Metropolis, Rosenbluth, Rosenbluth, Teller & Teller (1953)** — the
  Monte-Carlo / Metropolis algorithm.
- **Entropic Brain hypothesis** — Carhart-Harris et al.
- **Toker et al. 2022, *PNAS*** — "Consciousness is supported by near-critical
  slow cortical electrodynamics."
- **2026, *J Neurosci* 46(2):e0344252025** — "DMT-Induced Shifts in Criticality
  Correlate with Self-Dissolution."

This is a real Ising simulation used as a **metaphor-made-literal** for
near-critical brain dynamics. It does **not** claim the brain *is* an Ising model.

## Diversity tags

- **INPUT:** active pointer-drag on the canvas (+ a visible slider) — not passive
  fixation.
- **OUTPUT:** 2D WebGL2 GPU fragment-shader lattice — not Canvas2D.
- **TECHNIQUE:** Ising / Metropolis Monte-Carlo statistical mechanics (the lab's
  first genuine statistical-mechanics engine).
- **PALETTE:** critical iridescence — two spin poles in magenta (`#ff2d95`) ↔
  teal/cyan (`#12e6c8`), domain walls glowing white-hot near criticality, on
  near-black.
- **POLE:** intense — spans dull → critical → overwhelm.

## Ambition-floor criteria hit

- Audio-visual: produces both animated visuals (immediately, before any input)
  and gesture-gated sound.
- Self-contained in this folder; only reads the shared `safeFlicker` helper.
- Loads fast; clear title, one-sentence description, and a primary **Begin**
  action; degrades gracefully to a readable notice if WebGL2 is absent.
- On-page "Read the design notes" panel.

## Safety notes

- **No hard strobe.** The "overload" state above Tc is a fast *spatial* shimmer
  computed per-cell in the fragment shader — never a global luminance flash.
- No global luminance oscillation is used; if any were added it would be routed
  through `_shared/psych/safeFlicker` (≤3 Hz soft).
- `prefers-reduced-motion` is honored: the simulation runs fewer sweeps per frame
  so the motion is calmer.
- The **Stop** control instantly kills audio and freezes motion.
- All audio passes through a `DynamicsCompressor` limiter. No microphone is used
  (output only). Full teardown (oscillators stopped, `AudioContext` closed, RAF
  cancelled) happens on unmount and on Stop.

## Files

- `page.tsx` — React client component: canvas, drag/slider control, transport,
  notes panel, the rAF loop, graceful WebGL2 fallback.
- `gl.ts` — the WebGL2 Ising/Metropolis engine (checkerboard ping-pong update
  shader + iridescent renderer + GPU readback of the order parameter).
- `audio.ts` — the Web Audio synth (drone / consonant partials / noise bed /
  sonified avalanches) whose timbre tracks the order parameter.
