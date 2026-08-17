# 14784 — Nave

Room, not a mixer. Walk around inside a cathedral built from one of Karel's own
recordings and hear the piano ring off the real walls — a tight slap-back near a
pillar, a wide bloom in the centre of the nave — because the acoustics are
**computed from where you are standing**, not mixed with a fader. One recording,
spatialised through true image-source early reflections that recompute as the
listener moves.

## How to move

- **Pointer to look** — move the pointer to glance around the interior (yaw +
  pitch parallax).
- **Drag to walk** — press and drag: horizontal drag turns your heading, drag up
  to walk forward down the nave, drag down to step back. Position is clamped
  inside the nave and away from the pillars.
- **Recording** — a small dropdown (Welcome Home + Snowflake) picks which of
  Karel's real pieces sounds the room. That is the source, not a fader bank.

No keyboard, no MIDI, no fader bank, no gain controller — pointer / drag only.

## The image-source acoustic model

The nave is a **shoebox**: `x ∈ [-7, 7]`, `y ∈ [0, 22]`, `z ∈ [0, 54]` metres.
The piano sits near the altar at `(0, 6, 50)`; the listener's head is at
`y = 5.5`.

**First-order image sources.** The source is mirrored across each of the six
walls to produce six image sources (Allen & Berkley, 1979):

| wall        | image position          |
| ----------- | ----------------------- |
| left  x=-7  | `(-14 - Sx, Sy, Sz)`    |
| right x=+7  | `( 14 - Sx, Sy, Sz)`    |
| floor y=0   | `(Sx, -Sy, Sz)`         |
| ceiling y=22| `(Sx, 44 - Sy, Sz)`     |
| back  z=0   | `(Sx, Sy, -Sz)`         |
| front z=54  | `(Sx, Sy, 108 - Sz)`    |

**Each path is one branch of the Web Audio graph.** The dry/direct sound is
branch 0 (order 0); the six images are branches 1–6 (order 1). Every branch is:

```
AudioBufferSourceNode(loop)
  → DelayNode(distance / 343 m·s⁻¹)     // extra path length as delay
  → GainNode(reflⁿ · min(1, 2 / distance)) // 1/d spherical spreading, refl = 0.62
  → StereoPannerNode(azimuth of image relative to heading)
  → safeMaster.input
```

On every move the distance, delay, gain and pan of all seven branches are
recomputed from the listener's position and heading, and written with
`setTargetAtTime` (τ ≈ 40–50 ms) so nothing zippers.

**Why moving changes the sound.** When you crowd the left wall or a pillar, that
wall's image is suddenly close — short delay, high gain, hard-panned — a tight
slap-back. In the open centre every image is far and balanced, so the early
field spreads wide. The geometry produces the effect; there is no fader.

**Late field.** A `ConvolverNode` is fed a synthesized decaying-noise impulse
response (RT60 ≈ 3.4 s, a short early gap then exponential decay) — this is the
acoustic *model*, not the music. Its wet level rises toward the open centre of
the nave (`0.16 → 0.50`) and drops near walls/pillars, so the centre blooms
while the edges stay dry and reflective. This mirrors **RoomAcoustiC++** (2026):
geometric image-source early reflections combined with a feedback-delay-network
late tail.

All audio is routed through `_shared/visionary/safeMaster` (high-shelf cut,
lowpass safety cap, brick-wall limiter) — never straight to `ctx.destination`.

## The visuals

Raw **WebGL2** full-screen fragment shader raymarching the nave interior: a
shoebox SDF for the walls (`-sdBox`, positive inside), z-repeated capped
cylinders for the receding columns, an emissive **rose window** on the front
wall, and clerestory windows high on both side walls. As you walk, the camera
position moves through the nave and the geometry parallaxes.

The light is **full-chromatic stained glass**: the rose window sweeps the whole
hue wheel (twelve petals, radial tracery), the clerestory windows cast many hues
down the nave keyed to their `z` position, and full-spectrum light shafts bloom
toward the window with hue spread across the beam. Faint gold **glints** mark the
walls at each image source's reflection point (the intersection of the
listener→image segment with its wall), so the acoustic model is legible.

**Safety.** Luminance drift is a single ~0.2 Hz sine; audio energy is heavily
smoothed (τ over ~1 s) before it touches brightness — no fast flicker, no strobe,
well under 3 Hz.

## Degradation

- **No WebGL2** → an on-brand notice; nothing crashes.
- **Audio load failure** → a `text-destructive` message ("the nave stands, but
  silent") while the nave still renders and remains walkable.

## References

- **Allen, J. B. & Berkley, D. A. (1979).** *Image method for efficiently
  simulating small-room acoustics.* JASA 65(4). — the mirror-image early
  reflection model this piece implements directly.
- **RoomAcoustiC++ (2026).** Open-source real-time room acoustic model combining
  geometric image-source early reflections with a feedback-delay-network late
  tail. — the early-plus-late architecture followed here (image-source branches +
  convolution bloom whose wetness tracks room openness).

## Files

- `page.tsx` — the whole prototype: image-source Web Audio engine
  (`makeNaveAudio`), WebGL2 nave raymarcher (`makeNaveRenderer`), pointer-look /
  drag-to-walk locomotion, and the house-style chrome.
