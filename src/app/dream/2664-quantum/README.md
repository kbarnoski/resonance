# 2664 · Quantum Whispers

## The question

What if you jammed with musicians whose replies live in **superposition** — a
shimmering cloud of possible answers — that only **collapse** into one actual
phrase on each downbeat, and **teleport** to each other imperfectly, so the
ensemble drifts between echoing you and diverging into its own strange music?

You play a computer-keyboard instrument; three cooperative agents reply.

## How to play

- **Begin** creates and resumes the AudioContext (autoplay policy).
- Play the home row `A S D F G H J K L ;` and the top row `Q W E R T Y U I O P`.
  Keys map to a run of free 12-TET pitches (MIDI 60–79). Always-on polyphony:
  hold chords, they sustain until keyup.
- The **DIVERGENCE** slider is the whole continuum. Near 0 the agents track your
  recent notes tightly (imitation). Near 1 they wander into their own seeded
  attractors and detune microtonally (divergence) — it is meant to be able to
  sound bad.
- Leave it idle ~4s and a seeded ghost keeps jamming a short motif so the
  collapse/teleport cycle animates and sounds with zero interaction. The first
  real keypress yields instantly.

## How the engine works (`engine.ts`)

Deterministic and quantum-**inspired** — no quantum library, no ML, no network.

- Each agent holds a probability distribution `prob[]` (amplitudes) over a
  discrete pitch grid of `N_BINS = 25` bins (`MIDI_LO = 52` upward).
- **Evolve (every frame):** each bin is pulled toward
  `(1 − divergence)·userDist + divergence·attractor`, lightly modulated by a
  per-bin shimmer phase, then re-normalised. `userDist` is a decaying histogram
  of the notes you (or the ghost) actually sounded.
- **Collapse (every downbeat):** the agent samples one bin from `prob` with the
  seeded PRNG and plays it. A continuous cent detune, `±divergence·55¢`, is added
  so pitch space stays free — no just-intonation / pentatonic snapping — and the
  DIVERGENCE knob produces real, controllable dissonance.
- **Teleport (every downbeat):** the agent mixes a *noisy* copy of its
  distribution into its neighbour (`noise = 0.12 + divergence·0.55`). Embracing
  that transfer noise as expressive "quantum whispers" is the point. A bright
  thread is drawn for ~260 ms and the neighbour's cloud reshapes toward it.
- Agents **cooperate/echo** — round-robin teleport, shared player memory. This is
  explicitly **not** an adversarial-AI piece; they never trap or fight you.
- Determinism: one `mulberry32(0x2664)` stream drives all randomness; all timing
  uses `performance.now()`. No `Math.random`, no `Date.now`.

## Audio (`audio.ts`)

Simple synthesis, free 12-TET / continuous cents (no scale lattice). Player keys
drive polyphonic triangle **lead** voices; each agent has its own **FM** timbre
triggered on collapse (staggered ~85 ms so three simultaneous collapses don't
smear). Master gain `0.18` (≤ 0.2) into a `DynamicsCompressor` limiter. Starts
silent; the context is created inside the Begin gesture.

## Visuals (`viz.ts`, WebGL2)

Each agent is a ring of additively-blended glowing points (the amplitude cloud)
on the violet→magenta brand ramp — raw hex/hsl is confined to this art layer. On
a downbeat the cloud contracts toward the collapsed bin and flares a bright core,
then re-blooms; teleports draw a thread between agent centres. No strobe:
luminance changes stay slow (< 3 Hz, ~1.6 Hz collapse rate) and reduced-motion
damps the flash and freezes shimmer. WebGL2 unavailable → on-brand
`text-destructive` notice; audio still runs.

## Named reference

**arXiv:2607.19212** — *"Teleportation Game: Quantum Teleportation in Multi-Agent
Systems for Interactive Music"* (submitted 21 Jul 2026). It encodes musical agent
behaviour as quantum states, has agents teleport states to one another,
deliberately embraces transfer noise as musically expressive "quantum whispers,"
and creates a continuum between imitation and divergence. This prototype
implements that **framing** with plain deterministic rules.

## Unverified headless

`tsc --noEmit` and `next lint` pass clean. Not verified in this headless
container: actual WebGL2 rendering / point-sprite glow, audible output and
timbre balance, the exact feel of the DIVERGENCE continuum and dissonance onset,
and the reduced-motion path. These need a real browser with audio.
