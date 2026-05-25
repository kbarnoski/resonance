# Color Mix — design notes

**For**: kids 3+  
**Route**: `/dream/149-kids-color-mix`  
**Built**: Cycle 176 (2026-05-25)  
**Status**: `demoable`  
**Deps**: Zero · **API**: None · **Permissions**: None

---

## The question

What if music worked like finger-painting? Three colors, three notes. Bring them together and
they blend — visually and sonically — into something richer than any of them alone.

## What it does

Three large colored circles sit on a dark canvas in a triangle formation:

| Circle | Color | Note | Frequency |
|--------|-------|------|-----------|
| Rose   | 🌹    | C3   | 130.81 Hz |
| Amber  | 🟠    | E3   | 164.81 Hz |
| Violet | 🟣    | G3   | 196.00 Hz |

**Drag any circle** to reposition it. When circles overlap:
- Their colors mix on-screen (screen compositing: rose+amber=orange, rose+violet=magenta,
  amber+violet=warm green, all three=bright white)
- Their musical voices get louder together (gain ramps smoothly via setTargetAtTime)

The end state — all three circles converging — produces a C major chord (C+E+G) and a brilliant
white glow where they meet. The visual peak and the auditory peak are simultaneous.

## Audio design

Three triangle-wave OscillatorNodes, always running:

- **0 overlaps** (isolated): gain 0.042 — barely audible background hum. The circle "breathes"
  (±5px sine pulse) to signal it's alive and waiting.
- **1 overlap**: gain 0.14 — clearly audible interval. The two overlapping voices form a
  third (C+E), a fifth (C+G), or a minor third (E+G), depending on which pair meets.
- **2 overlaps** (all three): gain 0.22 — prominent C major chord.

All gain transitions use `setTargetAtTime(value, now, τ=0.05s)` — 50ms time constant, no
audible clicks or pops during drag.

## Why screen compositing

`globalCompositeOperation = "screen"` is the browser's most faithful simulation of color mixing
light: `result = 1 - (1 - a) × (1 - b)`. On a near-black background:

- Two colors blend to a lighter, mixed-hue region
- Three colors blend toward white

This is **additive** color mixing (how light mixes), not subtractive (how paint mixes). The
RGB primaries for screen mixing work differently from physical paint: overlapping violet and
amber gives a bright warm glow, not muddy brown. The circles look like they're made of light,
not pigment — which matches the audio: pure triangle-wave harmonics, not acoustic noise.

## What a child discovers

1. **First gesture**: dragging a circle reveals it can move. The circle follows the finger.
2. **First overlap**: two circles approach and their colors blend at the edges. The quiet hum
   becomes louder and more complex. Cause-effect is immediate (<50ms).
3. **Exploration**: the child tries different pairs. Rose+Amber feels warm and happy (major
   third). Rose+Violet is more mysterious (minor third + fifth).
4. **The convergence**: all three circles together — white glow, full chord, the "loudest"
   and brightest state. The child has discovered that more overlap = more music.

No labels are required. No instructions need to be read. The interaction space is fully explored
in under 3 minutes.

## What's new about this prototype

All 47 prior kids prototypes respond to **single-object events** — tap, drag position, hold
duration, drawn path, or collision with a wall. This is the first where the **relationship
between three distinct moveable objects** is the primary musical parameter.

The musical learning embedded in the mechanic:
- **Color mixing = harmony**: children learn that three specific colors combine to white,
  and simultaneously that C, E, G combine to a major chord. The lesson sticks because both
  domains share the same spatial interaction.
- **Interval quality without names**: rose+violet overlap sounds more "open" than rose+amber.
  A child will feel this even without knowing "that's a perfect fifth vs. a major third."
- **Reversibility**: pulling circles apart decreases both the color saturation and the
  volume. The child controls the "how much music" dimension continuously.

## Interaction details

- **Hit radius**: R + 12px = 120px diameter effective tap zone. Generous for 3yo motor control.
- **Pointer capture**: `canvas.setPointerCapture(pointerId)` ensures drag continues even when
  the finger leaves the canvas boundary.
- **Touch-action**: `touch-none` CSS prevents scroll conflicts on mobile.
- **Multi-touch**: not supported (only one circle can be dragged at a time). A parent+child
  two-finger scenario would need pointer event multiplexing — deferred to v2.

## Polish ideas (future cycles)

- **Multi-touch drag**: two simultaneous pointers each dragging their own circle. Parent+child
  collaborative play. ~30 lines.
- **Sparkle burst on full overlap**: when all three first converge (overlapCount goes 1→2 for
  the third circle), emit a one-shot particle explosion at the centroid of all three circles.
  ~20 lines.
- **Slow drift when idle**: if no drag for 10 seconds, circles slowly drift toward a random
  configuration. Keeps the canvas alive. ~15 lines.
- **Additional notes**: swap the triad for other chords (minor: C+Eb+G, augmented: C+E+G#).
  A chord-type picker before start. ~20 lines.
