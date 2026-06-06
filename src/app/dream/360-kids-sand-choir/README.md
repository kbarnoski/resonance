# 360 · Kids Sand Choir

**The one question:** What if a 4-year-old could pour streams of glowing colored
sand that pile into dunes by *tilting* the iPad — and every grain that comes to
rest on a singing string plays a note, so the shape of the sand pile you build
*is* the song?

Route: `/dream/360-kids-sand-choir`

## What it is

A fullscreen falling-sand toy. A spout at the top continuously drips warm grains
(amber / ochre / coral / rose / pale-gold) onto a deep-indigo field. Seven
horizontal "harp strings" cross the lower two-thirds of the screen. Tilt the
tablet and the dunes flow and reshape; wherever a grain settles onto a string,
that string plucks a soft note. Build a tall dune over the low strings and you
get a low drone; let sand cascade across all seven and you get a rippling arpeggio.
The sculpture and the song are the same object.

## Design (one paragraph)

The core is a **falling-sand granular cellular automaton** on a 180×120 grid
(`sand.ts`): each cell is empty or a single colored grain, and every frame —
scanning *against* the gravity direction so a grain advances at most one cell —
each grain tries to move straight in the gravity direction, then tries the two
diagonal-down cells in randomized order, which is what makes sand slump into
natural slopes. **Gravity comes from device tilt** (`page.tsx`): `deviceorientation`
β/γ become a smoothed 2D gravity vector that is quantized to a dominant fall axis
plus a diagonal bias, so tipping the world flows the dunes left/right/down.
**Sonification** (`audio.ts`): the seven strings are tuned to **D-Dorian**
(D E F G A B C, low→high by row); when a grain comes to rest on a string the CA
emits a settle event and the page plucks a pre-rendered **Karplus–Strong** string
(pitched by row, stereo-panned by grain x, with an 80 ms per-string refractory so
avalanches don't machine-gun). A soft always-on D+A triangle pad keeps it from
ever being silent, and the entire mix runs through a brick-wall
`DynamicsCompressor` limiter (safe-sounds rule). **Render** (`gl.ts`): the CA grid
is uploaded to an RGBA8 texture each frame and drawn by a hand-written GLSL ES 3.00
(`#version 300 es`) fragment shader — warm grains over an indigo gradient with
matte alpha-over glowing strings (gold→violet, soft flash on pluck; no additive
bloom, per the lab's anti-glow house style).

## Subsystems integrated (≥3)

1. **Falling-sand CA sim** — `sand.ts` (grid, gravity-quantized step, diagonal slip, spout, settle events).
2. **Tilt→gravity input + fallbacks** — `deviceorientation` with iOS `requestPermission`, pointer-drag fallback, and a hands-free auto-sway.
3. **Grain→string D-Dorian sonification** — Karplus–Strong plucks + ambient pad + brick-wall limiter (`audio.ts`).
4. **WebGL2 render** — per-frame texture upload + GLSL ES 3.00 shader (`gl.ts`).

## Ambition criteria

- **#1 — never-used-technique (lab-first):** this is the lab's first
  **falling-sand granular cellular automaton** (the "powder game" / Noita /
  Sandspiel family).
- **#2 — ≥3 subsystems:** four, listed above.
- **#3 — named references:** **Max Bittker's *Sandspiel*** and the
  **Noita / "powder game" falling-sand cellular-automaton tradition** for the
  CA; **Karplus & Strong, "Digital Synthesis of Plucked-String and Drum Timbres"
  (Computer Music Journal, 1983)** for the pluck voice.

## Kids design rules

No reading required to play (icon Start button, color/shape, not text). Single
big circular Start (160px, ≥64px tap target) creates the `AudioContext` and
requests tilt permission inside the same tap gesture (iOS-safe). Immediate
response, no spinners, no fail state. Always-on ambient pad so it is never
silent. All transients pass through the limiter so it can never get loud/harsh.
Bold saturated warm grains on a deep-indigo field.

## Degrade gracefully + self-demo

- iOS 13+: `DeviceOrientationEvent.requestPermission()` is called inside the
  Start tap; `AudioContext` is created in the same gesture.
- Permission denied / no sensor → readable `text-rose-300` notice **plus** a
  pointer-drag fallback (dragging tilts the gravity vector) **and** a gentle
  auto-sway so the dunes keep flowing and the strings keep plucking with no
  hands — a phone reviewer who never grants sensors still sees and hears it play.
- No WebGL2 → readable `text-rose-300` notice; audio keeps running.

## Typography notes

Title `text-3xl`/`sm:text-4xl` (≥`text-xl`). Body copy ≥`text-base` (16px).
Primary text `text-white/95`, secondary `text-white/75`, all sensor/error
notices `text-rose-300` (never dimmed). Buttons are `min-h-[44px]` with
`px-4 py-2.5`; the main Start control is a 160px circle. A "Read the design
notes" link opens an in-page notes panel. Monospace is used for the notes body,
matching the Resonance dark-theme house style.

## Unverified surface (honest note)

Built in a sandbox with **no real device tilt and no GPU**. The following are
unverified on hardware: the exact `deviceorientation` β/γ → gravity mapping and
its feel on a real tablet; whether the 180×120 CA sustains 60fps on a phone GPU;
and the precise shader output / color rendering. The CA logic, audio graph, and
fallbacks are written to be correct but have not been run end-to-end here.
`npm run build` is owned by the orchestrator; `node_modules` is absent in this
sandbox so a local typecheck could not be run.
