# 997 · Resonant Halls

> What if you could walk in **first person** through a cathedral of harmonic
> rooms — each room a key with its own acoustics — and stepping through a doorway
> is a key modulation you hear in the **reverb itself**?

A first-person walk through five connected 3D chambers laid out along the
**circle of fifths** (C → G → D → A → E). Each room runs its own
continuously-sounding just-intoned drone chord, each room has its own
synthesized acoustics, and crossing a doorway performs a real **pivot-chord key
modulation** you can hear in the changing reverb.

This is the deep extension of two prior lab builds: `992-dream-house`
(continuously-running just-intoned sine drones — never triggered notes) and
`995-kids-moon-trampoline` (the lab's first hand-rolled true-3D scene, no
three.js).

## How to walk it

- Press **Enter the hall** — this single gesture creates the AudioContext and
  fades the drone in (no autostart).
- **Drag to look** (pointer is the primary control — looking around is half the
  experience).
- **WASD** or the **arrow keys** to walk forward/back and strafe through the
  corridor of rooms.
- **Take the tour** auto-walks you through all five rooms with a slow gaze sweep
  for a hands-free demo; it loops back to the start at the apse. Any drag or key
  cancels the tour.
- Watch the HUD: the current room (e.g. *G major · hall*) and, while you're in a
  doorway, **→ modulating G → D**.

## The five rooms (circle of fifths)

| Room | Key | Tonic (JI) | Character | Reverb |
|------|-----|-----------|-----------|--------|
| 1 | C major | ~65 Hz | chapel | short, bright |
| 2 | G major | ~98 Hz | hall | medium |
| 3 | D major | ~73 Hz | nave | long, dark |
| 4 | A major | ~110 Hz | gallery | medium |
| 5 | E major | ~82 Hz | apse | longest, shimmering |

Each tonic is a just perfect fifth (×3/2) above its neighbour, octave-folded so
every drone root stays in the warm, felt-in-the-body low register (the master
lowpass at 6 kHz guards the top — never shrill). Accent **hue = fifthsIndex / 12**,
so kindred keys are kindred colors.

## Per-room acoustics (the headline)

Each room owns a **procedurally-synthesized impulse response** fed to its own
`ConvolverNode`:

- A dense **exponential-decay noise tail** whose length is the room's `decay`
  (1.1 s chapel → 4.6 s apse) and whose decay curve steepens for darker rooms.
- A sparse **early-reflection pattern** stamped up front, with reflection times
  and spread that scale with room size and pan across the stereo field — a small
  room has tight, early reflections; a tall nave has later, more spread-out ones.
- A **one-pole lowpass** smoothing pass that darkens big rooms (low `bright`) and
  leaves small rooms crisp.

So a small bright chapel rings short and present; a tall dark nave rings long and
distant. The IRs are built from a tiny deterministic LCG seeded per room, so they
are stable and hand-verifiable.

**Signal path per room:** sine oscillator bank (the JI chord) → per-room input
gain → `ConvolverNode` (its IR) → per-room **wet** gain (proximity-weighted) →
master bus. A smaller **dry** path keeps the nearest drone tactile. Master bus:
gain → lowpass (6 kHz) → compressor/limiter → destination (ear protection).

## Proximity → which room you hear

`computeRoomWeights(cameraZ)` places a **Gaussian well** at each room centre
(`z = i * spacing`) and returns normalized weights summing to 1. Those weights
ramp each room's wet/dry sends with `setTargetAtTime` (no clicks). The wells
overlap by design, so doorways **cross-fade** smoothly between two rooms.

## Doorway = pivot-chord modulation

This is the audible reward. The chord shape includes both **1/1 (root)** and
**3/2 (perfect fifth)**. Because each room's tonic is a just fifth above the last,
**the 3/2 fifth of room *i* is, in frequency, the root (1/1) of room *i+1*.**

During a crossing both rooms are audible, so that shared partial sounds as a
**held common tone** — a classic pivot — while the *other* tones of the departing
key fade and the arriving key's tones bloom. The modulation lands on something
continuous instead of a jump cut, and you hear it dissolve from one room's reverb
into the next. `computeCrossing(cameraZ)` drives the "→ modulating C → G" HUD
text whenever you're in the doorway band.

## Rendering

Hand-rolled 3D, **no three.js**. A single full-screen fragment shader
**raymarches an SDF corridor of box-rooms**: each room is a positive-inside
signed-distance box, unioned together with overlapping z half-extents so the
shared walls are open (the doorways). Interior sphere-tracing from the camera
finds the walls; shading adds a clerestory light, a volumetric doorway glow,
cathedral ribs, and colored distance haze in the room's accent.

The **first-person camera is hand-built** (the lookAt approach from
`995-kids-moon-trampoline`): camera position + yaw/pitch → forward vector →
`right = normalize(cross(fwd, up))`, `up = cross(right, fwd)`, passed as uniforms
to drive each ray's origin and direction. WASD moves along the flattened look
direction. If WebGL2 is unavailable, a graceful notice is shown.

## References / lineage

- **La Monte Young & Marian Zazeela — *Dream House*** (MELA Foundation, NYC):
  continuously-running just-intoned drones, sound as an inhabited environment, no
  triggered notes and no wrong notes.
- **Architectural-acoustics auralization:** convolution reverb built from a
  room's impulse response — here synthesized procedurally per room so each
  chamber has its own measurable "sound."
- **The circle of fifths** as a literal spatial floor-plan: adjacent rooms are a
  fifth apart, share a pivot common tone, and wear kindred colors.
