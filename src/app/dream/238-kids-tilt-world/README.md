**For**: kids (4+)

What if a 4-year-old could TILT the iPad to roll a glowing marble across a 3D musical hill-world, ringing notes — no tapping the screen?

## How to play

1. Tap the big **Tilt to play** button (this also lets iOS ask for motion permission and wakes up the sound).
2. **Tilt the iPad** — the glowing marble rolls in whatever direction you lean it, like a real ball on a tray. Tilt back to send it the other way.
3. Roll the marble onto the **colored glowing pads** scattered around the hills. Each one rings a soft bell and bursts into sparkles.
4. There is no score, no losing, no "wrong" note — every pad is part of the same happy scale, so it always sounds nice.

No reading needed. If you can lean a tablet, you can play.

## The tech

- **three.js 3D world** (not a flat 2D canvas): a `PerspectiveCamera` looks down at a gently undulating, warm-lit landscape built from a sine-bump height field, with a glowing marble, glowing note pads, sparkle bursts, and a faint marble trail. The camera gently follows the marble.
- **Tilt input**: `DeviceOrientation` `beta`/`gamma` become an acceleration vector. The marble integrates velocity with rolling friction and a clamped top speed, plus real **downhill gravity** along the surface gradient — so hills and valleys actually steer the ball (simple marble physics, LocoRoco-style).
- **Spatial audio**: each pad plays a clean note through a `StereoPannerNode` that pans left/right based on the marble's on-screen x position — so the sound follows the ball across the world. Notes are a soft triangle + sine partial (a gentle bell), with `setTargetAtTime` attack/decay so there are no harsh transients.
- **Pentatonic = always consonant**: pads ring C major pentatonic (C3 E3 G3 A3 C4). Following the BANDIMAL convention, **bigger pad = lower pitch**. Each pad has a short cooldown so it can't machine-gun.
- **Never silent** (KIDS.md): a soft ambient drone (two detuned low sines under a slow LFO) fades in on the first gesture and loops forever.

## Degrades gracefully

iOS needs a user gesture to call `DeviceOrientationEvent.requestPermission()`, which the Start button provides. If permission is denied, there is no sensor (desktop), or no tilt events arrive within ~1.8s, the prototype automatically switches to a **pointer-drag fallback** (drag the marble with finger or mouse and it's pulled that way) and shows a short readable note in rose. There is also a "No tilt? Drag to play instead" button on the start screen. Either way you get full sound and visuals.

## Named reference

- Browser accelerometer marble games — **"Inertia"** (kikkupico WebGL accelerometer marble, 2026) and the classic **tilt-labyrinth** / **LocoRoco** tilt-physics lineage.
- **Embodied music cognition** — body movement shapes pitch perception; Reggio Emilia sensorimotor learning, where children think with their whole bodies.

## What's genuinely new here

The lab already has ~110 kids prototypes, and almost all of them are **touch + 2D canvas**. This is the first kids piece that is controlled by **tilting the device**, plays out in a **real three.js 3D world**, and uses **spatial (panned) audio** tied to where the ball is on screen. The instrument is the child's own body leaning the tablet — not a finger on glass.
