# 1052 · Piano Bloom

**Route:** `/dream/1052-piano-bloom`

## The one question

> What if you could **play** your own piano into a living reaction-diffusion
> field — sculpting a Gray-Scott bloom with your touch, and having that bloom
> granulate and re-voice your piano back at you?

It is an **instrument you play**, not a screensaver you watch. Touch sculpts the
field; the field re-voices the sound; you respond. Bidirectional and felt.

## What it is

A self-contained audio-visual prototype:

- **The body** — a real Gray-Scott reaction-diffusion simulation (two chemicals
  U and V, feed/kill, Laplacian diffusion, double-buffered) on a grid. Mapped to
  a warm psilocybin palette: ember floor → rust → amber → ochre → moss →
  luminous gold. Never goes cold.
- **The voice** — "reader" probes on the field drive granular synthesis of a
  loaded recording, or a felt-piano synth bed when no file is loaded.

## How to use it

1. Press **Begin**. The field blooms and a warm felt-piano bed starts
   immediately (no input needed — works on a phone glance).
2. **Touch / drag on the field** to inject reagent and grow blooms where you
   touch.
3. **Drag the glowing reader probes** over the field. Each reader samples the
   local field and voices it: dense blooms = thick grain clouds / louder, calm
   field = sparse sparse grains. Use the **Readers 1–4** control to add probes.
4. **Drop a piano recording** (or pick a file — `.wav/.mp3/.m4a/.ogg`). This is
   how Karel loads his real *Welcome Home* recordings: the file is decoded with
   `AudioContext.decodeAudioData` into an `AudioBuffer` and granulated. "Back to
   felt bed" returns to the fallback synth.

## The technique

- **Reaction-diffusion (Gray-Scott).** `U' = Du·∇²U − UV² + f(1−U)`,
  `V' = Dv·∇²V + UV² − (f+k)V`. 8-neighbour Laplacian stencil, toroidal wrap,
  double-buffered ping-pong.
- **WebGPU compute (preferred).** The RD step runs as a WGSL compute shader over
  ping-pong storage buffers when `navigator.gpu` is available, at a 256² grid.
  Falls back cleanly to a **Canvas2D / typed-array CPU** step at 160² when
  WebGPU is unavailable — never a blank screen. The active backend is shown in
  the header.
- **Granular synthesis.** Each active reader schedules short windowed
  `AudioBufferSourceNode` grains ahead of the clock: field V → grain position
  (scrub), gradient → pitch (`playbackRate`) + density, intensity → grain gain,
  reader x → stereo pan. Gains are ramped to avoid clicks.
- **Felt-piano fallback.** Detuned triangle/sine partials per reader + a slow
  low pad, soft attack / long release; readers modulate filter cutoff, detune,
  amplitude and pan so the play-relationship persists with zero input.

## Named references

- **Reactive Audio "Growth" (2026)** — a Gray-Scott RD plugin where the user
  places *modulation readers* onto an evolving field and those readers translate
  local field values into modulation signals. The *reader-on-a-living-field*
  interaction model is borrowed directly.
- **Pearson (1993)**, "Complex Patterns in a Simple System," *Science* —
  Gray-Scott reaction-diffusion model and its feed/kill parameter space.
- **Iñigo Quílez** and standard RD **double-buffer Laplacian-stencil**
  implementations.

## Honest notes / unverified

- The WebGPU path reads the U/V buffers back to the CPU each frame (for probe
  sampling and Canvas2D rendering). This is simple and correct but not the
  fastest possible design; a pure GPU render pass would scale to much larger
  grids. Functionally fine at 256².
- WebGPU availability was **not** verified in this build environment (headless,
  no GPU). The code feature-detects `navigator.gpu` + adapter + device and falls
  back to CPU; the CPU path is what runs here. The WGSL compute path should be
  exercised on a real WebGPU browser (Chrome/Edge desktop) before claiming the
  GPU body works end-to-end.
- The grain re-voicing is **musical, not analytical** — it does not pitch-track
  the recording; it scrubs and bends grains by field state. That is the intended
  instrument behaviour, not a transcription tool.
- Tested for type/lint cleanliness via `tsc` and `eslint`. Not run in a live
  browser as part of this build (no display in the container).

## Next-cycle deepening (folded in from the DEEP sibling, cycle 600)

This shipped as the winner of a DEEP fire that explored ONE concept — "play your
own piano into a living WebGPU-compute resonating body" — via two approaches.
The de-selected sibling **`1054-piano-flock`** (a 120k-particle WebGPU boids
flock you *conduct* with a pointer-attractor; flock centroid→grain-scrub,
dispersion→spread, speed→pitch, proximity→gain; spectral-flux onsets spawn
note-bursts) was strong and love-aligned (the lab's loved particle cluster:
130/236/262/321). Worth grafting here as a deepening:

- **Onset-driven seeding.** Borrow 1054's spectral-flux `OnsetMeter`: when the
  loaded recording has a transient, *inject reagent automatically* at a reader
  (or the last touch point) so the piano's own attacks plant blooms — the field
  would then visibly pulse with the music even without touch, while touch still
  overrides.
- **A second "conductor" reader mode.** Let one reader be a pointer-follow
  attractor (1054's gesture) instead of a fixed probe, so you can sweep a play
  head through the field like conducting — combining the paint+probe model with
  the flock's swirl gesture.
- **GPU-resident render.** Both pieces read the sim back each frame; a pure-GPU
  render pass (sampler on the storage texture) would let the RD grid grow past
  256² and free the CPU for grain scheduling.
