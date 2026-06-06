# 358 · Beat Mirror

**What if Resonance could find the pulse in live audio and lock a visual to it —
showing you the BPM it heard, with confidence?** Beat Mirror is an adult,
real-time beat & tempo tracker built to make the machine's *listening* legible.
It hears a beat, tells you the tempo (large and unmistakable), shows how sure it
is, and locks a clinical visual pulse to the predicted beat — with a scrolling
scope where you can SEE the alignment between what was heard (onsets) and what
the tracker predicts (beats). This is instructional, not a glowy nebula.

## How to use

1. Press **Start**. An internal **112 BPM** drum loop (kick / snare / hat) plays
   immediately and the tracker locks to it. Because you know the right answer
   (112), this self-demos that the pipeline is correct — no mic required, works
   on a phone with no permission prompt.
2. Watch the **detected tempo** readout settle near 112 and the **confidence**
   bar climb from amber (searching) → violet (tracking) → emerald (locked).
3. The **pulse** (ring + disc) flashes exactly on each predicted beat. The
   **scope** along the bottom draws the onset-strength envelope (violet), with
   detected onsets marked below the line (white ticks) and predicted beats
   overlaid as tall emerald ticks. When the emerald ticks sit on the onset
   peaks, the tracker is locked.
4. Switch the source to **Mic** to clap or play music at it and watch it relock.
   Mic input is **analysis only** — never recorded, never uploaded, never routed
   to the speakers (no feedback). If the mic is denied or absent you get a rose
   notice and the internal groove keeps running.

## Subsystems (≥3)

1. **DSP — onset strength + tempo induction + beat phase** (`tracker.ts`).
   Spectral-flux onset strength from a hand-written radix-2 FFT, a rolling onset
   envelope resampled to 100 Hz, autocorrelation-based tempo estimation over the
   60–180 BPM lag range with an octave check and a soft perceptual prior near
   120 BPM, and a cumulative-score beat-phase tracker that nudges a predicted
   beat grid toward recent onset peaks.
2. **Audio sources** (`audio.ts`). An internal Web Audio drum-loop synth
   (lookahead scheduler, synthesized kick/snare/hat at 112 BPM) that autoplays,
   plus a live-mic input path. Both terminate in one shared `AnalyserNode`; the
   groove is audible, the mic is analysis-only.
3. **three.js renderer** (`scene.ts`). An orthographic scene driving the pulse
   (disc + confidence-colored ring) and the scrolling scope (onset envelope,
   onset marks, predicted-beat ticks), mutated per frame through refs.

## The algorithm (in brief)

- Per frame: window the `AnalyserNode` time-domain block, FFT it, and sum the
  half-wave-rectified positive change in magnitude vs. the previous frame
  (spectral flux) → one onset-strength sample.
- Resample those samples into a 6 s onset envelope at 100 Hz; mean-subtract and
  lightly smooth it.
- **Tempo** = the lag of the dominant autocorrelation peak in the 60–180 BPM
  range (octave-checked, lightly biased toward 120); **confidence** = peak
  prominence over the autocorrelation baseline.
- **Phase** = the offset that maximizes the summed envelope at predicted beat
  positions; the predicted next-beat time is nudged toward that grid with a
  damped correction, and the pulse fires when context time crosses it.

## Named references

- Masataka Goto & Yoichi Muraoka, *"A Real-time Beat Tracking System for Audio
  Signals"* (ICMC 1995) — real-time tempo + beat-phase tracking with a
  perceptual tempo prior.
- *"OBTAIN: Real-Time Beat Tracking in Audio Signals"* (arXiv:1704.02216) — the
  onset-strength → cumulative-beat-score approach used for phase alignment.

## Ambition criteria hit

- **#1 novel technique** — real-time beat tracking / tempo induction is
  lab-first here; no prior beat-tracker prototype.
- **#2 ≥3 subsystems** — DSP pipeline, dual audio sources (internal synth +
  mic), and the three.js pulse/scope renderer (listed above).
- **#3 named reference** — Goto 1995 + OBTAIN (above).

## Honest status

**Build-verified, not browser-verified.** This passes the full `npm run build`
(TypeScript + ESLint) and the internal groove is designed to self-demo at a
known 112 BPM. **Unverified surface:** tempo lock on real *external* audio (the
mic path), and mic/analysis latency — the absolute phase of the visual pulse vs.
the room sound depends on output/input latency that is not measured or
compensated here. The internal-groove lock is the reliable demo; the mic path is
best-effort.
