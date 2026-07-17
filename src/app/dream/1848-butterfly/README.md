# 1848 · Butterfly — a chaotic double-pendulum music box

**The one question:** _What if a piece of music were the trajectory of a
chaotic physical system — so that nudging the starting point by a hair produces
a completely different song (the butterfly effect), yet it's fully
deterministic and never repeats?_

## What it is

A real **double pendulum** — two coupled rigid rods swinging under gravity — is
integrated in real time and read as a generative score. The double pendulum is
the textbook example of **deterministic chaos**: its equations of motion are
exact and repeatable, but the motion is so sensitive to initial conditions that
it is unpredictable in practice and never falls into a loop. So the piece is
genuinely different at minute five than at second five. There is no script,
no random number generator driving the notes — only physics.

## How the mapping works

- **Integrator.** State is `[θ1, ω1, θ2, ω2]` (two joint angles and angular
  velocities). The exact double-pendulum equations of motion are advanced with
  classic **4th-order Runge–Kutta** (`physics.ts`), 12 substeps per animation
  frame for numerical stability at high energy.
- **Sequencer.** The plane is divided into vertical **pitch-band gridlines**.
  Each time the pendulum **tip crosses a gridline**, a note fires. Pitch = the
  band's scale degree on a **major pentatonic** scale (so chaotic timing still
  sounds musical). **Angular velocity** `|ω1|+|ω2|` → note dynamics. The
  **second bob's** horizontal position → stereo pan; its height → timbre
  (brightness of a marimba-ish sine partial). Notes are rate-limited and voice-
  capped so dense crossings never turn to mush (`audio.ts`).
- **Sound.** Short triangle+sine plucks with fast exponential decay through a
  master compressor, a procedural plate reverb, and a short delay. Master gain
  is clamped to 0.28.

## The butterfly-effect twin

On launch a **second pendulum** starts **0.001 rad** away from the first —
otherwise identical. It's drawn faintly. For the first several seconds the two
overlap almost perfectly, then they peel apart and, within ~10–20 s, wander
onto completely different orbits. The on-screen **twin divergence** readout is
the distance between the two tips: watch it sit near zero, then explode. That is
sensitive dependence on initial conditions, made visible (and, since only the
main pendulum sounds, you hear the song the twin _would not_ have played).

## Visual substrate

Raw **WebGL2** (no three.js). A **ping-pong feedback texture** accumulates the
tip's path with **additive blending** and a slow per-frame fade, so the chaotic
orbit paints a glowing, Lissajous-like long-exposure figure — a physics-demo /
Ikeda-plot vibe rather than a psychedelic shader field. The live rods and bobs
are drawn on top each frame; the main tip bob gets the one hot accent, the trail
and twin use the violet ramp. Luminance changes are slow and smooth (no
strobing), and `prefers-reduced-motion` shortens the trail and lowers its
intensity. If WebGL2 is unavailable, a **Canvas2D** decaying-trail fallback
keeps the piece visible.

## Interaction

- **Start** launches from a deterministic seeded initial condition (a small
  `mulberry32` PRNG, not `Math.random`), so it's immediately moving and
  sounding — it self-demos headless.
- **Drag** anywhere on the field to set new initial angles; **release** to
  relaunch. A tiny change in where you release sends the whole piece down a
  different path.

## Named references

- The **double pendulum** as a canonical chaotic mechanical system.
- Edward **Lorenz**, the **"butterfly effect"** — sensitive dependence on
  initial conditions (1963).
- Henri **Poincaré**, who first recognized that fully deterministic systems can
  be practically unpredictable (the three-body problem, ~1890) — the root of
  modern chaos theory.

## Next-cycle deepening

- Voice the twin at a whisper in the opposite ear so the divergence becomes an
  audible canon that drifts out of unison.
- Add a **Poincaré-section** inset (sample `θ2, ω2` when `θ1 = 0`) to expose the
  strange structure underneath the sound.
- Let the user perturb a _running_ system by an adjustable ε and A/B the two
  resulting songs.
- Map total mechanical energy to reverb size / tempo so the ear can track the
  system slowly bleeding or gaining energy.
