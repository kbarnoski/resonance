# 2688 · Orrery of Resonances

**What if you PLAYED music by physically swinging your phone** — the accelerometer
drives a little gravitational system (an "orrery") whose bodies fall into
**orbital resonances**, and those resonances literally become the musical
intervals you hear, so consonance emerges when the orbits lock and drifts
microtonal when you destabilise them?

## What it does

Four bodies orbit a central star in a 2D central-gravity simulation. Each body is
a sustained oscillator (Web Audio). The phone is the instrument: **DeviceMotion**
acceleration and its jerk (the "whip" of a swing) inject energy into the system.
Everything is drawn on **Canvas2D** — glowing bodies, trails, faint orbit rings,
and bright "resonance threads" that light up between locked pairs with their ratio
label (e.g. `3:2`).

## The orbital-resonance → interval mapping

- Each body's **mean motion** `n = √(GM/a³)` (its orbital frequency, derived from
  the live semi-major axis `a` via the vis-viva equation) is read straight out as
  a pitch: `freq = 110 Hz × (n / n_outer)`. The outermost, slowest body is the
  tonic drone; inner bodies ride above it.
- When two adjacent orbits drift near a **small-integer period ratio** (2:1, 3:2,
  4:3, 5:3, 5:4, 6:5, 3:1), a gentle **resonance-capture** force applies equal and
  opposite tangential accelerations that drive the ratio toward exact
  commensurability — the same negative-feedback trapping that captures real moons
  into **mean-motion resonance**. Inside a lock, the frequency ratio *is* that
  same integer ratio, so you hear a **just interval** — consonance emerges from
  gravity, not from a scale.
- **Nothing is quantized.** Pitch is a continuous readout of the dynamics. Swing
  hard and the orbits gain energy and eccentricity, the ratios slide off simple
  integers, and the pitches drift **microtonal and beating**. Ease off and the
  capture force + mild eccentricity damping pull the chain back into lock. A live
  "temperature" (distance from lock) opens a low-pass filter, so chaos is bright
  and consonance is warm.

## Named reference

The **Laplace resonance** of Jupiter's moons **Io–Europa–Ganymede**, whose orbital
periods sit in a **4:2:1** mean-motion chain. The bodies here are seeded slightly
off such a chain so capture audibly pulls them into lock in the first seconds.

## Controls

- **Start · unlock sound & motion** — required user gesture; unlocks the
  AudioContext and calls `DeviceMotionEvent.requestPermission()` on iOS.
- **Swing / tilt the phone** — primary input. Magnitude + jerk = injected energy.
- **Drag the canvas** (desktop) — pointer velocity acts as the swing vector.
- **Design notes** — in-app overlay summarising this file.

## Fallback behaviour (degrades gracefully)

- **No motion sensor / permission denied:** an on-brand notice appears and pointer
  drag drives the swing instead.
- **Seeded idle autopilot:** with zero interaction a deterministic
  `mulberry32`-seeded "breathing" swing gently pushes the system toward and away
  from resonance, so the piece is alive the moment it loads — a reviewer opening
  it on a phone at 06:30 hears it play itself. Any real input switches autopilot
  off; pausing lets it settle back into resonance.

## Determinism & hygiene

All randomness is seeded (`mulberry32`, seed `0x2688`); time comes from
`performance.now()` / rAF timestamps; the sim runs on a fixed timestep with
softening. Listeners, the AudioContext, and the animation frame are all cleaned up
on unmount. Self-contained: no cross-prototype imports, no network, no new deps.
