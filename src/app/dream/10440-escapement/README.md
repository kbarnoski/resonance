# 10440 · Escapement

## The one question

**What if a clock's ESCAPEMENT — the swinging pendulum whose pallets alternately
catch and release an escape wheel — were a percussion instrument, its tick and
tock the downbeat and off-beat, with secondary hammers driven off the wheel
adding interlocking subdivisions?**

This is the **ESCAPEMENT / PENDULUM** realization of the three-way *Clockwork*
theme: rhythm-first, with **absolutely no pitched drone**. The visible mechanism
*is* the score — you watch the pallet about to catch.

## How the catch / release → tick / tock mapping works

A pendulum swings under an angle `θ = amp·sin(phase) + bias`. Its phase
accumulates at angular frequency `ω`, and each time the pendulum passes through
**center** (every time `phase` crosses a multiple of π) one pallet of the anchor
**releases** the escape wheel and it steps forward exactly **one tooth** — the
classic ratcheting "tick" motion you can see in the wheel.

- Crossing in one direction → the left pallet **catches**: a low wood/anvil
  **tick** (the downbeat).
- Crossing in the other direction → the right pallet **releases**: a brighter,
  drier **tock** (the off-beat).

Two escape events per full swing period, so tick and tock alternate as a steady
mechanical pulse. The anchor visibly rocks with the pendulum, and the pallet
that is currently dipping into the teeth glints — you can see the catch coming.

## The secondary-hammer coprime subdivisions

The escape wheel keeps an integer **tooth counter**. Off that advancing count,
three secondary hammers strike three different resonant bodies on **coprime
divisions** of the tooth stream:

| hammer | fires every | body (inharmonic ping) |
| ------ | ----------- | ---------------------- |
| 0      | 3rd tooth   | low anvil `[1, 2.76, 5.4]` |
| 1      | 5th tooth   | mid bell `[1, 3.19, 4.71]` |
| 2      | 7th tooth   | high plate `[1, 2.43, 6.08]` |

Because 3, 5 and 7 are pairwise coprime, they only all realign every
**3·5·7 = 105 teeth**. The subdivisions therefore *phase-drift* against each
other continuously: the interlocking pattern at minute five is genuinely unlike
minute one, with no loop point in earshot.

## The tilt → gravity → tempo coupling

Primary input is **device tilt** (`DeviceOrientationEvent`), read as a change to
the effective gravity on the pendulum — tilt the clock and, like a real pendulum
on an incline, it runs fast or slow:

- **beta** (front/back) → effective **gravity** → `ω = ω_min + g²·(ω_max − ω_min)`
  → the **tempo**. Forward tilt speeds it up, back tilt slows it down.
- **gamma** (left/right) → a swing **bias** that modulates the half-period
  within each swing, so tick and tock spacing goes uneven — a limping groove.

On iOS 13+ the code calls `DeviceOrientationEvent.requestPermission()` from
inside the Start button's tap handler.

## The granular density → rhythm framing

Tempo is a continuum between two ends of the same events:

- A **slow** pendulum (low gravity, `ω ≈ 2.2`) gives spacious, **countable**
  tick-tock — discrete rhythm you can follow with a finger.
- A **fast** pendulum (high gravity, `ω ≈ 48`) crowds the strikes toward a
  continuous **mechanical buzz** — the same discrete events packed so tightly
  they read as texture.

The readout labels the span *spacious → countable → driving → buzzing*, and each
strike is softened as the density climbs so the buzz melts smoothly into
texture rather than clipping.

## Named reference

The **pendulum clock escapement — Christiaan Huygens, 1657** — and the
verge/anchor escapement lineage. The whole instrument is an argument that
*mechanical rhythm falls straight out of escapement geometry*: the tick-tock and
its subdivisions are not composed, they are the direct acoustic shadow of the
gear-train's counting.

## Input / degrade ladder

Every stage must work on a **muted phone with no sensors**. The visual animates
immediately on Start with zero input; audio is deferred until the first real
gesture (autoplay policy) and the auto stage stays silent.

1. **Tilt** — if `DeviceOrientationEvent` permission is granted and events
   arrive, beta/gamma drive gravity + bias.
2. **Pointer drag** — dragging on the canvas: vertical = gravity/tempo,
   horizontal = groove bias. This also opens the audio gate.
3. **Seeded auto-conductor** — after ~1s with no input, a deterministic driver
   seeded with `mulberry32(0x10440)` gently sweeps gravity between spacious and
   busy so the mechanism visibly swings and ticks on its own, **silently**,
   badged *"auto — tilt or drag to drive"*.

If WebGL2 is unavailable, an on-brand notice shows and the escapement keeps
ticking (audio survives). No `Math.random` / `Date.now` / `new Date()` in
executable code — time is `performance.now()`, randomness is the seeded PRNG.

## Rendering & sound

- **WebGL2** fragment-shader SDF scene: escape wheel with ratchet teeth, rocking
  anchor + pallet jewels, pendulum rod + engraved bob, three hammers with
  resonant plates, and brief soft strike-flashes. Palette is precise clockwork —
  **brass / steel / graphite on a dark ground**. No strobe: swing is smooth,
  flashes decay gently (≤3 Hz).
- **Web Audio**, percussion only, through the shared `createSafeMaster` limiter:
  a pitch-dropping wood knock for tick vs tock and fast-decay inharmonic metal
  pings for the hammers, each with a seeded noise-click transient. Nothing
  sustains — there is no oscillator bed.

## Next-cycle deepening

- **True mechanical coupling of amplitude:** feed the escape impulse back into
  the pendulum so the swing amplitude (and thus the wheel's step size and the
  hammer velocities) breathes with the drive — a real escapement's
  self-regulation, heard as dynamics.
- **Selectable trains:** let the coprime set be chosen (3/5/7 vs 2/3/7 vs
  4/5/9), and add a second, slower "strike train" that counts whole revolutions
  into an occasional bell — a downbeat above the downbeat.
- **Recoil vs deadbeat:** offer the two historical escapement geometries as two
  distinct grooves (recoil nudges the wheel backward on catch, a subtle
  flam before each tick).
