**For**: kids (4+)

A row of sleepy creatures passes a "bump" down the line — each wakes and sings its note as the wave reaches it, then the wave bounces back for a return melody.

## What's novel

First impulse-propagation / Newton's-cradle chain-reaction music machine in the Resonance dream lab. A single tap triggers a traveling wave that reflects off the ends, producing ascending and descending pentatonic melodies without any sequencer or timing grid.

## How it works

### Impulse propagation
A `Wave` object stores a floating-point position (in creature-index units) and a direction (+1 right / −1 left). Each rAF frame the position advances at `WAVE_SPEED` creatures/second. Whenever the wave crosses a creature index it hasn't triggered yet, it fires that creature's bounce animation and note. At the far end the wave reflects with a `BOUNCE_DECAY` speed multiplier, losing energy each bounce until it falls below a threshold and disappears. Tapping a creature in the middle spawns two waves simultaneously (both directions), and tapping both ends creates two waves that meet in the middle.

### Pitch mapping
7 creatures → C3 E3 G3 A3 C4 E4 G4 (C-major pentatonic, two octaves). Left = lowest/biggest, right = highest/smallest (BANDIMAL convention). Dragging creatures swaps their positions in the array, so the wave plays whatever order the child arranges.

### Synthesis
Each creature note uses additive synthesis: fundamental sine + octave partial + 3rd harmonic, each with fast linear attack (~8ms) and exponential decay (0.9–1.4s, longer for low notes). A triangle-wave "click" at 4× the fundamental adds marimba-style knock. All audio routes through: `GainNode` (master) → `BiquadFilter` (lowpass 9kHz) → `DynamicsCompressor` (threshold −6dB, ratio 20:1) → destination. Always-on ambient drone: three sine oscillators at C3/E3/G3, very low gain (~0.018), slow fade-in.

### Auto-demo
On load, a demo wave fires from creature 0 every ~5.5 seconds while idle, so the prototype is always alive. AudioContext is only created on first user touch; until then the visual wave and creature animations run silently.

### References
- Newton's cradle — impulse transfer through a row of touching balls
- "Pass it down the line" — classic kids physical chain-reaction toy
- Rube Goldberg machine — sequential trigger philosophy
- BANDIMAL (Teenage Engineering) — bigger/left = lower pitch convention

## Graceful degradation
`buildRig()` is wrapped in try/catch; `AudioContext.resume()` failure is caught. If the Web Audio API is unavailable the rAF loop still runs full animations + auto-demo.

## Next-cycle deepen ideas
- Variable wave speed proportional to creature "mass" (lower notes = heavier = slower wave)
- Multi-wave interference: when two waves occupy the same creature simultaneously, play a chord
- Momentum particle trails following the wave
- Voice-recording mode: hold a creature to record a sound → play it back as the wave arrives
- More creatures (up to 12) with pitch indicators as visual size gradient
