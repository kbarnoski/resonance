# 847 · Feedback Ecology II

A long-form, self-running feedback instrument whose **topology evolves on its own
over minutes**. This is **cycle-2 of [820 · Feedback Ecology](../820-feedback-ecology)**,
which queued exactly this in its own README: _"add Lorenz-attractor coupling weights
that drift over time."_

Where 820 was a coupled resonator network you steered with sliders, 847 takes its hands
off the wheel: a chaotic attractor weathers the coupling through bifurcations while
Hebbian edges strengthen-or-die, and it is rendered on the **GPU (raw WebGL2)** instead
of Canvas2D. No user input is required — minute 5 is genuinely not minute 0.

## What it is

It inherits **820's ear-safe Web Audio engine wholesale** (copied into `audio.ts`, not
imported across folders): eight high-Q `BiquadFilter → DelayNode → feedback GainNode`
resonators wired into a small-world coupling graph (ring backbone + cross-links), root
55 Hz (A1), every path ending in a `DynamicsCompressorNode` brick-wall limiter before a
master gain that defaults to 0.25.

On top of that engine sits the cycle-2 deepening — a **self-evolving topology** layer
(`evolution.ts`) and a **WebGL2 renderer** (`renderer.ts`).

## The deepening — how cycle-2 differs from 820

### 1. Lorenz attractor drift (the "weather")

A classic Lorenz system (σ=10, ρ=28, β=8/3; dt=0.005, 6 Euler sub-steps/frame for
stability) is integrated every animation frame. Its normalised coordinates become
**global modulation**, always passed through 820's clamped setters:

- **x → global coupling** — sweeps the network through bifurcations on its own: isolated
  pings ↔ mutual entrainment ↔ roaring drone, with nobody touching a slider.
- **y → self-feedback** — the "edge of chaos" amount, hovering the resonators near the
  Hopf boundary.
- **z → slow timbre/register** — a gentle global filter-Q and ±detune modulation.

Because the Lorenz system is aperiodic, the instrument never settles into a loop. It
**weathers** — audibly and visibly drifting through states over minutes. This is the
long-form generative core.

### 2. Hebbian adaptive edges (the network rewires itself)

Each edge carries a **live weight** that evolves every frame: when both endpoint nodes
are energetic the edge is potentiated (correlation-scaled, "fire together, wire
together"); idle edges decay toward a non-zero floor. _Seldom-used links die out,
heavily-used links strengthen._ The live weights feed the coupling gains, so the graph
literally re-wires itself over time — and you **see** it, because edge brightness in the
render is proportional to the live weight. Per-frame deltas are small and weights are
clamped to `[0.12, 1.0]`, so it never runs away.

### 3. Autonomous seeding

No input is required, so every ~5.5 s a gentle impulse (820's `injectImpulse`) is fired
into the **lowest-energy** node, keeping the ecology alive without overriding the
Lorenz/Hebbian dynamics that shape what happens. Tapping a node still perturbs it as a
nice-to-have, but it is not the primary interaction.

## GPU render (raw WebGL2, no three.js, no Canvas2D)

The jury hard-banned Canvas2D this cycle. `renderer.ts` is hand-written WebGL2:

- **Nodes** — additive point-sprite blobs; size + brightness ∝ node energy, hue per node
  (820's palette), drawn with a soft radial falloff in the fragment shader.
- **Edges** — GPU `LINES` geometry whose brightness/alpha ∝ **live Hebbian weight ×
  signal flow × global coupling**, so the viewer literally watches links strengthen and
  die.
- **Ping-pong FBO feedback trails** — each frame the previous accumulation texture is
  faded and fed back, then new geometry is drawn additively on top, so energy leaves
  luminous decaying trails. This is the "David Tudor feedback ecosystem" look that
  Canvas2D can't do cheaply — a real GPU technique.
- **Lorenz weather trace** — a faint drifting point cloud of recent attractor positions
  plus a background tint driven by the Lorenz z channel, so the autonomous drift is
  visible as well as audible.

Shaders are compiled/linked with error checks; VAOs/buffers/FBOs are created once; on
teardown the renderer deletes every program/buffer/VAO/texture/framebuffer and calls
`gl.getExtension("WEBGL_lose_context")?.loseContext()`.

## Ear-safety (inherited from 820, unchanged)

- `DynamicsCompressorNode` brick-wall limiter (threshold −8 dB, ratio 20, attack 1 ms,
  release 50 ms) before the master `GainNode` (default 0.25, capped at 0.3 in the UI).
- Self-feedback hard-clamped to **MAX_FB_GAIN = 0.88**, coupling to **MAX_COUPLING =
  0.35** — the Lorenz/Hebbian layer can only modulate _within_ these ceilings.
- `AudioContext` is created and `resume()`d only after the explicit **Awaken the
  Ecology** gesture (iOS-safe).
- Gentle 2-second ramp on start; an always-visible **panic mute** button.

## Graceful degradation

- If `canvas.getContext("webgl2")` returns null (or renderer init throws), a
  `text-rose-300` notice is shown **but the audio keeps running** — the sound is the
  point.
- If Web Audio is unavailable, a `text-rose-300` notice is shown instead.

## Files

- `page.tsx` — React component: gesture-gated start, the autonomous animation loop
  (Lorenz step → Hebbian step → clamped audio modulation → WebGL2 render), controls,
  graceful degradation, full teardown.
- `audio.ts` — 820's ear-safe engine, copied; plus `applyCouplingWeights` (per-edge live
  coupling) and `applyTimbre` (Lorenz-z Q/detune), both still routed through the clamps.
- `evolution.ts` — Lorenz integrator + Lorenz→modulation mapping + Hebbian edge plasticity.
- `renderer.ts` — raw WebGL2: shaders, ping-pong FBO trails, node/edge/Lorenz draws,
  resource teardown.

## Named references

- **E. N. Lorenz, "Deterministic Nonperiodic Flow," _Journal of the Atmospheric
  Sciences_ 20 (1963), 130–141** — the canonical chaotic attractor used here for the
  drifting "weather."
- **Adaptive / time-varying pulse-coupled oscillator networks** — Hebbian edge plasticity
  ("fire together, wire together"; seldom-used links die out, heavily-used links
  strengthen) as the mechanism for a self-rewiring coupling graph.
- **David Tudor — _Rainforest_ (1968), _Pulsers_ (1976)** — feedback ecosystems as
  compositional material (inherited lineage from 820).
- **Toshimaru Nakamura — no-input mixing board** — no-input = a feedback network with no
  external signal; the sound-world this instrument inhabits (inherited from 820).
