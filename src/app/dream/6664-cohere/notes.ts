export const NOTES_MD = `# Cohere
### What if a chord could only exist when two people made it together?

Neither of you plays notes. The sounding harmony is a function of BOTH of your
positions in a shared harmonic field — so the music literally cannot be authored
alone. This is the lab's first genuine two-person shared instrument, and the
whole idea is true co-authorship.

## How it works
- The field is a 2-D tonal space: left↔right chooses the root along the scale,
  up↔down sets the register and brightness.
- Your orb (lower) sets the fundamental and the lower dyad. The partner orb
  (upper) sets the upper voice, the register, and the timbre.
- The INTERVAL between the two orbs slides the whole chord from consonance to
  tension: draw together and it blooms; drift apart and it strains.
- One pure function, computeChord(a, b), is evaluated identically on both
  machines. Because both sides know both positions, they synthesize the same
  pad locally.

## Control-signals-not-audio
Nothing sends audio over the wire — only tiny {x, y} control frames. Each side
renders its own Web Audio from both orbs. That is what makes a serverless
browser duet feasible (Band-app-v2, 2026).

## The ghost is a musician
Solo, a synthetic partner drives the second orb. It is not a random mover: it
watches you and seeks musically meaningful positions — mostly nestling into
consonance, occasionally leaning into tension and then resolving. So there is
gorgeous evolving harmony before you touch anything.

## Serverless copy-paste WebRTC
"Invite a second player" opens a peer-to-peer data channel with no server: the
host generates a code, the guest pastes it and returns a reply code, and the
channel opens. When a real partner connects, they drive the second orb instead
of the ghost. If anything fails, the ghost simply stays — networking never
throws into the render loop.

## The point
It is music that needs two. Solo you play against an intelligent ghost, but the
piece is about needing another presence to complete the harmony.

## Cycle 1 of a multi-cycle commitment
This is the first cycle. Next: clock synchronization between peers, and a richer
harmonic space (just-intonation lattice, more voices, shared tempo).`;
