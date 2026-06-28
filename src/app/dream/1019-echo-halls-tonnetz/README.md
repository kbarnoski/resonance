# Echo Halls — Tonnetz (`1019-echo-halls-tonnetz`)

Route: `/dream/1019-echo-halls-tonnetz`

## The one question

**What if the harmonic rooms were laid out as a _Tonnetz_ — the neo-Riemannian lattice of triads —
so that physically stepping across a threshold applies a P / L / R transformation (parallel,
leading-tone-exchange, relative) to the chord, and the resonating _body_ of each room is a live
WebGPU-compute reaction-diffusion field that grows its own pattern, so you walk smooth voice-leading
paths through chord-space while a Turing pattern blooms and sings under your feet?**

This is the deep harmonic extension of `977-echo-room-gpu` (a single-room "walk among
HRTF-spatialized ghost loops" piece). The distinct angle here is the **harmony model** — a real
neo-Riemannian Tonnetz where _movement = voice-leading transformation_, far richer than 977's simple
6-column diatonic strip — **plus** a genuine **WebGPU-compute** reaction-diffusion simulation as the
room's resonating body. The proven 977 scaffolding (WebGPU init, HRTF panner-per-source chain,
MediaPipe Pose CDN import, renderer fallback, ~1.5s auto-demo, clean teardown) is **copied** in, not
imported.

## The Tonnetz / neo-Riemannian harmony model

A triad is `{ root: pitch-class 0..11, minor: bool }`. The three canonical neo-Riemannian transforms
each hold **two common tones** and move the third voice by a single semitone or whole tone — the
smoothest possible ("parsimonious") voice leading:

