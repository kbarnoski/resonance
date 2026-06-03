**For**: kids (4+)

Open this because you want to *hear* a game instead of *watching* one — six singing animals hide in the air around a child, and they find each one by physically turning their body in a circle.

## What it is

The lab's first deliberately non-screen, audio-FIRST piece, and its first
DeviceOrientation (heading) controller. The screen is a footnote: a faint warm
dusk-meadow compass and a "found" row of animals. The experience lives in
spatial sound moving around the listener's head.

## How to play

1. Hold the phone or tablet (headphones make it magical; speakers still convey
   left/right).
2. Tap the one big **Start** button.
3. Turn your *whole body* slowly in a circle. As you turn, the whole soundscape
   rotates around your head.
4. Six animals are hidden at fixed bearings all around you (frog, bird, whale,
   cricket, owl, bee), each humming a soft musical motif. When you turn to
   **face** one (within ~25°), it swells to the front, brightens, buzzes the
   phone (`navigator.vibrate(40)`), blooms big on screen and sings a short happy
   "found!" phrase — then it joins the found row.
5. Find all six. When you do, they all sing a soft chord together as a
   celebration, then it gently resets so you can play again.

No reading, no "wrong", no fail, no timer, no scolding. Just exploring with your
ears.

## Subsystems

- **HRTF binaural panning** — one `PannerNode` per animal with
  `panningModel = "HRTF"`, each parked at a fixed 3D position on a ring around
  the listener. Position is set via the modern AudioParams
  (`panner.positionX.value`) when available, falling back to the legacy
  `panner.setPosition(...)`.
- **Rotating AudioListener** — the device heading (DeviceOrientation `alpha`)
  rotates the `AudioListener`'s forward vector, so the *world* turns around the
  child's head. Uses modern `listener.forwardX/forwardZ/upY` AudioParams when
  present, else legacy `listener.setOrientation(...)`.
- **Find / collect state engine** — a per-frame loop computes which animal is
  being faced (shortest signed angle within tolerance), swells + brightens that
  voice continuously with closeness, fires the first-find event (sing + vibrate
  + bloom), tracks the found set, triggers the all-found celebration, and loops.
- **Always-on ambient pad** — a quiet warm drone so the piece never feels broken
  and never sits in silence. Every animal also keeps a faint idle hum so it is
  discoverable by ear before you face it.
- **Minimal Canvas2D compass** — near-black dusk wash, a faint warm ring, soft
  colored dots for where animals hide, and a big centered bloom of whatever you
  are currently facing. No WebGL, no three.js, no busy visualizer.

## Graceful degradation (so the demo always works with zero sensors)

The big **Start** button calls `DeviceOrientationEvent.requestPermission?.()`
(iOS 13+) inside the click handler when that API exists, otherwise just
`addEventListener('deviceorientation', ...)`. If no real orientation sample
arrives within ~2 seconds (or the API is absent), three fallbacks activate so the
piece stays fully demoable:

- **(a) Drag-to-turn** — dragging the screen rotates the heading.
- **(b) Arrow keys** — ← / → nudge the heading.
- **(c) Auto-tour** — the heading slowly auto-rotates hands-free, so it demos
  completely on its own with nothing touched.

A readable `text-rose-300` line explains the controls. Modern vs legacy
AudioListener / PannerNode APIs are feature-detected as described above.

## Named references

- **Pauline Oliveros, *Deep Listening* (2005)** — listening as an active,
  spatial, exploratory practice; this piece asks the child to *listen their way*
  to each animal.
- **Bernhard Leitner — *Sound Space* sculptures** — sound you physically move
  through; here the "sculpture" is six fixed singers you walk your attention
  around.
- **The 2026 head-tracked spatial-audio wave** (e.g. THX Spatial Audio+ AI head
  tracking, shown at CES Jan 2026) — the browser-feasible equivalent is
  `PannerNode` HRTF + DeviceOrientation, needing zero special hardware.

## Next-cycle deepening

- A guided ~8-minute listening journey that gently resolves into a final chord.
- MediaPipe face-landmark head-tracking as a sensorless heading source on
  laptops/desktops.
- More animals, day/night soundscapes, and seasonal motifs.
- A two-player "shared room" where two children hunt the same singers together.
