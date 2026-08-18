# 15248 · Coherence

**Route:** `/dream/15248-coherence`

> What if Karel's recording only comes into full presence when your *breathing*
> phase-locks to a slow ~6-breaths-per-minute pace — so you literally breathe his
> music out of a veil by achieving cardiac/respiratory coherence?

This is the dream lab's second biosignal piece. The first read the visitor's
heartbeat via camera PPG; this one reads the visitor's **breath** and rewards
**coherence** — how well their breathing entrains to a resonance-frequency pacer.
As coherence rises, one of Karel's real sustained piano takes lifts from a distant,
veiled, dim state into full-band intimate presence. Lose coherence and it recedes.

## How to use it

1. Pick a recording (default: **"Bath"**) and press **Begin**. Grant microphone
   access when asked.
2. Watch the grayscale field. It gently **expands on the inhale and settles on the
   exhale** every ~10 seconds — that slow glow is your breathing guide. Match it:
   breathe in as the light swells, out as it settles. About six breaths per minute.
3. As your breath phase-locks to the pacer, the **coherence meter** climbs, the
   diffuse fog **focuses toward a single bright still point**, and Karel's take
   opens out of its veil — the low-pass lifts, the level rises, and a distant echo
   tail recedes into dry, close presence.
4. Press **Draw the veil** to stop. Everything tears down cleanly.

**No microphone?** Toggle **Guided demo** (or deny the mic prompt): a
perfectly-coherent breath is synthesized from the pacer itself so the whole
veil-lift and visual bloom play end to end with no sensor.

## The audio (hard rule)

The **only** audible sound is one of Karel's real catalog recordings — zero
oscillators, zero synthesis. The breath signal and the pacer are **control signals
only**, never audio sources. The microphone node dead-ends at an analyser; the
visitor never hears their own mic.

The take is loaded via `loadRealTrackBuffer` from `_shared/welcomeHome` and looped.
Everything ends at `createSafeMaster(...).input` — never `ctx.destination` directly.

### The veil-lift chain (driven by coherence 0→1)

```
bufferSource → lowpass filter → mainGain ─────────────────► master.input   (dry, present)
                     └────────► wetGain → delay ⟲ feedback ► master.input   (distance tail)
```

| Parameter        | coherence 0 (veiled) | coherence 1 (present) |
| ---------------- | -------------------- | --------------------- |
| lowpass cutoff   | ~320 Hz (muffled)    | ~18 kHz (clear)       |
| main gain        | 0.25 (quiet)         | ~0.95 (full)          |
| distant tail     | 0.5 (far away)       | ~0.05 (dry, intimate) |

The cutoff sweep is exponential and every parameter is ramped with
`setTargetAtTime` (time constant ~0.6 s), so the lift feels like a tide of clarity,
never a switch.

## The coherence estimator

A pacer phase `p(t)` runs at period **10 s** (0.1 Hz). Lung-fill is
`0.5 − 0.5·cos(2πp)` — rising through the inhale half, falling on the exhale.

The visitor's breath envelope is the **time-domain RMS** of the mic, heavily
smoothed (~0.9 s follower) so only the slow breath rise/fall survives. Coherence
blends two terms, then is smoothed so it drifts like a tide rather than jittering:

- **Phase match** — a running Pearson correlation between the breath envelope and
  the pacer over a **24 s** sliding window (sampled at 20 Hz). Positive correlation
  means they inhale when the pacer says inhale.
- **Rate match** — the visitor's breath period is estimated from inhale-peak
  intervals; `exp(−(period − 10)² / 18)` peaks at a 10 s period.

A variance gate zeroes the phase term when the visitor is barely breathing, so
silence doesn't read as spurious coherence.

## The visual — WebGL2 achromatic "breath lens"

A hand-written WebGL2 GLSL ES 3.00 fragment shader on a full-screen triangle.
**Grayscale only** — near-black at rest, luminous silver-white at full coherence,
no color hues anywhere. Domain-warped value-noise builds a soft caustic field:
heavily blurred, dim and diffuse when coherence is low, sharpening into crisp
filaments and gathering toward a single bright still point as coherence → 1. Fine
detail shimmers with `safeMaster.analyser` (Karel's real audio). The whole field's
luminance expands on the pacer's inhale and settles on the exhale at the 10 s
period — the visible breathing guide, a slow glow (≤1 change per ~5 s, never a
strobe). If WebGL2 is unavailable, a 2D `<canvas>` radial glow stands in so the
piece still demonstrates.

`prefers-reduced-motion` freezes the field to a steady static glow and stops the
shimmer; the inhale/exhale text cue still guides the breath.

## Named references

- **Lehrer, P. M. & Vaschillo, E.** — the resonance-frequency breathing / HRV
  biofeedback literature. Breathing near **~0.1 Hz (about six breaths per minute)**
  maximizes heart-rate variability and phase-locks respiratory and cardiovascular
  rhythms (the baroreflex resonance). This is the physiological basis for the 10 s
  pacer. (Lehrer & Gevirtz, *Frontiers in Psychology*, 2014, review; Lehrer et al.,
  *Applied Psychophysiology and Biofeedback*.)
- **"Guiding Breathing at the Resonance Frequency with Haptic Sensors" —
  *Sensors* (2023).** Work on pacing breathing precisely at the individual
  resonance frequency and the value of a clear external pacer, which motivates the
  slow visual guide here.
- **Resonance vs. fixed 0.1 Hz breathing RCT — *Scientific Reports* (2026).** A
  randomized controlled trial comparing individually-tuned resonance-frequency
  breathing against a fixed 0.1 Hz pace. This prototype uses the fixed-0.1 Hz pace
  for simplicity; per-visitor resonance tuning is a natural extension.

## Honestly, what is NOT device-verified

- **The breath-sensing pipeline is prototype-grade, not clinically validated.**
  RMS-envelope breath detection from a laptop/phone mic is noisy: it can be fooled
  by room noise, HVAC, speech, or a quiet breather, and it does not measure any
  cardiac signal at all — "coherence" here is a *breathing-to-pacer entrainment
  score*, not a measured HRV or cardiac-coherence value. Treat the meter as an
  expressive, encouraging estimate, not a physiological readout.
- **The rate estimate is coarse** — it needs a couple of clean inhale peaks before
  it contributes, so early coherence leans on the phase correlation.
- **The guided demo is synthetic** by design: it drives a perfect breath so the
  full veil-lift can be demonstrated with no microphone. That path exercises the
  audio and visuals end to end but tests nothing about real breath sensing.
- **Cross-device behavior is unverified.** It was written to the shared APIs and
  passes lint/type-check, but mic gain, autoplay-resume, and WebGL2 support vary by
  browser and device; the 2D-canvas and mic-denied fallbacks exist precisely
  because those paths cannot be guaranteed everywhere.
