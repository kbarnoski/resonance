# 2960 · Murmuration

Route: `/dream/2960-murmuration`

## The one question

**What if an instrument's memory were a living swarm — you play with your hand,
and a flock of autonomous voices grows around the phrases you keep returning to,
forgetting the ones you abandon?**

## The idea: a stigmergic swarm memory

This is a hand-played, continuous-pitch instrument whose long-form memory is
*stigmergic* — organised the way ants organise trails, through marks left in a
shared environment rather than through a central score.

- **The scent field** is a `128 × 72` grid of scalar "scent". The vertical axis
  maps to **pitch** as log-frequency across ~2.5 octaves (top = high); the
  horizontal axis is a free spatial dimension used for **stereo pan**. Every
  frame the whole field is multiplied by an evaporation factor (~0.99), so
  unfed memory fades.
- **Playing** deposits scent. Dragging your pointer/finger sounds a sustained,
  expressive continuous-pitch voice whose pitch is the field row under the
  cursor, and lays a soft gaussian splat of scent along the path you trace.
- **The swarm** is 48 autonomous voice-agents. Each frame every agent probes
  the local scent gradient, steers its velocity up-gradient (toward where you
  have been), and adds seeded wander-noise + inertia (boid-like, bounded speed,
  reflecting at the edges). When an agent crosses a high-scent cell it fires a
  short plucked grain at that cell's pitch **and deposits a little scent of its
  own** — the reinforcement that closes the stigmergic loop.

**Emergent result:** revisit a phrase → a bright attractor forms → agents
cluster and a shimmering choir sustains it. Stop feeding it → it dims and the
swarm disperses toward your newer gestures. Over minutes the piece is different
because of what *you* played.

## How to play it

1. On load it is already alive: a seeded **ghost hand** (autopilot) traces an
   evolving, revisit-biased repertoire so a swarm grows with no input.
2. **Drag anywhere** to take over. Trace a shape, then come back to it a few
   seconds later — watch a cluster of motes gather and hold the phrase.
3. **Feed a path to consolidate it; abandon a path to forget it.**
4. Press **Return to autopilot** to hand the instrument back to the ghost hand.

## Audio & visuals

- Self-contained Web Audio (no dependencies). Your hand voice is a sustained
  triangle + sub-sine through a slow lowpass with gliding, never-quantised
  pitch; agent voices are short plucked grains with fast decay and bounded
  per-frame polyphony. Master chain: bus → gentle lowpass → `tanh`
  soft-limiter → master gain `0.14` (≤ 0.15).
- Canvas2D. The field renders as a warm heat-field on a **violet ramp** (dim
  violet → white-hot peaks); agents are bright motes with short motion trails;
  your live cursor is a glowing head.
- Determinism: all randomness flows from a local `mulberry32` seeded `0x2960`
  (agent spawns, wander noise, autopilot repertoire). No `Math.random`,
  `Date.now`, or `new Date`. Motion honours `prefers-reduced-motion` (slower
  field drift and ghost hand, no fast luminance flashing; peak brightness
  breathes at ~0.6 Hz, well under 3 Hz).

## References

- **M. J. Buehler, *MusicSwarm*, Advanced Intelligent Systems (2026)** — swarms
  of agents self-organise music via stigmergic peer signals and shared memory,
  where *local novelties consolidate into global form*. The direct inspiration
  for the deposit-sense-reinforce loop here.
- **Tim Blackwell, *Swarm Granulator*** — the classic swarm-music lineage:
  particle swarms driving granular synthesis.
- **O. Bown & A. Eldridge, "ecosystem-based generative music"** — framing
  generative music as an ecosystem of interacting agents and environment.

## Honest limitations

- The "memory" is a single fading scalar field, not real phrase recognition or
  segmentation — it remembers *places on the field*, not musical ideas as such.
- Agent voices are deliberately simple grains; this is a sketch of the timbre,
  not a finished instrument.
- On a densely fed field the choir can crowd toward the single brightest
  attractor rather than sustaining several phrases in balance.
- Pitch and pan are the only two axes of the field; there is no time/rhythm
  memory beyond what the swarm's own motion implies.
