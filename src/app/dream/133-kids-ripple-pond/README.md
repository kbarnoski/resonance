# Ripple Pond

**For**: kids (3+) · zero permissions · zero API · zero deps

## What it is

A dark ocean canvas. Tap anywhere to drop an imaginary stone — a glowing ripple ring expands
outward at 65 px/s, singing its note as it spreads. When two ripples meet for the first time,
a burst of white light flares at the collision point and a chord plays from both constituent notes.

## The sound mapping

X position determines pitch — the screen is a gentle left-to-right pentatonic scale:

| Zone | Note | Color   |
|------|------|---------|
| Far left  | C3 (130 Hz) | violet  |
| Left-center | E3 (165 Hz) | rose    |
| Center    | G3 (196 Hz) | amber   |
| Right-center | A3 (220 Hz) | emerald |
| Far right | C4 (261 Hz) | cyan    |

All five notes are C-major pentatonic — no wrong combinations. Any chord that emerges from
two colliding rings sounds musical.

## The interaction

- **Tap once**: one ripple, one note.
- **Tap twice in different spots**: two ripples expand toward each other. When they first touch
  (r₁ + r₂ = distance between centers) — flash and chord.
- **Tap rapidly across the screen**: rings fan out everywhere, colliding in complex patterns.
  The chords are determined entirely by which X-zones the taps landed in.
- **Multi-touch**: each finger drops its own ripple. All native, no special handling.

## Why this works for a 4-year-old

The cause-effect is immediate (tap → ring + note, ≤16ms). The collision chord is a reward for
watching — the child doesn't need to aim at anything. Every combination is consonant. The physics
of expanding circles means collisions happen naturally without any deliberate planning; after a
few taps the child just discovers "they're bumping into each other and making a new sound."

Wave interference is a genuinely deep physics concept (superposition, constructive interference,
node/antinode patterns). The ripple pond teaches it through curiosity, without a label.

## Implementation notes

- Rings fade as `alpha = 1 − r/maxR`. `maxR` = screen diagonal × 0.60, so no ring ever persists
  long enough to clutter the canvas — they naturally expire as they reach the edges.
- Collision detection: per-frame check for each unique pair. A pair key (min_id:max_id) is stored
  in a Set after firing — each pair triggers exactly once, no matter how long the rings overlap.
- `collidedRef.clear()` when the pond is empty — avoids Set growth over long sessions.
- Up to 12 simultaneous ripples (drop oldest on overflow). Sufficient for any child's tapping
  rate and keeps per-frame O(N²) pair check cheap.
- Reverb: exponential-decay white-noise impulse response, 1.4s tail. Gives the "stone in a pond"
  resonance character.
- Ambient C3/E3/G3 drone at gain 0.007/0.005/0.004 — barely perceptible, keeps the canvas from
  feeling dead between taps.

## Polish ideas (future cycles)

- **Stone-drop animation**: dark concentric circle at tap origin, shrinking inward over 80ms,
  before the ring begins expanding. Suggests the stone entering the water.
- **Ripple decay trail**: faint inner secondary ring (already present) could have very slight
  reverse-direction expansion to simulate wave reflection.
- **Edge-bounce**: rings that reach the screen edge bounce (reflected origin outside canvas)
  producing new secondary rings at reduced gain. Teaches reflection without explanation.
- **Note name reveal on collision**: very brief (1s) note name label (e.g., "C + G") at the
  flash point at 30% opacity — educational layer invisible in fast play, visible to a patient parent.

## Resonance connection

The Ripple Pond is about **non-linear interaction** — two independent processes (expanding waves)
creating emergent events (collisions) that neither process could produce alone. Resonance's
journey engine works the same way: two audio layers that were never explicitly coordinated
sometimes arrive at the same moment and produce an unexpected sonic event. The pond is a
visible, playful model of that principle.
