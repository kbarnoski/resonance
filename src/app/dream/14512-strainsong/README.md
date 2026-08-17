# 14512 · Strainsong

**The one question:** *What if a physical material's DEFORMATION conducted your
catalog — you tip the world and a stretching, compressing membrane of your own
music tenses and slackens under gravity, its strain field voicing which
recordings sound?*

A soft-body membrane of Karel's 16 recordings fills the screen. Tip your phone
and gravity pours the sheet toward the low corner: it stretches uphill (tension)
and bunches downhill (compression). Each region of the sheet is one recording,
and the **local strain** — not a fader — sets that track's loudness and
brightness. Tension is bright and loud; compression is dark and quiet. The
physics is the mixing engine.

## What it is

- A **mass-spring soft body**: a 28×28 lattice (784 point masses) linked by
  structural and shear springs, pinned along its whole border, integrated with
  **Verlet + Position-Based Dynamics** constraint relaxation (Jakobsen 2001).
- Rendered in **raw WebGL2** — hand-written GLSL, a dynamic vertex buffer
  re-uploaded every frame from the physics positions, a static index buffer, a
  faint lattice overlay pass. No Canvas2D, no three.js.
- **Achromatic grayscale strain-map**: per-vertex signed strain drives
  brightness. Rest sits at a low mid-gray; compression renders toward black;
  tension renders toward white. No color hues anywhere in the art.

## How to use it

1. Press **Begin — let the membrane sound**. Audio needs the click to start, and
   iOS needs it to grant the motion sensor.
2. **On a phone:** tilt. Gravity follows `beta` / `gamma`, so the sheet pours and
   strains toward whichever corner you drop. Pool strain into one corner and its
   recordings swell.
3. **On desktop (no tilt sensor):** it runs autonomously — the gravity vector
   slowly orbits and the live audio energy ripples the membrane. **A / W / S / D**
   nudge gravity so you can drive it by hand.
4. The **voiced now** panel lists the recordings currently under the most
   tension — the taut, loud ones — with a live strain bar each.
5. **Read the design notes** (top-right) reveals the same explanation in-app.

## The physics → audio design

- Each spring reports a **signed strain** = `(length − rest) / rest`
  (positive = tension, negative = compression). Strains are averaged onto each
  vertex (for color) and into a **4×4 grid of 16 regions** (for audio).
- The membrane maps **1:1 onto Karel's 16 recordings** (13 *Welcome Home* + 3
  *Snowflake*): region `ry*4 + rx` voices `REAL_TRACKS[i]`.
- Per region, the chain is `BufferSource(loop) → GainNode → lowpass Biquad →
  safeMaster`. Strain drives both ends: tension lifts **gain** (≈ silent at rest,
  swelling under stretch) and opens the **lowpass cutoff** (≈ 200 Hz when
  compressed → ≈ 6 kHz when taut). So a compressed region is dark and near-silent;
  a stretched region is bright and present.
- A single **shared normalization** (1 / running peak strain) scales both the
  shader color and the audio mix, so *what you see is what you hear* regardless of
  how hard the sheet is loaded.

## Audio

Every sound is one of Karel's **real** recordings, loaded progressively via the
shared `loadRealTrackBuffer` / `REAL_TRACKS` helpers and routed through the single
`createSafeMaster` ear-safety bus. No oscillators, no synthesis, no generated
tones. The live analyser tap on the tamed mix feeds the autonomous perturbation
and a subtle global brightness pulse.

## Named references

- **BioSonix / physics-based sonification** (ISMIR 2026 line — sonifying
  deformation from tool interactions). The core wager here is the same: physical
  strain, not a slider, is the control signal.
- **"Tonal Cognition in Sonification"** (arXiv:2408.17012) — on how listeners
  read musical/tonal structure out of a sonified physical field.

## Graceful degradation

- **No tilt sensor / permission denied** → autonomous orbit mode plus an on-screen
  note; A/W/S/D still steer gravity.
- **WebGL2 unavailable** → a `text-destructive` notice, the membrane simply
  doesn't render, and the recordings still play.
- **Audio blocked / a track fails to load** → a `text-destructive` notice; other
  regions keep playing (each load is independent).
- **Unmount** → rAF cancelled, all sources stopped, GL buffers/VAO/program
  disposed, context lost, `safeMaster` disconnected, `ctx.close()`, listeners
  removed.

## Honest "not yet verified" notes

- **Not tested on real hardware.** The tilt → gravity mapping (`gamma/40`,
  `(45 − beta)/40`) is a reasonable default but was not calibrated on a physical
  phone; the neutral hold angle and axis signs may need per-device tuning. The
  autonomous desktop path is the reliable demo path.
- **Physics constants** (gravity magnitude, spring stiffness, PBD iterations)
  were tuned by reasoning, not by watching it run. The shared auto-normalization
  is deliberately there to keep the strain field expressive even if the absolute
  constants are off — but the *feel* of settling/rippling hasn't been eyeballed.
- **16 simultaneous piano loops.** Strain-gating keeps most regions near-silent
  so only the taut handful are audible, and the safeMaster limiter caps peaks,
  but the busiest moments haven't been listened to for muddiness.
- Loading all 16 recordings up front is progressive but network-heavy on a cold
  cache; regions stay silent until their buffer arrives.
