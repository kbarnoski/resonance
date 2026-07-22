# 2196 · cortex-weave

**Why open this:** the four Klüver form constants are usually a GPU shader you *watch* — here they are a vector instrument you *play from the keyboard*, morphing tunnels → spokes → spirals → honeycomb in real time while sustained keys make the cortical lattice **proliferate** into ecstatic overgrowth (structure builds; nothing dissolves).

`state: flicker/entoptic form-constant geometry · pole: intense`

**Tags:** INPUT=keyboard-played · OUTPUT=SVG-DOM · TECHNIQUE=retinocortical log-polar map + V1 Turing pattern (Bressloff–Cowan) · HARMONY=modal / banded-waveguide · VIBE=INTENSE geometric-proliferation-as-JOY

This is the first form-constant piece in the lab rendered as **SVG DOM elements** (every prior one is a GPU shader/compute), and the first *played-morph across all four constants* from a single keyboard.

## How it works

- **Cortical grid → inverse warp → SVG form constants.** A bounded, regular grid is laid out in *cortical* (log-polar) space — 8 log-radius rings × 12 angular spokes, two interleaved layers, ≤200 `<circle>` elements total. Each node is pushed through the shared engine's inverse warp `cortexToScreen` (`r = exp(u)`), so a plain grid becomes a log-polar phosphene lattice on screen. Node brightness is `formConstant()` / `honeycomb()` sampled at that node — so the *same* grid reads as tunnels, spokes, spirals or honeycomb purely by which field it samples.
- **Keyboard drives F / freq / G.** A single played **form parameter F** ∈ [0,1] interpolates the plane-wave direction `phi` (tunnel `0` → spoke `π/2` → spiral `π/4`) and then blends in the hex Turing lattice — one continuous sweep across all four constants. `A … ;` set F and each strikes a voice; `↑ / ↓` set the **spatial frequency** `freq` (ring/spoke density); holding keys raises a **growth `G`** that is a *slew-limited follower* (rises on hold, decays on release — never an autonomous 0→peak→0 clock). Growth lowers the lattice's lighting threshold (more of the pool lights up) and fades in a second, double-`freq` harmonic layer, so the weave visibly densifies. A slow inward `phase` drift gives the tunnels their motion.
- **Seeded autopilot.** From load, with zero input, a mulberry32 PRNG seeded with the fixed constant `0x2196` gently tours F across all four constants and lets G breathe, striking modal voices — the piece demos its whole idea with no keyboard. Any real keypress overrides it; a sustained hold keeps the player in control indefinitely. No `Math.random` / `Date.now` anywhere — time comes only from the `requestAnimationFrame` timestamp.
- **Modal audio.** A small modal / banded-waveguide voice bank: each key strikes a bank of high-Q bandpass resonators (excited by shared deterministic noise) tuned to an inharmonic, non-JI modal set (ratios ≈ 1, 2.76, 5.40, 8.93 morphing brighter with F); growth `G` opens a shimmer bus (a second, higher inharmonic layer). Master ≤ 0.16 through a lowpass + DynamicsCompressor, short fade-in, silent until the first note (autopilot counts). No Web Audio context → an on-brand notice shows and the visuals keep running.
- **Safety.** All luminance flicker routes through the shared safe-flicker engine (≤ 3 Hz, soft sine, `prefers-reduced-motion` honored — reduced motion falls back to slow drift). Flicker is off by default; a Kill control stops it instantly.

## References

- Heinrich Klüver, *Mescal and Mechanisms of Hallucinations* (1926) — the four form constants (tunnels/funnels, spokes/cobwebs, spirals, lattices/honeycombs).
- Bressloff, Cowan, Golubitsky, Thomas & Wiener, "Geometric visual hallucinations, Euclidean symmetry and the functional architecture of striate cortex," *Phil. Trans. R. Soc. B* (2001) — V1 Turing patterns become the form constants under the retinocortical log-polar map.
- The 2026 bioRxiv large-scale computer-vision mapping of stroboscopically-induced visual hallucination geometry — a fresh, drug-free confirmation that flicker reliably evokes the same four constants.

## Next-cycle deepening

- Per-node local `F` (a gradient of the form parameter across the field) so a tunnel can bleed into a honeycomb *within one frame* — a spatial morph, not just temporal.
- A second player axis on the number row for **symmetry order** (rotational multiplicity of the hex lattice), and pointer-drag to steer the drift center off-axis for oblique spirals.
- Optional WebMIDI so velocity drives per-strike growth impulses, giving the proliferation a percussive, played envelope.
