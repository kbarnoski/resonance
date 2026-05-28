**For**: kids (3+)

# Magnet Notes

Six glowing colored orbs float on a dark canvas. Each orb is tuned to a note in the
pentatonic scale (C3 E3 G3 A3 C4 E4). When two orbs drift close enough, magnetic
attraction pulls them together — and their notes ring as a soft chord. When they
actually **touch**, sparkles burst at the collision point and both notes spike loud.

Tap any orb to send it flying toward the farthest one. Tap open canvas to gently
scatter all orbs outward.

## Interaction

| Gesture | Result |
|---------|--------|
| Tap near an orb | Kick it toward the farthest partner |
| Tap open canvas | Nudge all orbs outward |
| Watch (no input) | Orbs drift, attract, ring, collide autonomously |

## Sound design

- Triangle oscillators, one per orb — soft and not harsh
- Gain scales with `proximity²` so the chord builds gradually as orbs approach
- On collision: both oscillators spike to 0.20 gain then decay in ~1.5 s
- Short plate reverb (2.2 s IR, 30% wet) for warmth
- AudioContext deferred to first tap (autoplay policy)

## Visual design

- Connection lines appear between attracted pairs: gradient-colored, brightness ∝ proximity²
- Additive blending for orb glow — orbs brighten each other when overlapping
- Outer halo expands as proximity increases — pre-collision visual warning
- Sparkle burst (24 particles, split between both orb colors) on each new collision
- Flash decay on each orb: glowFlash → 0 over ~40 frames after spike

## Notes for iteration

- **Mic mode** (v2): RMS energy adds velocity impulse to a random orb every beat → orbs
  drift more actively while music is playing
- **Gravity mode**: small constant downward pull; orbs cluster at the bottom making chords
  more likely to stay ringing
- **More orbs**: 8 or 10 orbs would fill the canvas better on landscape iPad
- **Collision counter**: a number in the corner showing how many chord-collisions happened
  this session — gives kids a score without a fail state
- **Color-to-note visual**: small note name (C3, E3...) appears briefly on orb flash — for
  parents who want to name the notes

## Loved prototypes that shaped this build

- `133-kids-ripple-pond` ❤️ — "things that interact when they meet" pattern
- `166-kids-lantern` ❤️ — glowing objects alive before first touch
- `169-kids-marble-run` ❤️ — physics-based movement and collisions
- `160-kids-paint-loop` ❤️ — layered, contemplative, always-in-motion
