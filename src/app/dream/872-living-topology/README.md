# 872 · Living Topology

A network of feedback resonators whose **coupling topology rewires itself over
minutes**, steered by a chaotic Lorenz attractor — so the network reorganizes
and the sound never repeats.

This is **cycle 3 of the `820-feedback-ecology` thread.** In cycle 1 (820), eleven
high-Q feedback resonators were cross-coupled through a *static* small-world
adjacency matrix (Watts-Strogatz: ring backbone weight 0.7 + shortcuts 0.4). Here
that matrix is no longer static: it is a dynamical system in its own right, driven
continuously by a Lorenz attractor.

## What it is

Eleven `BiquadFilter` (bandpass, high-Q) nodes each sit in a tight feedback loop:

```
impulse → BiquadFilter → DelayNode → feedback GainNode → back to BiquadFilter
```

Nodes are tuned to the **just-intonation overtone series on A1 (≈55 Hz)** so coupled
nodes reinforce each other's partials. Each node sends a fraction of its output into
neighbors' inputs through per-edge `GainNode`s. Those edge gains are rewritten **every
frame** from a Lorenz-driven, time-varying weighted adjacency matrix.

The Lorenz system (σ=10, ρ=28, β=8/3) is integrated with a small fixed `dt` (0.005),
several steps per animation frame. Its evolving, normalized `(x, y, z)` state is mapped
onto three things:

- **`z` → global coupling density** — the whole network swells and recedes.
- **`x` → a rotating "active arc"** that sweeps around the ring, selecting which
  small-world shortcut chords are currently strong.
- **`y` → relative weighting** of backbone vs. shortcuts (a slow breathing modulation).

The **ring backbone is always present**, so the network never goes fully silent — but
the chaotic state reshapes the shortcuts and the relative weights, so minute 5 differs
from minute 1. Because the Lorenz drift runs on its own, the piece evolves with **zero
user input**: this is exploited for a hands-free auto-demo.

## How to play

1. Tap **Awaken the Topology** (creates/resumes the `AudioContext` inside a user
   gesture — required for iOS). The network seeds itself and starts evolving within ~1s.
2. Watch the **gold ghost-curve drifting at the center** — that is the live Lorenz
   attractor steering everything. Edges brighten and fade as it rewires the graph; gold
   energy pulses travel along active edges; node glow tracks each resonator's RMS energy.
3. **seed network** injects a fresh excitation burst into every node to perturb the system.
4. **coupling** sets global network density (0 = isolated pings, high = emergent drone).
5. **chaos drift** sets how fast the Lorenz state advances — i.e. how fast the topology rewires.
6. **master volume** and **panic mute** are always visible and immediately effective.

You can also just leave it: with no interaction the Lorenz drift + seeded impulses keep
the piece sounding and animating on their own.

## Dynamical-system technique

The audio engine is a coupled feedback network; the *coupling matrix itself* is a second
dynamical system (the Lorenz attractor) layered on top. This is a discrete realization of
synchronization dynamics on a small-world network: a chaotic master drives the
time-varying coupling among the resonator "oscillators," pushing the ensemble through
shifting regimes of entrainment and de-synchronization that never close into a loop.

Visualization (three.js): eleven nodes on a Fibonacci sphere, a slowly orbiting camera,
edges drawn as additive-blended lines whose brightness = current coupling weight × energy
transfer, energy pulses (a `Points` cloud) riding along active edges, node glow shells
scaled by per-node `AnalyserNode` RMS, and the faint Lorenz ghost curve + live marker bead
at the center so the chaotic driver is legible.

## Ear-safety

Every signal path ends in a `DynamicsCompressorNode` brick-wall limiter (threshold −8 dB,
ratio 20, attack 1 ms, release 50 ms) → master `GainNode` (default 0.22) → destination.
Per-node self-feedback is hard-clamped to 0.86 (below the ≈0.88 divergence point); coupling
is hard-clamped to 0.32 per edge. On start, feedback ramps up over 2 seconds so there is no
blast. The panic-mute ramps to silence within ~10 ms. `AnalyserNode`s are taps only — never
routed to the destination. Full teardown on unmount: rAF cancelled, three.js geometries /
materials / renderer disposed, `audioCtx.close()`.

## Named references

- **Edward N. Lorenz**, *"Deterministic Nonperiodic Flow"*, Journal of the Atmospheric
  Sciences (1963) — the origin of the attractor used as the steering chaotic driver.
- 2026 work in ***Chaos, Solitons & Fractals*** on the **synchronization of coupled Lorenz
  oscillators on Watts-Strogatz small-world networks** — the direct theoretical bridge
  between chaotic systems and small-world coupling topologies that this piece sonifies.
- **David Tudor** — *Rainforest* (1968): feedback ecosystems as compositional material;
  **Toshimaru Nakamura** — no-input mixing board lineage (feedback network with no external
  signal). The feedback-instrument tradition this thread inhabits.
- Cycle 1: `820-feedback-ecology` (static small-world coupling). This prototype, `872`, is
  **cycle 3** of that thread — making the coupling matrix itself a Lorenz-driven dynamical system.
