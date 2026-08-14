# 13104 · Physarum Reef

> **The one question:** What if a piece of music grew a living slime-mold
> vein-network — the sound feeding an organism that builds itself into breathing
> organic filigree?

This is the lab's first **Physarum polycephalum** agent-transport-network
simulation. A colony of ~18,000 agents deposits and follows a chemical trail,
self-organising — with no drawn geometry — into a living, breathing vein
network. Real audio dropped in from outside the piece reshapes the colony every
frame, so different music grows a visibly different organism.

## The physarum model

Faithful to Jeff Jones's agent scheme (below): the whole structure emerges from
**deposit → diffuse → decay**, nothing more.

- **Trail field** — a `512 × 512` scalar grid (`Float32Array`), the
  chemoattractant the colony reads and writes.
- **Agents** — `{ x, y, heading }`, ~18,000 of them, stored structure-of-arrays.
  Each step, per agent:
  1. **Sense** the trail at three points — ahead, ahead-left, ahead-right — at
     `sensorDistance` and `±sensorAngle`.
  2. **Turn** toward the strongest sensed cell by `rotationAngle` (Jones's
     rule; ambiguity-ahead turns a seeded-random direction), plus a tiny seeded
     jitter.
  3. **Move** forward `stepSize`.
  4. **Deposit** a fixed amount into the trail at the new cell.
- **Each frame** the whole field is **diffused** (a 3×3 separable mean filter,
  toroidal wrap) and **decayed** (× ~0.90–0.975). This diffuse-and-decay is what
  makes veins condense out of noise and then reorganise into finer filigree.
- **Render** — the field is tone-mapped through a warm lookup ramp into an
  `ImageData` and blitted to Canvas2D; a fast-decaying activity field adds a
  cool teal glow on the active growth fronts.

### Parameters (nominal → audio-modulated range)

| Parameter        | Range           | Driven by                 |
| ---------------- | --------------- | ------------------------- |
| `sensorDistance` | 9 px            | fixed                     |
| `sensorAngle`    | 0.28 → 0.95 rad | spectral centroid         |
| `rotationAngle`  | 0.18 → 0.62 rad | spectral centroid         |
| `stepSize`       | 0.55 → 2.3 px   | loudness (RMS)            |
| `deposit`        | 0.55 → 5.2      | loudness (RMS)            |
| `decay`          | 0.90 → 0.975    | low-band energy (bass)    |
| agent bursts     | 3–8% of colony  | onset (spectral flux)     |

## Audio coupling (sound comes from outside the piece)

Primary input is a **dropped audio file** (`FileReader`/`arrayBuffer` →
`decodeAudioData` → `AudioBufferSourceNode` → `AnalyserNode` → speakers).
Optional secondary input is the **microphone** (`getUserMedia`, analyser only,
**never** monitored to the speakers — that would feed back). All audible sound
is routed through the shared `createSafeMaster` bus; nothing connects directly
to `ctx.destination`.

From the analyser each frame we extract loudness (RMS), spectral centroid,
low-band energy, and onset (adaptive spectral-flux gate), then map:

- **loudness → deposit strength + step speed** — louder music = faster, brighter
  growth.
- **spectral centroid → sensor angle** — bright music = wider exploration, more
  branching.
- **low-band energy → trail decay/persistence** — bass = denser, longer-lived
  veins.
- **onset → a burst of fresh agents at seeded spawn nodes** — the music literally
  feeds new growth into the reef.

Nothing here plays itself: this is not a self-playing drone. The colony grows
only when it is fed real sound (or the seeded silent demo).

## Muted-06:30 fitness

The moment the page mounts, a **seeded deterministic silent demo** drives the
sim: a fixed `mulberry32` seed feeds synthetic loudness / centroid / low / onset
envelopes (layered sines + a seeded beat schedule). A 40-step warm-up runs
before the first paint, so the reef is already a nascent, breathing vein network
within the first frame — no audio, no mic, no file, no strobing. Real audio is
gated behind an explicit gesture.

## Determinism & safety

- No `Math.random`, `Date.now`, or `new Date`. All randomness (agent init,
  jitter, spawn nodes, demo envelope) comes from a local `mulberry32(seed)` with
  fixed integer seeds. `performance.now()` is used only for animation timing.
- No strobe: slime-mold growth is inherently slow luminance drift; no
  full-screen high-contrast flashing.
- Full teardown on unmount: cancels `requestAnimationFrame`, stops and
  disconnects the buffer source / mic tracks / analyser, calls
  `master.disconnect()` and `ctx.close()`.

## Palette

Coral and amber veins on a near-black reef floor, with a cool teal glow riding
the active growth fronts — a living reef, not a star-void. Raw hex lives only in
the render module (`physarum.ts`).

## References

- **Jeff Jones (2010), "Characteristics of pathfinding in a simulated transport
  network"** — the agent model implemented here.
- **Sage Jenson (mxsage), physarum works** — the aesthetic lineage this piece
  follows.
- Implements the agent-based-morphogenesis frontier — **Neural Particle
  Automata, arXiv:2601.16096 (Jan 2026)**.

## Honest limits

- CPU + Canvas2D with a single trail channel and a toroidal (edge-wrapped) field.
  A WebGL2 multi-channel version would carry far more agents and could colour the
  veins by sensed direction; that acceleration is deliberately left out here so
  the piece runs anywhere without a GPU.
- The onset detector is a simple adaptive spectral-flux gate, not a trained beat
  tracker, so very dense or very compressed mixes can under- or over-trigger the
  growth bursts.
- The field is 512×512; extreme upscaling on very large displays softens the
  filigree (an intentional, organic softness rather than crisp pixels).
