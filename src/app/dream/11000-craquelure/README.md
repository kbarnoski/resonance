# 11000 · Craquelure

*A self-composing score that writes itself the way a glaze cracks — a living web
of fractures spreading across a near-black plane, each new crack ringing a note,
so the crack-map **is** the evolving music.*

Pale ivory / frost / pale-violet hairlines craze across a dark ground like fine
porcelain or frost on glass. It self-demos on arrival; press **Sound on** to add
the voice; tap the plane to seed your own crack.

---

## The technique — Jared Tarbell's *Substrate*

The growth is **agent-based crack propagation**, the algorithm Jared Tarbell
named and published as **Substrate**:

- <https://www.complexification.net/gallery/substrate/>

This is *not* a PDE, a cellular automaton, a mass-spring lattice, or a mechanism
simulation. It is a colony of **line-agents**. Each crack has a position and a
fixed heading and advances **one step per tick**. A coarse spatial grid — a
`Uint16Array` over a downsampled 210×210 resolution — stores the quantized
crack-angle that first *claimed* each cell, so collisions are O(1) lookups.

A crack **dies** when it either
1. runs off the plane, or
2. reaches a cell already claimed by another crack at a *sufficiently different*
   angle (folded angular difference > 14°; near-collinear cracks merge instead).

On death it **spawns 1–2 fresh cracks** at a **perpendicular** heading (±90°
with a few degrees of jitter), seeded one cell ahead of a random point on the
existing web — Tarbell's `findStart`. This is how the web keeps branching into
finer and finer crazing. Cracks that can't find open space die silently, and a
keep-alive floor guarantees the web never stalls.

Three subsystems, all live at once:
1. **Substrate crack engine** (`substrate.ts`) — the agent colony + grid + the
   long-form fill/dissolve/reseed cycle.
2. **SVG-DOM renderer** — every crack is a growing `<polyline>` (created lazily
   on its first claimed cell, extended each frame). DOM, not canvas/WebGL.
3. **Sonification** (`audio.ts`) — Web Audio voices + sub-bass drone, routed
   through the shared ear-safety master.

## How the sonification maps

- **Crack birth → struck note.** A triangle oscillator through a per-voice
  attack/decay gain envelope and a lowpass that opens with register.
  - *Pitch* is chosen from a fixed **Lydian** mode, indexed by the crack's
    heading angle (0–360° → seven scale degrees).
  - *Register (octave)* is chosen by the crack's **generation depth**: seed
    cracks ring low, deep descendants ring high.
- **Crack death-collision → quieter damped tone** (a sine an octave lower, long
  decay).
- **Sub-bass drone pad** — root + fifth, detuned sine pairs breathing beneath
  the web for depth.
- Polyphony is bounded (voice-steal past 12 simultaneous voices) and strikes are
  rate-limited (~45 ms floor) so the piece stays meditative, never a machine gun.

Audio autostarts only after a gesture: the visual is alive on mount while the
`AudioContext` stays suspended; **Sound on** resumes it and starts the drone.

## Long-form / stateful design

The plane slowly fills over ~2 minutes. When claimed-cell density passes ~28%
the whole web **dissolves** — the strokes fade over ~12 s — and the engine
**reseeds** from scratch with a new random set of seed cracks. So the piece is
genuinely different at minute five than at minute one: a different glaze each
time, never a fixed loop.

## Input

Generative-autonomous (it self-demos on mount). The one interaction: a
**click/tap anywhere** seeds a new crack at that point, its heading radiating
from the plane centre — letting a visitor nudge the growth.

## Next-cycle deepening

Give each crack a faint **sand-painter grain** (Tarbell's other Substrate
signature): as a crack advances, deposit a low-opacity translucent smear of
color perpendicular to its heading, so the plane reads not just as hairlines but
as watercolor-washed regions between them — and let the *area* of each freshly
enclosed region trigger a soft swelling pad tone, so closed cells sing as well as
the lines that draw them.

---

*Palette: ivory / frost / pale-violet on near-black. Cool, restrained,
hypnagogic-geometric, cosmic-ambient. Art about altered, meditative states of
perception through light and sound.*
