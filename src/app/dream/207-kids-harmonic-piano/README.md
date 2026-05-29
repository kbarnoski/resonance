# Voice Circles — design notes

**For**: kids (4+)  
**Route**: `/dream/207-kids-harmonic-piano`  
**Built**: Cycle 240 (2026-05-29)

## What it does

Four large glowing circles on a dark canvas, each representing one harmonic voice:

| Circle | Color | Pitch | Harmonic |
|--------|-------|-------|----------|
| Big violet | violet | C3 (131 Hz) | Fundamental |
| Medium cyan | cyan | C4 (262 Hz) | 2nd harmonic (octave up) |
| Medium-small emerald | emerald | G4 (392 Hz) | ~3rd harmonic (P5 above octave) |
| Small amber | amber | C5 (523 Hz) | 4th harmonic (2 octaves up) |

**First tap anywhere** wakes all four voices simultaneously — the child hears the full rich timbre immediately. Each subsequent tap on a circle toggles that voice on or off. The sound changes from pure (just the fundamental) to warm and complex (all four layers).

BANDIMAL rule: bigger circle = deeper sound. Size is the pitch metaphor, same as kalimba tines and marimba bars.

## What's new

The 206 prior prototypes all respond to WHERE the child taps (X/Y position, distance, zone). This is the first kids prototype where the interaction is **what combination is active** — additive/subtractive voice selection. The cause-effect is: "that circle makes this layer. with it off, the sound is thinner."

There's no wrong combination. Two voices sound like an organ. All four sound like a thick piano chord. Just the fundamental sounds like a flute.

## Audio design

Triangle oscillators (warm, rounded, neither pure sine nor buzzy sawtooth). Gains scaled by harmonic number:
- Fundamental: gain 0.90
- 2nd harmonic: gain 0.45
- 3rd harmonic: gain 0.30
- 4th harmonic: gain 0.22

This approximates a natural 1/n rolloff while keeping higher harmonics audible. The combined gain stays around 0.3–0.5 regardless of how many voices are active.

AudioContext initialized on first tap (browser autoplay policy). All four oscillators start immediately but muted; `setTargetAtTime` ramps individual gains up/down on toggle (40ms attack, 60ms release — prevents clicks).

## Visual design

Each circle has a slow visual pulse tied to a fraction of its audio frequency (0.45–1.2 Hz), creating a gentle breathing motion. Ripple rings expand outward from each active circle at ~1.4s intervals. On tap: a burst of 10 sparkle particles + a `tapScale` bounce (1.35× brief scale-up for on, 0.82× for off). Inactive circles show at 28% opacity, no glow, no ripple.

## Polish ideas

- **Mic mode**: detect pitch via autocorrelation; automatically tune all four oscillators to harmonics of the detected fundamental (e.g., play A2 on piano → circles tune to A2/A3/E4/A4)
- **Chord preset buttons**: switch the fundamental between C, G, and A (different emotional colors)
- **Fifth circle**: add a 5th harmonic voice (E5, minor seventh above 4th) for a richer cluster
- **Visual waveform**: show a real-time composite waveform strip below the circles — a direct representation of what the voices are doing to the signal
- **Shimmer mode**: when all 4 voices are active, emit a brief full-canvas shimmer flash (like `205-kids-bubble-bath`'s chord glow)
