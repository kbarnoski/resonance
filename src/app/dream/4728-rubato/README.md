# 4728 — rubato

**What if an accompanist could breathe with your rubato — no score, no click, no AI model — just an ensemble that follows the time you feel?**

You play a melody freely on the computer keyboard (or tap the stage): rushing,
dragging, holding — real expressive timing. A hand-rolled **attending
oscillator** infers your *intended* beat from the **timing of key events alone**
(never audio, never FFT, never a score or a learned model). A bass + chords +
soft-pad trio then lays notes **in time with that inferred beat** — speeding up
when you rush, stretching when you hold — so it feels like a trio breathing
_with_ you rather than a metronome you obey.

## The attending oscillator (`tracker.ts`)

The tracker is a nonlinear attending oscillator after **Large & Jones (1999),
"The Dynamics of Attending: How People Track Time-Varying Events"**. It holds an
internal oscillator with a continuous phase φ (0..1, where φ=0 is a beat instant)
and a period _p_ (seconds per beat). On every onset (a key/tap event, timed on
`performance.now()`), it applies two couplings:

- **Period coupling (gated).** The inter-onset interval is folded toward the
  current beat (so an occasional held note ≈ 2 beats, or a subdivision ≈ ½ beat,
  doesn't derail the tempo), then _p_ is pulled toward it by a **von-Mises-style
  focus gate** — strong when the onset lands near an expected beat, weak when it
  is off-beat. This is what makes it **stable yet responsive**: a moderate
  rush/drag is followed, jitter is resisted.
- **Phase reset.** The beat grid's `anchor` is nudged so the nearest predicted
  beat lands on your onset, keeping the felt beat aligned with what you played.

A smoothed **coherence** value (how tightly recent onsets hit predicted beats)
drives the visuals: high = confidently locked, low = re-adapting.

## The look-ahead scheduler (`audio.ts`)

Onsets live on the `performance.now()` clock; a fixed **perf→audio offset**
(captured when the AudioContext starts) maps each predicted beat onto
sample-accurate Web Audio time. Every animation frame the scheduler asks the
oscillator for the beats falling inside a short look-ahead window
(`nextBeatAfter`) and schedules, per beat, a **bass** note (root on strong beats,
fifth on the off — a two-feel), **chord** stabs on chord-change beats, and a soft
sustained **pad** on each bar's downbeat, from a small diatonic jazz turnaround
(`Dm7 · G7 · Cmaj7 · A7 · Dm7 · G7 · Em7 · A7`, advancing every two beats). Each
scheduled beat also queues a visual flash for its exact instant.

## The visuals (`page.tsx`, three.js)

A pendulum **trio** (bass / chord / pad) swings on the beat **phase** and pulses
(scale + emissive + additive halo) on each scheduled beat — bass every beat,
chord every two, pad every bar. A **beat-phase ring** carries an orbiting marker
at φ and brightens with coherence: when the lock is tight the bodies pulse
crisply; disrupt the tempo and they visibly re-adapt and dim. Melody notes throw
rising violet sparks. One renderer, one `requestAnimationFrame` loop, full
teardown on unmount (geometries/materials disposed, RAF cancelled, canvas
removed, AudioContext closed).

## Deterministic auto-demo (`demo.ts`)

The review may land on a **silent phone with zero interaction**, so on mount a
seeded "scripted human" (`mulberry32(0x4728abcd)`) feeds the tracker a phrase
**with deliberate rubato** — a few steady beats, a rush, a stretched drag, then a
settle — starting within ~1s and looping until you take over. A cold viewer sees
the ensemble visibly **speed up and stretch** to follow, hands-free. Timing is
fixed; the PRNG only adds ≤8ms of reproducible humanization. No `Math.random`,
no `Date` — the piece is fully deterministic.

## The opposite of the 2026 frontier

This deliberately does the **OPPOSITE** of today's frontier accompanists:

- **The ACCompanion** — Cancino-Chacón et al., _arXiv:2304.12939_ — an
  expressive automatic accompaniment system that follows a **score**.
- **"Real-Time Language Model Jamming"** — _arXiv:2606.11886_ (June 2026).
- **"Rubato: Transcribing Piano Music with Timestamps"** — _arXiv:2605.24291_
  (2026).

Those align to a score, a transcript, or a learned model. This one has **none of
that**: no score, no transcript, no model, no training — just a hand-rolled
oscillator that follows your **free rubato**, and it **cooperates** (it follows
you) rather than leading or arguing.

## Controls

- **Keys `a s d f g h j k`** — play a C-major row (C4..C5) and set the beat.
- **Space** — a neutral tap (rhythm without choosing a pitch).
- **Tap the stage** — works on touch; the horizontal position picks the pitch.
- **Play along — enable sound** — starts audio (needed once, on a gesture); the
  demo keeps going with sound until you play.
- **Mute**, **Design notes**.

## Honest limitations

- Tracks a **single tactus** (roughly one note per beat); very syncopated or
  polyrhythmic input can confuse it.
- **Fixed key and progression** — it doesn't infer harmony from what you play.
- The perf→audio clock mapping is a **fixed offset**, so audio can drift a few ms
  over very long sessions.
- Bootstraps tempo from your first interval, so the first beat or two after you
  take over may re-settle before locking.
- No WebGL → the ensemble can't render, but the tracker and audio still run and a
  DOM bar shows the inferred beat phase.

## References

- Large, E. W. & Jones, M. R. (1999). _The Dynamics of Attending: How People
  Track Time-Varying Events._ Psychological Review, 106(1).
- Cancino-Chacón, C. et al. _The ACCompanion._ arXiv:2304.12939.
- _Real-Time Language Model Jamming._ arXiv:2606.11886 (2026).
- _Rubato: Transcribing Piano Music with Timestamps._ arXiv:2605.24291 (2026).
