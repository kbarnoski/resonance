# Pendulum Harp — design notes

**For**: kids (3+)  
**Route**: `/dream/164-kids-pendulum-harp`  
**Cycle**: 192  
**Status**: demoable

---

## The idea

Five pendulums hang from a bar at the top of the canvas. Each has a
different length — and because pendulum period scales with √L, shorter
pendulums swing faster. The five different periods create an emergent
polyrhythm: no two pendulums are in phase for long, and the pattern never
repeats in a simple loop.

Each time a pendulum's bob passes through the bottom of its arc it plucks
a pentatonic note. Longer pendulum = lower note = bigger bob (BANDIMAL rule
that Karel has loved across six prior kids prototypes).

The child doesn't need to understand any of this. They tap a pendulum,
it swings and makes a sound. Tap more pendulums, more sounds overlap.
Watch the pattern drift apart and converge again.

---

## Physics

Simple pendulum ODE: θ'' = −(g/L)·sin(θ) − 0.12·θ'

- `g = 1800 px/s²` (visual gravity, chosen so swings take 1–3 s)
- Light linear damping keeps bobs swinging for ~20 s without taps
- Hard clamp at ±1.15 rad (≈66°) with 0.85 restitution prevents bobs from flying horizontal
- Zero-crossing detection: `sign(θ) changes AND |ω| > 0.35 rad/s`
- Note throttle: 200 ms minimum gap per pendulum (prevents double-trigger on slow crossings)

Pendulum lengths (as fraction of screen height):

| Index | Color   | Pitch | L / H  | Period ≈ |
|-------|---------|-------|--------|----------|
| 0     | violet  | C3    | 0.42   | 3.0 s    |
| 1     | emerald | E3    | 0.32   | 2.6 s    |
| 2     | amber   | G3    | 0.22   | 2.2 s    |
| 3     | rose    | A3    | 0.14   | 1.7 s    |
| 4     | cyan    | C4    | 0.08   | 1.3 s    |

---

## Audio

Two-oscillator pair per note (±5¢ detuning) → sine waves with fast attack
(12 ms) and exponential decay (0.40–0.60 s, lower = longer). Bell-like tone.
Soft C3+G3 ambient pad runs from start at gain 0.005.

---

## Interaction

Tap any pendulum bob or the area near it → angular velocity pushed toward
center by 2.2 rad/s. If no bob within 3× bob radius, pushes the nearest
pendulum. This means a 4yo tapping anywhere near a string will always get
a response.

---

## What's new to the kids zone

163 prior kids prototypes play notes on tap (or drag, or draw). This is
the first where the **physics of the canvas is the instrument** — the child
doesn't trigger notes directly; they add energy to a physical system that
then triggers notes on its own schedule. The timing is set by gravity and
string length, not by finger position. Tapping changes the amplitude of an
existing autonomous process.

This is the kids equivalent of `105-pluck-field` (loved ❤️) — physical
string resonance — but the strings are *pendulums* that can be energized
rather than a static grid that must be directly struck.

The emergent polyrhythm from five incommensurable periods connects to
Karel's love of `98-kids-drum-circle` ❤️ (rhythm without a score) and
`133-kids-ripple-pond` ❤️ (physics makes music autonomously).
