# 820 · Feedback Ecology

A self-organizing network of coupled feedback resonators — the Resonance lab's first
self-oscillating feedback instrument and its first piece built as a coupled dynamical system.
No samples, no recordings, no external API: all sound emerges from feedback loops between
eight high-Q resonator nodes wired into a small-world coupling graph.

## What it is

Eight `BiquadFilter` (bandpass, high-Q) nodes each sit inside a tight feedback loop:
`BiquadFilter → DelayNode → feedback GainNode → back to BiquadFilter`. These nodes are
coupled: each sends a fraction of its output into its neighbors' inputs through a
weighted adjacency matrix (ring backbone + small-world shortcuts).

With coupling above a threshold the network undergoes bifurcations:

- **Low coupling:** isolated, independent pings and decaying rings
- **Mid coupling:** nodes begin to entrain and beat against each other — polyrhythmic textures emerge
- **High coupling:** roaring emergent drone; energy circulates visibly around the graph

The system is genuinely non-stationary: minute 2 will differ from minute 0 because the
coupled resonators exchange energy asymmetrically and drive each other across subtly different
operating points over time.

## How to play

1. Open the page and tap **Awaken the Ecology** (required for audio unlock, especially on iOS).
2. The network self-organizes from its initial seeded impulses. Listen for entrainment.
3. **Tap a node** to inject an excitation impulse — kick the system, watch energy propagate.
4. **Tap empty space** to seed all nodes simultaneously for a denser perturbation.
5. **Coupling slider** — the bifurcation control. Sweep from 0 to max and hear the system
   transition from isolated pings to mutual entrainment to emergent drone.
6. **Self-resonance slider** — the edge-of-chaos control. Near maximum, nodes hover at the
   boundary between silence and self-oscillation. Small perturbations produce large outputs.
7. **Tuning preset buttons** change the resonant frequencies of all nodes:
   - `overtone` — just-intonation harmonic series on A1 (55 Hz); nodes reinforce each other's partials
   - `subharmonic` — utonal / undertone series; different beating patterns, darker character
   - `cluster` — tight ratio cluster; maximal beating and interference, dense and complex
8. **Master volume** and **panic mute** are always visible and immediately effective.

## Dynamical-system technique

Each resonator node is a damped nonlinear feedback oscillator. Self-feedback gain controls
proximity to the Hopf bifurcation boundary. Cross-node coupling routes partial outputs into
neighboring filter inputs. The weighted adjacency matrix encodes both "ring backbone" edges
(weight 0.7) and "small-world shortcut" edges (weight 0.4), giving the network fast global
communication while preserving local clustering — the topology that produces the richest
dynamical behavior.

The Canvas2D visualizer makes the system legible:
- **Node size / brightness** = current RMS energy
- **Edge flow particles** = coupling strength × signal transfer (energy moves around the ring)
- **Phase-space Lissajous trace inside each node** = limit cycle / attractor shape
- **Bottom energy strip** = per-node spectral activity over time

## Ear-safety design

Every signal path ends in a `DynamicsCompressorNode` brick-wall limiter (threshold −8 dB,
ratio 20, attack 1 ms, release 50 ms) before the master `GainNode` (default 0.25). Per-node
self-feedback is hard-clamped to 0.88 (above this, the filter diverges to digital noise rather
than musical self-oscillation). Cross-coupling is hard-clamped to 0.35 per weight unit.

Audio does NOT auto-start: the `AudioContext` is created and `resume()`d only after an explicit
user tap ("Awaken the Ecology"). On start, coupling and self-feedback ramp up over 2 seconds
so there is no sudden blast. The panic-mute button is always visible during playback and ramps
to silence within 10 ms.

## Named references

- **"Musicking with dynamical systems: introducing a digitally-controlled analog no-input mixer"**
  (ACM NIME 2024) — dl.acm.org/doi/10.1145/3678299.3678302 — the core theoretical framework
  for treating an instrument as a coupled dynamical system rather than a note-player.
- **David Tudor** — *Rainforest* (1968), *Pulsers* (1976): feedback ecosystems built from
  found transducers and sculptural speakers; the model for treating feedback topology as
  compositional material.
- **Toshimaru Nakamura** — no-input mixing board lineage: no-input = feedback network with
  no external signal; the sound-world this prototype inhabits.
- **Body Synths Laboratory** self-oscillating feedback synthesizer, shown at Superbooth 2026,
  Berlin, May 7–9 2026: current state-of-the-art hardware realization of the same concept in
  analog electronics.

## Next-cycle deepening

Add Lorenz-attractor coupling weights that drift slowly over time (so the adjacency matrix
itself becomes a dynamical system), per-node waveform displays in the graph, and a
recording/export pathway so performers can capture emergent textures.
