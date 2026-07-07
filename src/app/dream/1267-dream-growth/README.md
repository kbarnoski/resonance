# 1267 · Dream Growth

A first-person dream-architecture you **walk** and **play** — and that **grows around your playing**. It is the cycle-2 deepening of `1264-dream-cathedral`: same navigable interior and same HRTF-spatialized struck modal resonators, plus a **morphogenetic memory layer** that turns the room into a physical record of your performance.

## The one question

> What if the endless dream-corridors you walk and strike **grew** around your playing — every strike accreting new geometry (a pillar, an arch, a chime) near *where* and *how* you played — so by minute five the empty ground has reconfigured into a cathedral you *built*, and the architecture itself is a record of your music you can walk back through and replay?

## How to use

1. Press **Enter and start building** (this first gesture unlocks audio and requests pointer-lock).
2. **Look** with the mouse (or **drag** anywhere if pointer-lock is blocked), **walk** with **WASD / arrow keys** — slow, weightless, with inertia and a subtle head-bob.
3. **Strike** by clicking (or pressing **Space**): the surface under the crosshair — a pillar, grown geometry, or the open ground — rings, blooms teal, and throws a ripple.
4. **Watch it grow.** Every strike accretes a new element near where you struck. Play **low, sparse** notes for a cavernous colonnade of tall pillars; play **high, dense** notes for a thicket of hanging chimes; the middle grows arches spanning to their neighbours.
5. **Walk your history.** Old growth persists — backtrack through earlier structure and strike it again to replay your own performance. The corner readout shows *elements grown* and your *emerging mode*.

If your browser has no WebGL you get a readable rose notice instead of a blank screen.

## Named reference

- **Giorgio de Chirico** metaphysical architecture — bone plaster, cold fluorescent-teal light, long raking shadows from one low sun whose azimuth slowly crawls; hypnagogic "impossible rooms" of sleep-onset.
- **Morphogenesis / L-systems / architectural accretion** — generative growth as the model for a room that *builds itself as you play it*; the space as the physical record of a performance.
- **Differentiable / adaptive room acoustics** (arXiv 2510.00238) — cited as the long convolution reverb that fills the volume the room keeps growing into.

## Technique

- **Navigable interior** — a real `three.js` (v0.182) scene-graph: a sparse starter cloister of plaster pillars on an infinite bone-tiled floor, first-person pointer-lock mouselook + WASD with inertia and head-bob. Flat/`NoToneMapping` render for a painterly, non-game look; shadow-mapped directional light with a crawling azimuth.
- **Played modal resonators** — each strike is a small physical-model modal bank (partials ≈ `1, 2.01, 3.0, 4.18, 5.43, 6.79`, each with its own exponential decay, excited by a filtered-noise mallet transient), tuned to just-intonation **A-Dorian** `[1, 9/8, 6/5, 4/3, 3/2, 5/3, 9/5]` by what/where it hit. Each strike gets its own `PannerNode` with `panningModel:'HRTF'` at the struck world coords; the Web Audio listener is driven by the walking camera every frame.

## Integrated subsystems

- **The morphogenetic memory layer** (`growth.ts`, the distinguishing subsystem): three capped `InstancedMesh` pools (pillars / arches / chimes). Each strike accretes one element with a smooth scale-in ease (never a pop). **Pitch → type + height** (low → tall pillars, high → chimes, middle → arches spanning to the nearest existing foot). **Tempo/density → placement** (dense playing clusters growth tight around you; sparse playing spreads it into open ground). A **decaying histogram of your struck degrees** biases the tuning of new elements toward your *emerging mode*. Each grown element is itself a playable HRTF resonator. Pools are capped (a few hundred total); when full, the element *farthest from you* retires gracefully so the history you're standing in persists.
- `_shared/psych/droneBank` — the slow just-intonation drone bed; each strike spikes its `drive`, which eases back each frame.
- `_shared/psych/convolutionVoid` — the long code-generated reverb tail filling the growing volume.
- `_shared/psych/safeFlicker` (`prefersReducedMotion`) — damps head-bob and chime-swing when the visitor prefers reduced motion.

## Safety

No strobe or fast flicker; all luminance change is slow drift well under 3 Hz. Audio is gesture-gated (the Enter click), routed through a `DynamicsCompressor` limiter at master ≤ 0.5, and fully torn down on unmount (RAF cancelled, `AudioContext` stopped/closed, `renderer.dispose()`, pointer-lock exited). Instance counts are capped and reused so the GPU never chugs as the room grows.

## Next-cycle deepening

The growth is currently *additive* — a natural cycle-3 move is **selective pruning and resonant coupling**: let neglected structure slowly erode while frequently-replayed elements thicken and sprout, and physically couple neighbouring resonators so striking one sympathetically rings the arches and chimes it grew — the building becoming a single instrument whose whole body resonates with the mode you taught it.
