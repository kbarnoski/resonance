# 1542 — Flow Tracer

**The one question:** What if your own body's **motion**, seen through the
webcam, smeared the air into blooming **LSD-style colour tracers** you can hear?

`state: LSD · pole: ecstatic / embodied / kinetic`

## What it is

A webcam-driven audio-visual instrument. It computes a **dense frame-difference /
normal-flow motion field** by hand — no MediaPipe, no ML, just canvas pixel
diffing — on a 64×36 grid. Every cell gets a temporal brightness delta plus a
local spatial gradient, combined via the brightness-constancy constraint
(`v = -Iₜ · ∇I / |∇I|²`) into a 2-D motion vector. That field is the **sole
controller**.

The field advects an iridescent violet dye/particle field inside a **Canvas2D
ping-pong feedback trail**: each frame the previous frame is re-drawn slightly
zoomed and rotated at just-under-1 alpha, so wherever you move, colour blooms and
streaks along the motion vectors and lags behind as a positive-afterimage
**tracer**. Curl in the flow lets faint spirals/lattices emerge in the smear
(a Klüver form-constant nod, not required).

**See = hear:** total motion energy sets grain **density + brightness**; the
horizontal motion **centroid** pans the stereo image; the vertical centroid sets
**pitch** (up = higher, over a pentatonic-minor set). A soft sustaining drone bed
means it is never silent. The visual bloom and the audio grain are the same
event.

## How to use

1. Click **Start — camera + sound** (this is the gesture that creates/resumes the
   `AudioContext` and requests the webcam).
2. Move. Wave a hand, sway, dance — the harder and faster you move, the denser
   and brighter the blooms and grains.
3. Move toward the left/right of frame to pan the sound; move up in frame to
   raise the pitch.
4. **Design notes** (top-right) reveals an in-page explanation.

If the camera is denied or unavailable, a **seeded synthetic drifting motion
field** drives the exact same visuals and audio (a `text-destructive` notice
appears, but the piece keeps blooming and sounding — never blank, never silent).

## Named references

- **LSD positive-afterimage "tracers"** — the phenomenology of moving objects
  leaving lagging colour trails; the ping-pong feedback is a literal model of it.
- **Heinrich Klüver's four form constants** (spirals, lattices/gratings, tunnels,
  cobwebs) — the curl in the advection field lets these hints surface in the smear.
- **Memo Akten** — optical-flow-driven interactive visual work.
- **Bileam Tschepe (elekktronaut)** — feedback-trail / ping-pong aesthetic.

Optical flow already exists elsewhere in the lab, so it is **not** claimed as
novel here. The fresh axis is the optical-flow motion field as a **played
instrument** that simultaneously blooms *and* sounds — one weld, driven purely by
body motion.

## Technique notes

- **Motion field:** 64×36, mirrored webcam, luma per cell, central-difference
  spatial gradients, temporal delta, normal-flow estimate with light temporal
  smoothing. Energy and centroid are motion-magnitude-weighted.
- **Feedback:** two Canvas2D layers (visible + offscreen buffer). Each frame:
  clear → draw decayed/zoomed/rotated buffer → additive dye streaks + core blooms
  → copy back to buffer. Pure 2D canvas, no WebGL/three/SVG.
- **Audio:** granular/additive voice pool (≤ 14 voices), each grain a short
  sine/triangle burst with a 2× additive shimmer partial, `StereoPanner`,
  AD envelope. Master gain ≤ 0.18 through a `DynamicsCompressor`. Drone bed = 3
  detuned low oscillators through a slow (0.06 Hz) filter LFO.
- **Safety:** no strobe — all luminance change is smooth trail decay well under
  3 Hz. Respects `prefers-reduced-motion` (slower drift, gentler feedback, lower
  grain rate).
- **Determinism:** seeded `mulberry32` PRNG + `performance.now()` only. No
  `Math.random`, `Date.now`, or `new Date` anywhere.
- **Teardown:** on unmount, camera tracks stop, drone/LFO oscillators stop, the
  `AudioContext` closes, and the rAF loop is cancelled.

## Known limitations

- Normal flow only recovers motion **along the brightness gradient**, so flat,
  evenly-lit regions read as still (the aperture problem). It reads gesture and
  edges beautifully but is not true dense Lucas-Kanade optical flow.
- The 64×36 grid trades spatial precision for a rock-steady frame rate; very fine
  finger motion is coarsely quantized.
- Low-contrast or dim rooms produce a weaker field — good ambient light helps.
- The feedback tunnel drifts hue continuously; on very long sessions the palette
  slowly cycles through the whole violet→magenta→indigo band by design.
