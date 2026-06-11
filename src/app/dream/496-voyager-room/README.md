# 496 · Voyager Room

## The one question
**What if Resonance gave you not an accompanist that FOLLOWS you, but a small ENSEMBLE of
autonomous machine musicians that listen to each other AND to you — improvising a piece
together — so your role is to CONDUCT the collective harmonic tension, leaning into
dissonance and releasing it, rather than to play the notes yourself?**

You never play a note. You shape a living room of five machine improvisers by steering the
*sensory roughness* of what they collectively sound — pulling toward consonance or leaning
into a deliberate, controlled clash.

## The ensemble (5 autonomous agents)
Each agent is an independent generator with its own personality, timbre (oscillator + partial
set), stereo pan, and color. Personalities shape a *probabilistic* next-note choice, not a
script:

- **VEGA — Leader** (violet, triangle, center): states/repeats a root motif, rhythmically
  most active. Anchors the harmony.
- **LYRA — Harmonist** (emerald, sine, left): roughness-minimizing — strongly punishes
  candidate notes that push measured roughness above the conductor's target.
- **DRACO — Provocateur** (rose, saw, right): tension-raising — biased toward tritones,
  minor 2nds and m9/M7 against the recent buffer, *scaled by the dial* (well-behaved at
  tension 0, aggressive near 1).
- **ECHO — Follower** (amber, square, left): echoes/imitates whichever other agent was
  loudest recently, transposed (unison / +5 / +7 / octave). Draws the lit answering edge.
- **NEBULA — Drifter** (soft blue, sine, slow): whole-tone wash, long sustains, favours
  even-semitone neighbours — the room's pad.

All notes are snapped to **D dorian** so dissonance is always a *choice* layered over a tonal
center, never random noise.

## The shared brain
A small client-side probabilistic generator (`agents.ts`). On each candidate note an agent
scores by:
1. **Voice-leading** — prefer small moves from the agent's register center.
2. **Roughness steering** — predict the Plomp–Levelt / Sethares sensory roughness *if this
   candidate joined the currently-sounding partials* (`roughness.ts`), then reward candidates
   that move *measured* roughness toward the conductor's **tension target**.
3. **Personality bias** — Harmonist pulls roughness down; Provocateur pushes it up (weighted
   by the dial); Leader favours the motif/root; Follower imitates the loudest peer; Drifter
   drifts by whole tones.

Scores are softmax-sampled. So at tension = 0 the room resolves to consonance; at tension = 1
it *sustains* a controlled dissonance — the harmonist keeps it from collapsing into mud while
the provocateur keeps it from resolving.

## Frame-synchronous clock (the StreamMUSE binding)
One shared beat clock (`stepFrame`, driven by a tempo-locked `setTimeout` chain so tempo can
change live). On each frame, every agent that is *due* (its `basePeriod`, adjusted by
spotlight) generates its next event **in lock-step**, reading the buffer of events emitted on
the **previous** frame (`prevFrameRef`) plus the live tension target — then the buffer rolls
(`prev ← cur`). This is StreamMUSE's frame-synchronous streaming inference: each next musical
event is generated in lock-step with a shared clock and a live external signal (here, the
conductor's dial), rather than autoregressively offline.

## The conducting model (the whole point)
The visitor does **not** play pitches. They conduct:
- **TENSION slider** (primary) — consonance ⇄ dissonance. Sets the roughness target the whole
  ensemble steers toward.
- **TEMPO** — beats per minute; the frame clock retimes live.
- **Spotlight** — tap an orb (or a name button) to make that agent lead/play out front and
  more often; others defer (quieter, sparser).
- **Auto-conduct** — on by default. The moment audio starts the room is *already* improvising
  and self-conducts a slow ~20s settle → build → release tension arc, hands-free. Any slider
  touch turns it off and hands control to the visitor.

## Visual (Canvas2D only)
Dark constellation: five glowing orbs in a ring. Orb size/brightness = that agent's live
activity/loudness; color = personality. A lit gradient **edge** is drawn when one agent is
answering/imitating another. The center is a **tension ring** — emerald/violet and smooth when
resolved, jittery amber/rose when tense — with a text label (Resolved · Settling · Tense ·
Clashing), the live roughness value, and the current voicing. Orbs sprout spikes as the room
gets dissonant and smooth out as it resolves. A beat pulse fires on each clock step.

## References
- **George Lewis, _Voyager_** (1980s–present) — the canonical autonomous machine-improviser
  "virtual orchestra" that listens and responds with its own musical will. This is a faithful
  homage to that stance: the machines have agency; the human conducts a collective, not a tool.
- **StreamMUSE — "Real-Time Language Model Jamming: A Case Study for Live Music Accompaniment
  Generation," Bowen Zheng et al., arXiv 2606.11886 (submitted 2026-06-10).** Core idea
  borrowed: **frame-synchronous streaming inference** — generate each next event in lock-step
  with a shared clock and a live external signal. Implemented here on-device with a lightweight
  probabilistic generator (no server, no network, no ML library).
- Sensory-roughness model: Plomp & Levelt (1965); William Sethares, *Tuning, Timbre, Spectrum,
  Scale* (parametric dissonance curve used in `roughness.ts`).

## Ambition criteria hit & why
- **Novel interaction:** you conduct *collective harmonic tension* via a roughness target, not
  notes — a control surface most music toys don't expose.
- **Autonomy / multi-agent:** five agents with genuinely different objectives that listen to
  each other (shared previous-frame buffer) and to you, producing emergent counterpoint.
- **Real research binding:** the generation loop is a literal implementation of StreamMUSE's
  frame-synchronous inference, and the steering signal is a real psychoacoustic model.
- **Always-alive demo:** music and motion the instant you tap Start, hands-free.
- **Robust:** master chain ends in a DynamicsCompressor brick-wall limiter; degrades to
  audio-only if Canvas 2D is unavailable.

## Unverified surface (I cannot run a browser)
- **Roughness normalization constants** in `computeRoughness` are empirical; the absolute
  mapping of the tension dial (0..1) onto perceived consonance↔dissonance may need a tweak so
  that tension 1 *clearly* clashes and tension 0 *clearly* resolves at typical chord density.
- **Audible balance** of the five voices (gains, low-pass cutoffs, pan spread, note lengths)
  is set by ear-on-paper, not by listening — saw/square voices may be too bright/harsh or the
  drifter pad too quiet.
- **Timing feel** of the `setTimeout`-chained clock under load (drift / jitter) is untested;
  it is deliberately not sample-accurate (events are scheduled at `ctx.currentTime`).
- **Phone ergonomics:** tap-to-spotlight hit radius (60px) and canvas height (`min(60vh,460px)`)
  are guesses; not validated on a real touch device.
- **iOS audio unlock** path (`webkitAudioContext`, resume-in-tap) follows the known recipe but
  is unverified on hardware.
- Whether the emergent output is *musically satisfying* over minutes (vs. a few bars) is
  genuinely unknown without listening.
