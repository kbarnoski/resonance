# 1074 · Pulse Mirror

Play a rhythm — clap, tap, sing, or knock — and a duet partner tracks your tempo
and answers **on** the beat, anticipating it. A live score-follower / reactive
accompaniment: it listens to your rhythm, finds your pulse, and plays a warm
just-intonation call-and-response back, scheduled to your **predicted** next
beat so the answer lands in time rather than late.

Route: `/dream/1074-pulse-mirror`

## The one question it answers

What does it feel like to be *accompanied* — to have a partner that hears your
tempo and lands its reply exactly where you were about to put the next beat?

## How the onset / tempo / anticipation pipeline works

### Listener (mic path) — `listener.ts` `MicListener`

- An `AnalyserNode` FFT (1024) with `smoothingTimeConstant = 0`.
- A **~120 Hz highpass** sits before analysis to reject rumble / handling noise.
- Per frame we compute **positive spectral flux**: the sum of positive
  bin-to-bin magnitude increases (dB → gentle linear magnitude, then summed
  where the frame rose above the previous frame).
- An **adaptive threshold** = running `mean + 1.6 · stddev` over a short window
  (~0.7 s of frames).
- A **~90 ms refractory period** blocks double-triggering on one attack.
- Each accepted onset is timestamped on `audioCtx.currentTime` with a
  normalized strength.

### Tempo / beat tracker — `listener.ts` `TempoTracker`

- A rolling buffer of **inter-onset intervals (IOIs)**.
- Each IOI is **octave-folded** into the musical range ~0.3–1.0 s
  (≈ 60–200 BPM) by halving / doubling.
- The **median IOI** (smoothed) is the beat period; BPM = 60 / period.
- **Beat phase** is anchored to the most recent onset and repeats every period.
- **Confidence** falls out of the IOI spread (coefficient of variation): a tight
  cluster → high confidence; it also ramps with how many IOIs we have.
- `nextBeatAfter(t)` projects the next beat strictly after `t` — this is the
  prediction the scheduler commits to.

### Demo performer (no-mic path) — `listener.ts` `DemoPerformer`

A self-clocking synthetic onset generator that wanders ~90–120 BPM with slight
humanization (per-onset timing jitter, occasional syncopated skip) and feeds the
**same** `OnsetSource` → `TempoTracker` interface, so the whole follow-and-answer
loop is demonstrable **headless**. A badge shows emerald `● listening (mic)` when
the mic is live, amber `● demo performer` when synthetic.

### Anticipatory accompaniment — `engine.ts` `PulseEngine`

- A **lookahead scheduler** polls every ~25 ms and commits notes ~120 ms ahead
  on the Web Audio clock.
- Each answer is committed to the **predicted next beat time** so it sounds *on*
  the beat, not late (the core Dannenberg idea).
- Notes walk a pure **just-intonation ladder** — ratios `1, 9/8, 5/4, 4/3, 3/2,
  5/3, 15/8, 2` — over a warm ~220 Hz root, with a triangle voice + sine sub
  through a soft lowpass.
- A confidence gate holds the answer until a tempo is established.
- Underneath: a soft JI pad (shared `startDroneBank`) and a code-generated
  void reverb (shared `createVoidReverb`), all routed through a
  `DynamicsCompressor` before `destination`.

### Visual (raw WebGL2) — `renderer.ts`

Additive point-sprite / soft-blob rendering (`#version 300 es`, `gl.POINTS`,
additive `ONE, ONE` blending, soft radial falloff in the fragment shader):

- **Caller family** (amber, left) blooms on each detected onset.
- **Answer family** (violet/rose, right) blooms on each scheduled answer note,
  its vertical position set by pitch, with a faint pre-glow for anticipated
  notes before they land.
- An **expanding beat ring** pulses on the beat.
- A slow **sub-3 Hz background breath**.
- All blooms are eased (fast rise, slow luminous decay) — nothing strobes faster
  than ~3 Hz.

If WebGL2 is unavailable it degrades to an equivalent **Canvas2D** scene and the
audio keeps playing regardless.

## Controls

- **Start mic** — live listener on your microphone.
- **Start demo performer** — synthetic performer, no mic needed.
- Denying the mic falls back to the demo performer automatically (message in
  rose).

## Named references

- Roger B. Dannenberg, *"An On-Line Algorithm for Real-Time Accompaniment"*
  (ICMC 1984) — match the performer and **predict ahead** so accompaniment does
  not lag.
- Daniel P.W. Ellis, *"Beat Tracking by Dynamic Programming"* (2007) — beat
  tracking as recovering a **period + phase** from an onset-strength signal.

## Next-cycle deepening ideas

- Two-level metre: track beat **and** bar so answers can cadence over a phrase.
- Confidence-weighted voicing: thin the reply when unsure, harmonize when sure.
- Replace hard-thresholded onsets with a continuous onset-strength envelope and
  a dynamic-programming beat recovery (Ellis) for robustness to dropped beats.
```
