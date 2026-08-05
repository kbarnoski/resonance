# 6744 · Chua — an audio-rate strange-attractor synthesizer

**The one question:** _What if you could HEAR a strange attractor at audio rate —
listen to a chaotic dynamical system integrate itself sample-by-sample, and steer
it live through the route to chaos (pure tone → period-doubling → full chaos)?_

The waveform **is** the trajectory of **Chua's circuit** — a continuous chaotic
ODE — integrated **once per audio sample inside an AudioWorkletProcessor** on the
audio render thread. The state variables become the sound; a single knob walks the
period-doubling route to chaos. The phase portrait is drawn as a cloud of recycled
`<div>` dots — pure DOM, zero GPU.

---

## How to play

1. Press **Start — listen to the attractor** (audio only begins after this gesture).
   A seeded auto-demo is already sweeping the bifurcation knob, so before you touch
   anything you both see the phase-space breathe and (after Start) hear the route to
   chaos on its own.
2. **route to chaos · α** — the big slider. This is Chua's `alpha`, the bifurcation
   parameter. Low = a stable limit cycle (near-pure tone). Push it up and
   subharmonics fold in (period-2, period-4), then it breaks into the broadband,
   pitched **double-scroll chaos**.
3. **pitch** — scales the integration step `dt`, sliding the fundamental ~72–290 Hz.
4. **breakpoint** — the slope of the piecewise-linear Chua diode (the nonlinearity),
   which reshapes the timbre and the attractor's geometry.
5. **output** — master gain.
6. **Freeze orbit (A/B)** — holds the current regime so you can compare two settings.

**Keyboard:** `1`–`5` jump to orbits (limit cycle → period-2 → period-4 → chaos →
double scroll); `←/→` nudge the route-to-chaos knob; `↑/↓` nudge pitch; `space` /
`f` freeze. Any control interaction stops the auto-demo.

**Readouts:** current regime label, `α`, fundamental `ƒ₀`, live largest-Lyapunov
`λ₁`, and a violet **chaos meter**.

---

## The DSP model — Chua's circuit

Dimensionless state equations (Chua, 1983), with the piecewise-linear Chua diode
`f(x)`:

```
dx/dt = alpha * ( y - x - f(x) )
dy/dt = x - y + z
dz/dt = -beta * y
f(x)  = m1*x + 0.5*(m0 - m1) * ( |x + 1| - |x - 1| )
```

Classic double-scroll constants: `alpha ≈ 15.6`, `beta = 28`, `m0 = -1.143`,
`m1 = -0.714`. Integrated with fixed-step **RK4**. The bifurcation knob maps to
`alpha ∈ [6.8, 16.2]`, holding `beta = 28`: as `alpha` rises the system passes a
Hopf bifurcation into a period-1 limit cycle, then a Feigenbaum period-doubling
cascade (period-2, period-4, …), then single-scroll chaos, then the two-lobe
double-scroll. That progression is the audible payoff: **tone → subharmonics →
chaos-band**, all from one knob.

- **Output:** `x → left`, `y → right`, each passed through a one-pole DC blocker and
  a `tanh` soft-clip with a final hard limit, so it is always safe to listen to.
- **Pitch:** the fundamental tracks the y–z rotation rate `ω = √beta`; `ƒ₀ ≈
  sampleRate · dt · √beta / 2π`. The pitch slider sets `dt`.
- **Chaos meter (real Lyapunov):** a shadow trajectory offset by `10⁻⁷` is integrated
  in lock-step, its separation renormalised every 32 samples, and the accumulated
  log-divergence gives a live estimate of the **largest Lyapunov exponent** — positive
  means genuine sensitive dependence, i.e. real chaos.

## The AudioWorklet mechanic

The whole point is that the physical model runs on the **audio render thread**, not
the main thread. `worklet.ts` exports the processor as a plain **string**; the page
wraps it in a `Blob`, `URL.createObjectURL`s it, and
`await ctx.audioWorklet.addModule(url)`, then builds an
`AudioWorkletNode(ctx, 'chua-processor', { outputChannelCount: [2] })`. Parameters
(`alpha`, `dt`, `m0`, `gain`, plus constant `beta`, `m1`) are `parameterDescriptors`
driven with `setTargetAtTime`. The processor `port.postMessage`s a **downsampled
(x, y, z) snapshot** (1 of every 48 samples, ~220-point batches, transferable buffer)
up to the main thread — that snapshot is what the DOM phase-space plots. **No
SharedArrayBuffer** (COOP/COEP headers are not available here).

## The visual — pure DOM, zero GPU

No `<canvas>`, no `<svg>`, no WebGL. A fixed pool of ~360 absolutely-positioned
`<div>` dots is recycled every frame: each maps a point of the (x, y, z) trajectory
into a gently tumbling projection via CSS `transform: translate()`, with age-faded
`opacity` and a depth-mapped **violet** lightness. Before Start (and in the fallback)
the same ring buffer is filled by a main-thread RK4 integrator; once the worklet is
live it is filled from the posted snapshots.

## Degrade behaviour

If `audioContext.audioWorklet` is undefined (older Safari) **or** `addModule`
throws, the page shows an on-brand `text-destructive` notice — _"audio-worklet
unavailable — running a reduced main-thread model"_ — and falls back to a
main-thread oscillator bank: a fundamental oscillator, two subharmonic sines whose
gains rise with the period-doubling onset, and a **seeded** band-passed noise layer
whose gain rises with the chaos meter. So the tone → subharmonics → chaos-band
progression is still audible without an AudioWorklet. The DOM phase-space keeps
running in every case; the page never white-screens.

Determinism throughout: no `Math.random` (seeded `mulberry32`), no `Date.now()` /
`new Date()`; timing via `performance.now()` and `requestAnimationFrame`. Strobe-safe
(smooth trajectory motion, no fast flicker) and honours `prefers-reduced-motion` by
slowing the auto-sweep and dot tumble. Clean unmount cancels rAF, stops/disconnects
all nodes, closes the `AudioContext`, and revokes the Blob URL.

## Named references

- **Leon O. Chua**, _Chua's circuit_ (1983) — the canonical double-scroll chaotic
  circuit.
- **Rick Bidlack**, "Chaotic Systems as Simple (but Complex) Compositional
  Algorithms," _Computer Music Journal_ 16(3), 1992.
- **Edward Ott**, _Chaos in Dynamical Systems_ — the period-doubling (Feigenbaum)
  route to chaos and Lyapunov exponents.
- **Web Audio API** — the AudioWorklet render-thread processing model.

## Next-cycle deepening

Give the snapshot ring an explicit Poincaré-section mode (plot only the `y = 0, ẏ > 0`
crossings) so the period-doubling cascade becomes literally countable on screen — one
dot, two dots, four dots, then a smear — synchronised to the audible subharmonics.
Then let two frozen A/B orbits sound simultaneously in opposite ears for a direct
chaos-vs-limit-cycle comparison, and expose `beta` as a second bifurcation axis to
open the full two-parameter map.
