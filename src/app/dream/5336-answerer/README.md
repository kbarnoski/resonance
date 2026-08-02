# 5336 — Answerer

## The one question

**What if Resonance were a real-time musical PARTNER that answers what you play
on a MIDI keyboard — a contrapuntal voice with its own will, that can echo you,
invert you, imitate you at a canonic delay, or REFUSE to resolve when you push
toward a cadence?**

Not a visualizer, not a particle field. The core is **interaction logic + music
theory**. The partner has agency: moment to moment it decides how to answer —
sometimes it agrees, sometimes it pulls away, and sometimes it withholds
resolution. Musical stakes, not neurological ones.

## How the counterpoint engine decides

Everything lives in `counterpoint.ts`. Key context is **C major**. For each note
the visitor plays, `decidePartner()` builds a small set of candidate answers,
weights them by the current mood, penalizes forbidden motion, and picks one with
a **seeded PRNG** (`mulberry32(0x5336)`), so a review run is reproducible.

The candidate moves:

1. **echo** — canon at the octave, delivered at a canonic delay (~520 ms).
2. **invert** — mirror the played note around a C5 axis.
3. **contrary** — a consonant scale-tone reached by moving *opposite* to the
   visitor's melodic direction.
4. **consonance** — the nearest smooth consonant answer (voice-leading default).
5. **suspend** — deliberately hold a dissonance (2nd / 4th / 7th).
6. **refuse** — on a cadence, the suspension becomes a *refusal to resolve*.
7. **resolve** — on a cadence, non-wilful voices land on a tonic-triad tone.

The rule base is **species counterpoint** (J.J. Fux, _Gradus ad Parnassum_,
1725): consonances are unison/oct, m3/M3, P5, m6/M6; **P4, tritone, 2nds and
7ths are dissonances**; the engine **prefers imperfect consonances (3rds/6ths)
and contrary motion**, and **penalizes parallel perfect fifths and octaves**
(weight × 0.12 when the previous vertical interval was the same perfect interval
moving the same way).

A **tension** state (0..1) is the engine's "will": suspensions raise it,
refusals raise it more, resolutions drop it sharply, consonances let it decay.
The tension bar in the UI reads this value live.

**Cadence cue.** When the played note is the **leading tone (B)** — the note
that pulls up to the tonic C — non-wilful moods bias hard toward *resolve*, while
**Wilful** biases hard toward *refuse*. That is the moment the piece is about.

## Behaviors / moods

- **Shadow** — close imitation; answers you as a canon at the octave, trailing
  at the canonic delay.
- **Contrary** — the mirror; favors inversion and contrary motion, meeting your
  line and moving against it.
- **Wilful** — its own will; raises tension through suspensions and, at a
  cadence, refuses to resolve. Play B→C repeatedly in Wilful and hear/see the
  partner decline to land on the tonic.

## Input / output

- **Input:** **Web MIDI API** (`navigator.requestMIDIAccess()`) is the star.
  Graceful fallback: an on-screen pointer keyboard (C4–C6) **and** a seeded
  auto-performance that self-demos hands-free. Browsers without Web MIDI
  (Safari/Firefox) get a `text-destructive` notice and the keyboard/auto-demo
  still fully work.
- **Output:** an SVG/DOM two-voice piano-roll (no canvas, no WebGL). Time flows
  right→left; your line is violet, the partner's answer is a magenta neighbor;
  thin lines link each answer to the note it replies to (solid = consonance,
  dashed = held dissonance) so convergence and contrary motion are legible.
- **Audio:** Web Audio, two timbres — soft triangle+sine for you, a bowed/pad
  detuned-saw tone for the partner — through a `DynamicsCompressor` limiter with
  master gain 0.2, ≤ 8 voices. Starts only on a user gesture.

## Self-demo

On load, a fixed C-major phrase loops and the partner answers it (visuals run
immediately, no device, no sound). Playing MIDI or the on-screen keys pauses the
auto-performance; it resumes after ~2.5 s of silence. Audio requires one tap
("Begin", "Connect MIDI", or any key).

## Named references

- **J.J. Fux, _Gradus ad Parnassum_ (1725)** — the species-counterpoint treatise
  behind the consonance/motion rules; plus the fugal **answer / inversion /
  stretto** tradition.
- **arXiv:2606.11886**, _Real-Time Language Model Jamming: A Case Study for Live
  Music Accompaniment Generation_ (June 2026).
- **ReaLJam (arXiv:2502.21267)** — real-time human-AI jamming that takes
  initiative. This prototype is the browser-feasible, **rule-based cousin**: the
  neural model swapped for a transparent voice-leading engine.

## Demoable vs rough

- **Demoable:** the decision engine, three distinct moods, dual-voice
  polyphonic audio through a limiter, the scrolling SVG piano-roll with
  relationship lines, Web MIDI in, on-screen keyboard, seeded auto-performance,
  live tension meter, design-notes modal.
- **Rough:** one fixed key (C major); cadence detection is a single-note
  leading-tone cue rather than a full harmonic parser; no velocity-driven
  dynamics; partner rhythm is a fixed note length rather than an independent
  rhythmic will.

## Self-assessment

The piece hits the brief's spine: a transparent, genuinely musical decision
engine — not randomness — where a reviewer playing thirds sees contrary-motion
or imitative answers, and Wilful audibly and visibly withholds a cadence. Input
(Web MIDI + fallback), output (SVG two-voice roll), core technique (species
counterpoint with weighted moods and a tension state), and the chamber-duet vibe
are all present and on-brand. The main compromises are musical scope rather than
craft: a single key and a lightweight cadence heuristic keep the logic legible
at the cost of harmonic generality.
