# 11376 · Recall Orbit

**The one question.** What if a melody you sang became a shape you could see — a
glowing orbit traced by a living neural "mind" — and when the mind remembers
perfectly the orbit is a clean closed loop, but as memory loosens into dream the
loop unwinds into a wild, endless, never-repeating attractor?

## What it is

A genuine **Echo-State Network** (reservoir computer, Jaeger 2001) is the mind.
Its state `x ∈ R¹⁸⁰` evolves under a fixed, sparse random recurrent matrix `W`
(rescaled to spectral radius ρ via power iteration), driven **only by a phase
clock** — not by the melody. The reservoir's fading-memory dynamics turn that
clock into a rich, high-dimensional **limit cycle**: one loop of state that
repeats every 96 steps.

We project that 180-D state to 3-D through a **fixed random projection** and draw
the trajectory as a glowing **phase-portrait ribbon** in three.js (GPU
geometry) — the mind's motion made visible. Behind it, a faint point-cloud of the
180 units glows with each unit's activation. This is the "memory **as** geometry"
read: the melody's orbit, literally.

## The technique — a *trained* readout (the deepening)

This is cycle 2 of the lab's reservoir piece **10984 · echofold**. Echofold read
the reservoir with **fixed random** projections, so it could only *drift* — it
could never reproduce a phrase exactly. Here the readout is genuinely **trained**:

- **Ridge / Tikhonov regression** (Lukoševičius & Jaeger 2009): collect the
  reservoir's converged state rows `X` over a couple of clock loops (after a
  washout), with targets `Y = [pitch, gate]`, and solve
  `Wout = (XᵀX + λI)⁻¹ XᵀY`, λ = 1e-3.
- The 180×180 SPD system is solved by a **Cholesky** factorisation with
  double-precision accumulation (no ML libraries — ~200 lines of plain TS in
  `reservoir.ts`). Training runs in well under 50 ms.

Because the reservoir state is a deterministic periodic function of the clock
phase, the trained linear readout reproduces the taught phrase **exactly**,
forever — a clean closed orbit.

## The DREAM knob

A single knob `d ∈ [0,1]` morphs exact recall into reverie:

- blends the trained readout toward a random one, `Wout = (1−d)·Wtrained + d·Wrandom`;
- injects state noise ∝ `d` each step;
- fades the clock's grip and pushes ρ **past the edge of chaos**.

At `d = 0` the orbit is a clean closed loop (exact recall). As `d → 1` the mind
stops being slaved to the metronome and runs freely on its now-supercritical
recurrence — the loop **unwinds** into a wandering, space-filling attractor that
never returns.

## Controls

- **memory ⟷ dream** slider — the DREAM knob, with a live mode readout
  (`closed-orbit` / `unwinding`).
- On a muted screen with no mic it **auto-sweeps** dream 0→1→0 over ~40 s, so the
  full exact→dream→exact arc plays on its own. Drag the slider to take manual
  control; "Resume auto-sweep" hands it back.
- **Sound on** — glassy 2-op FM voices per emitted note over a drifting drone
  pad, routed through the shared ear-safety master bus.
- **Sing / play a phrase** — opens the mic (reclaimed sensor), records ~4 s,
  quantises your contour (spectral centroid → pitch, onsets → gate), **retrains**
  the readout, and sings *that* orbit back. Denied/absent → on-brand notice, the
  seeded demo continues.

## Rendering

three.js 3-D GPU geometry: an additive, length-faded line ribbon (with a soft
glow pass), a state-lit point cloud, a note-triggered head bloom, and a slow
auto-orbit camera (~0.02 Hz). Cool cyan / teal / aurora-green / ice-white on
near-black — cosmic-ambient, weightless. Degrades gracefully (no WebGL notice;
reduced-motion stills the camera; nothing strobes above 3 Hz).

## References

- H. Jaeger (2001), *The "echo state" approach to analysing and training
  recurrent neural networks*, GMD Report 148.
- M. Lukoševičius & H. Jaeger (2009), *Reservoir computing approaches to
  recurrent neural network training*, Computer Science Review 3(3):127–149 —
  the trained ridge-regression readout.
- Edge-of-chaos reservoir design, arXiv:2606.21335.

Deepens **10984 · echofold** (fixed-random drift) → a trained readout that
recalls exactly, plus a single DREAM knob that dissolves recall into dream.
