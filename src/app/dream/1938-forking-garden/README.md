# 1938 · Forking Garden

A composition as a **navigable, branching version-tree** where every alternate
future you ever grew is playing at once — and the path you are standing on rings
loudest.

## The one question

> What if a composition were a garden where ALL your alternate futures sound at
> once — every branch you ever grew, playing together, with the path you're
> standing on ringing loudest?

Compositional memory made total: your entire decision-history is visible,
permanent and re-enterable — **and simultaneously audible**.

## The mechanic

- The piece is a **TREE** of nodes. Each node holds one short **phrase**
  (3–6 notes, in D Dorian).
- A **cursor** marks the "current" node. There is a **root**.
- **Commit** a buffered phrase → it becomes a **child** of the cursor and the
  cursor moves onto it (extends the current branch).
- Navigate the cursor back to any earlier node and commit → a **FORK**: a new
  sibling branch sprouts. **Nothing is ever deleted.**

## Playback model — ALL leaves sound at once

Every leaf of the tree is a **voice** that loops its own root→leaf path, so the
whole garden of alternate histories sounds together (Borges: all outcomes happen
at once). The root→**cursor** path is **foregrounded** — louder and brighter,
with a wider filter — while the other futures sit quietly in a shared bed over a
soft **D** drone.

To keep the texture bounded and consonant (never a runaway mud), only the
**nearest ~7 leaves** to the cursor sound at any moment (plus the foreground
path), giving **≤ 8 melodic voices + 1 drone**. Master gain is capped at
**0.18**, ramped up on the first gesture.

## Pitch material

**D Dorian** — `D E F G A B C`, a 7-note **modal** set. Deliberately **NOT
pentatonic**. All voices share the mode and a common D root, so simultaneous
branches stay consonant. Warm synth: triangle + sine detuned pair → short
envelope → per-voice lowpass.

## Input

Input is the **Gamepad API** (polled every animation frame), with a **full
keyboard fallback**. The active input (`gamepad` / `keyboard` / `ghost`) is shown
live in the HUD.

| Action | Gamepad | Keyboard |
| --- | --- | --- |
| Cursor → parent | Left stick up | ↑ / W |
| Cursor → child | Left stick down | ↓ / S |
| Cursor → prev/next sibling | Left stick left / right | ← → / A D |
| Tap scale degree (1, 2, 3, 5) | A / B / X / Y | 1 / 2 / 3 / 4 |
| Commit (forks if not a leaf) | Right shoulder / trigger | Space / Enter |

## Ghost gardener (self-demo)

With **no input for ~5.5 s**, a **deterministic** ghost gardener takes over: it
builds phrases, extends branches and periodically jumps back to **fork** new
branches. The river-delta visibly grows and the all-futures texture audibly
thickens as more voices join — with zero human input. Any real key or gamepad
press hands control straight back. (A passive / headless load with no gamepad
sees the ghost + keyboard fallback, so both are first-class.)

## References

- **Jorge Luis Borges, "The Garden of Forking Paths" (1941)** — a labyrinth in
  which all outcomes coexist in time.
- **NIME 2026** framing of **non-linear music** — a piece divided into parts
  whose order is chosen at execution time.

## Determinism & safety

- No `Math.random` / `Date.now` / `new Date`. Randomness is a seeded
  **mulberry32**; time is `performance.now()` + `AudioContext.currentTime`.
- No new deps, no CDN, no network. Pure `"use client"` React + Web Audio +
  Canvas2D + Gamepad API.
- Full teardown on unmount: `cancelAnimationFrame`, `removeEventListener`
  (keys + `gamepadconnected`), `AudioContext.close()`.
- Degrades gracefully: no gamepad → keyboard + ghost; if audio can't start the
  garden still renders (an "audio unavailable" note shows).

## What to deepen next

- Per-branch timbre drift by depth (older futures darker / dustier).
- A "prune to a shadow" gesture that mutes a branch without deleting it.
- Rhythmic phrases (dotted / rest patterns) instead of even steps.
- Save + replay a chosen path as a linear render you can export.

### Folded in from the two parallel explorations (cycle 822 DEEP fan)

This shipped as the strongest of three parallel realizations of one concept
("Forking Paths"). The best ideas from the two that were explored and banked:

- **A "solo the branch you stand on" toggle** (from `1936-forking-paths`, the
  keyboard/single-path realization): flip between *all-futures-at-once* (this
  build's default) and *single-lit-path* — where only root→cursor sounds and a
  gold read-head sweeps it. The all-at-once texture is the surprise; the
  single-path mode is the legible, focused way to actually *compose* a line.
  Shipping both as a toggle would give the piece both a garden and a pen.
- **A 3D "fly the sky" spatial skin + device-tilt input** (from
  `1940-forking-flight`, the three.js/tilt realization): the same tree as a
  constellation you navigate by tilting a phone, with proximity-audible mixing
  (nearer stars louder). This is the phone-native way in — the one input Karel
  can actually *play* at a 06:30 glance — and a natural cycle-2 skin over this
  same tree model.
