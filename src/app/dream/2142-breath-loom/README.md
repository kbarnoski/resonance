# 2142 · Breath Loom

An altered-states instrument with **no buttons and no screen to watch**. You play
it entirely with your **breath**, and the sound is a biofeedback loop that rewards
slow, coherent breathing by resolving from a harsh inharmonic shimmer toward
luminous consonance.

This is an **audio-first, embodied** piece. The Canvas2D aurora ribbon is
deliberately dim and secondary — the experience lives in the ears and the body,
not on the screen. Best with headphones and eyes closed.

## The one question

> What if an altered-states instrument had no buttons to press and no screen to
> watch — you play it entirely with your breath, and the sound is a biofeedback
> loop that rewards slow, coherent breathing by resolving from harsh inharmonic
> shimmer toward luminous consonance?

## How breath phases are detected

The microphone is the **sole input** (no touch, no buttons beyond a single
"Begin" gesture). After Begin, the mic feed is split with two biquad filters and
read by two analysers on the shared `AudioContext`:

- **Low band** — a lowpass at ~500 Hz captures the *body* of the breath (rushing
  air, chest/nasal resonance). Its **time-domain RMS** is the breath amplitude
  envelope.
- **High band** — a highpass at ~2.6 kHz captures turbulent **hiss**, which rises
  on a sharp, controlled exhale.

The envelope is normalized per-room with adaptive floor/ceiling followers (the
floor chases the quiet minimum, the ceiling chases the loud maximum), then
smoothed, and its slope is estimated each frame. A small state machine with a
minimum-dwell hysteresis classifies the phase:

| Phase   | Condition                                                        |
| ------- | ---------------------------------------------------------------- |
| inhale  | rising smooth energy — slope above +threshold                    |
| hold    | elevated plateau — high level, near-zero slope                   |
| exhale  | falling energy, or a hissy elevated slope (high-band ratio high) |
| rest    | low level and flat                                               |

Every transition fires a short, guarded `navigator.vibrate()` pulse (a longer
triple-pulse when a new breath begins). Haptics degrade silently — most desktops
and many browsers return `false`, which is ignored.

If the mic is unavailable or permission is denied, a **"Demo without mic"**
fallback drives the *same* engine from a gentle simulated breath cycle (a slow
rise → hold → fall that slowly lengthens), so the piece is always reviewable on a
phone.

## The Sethares stretched-partial bank

A **stretched timbre** (William Sethares, *Tuning, Timbre, Spectrum, Scale*, 1993)
replaces the harmonic series `f·n` with

```
partial_n = f · n ^ log2(A)
```

for a stretch factor `A`. With `A = 2.1` the partials are mildly inharmonic —
bell-like and luminous rather than buzzy. Each of the two drone voices is a bank
of **7 partials**, and each partial is a **pair of detuned oscillators** so the
roughness is heard as audible amplitude beating.

Sethares' central claim is that **consonance depends on timbre**. Computing a
Plomp–Levelt dissonance curve over the interval `r` between two of these
stretched (A=2.1) timbres (base 98 Hz, 7 partials, amplitudes `1/n^0.85`):

- deepest consonance minimum at the **stretched octave** `r = A = 2.10`
  (dissonance ≈ **0.12**),
- the ordinary **harmonic octave** `r = 2.00` is comparatively **harsh**
  (dissonance ≈ **0.33**).

So for this timbre the *stretched* octave is the consonant one — exactly
Sethares' point. The biofeedback maps the coherence measure `C ∈ [0,1]` onto:

- **Interval migration:** `r = 1.98 + (2.10 − 1.98)·C` — from the clashing
  near-harmonic octave toward the Sethares consonance minimum.
- **Beating detune:** `18¢ → 1.5¢` as `C` rises — the beats slow toward
  stillness. Inhalation adds transient roughness (charging the drone with
  dissonant, beating partials), scaled down again by `(1 − C)`.
- **Brightness:** the drone lowpass opens with `C` and with inhale charge.

### Coherence (the consonance parameter)

```
C_target = 0.12 + 0.88 · slowness · regularity
```

- **slowness** — mean breath period mapped so ~4 s → 0 and ~11 s → 1 (rewarding
  the ~0.1 Hz resonance-breathing band).
- **regularity** — `1 − std/mean` over the last few breath periods.

`C` eases toward its target with a slow ~4 s time constant (coherence is *earned*,
not switched), and decays if breathing stalls.

### Breath → sound dynamics (ascension, not dissolution)

- **Inhale** swells and *charges* the drone — a `charge` scalar lifts the upper
  shimmer partials and opens the tone. Presence *fills and rises*.
- **Hold** *locks* the shimmering sustain at its charged peak.
- **Exhale** *releases* a slow descending resonance — the fundamental glides
  gently down and the feedback-delay tail swells.

State / vibe: holotropic / pranayama **ascension** — building luminous coherence,
never the self draining away.

## References

- **William A. Sethares**, *Tuning, Timbre, Spectrum, Scale* (1993) — stretched /
  compressed partials and the dissonance-curve view of tuning, where consonant
  intervals follow the timbre's partial spacing. The `f·n^log2(A)` bank and the
  interval-migration target here are computed directly from a Plomp–Levelt
  dissonance curve over that timbre.
- **"Enabling Adaptive Cardio-Respiratory Biofeedback Training on Ubiquitous
  Hand-Worn Devices" (CHI 2026)** — its two-loop model: an *Action–Cognition
  Loop* connecting cognitive state to breathing action, and a *Signal–Biofeedback
  Loop* translating physiology into real-time guidance. The consonance reward in
  Breath Loom **is** that Signal–Biofeedback loop, rendered as harmony instead of
  a visual gauge.

## Safety

- **Audio-first. No strobe, no flicker.** The Canvas2D ribbon is intentionally
  dim and secondary; all its luminance changes are slow drifts, and
  `prefers-reduced-motion` thins it further.
- Haptics are short, guarded `navigator.vibrate()` pulses on breath-phase
  transitions only, and no-op wherever unsupported.
- The mic is analysed but **never routed to the speakers** — no feedback howl.
- The `AudioContext` is created and resumed inside the Begin click (autoplay
  policy); the rAF loop, oscillators, mic stream, and context are all torn down
  on unmount.

## Next-cycle deepening

- **True HRV coupling.** Approximate respiratory sinus arrhythmia from the
  envelope's inhale/exhale asymmetry and fold it into the coherence measure, so
  the reward tracks cardio-respiratory coupling rather than breath timing alone.
- **A full Sethares scale, not just the octave.** Let held breaths step the drone
  through the other dissonance-curve minima (the stretched fifth/third) so a long
  practice traces a stretched-consonant melody.
- **Per-user calibration.** A short breathe-in/breathe-out calibration to set the
  floor/ceiling and hiss thresholds before the loop begins, improving phase
  detection across rooms and mics.
- **Binaural rendering** of the two voices for a wider, more embodied field.
