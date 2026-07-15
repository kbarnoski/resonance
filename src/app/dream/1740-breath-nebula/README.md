# 1740 — Breath Nebula

*state: cosmic-ambient nebula-tide · pole: cosmic-ambient*

## The question

**What if your breath were the tide of a living cosmic nebula — inhale blooms a
million-point stellar cloud outward into light, exhale lets it collapse back into
cold filaments?**

You breathe toward the microphone. The in-breath pushes a vast cloud of GPU
points outward and lights their cores warm-white; the out-breath pulls them back
into cold violet filaments. With no microphone the whole thing keeps breathing on
its own.

## What it is (the technique)

This piece's identity is **WebGPU**. Nothing is drawn on the CPU.

- **A persistent particle storage buffer** of hundreds of thousands of points
  (adaptive: ~500k on a capable GPU, ~150k under `prefers-reduced-motion` or a
  small storage budget, clamped to the adapter's `maxStorageBufferBindingSize`).
  Each particle is `pos(vec3) + age(f32)` and `vel(vec3) + seed(f32)` — a 32-byte
  struct.
- **A WGSL compute shader** (`nebula.wgsl.ts → advectWGSL`) runs every frame and
  advects each particle through a **3-D curl-noise flow field**: the analytic
  curl (finite-difference) of a value-noise *vector potential*, so the flow is
  near-divergence-free — it makes filaments and sheets, not sinks. On top of the
  flow it applies a **signed breath radial force** (outward on the in-breath,
  inward on the out-breath), a slow nebular swirl about Y, damping, and Euler
  integration. Particles age and, past a per-particle seeded lifetime (or if they
  escape the bound sphere), **respawn on the emitter shell**. The field is a pure
  function of position + a time uniform — no JS randomness reaches the GPU.
- **A render pipeline** (`renderWGSL`) reads the *same* buffer read-only in the
  vertex stage and expands each particle into a camera-facing quad
  (`draw(6, count)` — instanced), sized and coloured by local speed and the
  breath amplitude, drawn additively as a soft round point. Colour sweeps deep
  indigo → violet → warm-white bloom cores. The camera slowly auto-orbits on a
  deterministic frame clock.

### Breath drive

A smoothed **low-band RMS envelope** from the mic (`_shared/use-mic-analyser`,
bands 0–1) becomes the breath amplitude; its per-frame rise/fall sign sets the
radial force. With **no mic** (headless, denied, or unsupported) a deterministic
**~0.1 Hz sine over the integer frame counter** drives the same tide, so the
piece is alive and audible at an unattended review.

### Audio

Cosmic-ambient, deliberately **not** a static consonant just-intonation wash:

- a soft evolving **pad** built from inharmonic partials (`1, 2.01, 3.03, 4.98,
  6.02`) in detuned pairs with slow per-partial detune LFOs → beating + shimmer;
- a filtered-noise **wind** whose gain and bandpass frequency rise on the
  in-breath;
- sparse **bell** pings (Risset-ish inharmonic partials) struck on the out-breath.

Master graph: `pad + wind + bells → DynamicsCompressor → gain(0.15) → destination`,
with an exponential fade-in. The mic is analyser-only and never reaches the
destination.

## Graceful degrade

- **No WebGPU** (`navigator.gpu` missing / adapter null): a readable
  `text-muted-foreground` notice ("This piece needs WebGPU — try Chrome/Edge or
  Safari 18+"), the **audio keeps running**, and a minimal DOM radial-glow pulses
  with the breath signal. No elaborate Canvas2D fallback (Canvas2D is
  diversity-banned this cycle).
- **Mic denied**: a `text-destructive` notice, and the deterministic ghost breath
  keeps everything running.
- WebGPU init is wrapped in try/catch; the page compiles and renders the notice
  on a machine with no WebGPU and no mic without throwing.

## Safety & determinism

- **No strobe** — only slow luminance drift; the brightness bloom follows the
  ~0.1 Hz breath. `prefers-reduced-motion` slows the camera orbit, cuts the flow
  strength, and lowers particle count + brightness.
- **Determinism** — no `Math.random` / `Date` / `performance.now` in the
  state/audio/visual update path. All animation is driven by an integer frame
  counter; the only randomness is fixed-seed **mulberry32** particle seeding (and
  a mulberry32-filled noise buffer for the wind). `ctx.currentTime` is used only
  for Web Audio ramps/scheduling.

## References

- **Robert Borghesi — *ASTRODITHER*** (WebGPU + TSL audio-reactive experiment,
  published 2026-07-01 on webgpu.com): the freshest reference — a page that "is
  all signal until the music starts pushing it around." The breath-as-driver here
  is the same idea: an inert field that only comes alive under the signal.
- **KAYAC engineering — WebGPU compute-shader curl-noise demo** (1M particles on
  an M1): the direct technical ancestor of the compute-advected particle buffer +
  analytic curl-noise flow.
- **Refik Anadol — data-cloud / *Machine Hallucinations*** aesthetic: the
  boundless, luminous point-cloud read the palette and bloom aim for.

## Honest self-assessment

**Meets the brief on identity and structure.** It is a genuine WebGPU
compute+render piece: a persistent particle storage buffer advected by a WGSL
curl-noise compute shader with a breath radial force, respawn on a seeded emitter
shell, and an instanced additive render pass — driven by mic low-band RMS with a
deterministic ghost-breath fallback and the full audio bed. House style, palette,
safety, and degrade paths are all wired.

**Known limits / risks:**

- **Untested WGSL/GPU at runtime.** This sandbox has no GPU and no
  `@webgpu/types` installed, so the shaders and pipeline were written by
  inspection against the repo's existing WebGPU pieces (1348, 1554) and could not
  be executed. The curl finite-difference `e=0.1` and the flow/force/damping
  constants are educated first guesses and will likely want tuning on real
  hardware; point size (`0.006` NDC base) and additive bloom density may need
  adjustment for the chosen particle count.
- **Two AudioContexts** — the mic hook opens its own context (input only) while
  `NebulaAudio` owns the output context. Fine on Chrome/Edge/Safari but worth a
  glance on stricter mobile autoplay policies.
- **Breath radial-force gain (`×200`) is calibrated for the deterministic
  oscillator**; a loud/quiet room may over- or under-drive the tide, so the mic
  gain (`1.6`) and that constant are the first knobs to touch if live breath feels
  weak or jumpy.
