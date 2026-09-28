# Murmuration

**Status**: demoable

Stir a living flock of your own recording. Roughly 140,000 self-driven agents
(each a position and a heading, moving at constant speed) obey a mean-field
Vicsek alignment rule on the GPU: every frame each agent turns toward the mean
heading of its local neighbourhood and then takes a random noise kick of
amplitude η. Your two hands (webcam + MediaPipe) **are** that noise term — calm
hands keep η low and the flock falls into coherent flight; fast stirring drives
η past the critical value and the flock collapses into turbulence. The flock's
global **order parameter** φ = |mean of the unit heading vectors| is reduced on
the GPU and conducts Karel's real piano: high φ (coherent) plays clear, dry and
present; low φ (turbulent) dissolves the take into a diffuse, reverberant,
spectrally-blurred cloud. When there is no camera the piece runs a labelled
autonomous demo drive so the mechanism reads before you ever raise your hands.

## References

- **Vicsek, T., Czirók, A., Ben-Jacob, E., Cohen, I. & Shochet, O. (1995)**,
  *Novel type of phase transition in a system of self-driven particles*,
  Physical Review Letters 75(6):1226. The order parameter
  φ = |⟨e^{iθ}⟩| (magnitude of the mean of unit heading vectors) and the
  noise-driven order↔disorder phase transition are taken directly from this
  model; the hands act as the noise term η that Vicsek varies as the control
  parameter.
- **Reynolds, C. W. (1987)**, *Flocks, Herds and Schools: A Distributed
  Behavioral Model*, SIGGRAPH '87. The boids steering vocabulary
  (alignment / cohesion / separation) that the local-neighbourhood alignment
  and hand-driven advection draw on.

## Design notes

### The order↔turbulence→clarity mapping

- **Simulation (GPU compute).** Agents live in a WGSL storage buffer
  (`pos.xy`, `heading`, `turbulence`). Each frame runs three compute passes:
  (1) *clear* the atomic flow-field; (2) *deposit* — every agent atomic-adds its
  unit heading vector into its flow-field cell; (3) *move* — every agent reads
  the 3×3 neighbourhood mean heading, steers toward it (`alignStrength`), adds
  the Vicsek noise η, applies hand advection + local turbulence + a positional
  push, advances at constant speed with toroidal wrap, and atomic-adds its new
  heading into one of 1,024 order-parameter buckets.
- **Order parameter.** φ = |Σ unit-heading| / N is computed from the bucket
  buffer via a tiny (8 KB), throttled (every 5th frame) `mapAsync` readback that
  never stalls the pipeline. It is smoothed on the CPU before it touches audio.
- **η = your hands.** Hand-centre velocity between frames is the stirring
  strength; summed hand speed sets the global noise amplitude η
  (`0.12 + stir·1.05`, capped at 2.8). Near each hand the agents also get local
  advection and a positional shove, so you can carve vortices.
- **φ → audio.** The take splits into a DRY/clear path and a WET/diffuse path
  (a `ConvolverNode` whose impulse response is a decaying ~2 s slice of the
  *same* recording → a `BiquadFilterNode` lowpass that closes as turbulence
  rises → a `StereoPannerNode` that sways wider with disorder). An equal-power
  crossfade (`dry = cos(angle)`, `wet = sin(angle)`, `angle = (1−φ)·π/2`) moves
  between them: high φ → mostly dry/clear/present, low φ → mostly
  wet/dark/blurred. Playback rate stays 1.0 (pitch-clean). Everything terminates
  in `safeMaster.input`; nothing touches `ctx.destination`.
- **Palette.** A thermal blackbody ramp keyed to per-agent turbulence:
  near-black ink where the flock is sparse, deep ember-crimson for coherent
  flow, gold in dense aligned streams, white-hot where vorticity spikes.
  Rendered as additive HDR point-splats onto ping-pong `rgba16float` targets
  with frame-feedback trails, then tonemapped to the canvas.

### Graceful degradation

- **No WebGPU** (`navigator.gpu` missing or `requestAdapter()` null) → a reduced
  Canvas2D flock (`N_CPU ≈ 2,600` agents on a coarse alignment grid) with the
  banner *"WebGPU unavailable — reduced preview"*. The hands → φ → audio chain is
  identical.
- **No camera / permission denied / model-load fail / before you enable it** →
  a labelled autonomous demo drive: two virtual hands on Lissajous paths with a
  time-varying stir speed, so φ visibly rises and falls and the audio breathes
  between clear and diffuse. The status line reads `demo · autonomous stirring`,
  distinct from `tracking · live` and the `text-destructive` lost state.

### What is / isn't verifiable headless

- **Verifiable statically:** TypeScript types, the audio topology (real-catalog
  source only, no oscillator/synth, every path into `safeMaster.input`, none to
  `ctx.destination`), the demo-drive fallback existing from the start, the
  tracking status line, the WebGPU→Canvas2D degradation branch, and no API
  route.
- **Not verifiable headless:** actual WebGPU device creation and shader
  compilation, real MediaPipe hand tracking, live audio decode of Karel's takes,
  and the felt quality of the order↔turbulence→clarity coupling — these need a
  real browser with a GPU, a webcam and audio output. The demo drive exists
  specifically so the full chain animates even where those are absent.
