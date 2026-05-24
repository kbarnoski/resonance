# Hold & Glow

**For**: kids (3+) · **Route**: `/dream/137-kids-hold-glow` · **Cycle**: 162

## What it does

Hold anywhere on a dark screen. A glowing orb of light appears at your touch.
The longer you hold, the brighter and wider it glows. Release, and the glow
exhales — a fading ring drifts outward then vanishes.

Five color zones span the screen left to right:
- Violet (left) → C3 (lowest)
- Rose → E3
- Amber → G3
- Emerald → A3
- Cyan (right) → C4 (highest)

All five notes are C-major pentatonic — no wrong combinations.

Hold multiple fingers simultaneously → multiple orbs, multiple tones, a sustained chord that lives in the dark.

## Why this is new in the kids zone

All 35 prior kids prototypes respond to **tap-down** events (tap, drag, draw, tilt).
`Hold & Glow` is the first that rewards **duration**: you don't tap to trigger —
you hold to sustain, and the visual grows as a record of how long you've been still.

This is a completely different emotional register: contemplative, not reactive. A child
who has been running between prototypes encounters one that asks them to slow down and
hold. The glow rewards patience.

## Audio architecture

- `OscillatorNode` (triangle wave) → `GainNode` (envelope) → master `GainNode`
- Attack: linear ramp 0 → 0.18 in 80 ms
- Sustain: holds at 0.18 while finger is down
- Release: linear ramp to 0.001 over `max(120ms, 80ms + holdSec × 120ms)`
  (longer holds → longer natural fade, like a piano sustain pedal)
- Max 5 simultaneous voices

## Visual architecture

- Active orb: two radial gradients per finger
  - Outer halo: colored, grows from 22% to 50% opacity over 4 seconds of hold
  - Core: white-center → colored → transparent, radius 28 → 92 px over 4 seconds
  - `shadowBlur` 18 → 58, amplifies the glow without extra draw calls
- Release ring: expands outward at speed proportional to hold duration (long hold → fast-moving ring),
  fades to transparent in ~0.6 seconds
- Background: `#01080f` (near-black with a blue undertone — darker than the ocean-floor prototypes,
  which is intentional: the glow needs maximum contrast to read as genuinely bright)

## Polish ideas

- Pulsing: slow 0.5 Hz amplitude modulation on the core radius (~±6 px) to make the
  held glow feel alive rather than frozen — like a heartbeat. One extra `sin(t * π)` in `frame`.
- Color shimmer: hue rotates ±10° slowly while held (the child discovers the color is
  "breathing"). Requires HSL conversion or a time-varying gradient stop.
- Note label: text near the orb showing the note name (C3, E3…), opacity ~0.20,
  educational for parents without distracting kids.
- Dual-zone: at very long holds (>6 seconds), spawn a second inner ring at fixed radius
  that slowly orbits the hold point — a sign that the sound is "full" and doing something special.