- **P — Parallel:** `C ↔ Cm` — flip major/minor by moving the **3rd** one semitone.
- **L — Leading-tone exchange:** `C ↔ Em` — move the **root** down a semitone (it becomes the new
  chord's fifth).
- **R — Relative:** `C ↔ Am` — move the **5th** up a whole tone (relative major/minor).

These are implemented as pure functions `applyP / applyL / applyR` on a triad. The plane is tiled as
a **triangular Tonnetz** (`buildLattice`, 7×5 cells, odd rows offset half a cell). Each cell's triad
is derived by composing transforms outward from a C-major seed (`cellTriad`): vertical steps apply
**L**, horizontal steps alternate **R** and **P**. By construction, **every adjacency between cells
is exactly one P / L / R move** — so crossing any threshold is a single, common-tone-rich
voice-leading transformation, and the HUD shows the move that just happened (e.g. `L → Em`).

This is **real functional / neo-Riemannian harmony**, deliberately **not** a pentatonic
"no-wrong-notes" safety scale (a hard requirement from the lab's jury): there is genuine harmonic
meaning, and you hear common-tone retention and single-voice motion as you step. The live performer
sounds the full triad as three oscillators that **glide** between chords (slow `setTargetAtTime`), so
the voice leading is audible, not just labelled.

## The resonating body — WebGPU-compute reaction-diffusion

The room's "body" is a **Gray-Scott reaction-diffusion** field (the classic Turing-pattern
activator/inhibitor system) simulated **on the GPU via a WebGPU compute shader**:

- State is two `array<vec2<f32>>` storage buffers holding `(A, B)` per cell. Each frame the compute
  shader (`@workgroup_size(8,8)`) reads `src`, computes the 9-point Laplacian, applies the Gray-Scott
  update, and writes `dst` — **ping-ponging** between the two storage buffers across N iterations.
- Crossing a threshold, the live marker, and every ghost **seed** activator into the field (`splat`),
  so the pattern literally blooms where harmony is happening. The WebGPU splat keeps a CPU mirror
  (re-synced from the GPU each readback) and writes back only the affected rows as contiguous spans,
  so it never clobbers cells the GPU has evolved outside the brush.
- ~10 Hz the field is read back (`copyBufferToBuffer` → `mapAsync`) and summarized into **coverage**
  (fraction bloomed) and **edge energy** (mean gradient of B). Those drive the audio: coverage opens
  a shimmer partial tuned to a high partial of the current chord root and **breathes the master
  lowpass**; edge energy sweeps a bandpass. **The sim is the instrument's body, not a backdrop.**

## HRTF + ghost-loop mechanic (kept from 977)

- One `AudioContext`; **the live performer's position is the `AudioListener`**.
- The live triad and **every ghost own an HRTF `PannerNode`** placed at their lattice position, so the
  whole ensemble **re-pans around you** as you move.
- **"Start a loop"** records your lattice path (`x, y, col, row`) over a **7 s** bar; on close it
  becomes a **permanent ghost** that re-walks the lattice forever, re-deriving and re-triggering its
  triad/transforms at each step, spatialized. Recording **auto-arms the next** loop until the cap.
- Cap **6 ghosts**; oldest drops. **"Clear all"** removes everyone. Bus is `~1/√(n+1)` gain
  normalized → master lowpass → compressor/limiter → destination, so a full stack never clips.

## Fallback chain

- **Sim:** WebGPU-compute Gray-Scott → WebGL2 ping-pong fragment-shader Gray-Scott (RGBA16F float
  targets, `EXT_color_buffer_float`) → CPU Gray-Scott on a smaller grid. The active path is shown in
  the HUD as `sim webgpu-compute / webgl2 / cpu`.
- **Visuals:** the Tonnetz (nodes, P/L/R-coloured edges, the bloom, ghosts, the live marker) is drawn
  on a Canvas2D overlay that is always available.

## Input + graceful degradation

- **MediaPipe Pose** (full body) loaded at runtime via dynamic `import()` of
  `@mediapipe/tasks-vision` from the CDN (not a `package.json` dependency), `pose_landmarker_lite`,
  VIDEO mode. Position = the **torso/hip centroid** of shoulders (11,12) + hips (23,24), x mirrored
  for a selfie view.
- If the camera is denied/unavailable or MediaPipe fails to load (offline), it falls back to
  **pointer = body position**, with a readable `text-rose-300` notice on error.
- On cold load with no hardware, a **~1.5 s-delayed auto-demo** walks a small **P–L–R cycle** through
  four neighbouring cells and records a couple of ghosts, so the page is **sounding and moving at a
  glance with zero permissions**. Any pointer move or "Start camera" takes over.

## Teardown

On unmount: cancel rAF, close the `AudioContext` (stopping all oscillators), dispose the RD sim
(destroy GPU buffers / delete GL programs+textures+FBOs), close the MediaPipe landmarker, stop camera
tracks, and remove the resize listener — no leaks.

## Research lineage

- **The neo-Riemannian Tonnetz tradition** — Euler's _Tonnetz_ (1739), Hugo Riemann's harmonic
  dualism, and **Richard Cohn**'s modern parsimonious-voice-leading / neo-Riemannian theory (the
  P/L/R group acting on the 24 major/minor triads). The lattice and its single-transform adjacencies
  are this prototype's spatial spine.
- **"Spatial Orchestra" (arXiv:2510.23848)** — walking into spatialized "bubbles," each a positioned
  note; the direct ancestor of navigating harmony by stepping through space.
- **arXiv:2606.24367 (24 Jun 2026), "Statistical validation and full-sphere extension of a Bayesian
  model for human static sound localisation"** — full-sphere human localization accuracy, motivating
  HRTF spatial chord navigation as something a listener can actually parse.
- **Gray-Scott / Turing reaction-diffusion** (Alan Turing's morphogenesis; Pearson's parameter
  taxonomy) as the generative "body," after Karl Sims' reaction-diffusion tutorial.

## Honest status

**Not device-verified.** This environment has **no installed `node_modules`** and **no real GPU or
camera**, so `next build` / `eslint` were **not** run here, and the WebGPU-compute path, the WebGL2
float-target fallback, the MediaPipe Pose CDN load, and the HRTF re-panning have **not** been
exercised on real hardware. What _was_ verified: the file type-checks clean under TypeScript
`--strict` (es2024 lib, react-jsx) using a local React shim, all helpers avoid `use*` hook-naming,
and there are no unused symbols. The safest bets for a live review are the **WebGL2/CPU RD fallbacks**
plus the **pointer + auto-demo** paths, which need neither WebGPU compute nor camera. The most likely
spots to need a small fix on first real-GPU run are the **WebGPU compute bind-group / ping-pong
wiring** and the `mapAsync` readback cadence (it is guarded by a `reading` flag, but real drivers may
want a dedicated rotating set of staging buffers if frame-rate is high).
