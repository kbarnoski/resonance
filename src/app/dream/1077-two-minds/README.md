# 1077 · Two Minds

Two people, apart, whose separate rhythms slowly **entrain** — the piece makes
the invisible inter-brain synchrony between them visible and audible. This is the
lab's first **social / collective-consciousness** psychedelic piece: every prior
one is a solo trip. Here there are two distinct luminous presences that approach
each other across a void until they meet.

Route: `/dream/1077-two-minds`

## The one question it answers

What if a psychedelic experience could be *shared* — two beings, apart, whose
separate rhythms slowly synchronize, and the piece renders the interbrain
synchrony between them as something you can both see and hear?

## How to experience it

- Press **Begin** (Web Audio needs a gesture).
- **Tap a pulse:** Spacebar, or click / tap anywhere on the field. Each tap is a
  discrete onset; from the stream of onsets the piece estimates your tempo
  (median inter-onset interval) and re-aligns your phase to each tap.
- **Be the partner:** open this same page in a **second browser tab**. The two
  tabs couple instantly over a `BroadcastChannel` (channel `"two-minds"`) — no
  server. Tap in both tabs and drive them into sync.
- **The guide (no partner yet):** when no BroadcastChannel partner is present, a
  synthetic partner appears. It starts at an OFF tempo and, over ~35 seconds,
  drifts toward matching your tempo and phase — so the whole **apart →
  approaching → merged → held** arc plays out on a *single tab* with zero setup,
  even on a phone glance. It is labelled `● guide (no partner yet)` vs
  `● partner connected`.
- **Idle:** if you never tap, a gentle self-pulse keeps the piece sounding and
  moving on its own.

Peers are tracked in a small map keyed by a random per-tab id (last-writer-wins),
and pruned if not heard from within ~5 s. 0 or 1 partners are both handled.

## The interbrain-synchrony grounding

The measured neural signature of shared trance / collective states is
**theta-band frontotemporal inter-brain synchrony**, as surveyed in the
**Frontiers (2026) narrative review of inter-brain synchrony in mindfulness /
meditation hyperscanning**. Two brains in a shared contemplative state show their
frontal/temporal theta rhythms lock together. This piece dramatizes exactly that:
two "minds" that fall into sync, with the synchrony surfaced as a felt readout.

### References

- Y. Kuramoto (1975), *Self-entrainment of a population of coupled non-linear
  oscillators.*
- Steven Strogatz, *Sync* (2003).
- Frontiers (2026), narrative review of inter-brain synchrony in mindfulness /
  meditation hyperscanning (theta-band frontotemporal inter-brain synchrony as
  the signature of shared states).

## The coupling / synchrony math

Each mind is a Kuramoto phase oscillator: `dφ/dt = 2π·f + K·sin(φ_other − φ_self)`.
Tapping near the partner's beat lets the coupling `K` pull the two phases
together, so lock feels *earned* rather than snapped. The **synchrony index** is
the phase-locking value `|mean(e^{iΔφ})|` over a short sliding window of the
instantaneous phase difference `Δφ = φ_remote − φ_local`, then slewed so it moves
like a felt state, not a jitter.

## What maps to what

- **Visual:** warm (amber/rose) presence = you; cool (violet/cyan) presence = the
  other mind. Each pulses on its own beat. As synchrony rises they drift toward
  centre, a woven Lissajous/interference figure grows and sharpens between them,
  and at full lock they blend to a shared gold-white. A large `%` readout + meter
  is the emotional core.
- **Audio (shared engines):** two `droneBank` voices (one per side) through the
  shared `createVoidReverb` → a `DynamicsCompressor` → destination. A detuned
  sustained pair **beats** when out of sync and ramps to **unison** as sync rises
  — you hear the minds lock. Each tap is a soft 2-op FM bell panned to its side.
  Sustained high sync **blooms a held collective just-intonation chord**
  (added-sixth), reverb opens, drive rises — the ecstatic peak — then it breathes
  back down. Voices are poly-capped (≤10) and self-clean on end.

## Safety

No strobe. Pulses and blooms are eased (fast rise, slow luminous decay);
luminance changes are smoothed and stay well under 3 Hz. No full-screen flashing.

## Next-cycle deepening

- A manual **WebRTC copy-paste SDP** path (`RTCDataChannel`) for real
  cross-device partners, kept optional so it never blocks the local paths.
- More than two minds: a small **collective** of oscillators with an order
  parameter for group coherence (true Kuramoto ensemble).
- Map real **theta-band EEG** (or a webcam pulse proxy) into the onset stream so
  the entrainment is driven by an actual physiological rhythm.
- Spatialize the two presences in true stereo/ambisonic space as they approach.
- A "memory" of past lock moments — the field keeps faint scars where the minds
  previously met.
