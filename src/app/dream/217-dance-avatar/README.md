# 217 — Dance Avatar

**For**: adults (live performance, exploration)  
**Cycle**: 251  
**Status**: demoable  
**Deps**: none  
**Permissions**: optional mic

## What it is

A 12-joint spring-physics skeleton that dances in response to audio. Each body part is driven by a specific frequency band — bass lifts the shoulders, sub-bass bounces the hips and feet, mid frequencies swing the arms, high-mid makes the hands flutter, treble nods the head. In demo mode, six incommensurable LFOs produce continuous fluid motion. With mic input, the skeleton mirrors whatever is playing in the room.

## Interaction

- Opens immediately in demo mode (LFOs → skeleton dances before any tap)
- **Enable Mic**: connects Web Audio AnalyserNode to live input; skeleton responds in real time
- **Stop Mic**: returns to demo LFOs

## Audio mapping

| Band | Hz | Color | Joint(s) | Movement |
|------|----|-------|----------|----------|
| sub-bass | 20–60 | violet | hips, knees, feet | body bounce / stomp |
| bass | 60–250 | cyan | shoulders | chest lift / breathe |
| low-mid | 250–500 | green | hips | left-right sway |
| mid | 500–2k | yellow | elbows, hands | arms swing counter-phase |
| high-mid | 2–4k | orange | hands | wrist flutter |
| high | 4–20k | rose | head | nod forward |

## Physics

Spring-mass system per joint. On each frame:
```
force = (target - position) × K − velocity × D
velocity += force × dt
position += velocity × dt
```
`K = 140` (snappy response), `D = 10` (moderate damping — oscillations fade in ~0.4s). The spring is what makes the movement look "body-like" rather than mechanical: joints overshoot, oscillate, then settle, exactly as real limbs do.

Target positions = rest position + audio-derived offset. The offset includes time-varying `sin()` components so the arms swing counter-phase (left/right alternate), hips sway rhythmically, and wrists flutter at a different rate from the gross arm movement. This creates the impression of independent joint timing even though all six band energies drive the whole figure simultaneously.

## What's genuinely new

**First prototype with an animated human skeleton.** 216 prior prototypes visualize audio as particles, fluid, terrain, rings, tiles, or canvas marks. This is the first where the visualization IS a human figure — head, shoulders, elbows, wrists, hips, knees, feet connected by glowing skeleton lines.

**Embodied frequency interpretation.** The frequency-to-body-part mapping is not arbitrary:
- Sub-bass and bass (felt in the body) drive the torso and legs
- Mid frequencies (melodic/harmonic content) drive the arms
- Treble (presence / air) drives the head
This mirrors how we physically experience music — you feel bass in your chest, melody in your hands, and high frequencies in your head.

**Live-performance fitness.** The skeleton works as a real-time stage visualizer. With a mic pointed at a PA system, the figure responds to whatever the performer is playing — walking bass = swaying hips, piano solo = arm gestures, crash cymbal = head snap. At projection scale, it reads from 30 meters.

## Inspired by

- **DiscoForcing** (ICML 2026, arXiv:2605.28491): streaming audio-driven full-body character animation via diffusion-forcing sequence model. This prototype is the zero-dep browser adaptation: replaces the neural network with six spring-mass joints, retains the core insight that music has kinetic energy and a human body is its natural receiver.

## Polish ideas

- **Onset flash**: on a sharp transient (energy spike > 0.5 in any band), all joints scatter briefly outward from the skeleton center then spring back — a "shock" dance move
- **Trail**: each joint leaves a 0.2s ghosted trail (lower-opacity copy of previous positions) — makes the motion more visible and adds temporal "blur"
- **Multiple avatars**: 2–3 skeletons in different positions with slightly different spring constants, each responding to the same audio but arriving at their own timing — a small ensemble
- **Named presets**: "Piano" (hands drive more), "Bass DJ" (hips + feet dominate), "Conductor" (head + arms) — different weighting matrices for different performance contexts
- **MIDI input**: trigger position presets from MIDI pads (via Web MIDI API) — the figure snaps to a pose on pad hit, then spring-relaxes

## Technical notes

- `Uint8Array<ArrayBuffer>` required for `getByteFrequencyData` in TypeScript 5.7+ strict mode (same pattern as `206-sdf-cave`)
- `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` on resize instead of `ctx.scale()` to avoid cumulative scale drift
- `as const` on BANDS array gives TypeScript literal types for r/g/b — eliminates string-formatting errors
- `globalCompositeOperation = "screen"` on the glow pass — additive blending without overexposure at low energy
