# Move the Sun — design notes

## The ONE question
**What if a 4-year-old could move the sun across the sky — and the shadows it casts would sing?**

## The fresh idea: shadow-as-playhead
This is a **sundial turned into a sequencer**. A few objects (a tree, a rock, a glowing
crystal) stand on a warm dark landscape, and each one throws a **long cast shadow** away
from the sun. Scattered on the ground are glowing **chime stones**. When the *tip or edge*
of a shadow sweeps across a stone, that stone **rings a warm note and flashes**.

So the music is not made by tapping a note to hear it. The music **emerges from where the
shadows fall** as you drag the light. A slow sun-drag from low → high → low pulls every
shadow across the ground in turn, so the stones ring as a gentle, evolving **arpeggio**.
Plant another object and you've added another moving playhead. Moving the sun is *scrubbing
a sequencer built out of geometry*.

## Sundial / gnomon geometry
Shadow length follows the real gnomon relationship: **L = H / tan(altitude)**.

- **Low sun** (near the horizon) → **long** shadows that stretch right across the ground.
- **High noon sun** → **short** shadows hugging each object's base.
- Shadow **direction** always points **away** from the sun (horizontal projection of the
  light), so as the sun crosses left → right the shadows swing right → left like a clock
  hand. The sun rides a half-circle arc (east horizon → zenith → west horizon), parameterised
  by `t` in `0..1`. See `shadows.ts` (`sunPosition`, `castShadow`, `distToShadow`).

A stone is "struck" when a shadow segment passes within ~26px of it; a short per-stone
debounce keeps a hovering shadow from buzzing.

## Tuning — and why NOT pentatonic
The banned local minimum is the flat **C-major-pentatonic "nothing-is-ever-wrong" wash** —
the toy where every note is safe and nothing means anything. Instead the chime stones are
tuned to a **just-intonation** set over a low warm root (~D3), a warm major / soft-Lydian
collection:

```
1/1, 9/8, 5/4, 11/8 (gentle Lydian #4), 3/2, 5/3, 15/8, 2/1, 9/4
```

Pure small-integer ratios beat against the root with the locked-in shimmer of a real
golden-hour chord, and the soft 11/8 gives a touch of Lydian lift rather than generic
"pretty." Because the stones are *spatially ordered* and the shadow sweeps them in sequence,
you actually hear **intervallic motion** — a chord assembling — not a random splash.

## Sky-color / time-of-day journey
As the sun moves low → high → low the **sky shifts dawn rose/amber → pale noon gold → dusk
violet** (`skyColors`). The ambient pad tracks this: at **dusk** the pad **deepens and
darkens** (lower filter, a bit louder) for warmth; at **noon** chimes are filtered a touch
**brighter/airier** (the `brightness01` argument to `strike`). The scene is never silent — a
slow detuned-triangle pad with a breathing LFO holds under everything.

## Interaction
- **Drag the big glowing sun** (≥64px grab radius, pulsing hint ring) across the sky — the
  primary gesture. Pointer + touch.
- **Tap empty ground** to plant a new object (tree → rock → crystal, cycling) = another
  shadow = another playhead. Capped at 8 to keep the texture and polyphony gentle.
- **Reset** button restores the starting objects.
- **Idle auto-demo:** after ~2.5s of quiet the sun gently drifts back and forth on its own,
  so the shadows sweep and the scene sings at a silent glance. Any real input cancels it; it
  resumes after the next idle.

## Degradation
- **Audio:** an explicit **Tap to begin** gate creates the `AudioContext` inside the first
  user gesture (iOS requirement). No sound until that tap.
- **Tilt:** DeviceOrientation is **feature-detected**; if present it softly nudges the sun,
  but pointer drag works fully without it. No tilt → drag only, silently.
- **Visuals:** Canvas2D only (no three.js / SVG / WebGL). DPR-aware, resizes with the window.

## Kid-safety
Every voice runs through the same chain: voice → **master gain** → **lowpass ≤ 7 kHz** →
**DynamicsCompressor (limiter)** → destination (`audio.ts`). Soft attacks, warm bell tails,
clamped object count, and the limiter keep an object-rich scene from stacking into a harsh
wall. No reading required, no fail state, large well-spaced targets, response within a frame.

## Named references
- **The sundial / gnomon** — a shadow as the measure of the sun's motion. Here the shadow
  stops *measuring* time and starts *playing* it: the gnomon's shadow becomes the sequencer's
  playhead.
- **Olafur Eliasson, _The Weather Project_** (Tate Modern Turbine Hall, 2003) — the
  room-filling artificial sun that made a crowd lie down and watch their own silhouettes. The
  warm radiant disc and golden-hour palette are a nod to that single, gravitational sun.

## Next-cycle deepening
- Per-object **timbre**: tree = soft marimba, crystal = glassy bell, rock = woody pluck, so
  planting changes the orchestration, not just adding voices.
- Let the **sky/time-of-day shift the mode** more boldly (e.g. raise 15/8 vs. flatten to a
  warmer 7/4 at deep dusk) so dawn and dusk feel harmonically distinct.
- Shadow **overlap** could deepen/sustain a note (two playheads on one stone = a held drone).
- A faint **ground-grid of light** that the shadow tip "draws" on, leaving a slow-fading
  trail so the child sees the path the music took.
