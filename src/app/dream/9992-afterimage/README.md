# 9992 · afterimage

**One question:** *What if the artwork's true image is the one your own eyes paint after the screen goes blank — a hallucination delivered by your retina, not the display?*

## What it is

A quietly unsettling colour piece where the screen is only a **primer**. It holds a
saturated field steady, then dissolves to a neutral mid-grey — and *you* perceive
a vivid **negative afterimage**, the complementary colour, blooming and fading on
that grey. Nothing complementary is ever drawn. The payoff is rendered by your
visual system; the display just adapts your retina and then gets out of the way.

The piece runs itself: a slow auto-cycle walks around the opponent-colour wheel,
each new primer landing on roughly the hue you just hallucinated, so the image
keeps handing itself off from the glass to your eye.

## The perception mechanism

Staring at a saturated hue fatigues the cone photoreceptors and the
opponent-process channels tuned to it. When the field ramps to neutral grey, the
still-fresh *opposing* channel dominates the now-balanced input, and you see the
complementary colour — a **negative afterimage**. Cyan primes red, green primes
magenta, blue primes yellow, and so on around the wheel.

Two design choices make the prediction accurate:

- **True opponent complements.** The predicted afterimage swatch shown in the UI is
  the primer hue rotated 180° — the actual opponent colour, not an artistic guess.
- **Slow luminance ramps (≥0.9 s), never flashes.** Adaptation *needs* a steady
  hold and a smooth release; a hard cut would both weaken the afterimage and be a
  photosensitivity risk. The ramp is the effect, done safely.

A dim fixation cross sits at the centre because afterimages need steady
fixation — if your eyes drift, the retinal image smears and the ghost breaks up.
The on-screen instruction says so directly.

### Cycle structure (per beat, at 1× pace)

1. **ADAPT (~12 s):** the saturated field fades in and holds. A low binaural
   drone, pitched to the hue, sits underneath.
2. **BLINK (~9 s):** the field ramps to neutral grey. The negative afterimage
   blooms and fades in your vision; the audio simultaneously slides to the
   *complementary* interval (a tritone away — the sonic opponent) and thins.
3. The next primer adapts to ≈ the hue you just saw (complement + 30° drift), so
   the piece precesses around the whole opponent circle rather than oscillating on
   one pair.

## The rendering — a CSS/DOM compositor, nothing else

No canvas, no WebGL, no `Math.random`/`Date.now`. The entire picture is:

- a neutral-grey base `<div>`,
- a saturated-wash `<div>` on top (a full-field `radial-gradient`),
- **one opacity ramp** between them, driven per frame from `requestAnimationFrame`
  timestamps.

The browser compositor is the only renderer on the machine; your retina is the
second renderer, and it draws the part that matters.

## Audio

A gentle **binaural drone** (Web Audio): a hard-panned oscillator pair whose
~6 Hz difference beats inside the head, plus a centre sub for warmth, all through
the shared `safeMaster` limiter. Hue maps to pitch and to a lowpass "brightness";
on BLINK the drone flips to the complementary (tritone) pitch and thins, mirroring
the retinal negative. Sound starts only after the **Begin** gesture; the visual
cycle auto-runs from mount regardless.

## How to use

1. The cycle is already running when the page loads. Sit ~arm's length away.
2. Press **Begin** to add the binaural drone (optional).
3. **Fixate the cross and hold still.** When the field dissolves to grey, keep
   looking — the complementary ghost will arrive and fade.
4. Tap the field or press **Space** to release to grey immediately.
5. Drag **pace** to slow down or speed up the whole cycle.

## Named references

- **Ewald Hering** — opponent-process theory of colour vision; the red↔green,
  blue↔yellow channels whose imbalance *is* the negative afterimage.
- **Hermann von Helmholtz** — *Handbuch der physiologischen Optik*; classic
  treatment of positive and negative afterimages and retinal adaptation.
- **Bridget Riley & op-art** — deliberate exploitation of complementary
  adaptation and retinal instability as the content of the work.
- The broader **entoptic / endogenous-luminescence** framing: perceiving light
  and colour that the display never emitted — "seeing what isn't there."

## What I'd try next

- **Shaped primers (rosettes / silhouettes)** instead of a full wash, so the
  afterimage arrives as a recognisable *form* on the grey, not just a colour.
- **Positive-afterimage beat** in near-dark (brief bright flash → lingering
  same-colour glow) to contrast with the negative, complementary one.
- **Gaze-held audio coupling** via a webcam fixation check (mic/camera optional,
  degrades to the current auto-cycle) so the drone only releases when your eyes
  actually hold the cross.
- Per-viewer calibration of hold time — afterimage strength varies with ambient
  light and individual adaptation speed.

## Notes for a curator

- **Unverified without a real display.** The afterimage strength depends on
  screen brightness, ambient light, viewing distance and the individual viewer.
  Code correctness (timing, complement maths, teardown) is verifiable; the
  *perceptual payoff* can only be confirmed on a bright screen in a dim room.
- **No strobing, no flashes.** Every transition is a ≥0.9 s luminance ramp;
  `prefers-reduced-motion` further slows the default pace. Safe for
  photosensitive viewers by construction.
- Fully self-contained: no API route, no network, no mic/camera. Works silently
  if Web Audio is blocked; the visual cycle never depends on the gesture.
