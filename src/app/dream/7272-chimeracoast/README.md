# 7272 · Chimeracoast

*Cycle 2 of [`7192-tidefield`](../7192-tidefield). Route: `/dream/7272-chimeracoast`.*

## The one question

**What if a living generative tide ran on a *ring* of oscillators like a
coastline, where one *arc* of the coast spontaneously locks into a coherent,
in-tune wave while the rest of the ring stays choppy and incoherent — a
travelling *chimera* — and the coherent arc's position sweeps the sound across
the stereo field before the whole coast comes home?**

The parent (`7192-tidefield`) drove *one* voice from a single **global** Kuramoto
order parameter over a network of 6 oscillators. The deepening here is that
coherence is **localized to a moving arc** of a ring, **detected live**, and
**voiced and panned by its geometry** — a true chimera state rather than a global
sync scalar.

## The mechanism — a nonlocal-ring chimera (Kuramoto–Battogtokh)

`engine.ts` places **N = 40 identical phase oscillators on a ring**; index `i` is
an angular position `2πi/N` around a coastline. Each oscillator couples to the
*whole* ring through a **distance-dependent cosine kernel** and a **Sakaguchi
phase lag α near π/2** (the classic Abrams–Strogatz reduction of the
Kuramoto–Battogtokh model):

```
dθ_i/dt = ω − (rate/N) Σ_j G(i−j)·sin(θ_i − θ_j + α)   with  G(Δ) = 1 + A·cos(Δ)
```

`G` is strong locally and weak far away (`A = 0.9`). With `α` just below π/2
(`α ≈ 1.457`, i.e. Abrams' `β = π/2 − α ≈ 0.11`) the ring **spontaneously
splits**: a contiguous **arc phase-locks** (high *local* order parameter) while
the rest **drifts incoherently** — and the coherent arc slowly **travels** around
the ring. A localized coherent bump in the seeded initial condition nucleates the
first arc.

Each frame the engine computes a **sliding-window local order parameter**
`r_local(i) = |mean e^{iθ}|` over ±5 neighbours, then tracks:

- **arc centre** — circular mean of ring positions weighted above the coherence
  midline (→ stereo pan),
- **arc width** — fraction of the ring that is coherent,
- **chimera metric** — `max_i r_local − min_i r_local` (coexistence of a
  coherent *and* an incoherent region; `> 0.4` = a genuine chimera).

Over the ~7-minute arc a slow **two-rate tide of α** walks through the chimera
band so episodes wax and wane and never repeat. A late **homecoming ramp**
collapses α → ~0 (purely attractive coupling → full sync) and adds a **home pull**
toward a mid-bin home phase, so the whole coast synchronizes into **one home
wave**: D Dorian, resolved on **Dm**, low tension.

## Named references

- **Kuramoto & Battogtokh, 2002** — *Coexistence of coherence and incoherence in
  nonlocally coupled phase oscillators.* The original chimera: a ring of
  identical, nonlocally-coupled oscillators splits into a coherent and an
  incoherent arc. This is the exact mechanism here.
- **Abrams & Strogatz, 2004 / 2006** — *Chimera states for coupled oscillators.*
  The cosine kernel `G(Δ)=1+A·cos Δ` with phase-lag `β = π/2 − α`, and the
  drifting coherent domain, are taken from this reduction.
- **"Agogic: Performance-Timed Music Tokens" (arXiv 2608.03999, 2026)** —
  expressive held-duration accents from oscillator dynamics: a local-order
  threshold crossing *holds* (lengthens) the next bell rather than making it
  louder.

## Mapping table — dynamics → sensation

| Ring quantity | Musical / visual result |
|---|---|
| Coherent arc (high local order) | Bright, in-tune choir (4 detuned saw/tri voices) |
| **Arc centre angle** | **Stereo pan of the choir** (sweeps L↔R as the arc travels) |
| Arc coherence (`max r_local`) | Choir loudness, filter brightness, detune → 0 (tightens in tune) |
| Arc width | Choir level scaling; how much of the ring the choir covers |
| Incoherent region (`1 − min r_local`) | Quiet detuned **beating haze**, spread wide, darker filter |
| Local-order threshold crossing | FM **bell**, panned to the arc, D-Dorian snapped |
| Agogic accent (crossing charge) | Bell is **held longer** (accent by duration) |
| Global order parameter | Background luminance; homecoming trigger |
| Mean phase | Chord choice in the D-Dorian progression (home = Dm) |
| Tension (`1 − global order + chimera`) | Overall unrest; falls to 0 at homecoming |
| Home phase / D | Shared sub + low drone bed |

Everything routes through a master mix → **DynamicsCompressor limiter** → output
gain fixed at **0.25** (hard level ceiling).

## Ambition criteria (headless `verifyLongForm()`)

`engine.ts` exports `runSimulation()` and `verifyLongForm()` that fast-simulate
420 s deterministically and assert all four guarantees. Measured on the shipped
constants:

| Criterion | Result |
|---|---|
| (a) 0 duplicate sampled phase-vectors | **0 duplicates** / 211 samples ✓ |
| (b) minute-1 measurably differs from minute-5 | circular distance **11.24** (≫ 0) ✓ |
| (c) homecoming reached (global order high, tension low, home chord) | globalOrder **1.00**, tension **0.00**, chord **Dm** → `homecomingReached: true` ✓ |
| (d) ≥ 1 genuine chimera episode (metric > 0.4) | **maxChimeraMetric 0.977**, **150** episodes over threshold ✓ |

During the bulk (t ∈ [40, 300] s) the chimera metric holds a median of ~0.66 with
100% of samples above 0.3 — the coast is a travelling chimera for essentially the
whole middle of the piece, then locks into one wave at homecoming.

## Conduct

- **Primary: device tilt** (`deviceorientation` beta/gamma) — a "breath" that
  transiently perturbs the ring and disperses the coherent arc, which then
  reabsorbs over ~26 s. iOS permission is requested behind the Begin gesture.
- **Fallback: an on-screen slider** ("stir the coast") for desktop / headless.
- **Seeded auto-conduct** always runs (deterministic breaths keyed to the ring's
  own clock), so it lives and sounds with zero input.

No microphone this cycle (mic is diversity-banned here).

## Honest limitations

- With N = 40 and finite integration the chimera is (as in the literature)
  *metastable*; the shipped α band keeps it robust for the whole run, but pushing
  the slider hard for a long time can briefly flip the coast fully coherent or
  fully choppy before it re-forms — that is the physics, not a bug.
- The arc's drift is real but gentle and tends to favour part of the ring rather
  than lapping uniformly, so the stereo sweep wanders rather than metronomically
  circling.
- Coupling is O(N²) per step (~1600 ops); fine at 60 fps and for the headless
  420 s run, but N is deliberately modest to stay light on mobile.
- Audio still needs one user gesture (autoplay policy) even though the ring and
  canvas are alive from mount — stated in the UI on the Begin button.
