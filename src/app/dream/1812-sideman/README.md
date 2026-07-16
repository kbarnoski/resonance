# 1812 · Sideman

**Route:** `/dream/1812-sideman`
**Tags:** input: keyboard-played (QWERTY) + optional Web MIDI · output: Canvas2D · technique: reactive/anticipatory generative accompaniment (score-following-lite: key/tempo inference + walking bass + rootless comping + brush-drum groove) · vibe: jazz (warm club)
**state/technique:** live-performance reactive accompaniment / rule-based generative jazz trio with an anticipation display

## The one question

> What if your rhythm section could read your playing a beat ahead — what if
> you played a melody at a QWERTY/MIDI keyboard and a generative jazz trio
> (walking bass + comping piano + brush drums) followed your tempo and key in
> real time, and — crucially — **showed you the chord it's about to play a beat
> before it plays it**, so you play *into* the change instead of chasing it?

The human leads; the machine anticipates. The headline is the **anticipation
display**: at all times the canvas shows the current chord, the next chord, and
a countdown/progress bar to the beat where the change lands.

## How it works

- **Input.** Two QWERTY rows are a ~2-octave melody instrument, quantized to the
  current inferred key so every note fits: `zxcvbnm,./` = lower octave,
  `qwertyuiop` = upper octave. **Web MIDI** is used if
  `navigator.requestMIDIAccess()` is available; otherwise it silently falls back
  to QWERTY. The key legend on the page updates as the key changes.
- **Score-following-lite.** Tempo is inferred from the median inter-onset
  interval of your recent notes (clamped 70–160 BPM, glided gently). Key is
  inferred from a decaying pitch-class histogram scored against major/minor scale
  templates (tonic/3rd/5th weighted). Either can be **locked** if inference feels
  jumpy. A look-ahead scheduler (25 ms interval, 120 ms lookahead, driven off
  `AudioContext.currentTime` — the "A Tale of Two Clocks" pattern) runs the trio.
- **The trio** (all synthesized, no samples, no external audio):
  - **Walking bass** — quarter notes: root → chord tones → chromatic approach
    into the *next* chord's root, so the line pulls toward the change.
  - **Comping piano** — rootless left-hand voicings (3rd/7th + 9/13 extensions)
    on syncopated swung off-beats; the "and of 4" comp anticipates the next
    chord.
  - **Brush drums** — swung ride pattern (skip note on 2 & 4), brush swish
    (filtered noise), feathered kick, hat "chick" on 2 & 4.
  - **Progression** — an 8-bar ii–V–I turnaround family transposed into the
    inferred key (a minor variant with iiø–V–i and a bVImaj7).
- **Anticipation display.** A scrolling time-lane shows chord blocks drifting
  toward a NOW line; the next block pulses and outlines as it approaches. A large
  `current → next` header with a per-bar progress bar and a "next change in N.N
  beats" readout makes the change legible a beat early.
- **Self-demo.** On Start the trio grooves immediately, and if you stay idle it
  plays short melodic phrases over the changes — so a reviewer who just clicks
  Start hears *and* sees a jazz trio playing.
- **Output safety.** Voices → per-instrument buses → volume mix → a
  `DynamicsCompressor` limiter (threshold −15 dB, ratio 20) → master gain →
  destination, keeping peak conservative (≈ ≤ 0.2).

## References

- **ReaLJam — "Real-Time Human-AI Music Jamming with Reinforcement
  Learning-Tuned Transformers", arXiv:2502.21267 (Feb 2025).** The idea borrowed
  here is *anticipation*: the agent commits to and **displays** its upcoming
  chords ahead of time so the human can react and the latency mismatch
  disappears. This prototype implements that anticipation-display idea in the
  browser.
- **Rootless left-hand voicings (Bill Evans / Bud Powell)** for the comping —
  3rd/7th-anchored shapes with 9ths and 13ths, no root (the bass owns it).

## Honest note

ReaLJam uses reinforcement-learning-tuned transformers. This prototype's
accompaniment engine is **rule-based, not ML** — hand-written music-theory rules
for the progression, walking bass, voicings, and groove, plus simple statistical
tempo/key inference. What is faithfully borrowed is the *anticipation display*:
committing to and showing the next chord ahead of the beat.

## Files

- `page.tsx` — client component: Canvas2D rendering, controls, QWERTY/MIDI input.
- `audio.ts` — `JazzEngine`: Web Audio synthesis, look-ahead scheduler,
  tempo/key inference.
- `engine.ts` — pure music theory: scales, progression, rootless voicings,
  walking-bass generator, key inference.
