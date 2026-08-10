# 9464 · Astral

**The one question:** *What if you could fall INTO his music as a nebula of quantized light?*

Karel's real "Welcome Home" piano recording becomes a boundless cosmic
light-field — a living veil of ordered-dither light-grains that you fall into as
it slowly gathers itself toward a single point of light.

## What it is

Press **Begin the fall**. The recording loads and drives a WebGPU-compute
particle nebula rendered behind minimal chrome. A small readout in the corner
tracks elapsed time, the current phase (Drift → Gathering → Convergence →
Tunnel of light), and the convergence percentage, so the long-form evolution is
legible. A **live / offline** badge shows whether you're hearing the real
recording or the seeded synth stand-in, and a badge shows whether WebGPU compute
or the Canvas2D fallback is running.

## The technique

- **Onsets → spawns.** An `AnalyserNode` (fftSize 2048) taps the piano.
  Each frame we compute **spectral flux** — the sum of positive bin-to-bin
  magnitude increases — and threshold it against a running mean. Onsets emit
  fresh star-agents into a ~90k-particle storage buffer via a lock-free **ring
  emitter** (the sim uniform names a `[start, count)` window of indices to
  reseed — no atomics).
- **Curl-noise advection.** A WGSL **compute pass** integrates every agent
  through a divergence-free curl-noise flow field each frame.
- **Density → bloom → dither.** An additive point-splat accumulates particle
  density into an HDR (`rgba16float`) texture; a separable Gaussian blur adds
  bloom; a composite pass tone-maps the density, ramps it **deep indigo →
  violet → white-hot core**, and lays a **Bayer 8×8 ordered dither** over it so
  the cloud reads as a shifting field of quantized light-grains — the signature
  veil.
- **Long-form state.** A **convergence** parameter auto-ramps over ~3.5 minutes,
  biasing the flow field inward (plus a gentle rotation) so the diffuse swarm
  gathers into a converging **tunnel-to-light** and the curl amplitude quiets as
  order takes over. The piece at minute four is materially unlike minute zero. A
  slider lets you nudge the convergence forward by hand.
- **Loudness (RMS)** modulates the spawn rate and overall exposure — smoothly,
  never as a strobe.

## References

- **Robert Borghesi — *ASTRODITHER*** (audio-reactive WebGPU + ordered dithering
  + bloom, ~July 2026): the audio-reactive quantized-dither-veil aesthetic this
  piece is built around.
- **Brian Eno — long-form generative ambient**: the model for a slowly
  evolving, minutes-long arc that never repeats itself the same way.

## Honest caveats

- **WebGPU is the point.** The 90k-particle compute nebula needs WebGPU; where
  it's unavailable the piece falls back to a Canvas2D nebula (~3.6k agents on a
  low-res dithered grid). The fallback keeps the same mechanism and dither veil,
  but it is a stand-in, not the full experience.
- **Particle count is a budget, not a guarantee.** 90k points at full canvas
  resolution with a per-frame blur is comfortable on discrete GPUs and fine on
  most integrated ones at `low-power`; very weak GPUs may want a lower count.
- **Audio may be offline.** If the recording can't be fetched/decoded within
  ~4s, a seeded warm-drone synth stands in and drives the identical analysis, so
  the nebula always has onsets to spawn on. The badge tells you which you're
  hearing.
- **Photosensitive-safe.** All motion is smooth luminance drift — no flashing,
  no strobing. `prefers-reduced-motion` slows the field and tames the swings.
