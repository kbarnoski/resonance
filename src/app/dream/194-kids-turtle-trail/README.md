# Turtle Trail

**For**: kids (3+) · **Prototype**: `194-kids-turtle-trail` · **Cycle**: 226

Four glowing turtles wander a dark canvas, each leaving a colored trail. When a turtle
crosses another turtle's trail, it plays a pentatonic note. Music emerges from spatial
paths — no tapping required.

Tap anywhere to drop a glowing treat (a golden pellet). All four turtles steer toward
it for 3.5 seconds; their converging paths create trail intersections and a brief burst
of notes.

---

## Design

**Four notes / four colors:**
- Violet · C3 (130.8 Hz)
- Teal · E3 (164.8 Hz)
- Amber · G3 (196 Hz)
- Rose · A3 (220 Hz)

C-major pentatonic — no dissonant combinations possible. All four notes together form
a C6/9 chord, so dense crossing events always sound consonant.

**Wandering physics:** each turtle's heading changes by ±0.11 rad/frame (random walk)
with a center-seeking correction when it nears a canvas edge. At 1.4 CSS px/frame
(~84 px/s at 60 fps), trajectories are organic and slightly unpredictable.

**Crossing detection:** every other frame, each turtle checks if its current head
position is within 11 CSS px of any trail segment belonging to the other three turtles
(stride-4 sampling; the most recent 30 trail points are skipped to avoid false
detections near a shared starting area). Per-turtle cooldown: 700 ms.

**Food pellet:** places a target that all turtles steer toward (heading correction
×0.09/frame) for 3.5 s. Converging paths → multiple crossings → musical burst.

**Audio:** triangle oscillators + 2.0 s impulse-response reverb. Per note:
`setValueAtTime(0.28) → exponentialRampToValueAtTime(0.001, +0.85s)`. Ambient
C3+G3 sine drone at gain 0.018 (barely felt, keeps the canvas from feeling silent).

---

## What's genuinely new

**Trail crossing = note** is an interaction model that doesn't exist elsewhere in the
sandbox. Every other prototype triggers notes from a tap position (where you touch),
an audio signal (frequency or amplitude), or a scheduled timer. Here the note is fired
by a spatial relationship between two paths drawn over time — the geometry IS the music.

**Autonomous before first touch.** The turtles move from the moment the canvas loads.
A child can watch for 10–20 seconds before touching anything and already see the trails
building. When a natural crossing happens (roughly every 10–20 s at rest), it plays a
note. The app isn't waiting for input.

---

## Live session feel

The food mechanic creates intentional musical events that feel like drum fills: tap →
turtles converge → chord burst → scatter → back to sparse wander. Repeat as desired.
Holding multiple quick taps chains bursts. Letting it run without tapping gives
a slow, meditative ambient stream.

---

## Polish ideas

- Mic mode: RMS amplitude → turtle speed (loud = faster → more crossings per second)
- Clear trails: long-press or double-tap to erase all trail history and respawn
- Turtle count slider (2–6): fewer = sparser, more = denser collisions
- Self-crossing: a turtle crossing its own older trail plays at lower octave (C2/E2/G2/A2)
- Sparkle burst at crossing point (small particle emit where intersection occurs)
