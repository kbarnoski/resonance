# 1490 · Slow Cathedral

**Pitch:** A cathedral of light that builds itself, strut by strut, over ten minutes — a sparse sapling at minute one, a towering vault of thousands of struts by minute ten, and topologically a different structure at every moment in between. It is designed to dissolve your sense of time: nothing "happens," yet an entire architecture of light assembles itself in front of you across subjective aeons.

> *"What if a piece could dissolve your sense of time by GROWING an architecture of light in front of you over 10+ minutes — a cathedral that builds itself, branch by branch, and is a completely different structure at minute 10 than at minute 1?"*

## How it works (subsystems)

Three distinct subsystems, one long-form arc:

1. **Growth state machine with memory (`growth.ts`).** A **space-colonization algorithm** grows a branching structure toward a cloud of ~1,950 attraction points shaped like a gothic cathedral — a flared base, eight ribbed pillars (angular quantization → mandala symmetry), an arched vault, and a tapering spire. Root nodes at the foot of each pillar climb toward the nearest attractors; each attractor a branch reaches is *consumed* and fires a growth event. The node list only ever **accumulates** — this is genuine memory, not a looping animation. A uniform spatial-hash grid keeps nearest-node queries fast even at thousands of nodes. Growth is **paced against a wall-clock duration** (`catchUp(targetProgress)`), so the visible build tracks the 10-minute arc regardless of how the algorithm happens to branch, and a per-frame iteration cap prevents fast-forward hitches. Fully deterministic: a seeded `mulberry32` PRNG only — no `Math.random`, no `Date`.

2. **three.js scene-graph (`scene.ts`).** A real 3D scene — **not** a full-screen fragment shader, **not** Canvas2D. Luminous struts are a single `THREE.LineSegments` with additive vertex colours; junctions are `THREE.Points` glow sprites; freshly-reached growth tips bloom via a pooled set of additive `THREE.Sprite` flares. Geometry is **appended incrementally** into pre-allocated dynamic buffers as nodes accrete. The palette **ascends with height** — deep indigo foundations → violet nave → warm gold/white cathedral-glass at the spire — and the camera slowly orbits, rises, and dollies back to keep the growing spire framed.

3. **Audio (`audio.ts`).** What you *see* growing is what you *hear*. Every growth event rings a soft **inharmonic bell** (fundamental + metallic partials) pitched by the **height** of that event on a just-intonation pentatonic ladder — low struts sound low, the spire sounds like high glass. Beneath it, a just-intonation **drone bed** (shared `droneBank`) slowly opens its filter as the structure fills in — the long-form "ascending" bloom. The `AudioContext` is created only on the Start gesture; the master gain ramps from silence to ≤ 0.2; a `DynamicsCompressor` limits the bus; concurrent bell voices are capped at 14.

**Idle preview vs. the real build.** On load, before any gesture, the cathedral is already growing at a compressed `DURATION_PREVIEW` (32 s) timescale so a 20-second glance still *sees* it rise (it regrows on a loop while idle, silently). Pressing **Begin** resets to the sapling and runs the full `DURATION_REAL` (600 s) slow build with audio.

**Input.** Device-orientation **tilt** is the primary control (steer your gaze around the structure); on desktop / no-orientation it falls back to pointer-move and arrow keys. iOS `DeviceOrientationEvent.requestPermission` is requested at Start and silently falls back to pointer if declined. The piece **fully self-plays** — tilt only adds parallax, it is never required.

**Safety.** No strobe: the only global brightness change is a ≈0.045 Hz luminance swell (far below the ~3 Hz danger band). `prefersReducedMotion` further slows all motion and damps the brightness swing. WebGL-unavailable and tilt-unavailable both degrade to readable notices, never a crash.

## Named references

