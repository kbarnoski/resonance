**For**: kids (4+)

Flick a glowing double pendulum and watch it dance a never-the-same-twice aurora ribbon that sings a real chord progression that never exactly repeats.

---

## The one question

"What if a 4-year-old could flick a glowing DOUBLE PENDULUM and watch it dance a never-the-same-twice aurora ribbon, singing a real chord progression that never exactly repeats?"

## How to play (no reading required)

- Tap the big **Start** button (creates/resumes the AudioContext; requests tilt permission on iOS in the same tap).
- **Flick** anywhere on the screen — a fast swipe gives a big push, a tap a small one. Every flick adds visible energy and an immediate chime (<50ms).
- On a phone, **tilt** to gently bend the direction of gravity (optional — flicking is the whole game without it).
- Do nothing and after ~2 seconds the **auto-demo** re-flicks the pendulum, so even a hands-free glance both sees the aurora dancing and hears the chord within ~1s.
- There is no score, no timer, no "wrong" — it is a calm, bedtime-tolerable kaleidoscope that sings.

## The novelty — a REAL double pendulum (deterministic chaos)

This is the lab's first use of **chaotic double-pendulum dynamics**. `physics.ts` integrates the two-segment double-pendulum **Lagrangian equations of motion** (angles θ1, θ2 and angular velocities ω1, ω2) with a small fixed-step **RK4** integrator and light damping (so it eventually settles, then the auto-demo re-flicks it). The lower bob's path is the generative engine: a trajectory that is fully **deterministic** yet, because of **sensitive dependence on initial conditions**, is chaotic and never exactly repeats.

**Named reference:** the *double pendulum* / *deterministic chaos* — Lagrangian mechanics and sensitive dependence on initial conditions (the classic Lorenz "butterfly" intuition applied to a mechanical system). It is also a small nod to artificial life's idea of **open-ended novelty emerging from simple deterministic rules**.

## The three subsystems

1. **Chaotic double-pendulum physics** (`physics.ts`) — RK4-integrated Lagrangian EOM with damping; pure, headless-testable. The chaotic lower-bob path drives everything else.
2. **Functional-harmony synth** (`harmony.ts` + `audio.ts`) — a genuine diatonic **I–vi–IV–V** progression in C major advances every ~4s. The bob's height is **snapped to a chord tone of the live chord**, so the melody is always consonant but never loops (NOT pentatonic "no wrong notes" — V really contains the leading-tone B). New notes trigger on the bob's swing **zero-crossings** (clean musical onsets, not per-frame spam). Warm soft-mallet/glass chimes (sine + detuned partials, ≥10ms attack), plus an always-on drone pad so it is never silent.
3. **Canvas2D additive-glow renderer** (`render.ts`) — two glowing rods + bobs, a long fading **aurora trail** of the lower bob in a teal→violet→gold gradient by speed, soft bloom on each note, using `'lighter'` compositing. Not a flat full-screen shader.

## Kids-safe audio chain (exact)

`masterGain (~0.26) → BiquadFilter lowpass (~6500Hz) → DynamicsCompressor(threshold −10, ratio 20:1) → destination`. An AnalyserNode taps the master only; nothing connects to `destination` directly. Soft attacks, gentle decays, no loud transients.

## Files

- `page.tsx` — React client component: Start gate, pointer/flick + tilt input, animation loop, auto-demo, teardown.
- `physics.ts` — pure double-pendulum RK4 physics + energy + flick helpers.
- `harmony.ts` — pure functional-harmony progression + chord-tone snapping.
- `audio.ts` — Web Audio engine (chime voices, drone pad, kids-safe master chain).
- `render.ts` — Canvas2D additive-glow aurora renderer.
- `chaos.test.ts` — headless self-test (no DOM): RK4 boundedness, energy conservation, in-key snapping.

## Self-test

`chaos.test.ts` runs headlessly under `npm test` (vitest) and asserts: (1) the RK4 step stays finite & bounded over thousands of damped steps; (2) the **undamped** integrator conserves total energy to <2% over a short run (a real integrator sanity check); (3) `snapToChord` always returns a frequency inside the current chord's tone set across all four chords and the full input range — never out of key — plus a check that the four chords are genuinely distinct triads (V contains B, C major does not).

## Ambition criteria hit

- **Never-used technique:** chaotic double-pendulum (Lagrangian RK4) dynamics.
- **≥3 subsystems:** chaotic physics + functional-harmony synth + additive-glow Canvas2D renderer.
- **Named reference:** the double pendulum / deterministic chaos (Lagrangian mechanics; sensitive dependence on initial conditions).
