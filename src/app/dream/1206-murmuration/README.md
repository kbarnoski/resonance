# 1206 — Murmuration

*An ensemble you conduct as a flock.*

## The question

What if the ensemble were a **murmuration** — a flock of ~180 voice-birds that
sing when they cluster — and each person in the room is a glowing **attractor**
that pulls the flock, so several people together sculpt one emergent piece of
music by moving the swarm?

This is the lab's first **emergent-swarm shared ensemble**. Prior multi-peer
pieces are 2-person duets; prior flocking pieces are solo. Here the swarm is the
instrument and any number of hands play it at once. It is fully alive solo — you
steer the whole flock while two gentle ghost-attractors drift so the piece
breathes on its own — and becomes collaborative the moment a second tab joins.

## The flock (Reynolds 1987)

The visuals are a classic boids simulation — Craig Reynolds' 1987
*Flocks, Herds, and Schools* — with three local rules per bird:

- **separation** — steer away from crowding neighbours
- **alignment** — match the heading of nearby birds
- **cohesion** — drift toward the local centre of mass

On top of that, every bird is pulled toward the **union of all attractors**
(you, the ghosts, and each remote peer) through a soft distance-eased well.
Every client integrates the flock **locally** from a **fixed random seed**, so
all same-origin tabs converge to the same emergent shape without streaming 180
birds over the wire — only the handful of attractor positions cross the channel.

## The sound clock — lookahead-commit

The flock's *motion* is continuous, but its *voice* is quantised to a shared
beat grid so a room stays musical. A shared tempo and origin `t0` are broadcast
once (earliest `t0` wins, so every tab agrees). A ~40ms scheduler:

1. detects **knots** — grid cells holding ≥ K birds (a cluster forming),
2. **quantises** each knot to the **next beat** in a 1-beat lookahead window,
3. schedules the grain via Web Audio at `audioCtx.currentTime + (beatTime - now)`,
4. broadcasts a cluster **intent** `{col, row, beat, midi, brightness}` so all
   clients ring the same note in phase, playing cached future onsets rather than
   blocking on a message.

This lookahead-commit scheme follows the anticipation-then-commit pattern from
**ReaLJam (arXiv:2502.21267, 2025)** and the streaming real-time generation of
**StreamMUSE (arXiv:2606.11886, 10 Jun 2026)**: decide slightly ahead of the
beat, commit, and let the shared grid keep distributed players locked together.

## The voice

Deliberately **not** a just-intonation choir or drone (banned this week).
Each cluster fires a **granular / bowed-glass ping**: a triangle fundamental
plus shimmering detuned upper partials through a pitch-tracking band-pass, with
a short high-passed noise grain for the glassy pluck transient, and a fast
bowed attack into an exponential decay. Pitch maps to the cluster's **vertical
position** on a minor-pentatonic set (higher on screen → higher pitch);
**brightness** maps to flock speed. Polyphony is bounded (voice-steal, max 10)
so a busy flock never turns to mud. A short generated impulse-response reverb
gives it glassy space. All synthesised in Web Audio — no assets.

## Palette & motion

Chromatic chiaroscuro, not bright daylight and not flat near-black: a deep
indigo/charcoal base with luminous additive streaks and trails, shaded
**teal → magenta → amber** by speed. Each attractor is a distinct-hued glow
carrying its peer's colour; clusters bloom with an expanding ring when they
sing. Motion is continuous and organic — no strobe, no full-screen flash;
luminance changes stay smooth and slow for photosensitive safety.

## Demoing multiplayer

Transport is `BroadcastChannel("resonance-ensemble-1206")` — zero infra,
guaranteed same-origin. **Open a second browser tab (or another device on the
same origin) and click "Enter the flock"** in each. Every tab becomes an extra
glowing hand; move your pointer/touch to steer, and watch the shared flock and
its notes stay in phase across tabs. Peers silent for >5s are pruned.

## Honest limits

- **BroadcastChannel is same-origin only** — this demos as multi-tab / same-
  device multiplayer. True cross-device play needs a signalling hop; **WebRTC
  is the next step**.
- The flock is *deterministic-ish*: fixed seed + shared attractors keep tabs
  visually close, but floating-point drift and message latency mean shapes can
  diverge slightly over long sessions. The **sound** stays phase-locked because
  it rides the shared beat grid, not the pixel-exact flock.
- Voice-steal is by refusal (drop new onsets past the cap) — simple and safe,
  occasionally dropping a note under very dense clustering.

Run: it's a Next.js client route at `/dream/1206-murmuration`. Loads in <1s,
degrades to solo if BroadcastChannel or Web Audio is unavailable.