- **Space-colonization growth** — Runions, Lane & Prusinkiewicz, *"Modeling and visualization of leaf venation patterns"* (2005); and **L-systems** — Lindenmayer (1968). The growth core is a space-colonization algorithm, a direct descendant of these.
- **Terry Riley, *In C*** — slow structural accretion of a large form from small repeated cells.
- **Éliane Radigue** — her hour-long ARP 2500 drones as a model of long-form, near-imperceptible evolution.
- **The Buddhist *kalpa*** — deep/geologic time as a meditative object.
- **High-dose psilocybin / DMT "temple" visions** — the recurring report of vast sacred architecture assembling itself over subjective aeons.

## Research anchor (RESEARCH §744, 2026-07-11)

Built to *implement*, not merely evoke, a **<14-day** finding: arXiv **2606.29427**, *"Entropic Time, Psychophysics, and Deformed Neural Dynamics: A Unified Physical Theory for Human Time Perception"* (submitted **2026-06-28**, https://arxiv.org/abs/2606.29427). Its core claim is that subjective time is not a readout of coordinate time but "a local metric mutation driven by macroscopic physical **entropy production**," and it explicitly gives a thermodynamic basis for **time dilation in psychedelic states (the REBUS model)** — the felt *length* of an experience tracks the density of state-transitions per unit physical time (dτ/dt). This piece takes that literally as a *design law*: the cathedral's **rate of new structure/events climbs over the arc** (the branch-reach cadence and voice density rise as it fills), so by the paper's model the later minutes should feel *longer and more timeless* — the engineered phenomenology of "the eternal present." That dive → this build is the deliberate cycle-744 attempt at the lab's first 5/5 (a **multi-cycle** commitment cited against a **<14-day** finding, on top of the ≥3-subsystem + named-ref middle).

## AMBITION self-assessment

- **#1 — never-before-used technique in the lab:** **Yes.** A space-colonization / L-system *generative-growth* state machine with accumulating memory on a three.js scene-graph is a growth paradigm not previously used here (the neighbouring pieces are physics sims, shaders, and flocks).
- **#2 — integrates ≥3 distinct subsystems:** **Yes.** (a) the space-colonization growth state machine, (b) the incremental three.js scene-graph renderer, (c) the event-driven bell + drone audio engine — tightly coupled: one growth event drives both a visual tip-flare and an audible bell.
- **#3 — borrows from a named reference:** **Yes.** Directly implements Runions et al. (2005) space colonization; structurally and sonically models Riley's *In C* and Radigue's long-form drones.
- **#4 — multi-cycle commitment:** **Yes — explicitly planned below (cycles 1/2/3).**
- **#5 — built on recent research:** **Yes.** The growth *mechanism* is the established Runions et al. (2005) space colonization, but the piece is designed to *implement a design law* from a **<14-day** finding — arXiv 2606.29427 (2026-06-28), which grounds psychedelic time-dilation in entropy-production rate (see the Research anchor above). The accelerating branch/voice cadence over the arc is that paper's dτ/dt made into phenomenology.

### Multi-cycle plan

- **Cycle 1 (this build):** the growing cathedral end-to-end — space-colonization growth with memory, incremental scene-graph rendering, height-pitched bells + opening drone, tilt/pointer/keys steering, idle preview + full 10-minute build, all safety and determinism constraints met.
- **Cycle 2 (next):** *architectural articulation* — thicken struts into tapered tubes whose radius follows subtree weight (Murray's law, as in the original venation paper) so pillars read as load-bearing; add a second, slower attractor field that "closes" arches between pillars into true gothic vaults; introduce voice-leading so successive bells resolve as chord progressions rather than isolated tones; add a real additive-bloom post pass.
- **Cycle 3:** *the eternal present* — after the build completes, transition into a slow breathing/settling phase where the finished cathedral very gently re-illuminates region by region (a "consecration" pass), plus an audio-reactive coupling where the drone's spectral centroid subtly bends new branch directions, closing the see↔hear loop in both directions.

### Next-cycle deepening (concrete first step)

Replace the flat `LineSegments` struts with `TubeGeometry`/instanced tapered cylinders sized by a one-pass subtree-weight accumulation over the node tree, and give each of the 8 pillars its own consonant modal centre so the cathedral sounds like eight interlocking bell-choirs rather than one scale — the single highest-leverage change toward "sacred architecture" over "glowing graph."
