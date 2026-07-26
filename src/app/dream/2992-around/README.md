# 2992 · Around

A binaural **sound-sculpture room**. You sit at the origin and reach into the
space around your head to place sustained voices at real 3-D positions —
then hear them orbit you in true binaural space as you turn.

> The one question: *What if you could sculpt a living choir out of thin air —
> placing sustained voices at real 3-D positions and hearing them orbit you in
> true binaural space as you turn your head?*

## What it is

- The listener is at the origin. Each **voice-orb** is a small **additive drone
  voice** (fundamental + natural overtones + a detuned twin for slow beating)
  at a **continuous pitch** derived from its spatial position — never quantised
  to any musical scale or lattice.
- Every voice is spatialised through its own Web Audio **`PannerNode` with
  `panningModel = "HRTF"`**, positioned in 3-D via `positionX/Y/Z`, mixed
  through a soft limiter into a master gain capped at **0.15**.
- Each voice **orbits** the head on its own seeded arc (with a slow elevation
  bob), so the field is alive and the binaural motion is audible — a voice
  sweeps from one ear to the other.
- Turning your **head / device** rotates the `AudioListener`
  (`forwardX/Y/Z`, `upX/Y/Z`) so the whole field turns around you.

## How to use

1. Press **Start the choir** (browsers require a gesture before audio).
   Before that, a **silent seeded demo** already runs on the canvas.
2. In **Place** mode, click/drag the radar: angle from centre → **azimuth**,
   distance from centre → **distance**, and the **elevation slider** lifts the
   next voice above/below your ears. Pitch follows position continuously.
3. Switch to **Look** mode and drag to turn your head — or press **Use device
   tilt** (asks iOS permission on tap) to head-track with your phone.
4. The status line names the currently **loudest/nearest** voice; it is ringed
   on both the radar and the horizon band.

**Headphones strongly recommended** — HRTF cues are what make a voice pass your
left ear. On speakers the effect collapses toward stereo.

## Subsystems integrated

1. Pointer + device-orientation 3-D placement / look-around input.
2. An HRTF binaural audio graph — multiple `PannerNode`s + a movable
   `AudioListener`, through a limiter to a ≤0.15 master.
3. A continuous-pitch sustained additive voice bank (per-orb partials).
4. A Canvas2D spatial-field renderer: top-down radar + elevation horizon band.

## Determinism

All randomness comes from `mulberry32(0x2992)`. No `Math.random`, `Date.now`,
or `new Date()` in logic; `performance.now()` is used only for frame timing.
The seeded demo places and orbits four voices identically on every load, so it
self-demonstrates headless.

## References

- **Web Audio API** — HRTF `PannerNode` and `AudioListener` spatialisation.
- **Jens Blauert**, *Spatial Hearing: The Psychophysics of Human Sound
  Localization* — HRTF / interaural localization cues.
- **AudioMiXR: 6-DoF spatial audio object manipulation** (arXiv:2502.02929),
  a marker of the 2026 spatial-audio frontier.

## Honest limitations

1. **Generic HRTF.** The browser's HRIR set is not yours — front/back
   confusion and weak elevation are expected, and vary per listener.
2. **Pitch↔position is an artistic map**, not physics; higher + nearer sings
   higher purely by design choice.
3. **Two reference frames.** The radar is a fixed top-down *world* view while
   the horizon band is *facing-relative*; reconciling them takes a beat.
4. **Speaker playback degrades** the binaural illusion badly — this is a
   headphone piece.
