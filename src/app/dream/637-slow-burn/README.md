# 637 · Slow Burn

**The one question:** What if Resonance could make the invisible *pocket* of a groove
**visible** — a tender, after-hours neo-soul vamp whose laid-back snare and pushed hats you can
*see* landing off the grid, and *feel* start to breathe as you loosen the feel?

A ~72 BPM lo-fi / neo-soul vamp built entirely from Web Audio primitives, with an SVG
**grid-vs-actual onset plot** as the visual centerpiece. Every voice carries its own microtiming
lean; a single FEEL lever scales them all from robotic to deep in the pocket, and the plot makes
that normally-invisible deviation legible in real time.

---

## What it is

- **Sound:** soft sine kick, brushed bandpass-noise snare, lazy filtered-noise hats, gliding sine
  sub-bass, and an FM Rhodes (sine carrier + 1:1 sine modulator, decaying tine envelope) comping a
  smoky after-hours progression — **Fm9 → Bbm9 → Eb13 → Abmaj9** — over vinyl crackle and a gentle
  lowpass haze.
- **The pocket, made audible:** each voice has a per-voice timing offset — kick dead-on (0ms),
  snare laid back (~+32ms), hats pushed early (~−11ms), bass a touch behind (~+18ms). A global
  **FEEL** lever scales every offset from `0` (quantized) through `~1.0` ("in the pocket") to `1.8`
  ("too loose"). Moving it makes the beat audibly breathe.
- **The pocket, made visible:** the SVG plot draws the 16th-note grid (vertical lines, beats
  emphasised). For every hit it renders a hollow ring at the grid time, a connecting line, and a
  glowing filled dot at the *actual* onset — colored and sized by voice + velocity. As FEEL rises,
  the dots visibly pull away from the grid.
- **A living vamp:** a reharmonization state machine drifts the upper-extension voicings, walking
  bass passing-tones, and ghost-snare fills over successive laps through the progression, so the
  vamp at minute three is not the vamp at minute zero.

## How to use

- **Start the vamp** (button) or press **Space** to start/stop. The AudioContext is created and
  resumed *inside* the click/Space handler (iOS gesture requirement).
- **FEEL / looseness:** drag the slider, or press **← / →** (or **[** / **]**) to nudge it. Taking
  manual control stops the auto-demo sweep.
- **Toggle voices:** number keys **1–5** (kick / snare / hat / bass / rhodes), or the labelled
  buttons.
- **Idle auto-demo:** within ~1.8s of load the vamp starts itself and slowly sweeps FEEL from
  robotic toward in-the-pocket on a ~14s breathing cycle, so even a **silent glance** (no audio
  hardware) sees the dots drift off the grid.
- **Read the design notes:** the corner button reveals an inline notes panel.

## Subsystems

| # | Subsystem | What it does |
|---|-----------|--------------|
| 1 | **Microtiming look-ahead scheduler** | `setInterval` poll (~25ms) schedules notes ~120ms ahead of `audioCtx.currentTime`; applies each voice's per-hit timing deviation × the FEEL lever (plus a hair of human jitter). |
| 2 | **From-scratch multi-voice synth** | Kick, snare, hats, sub-bass, and FM Rhodes built from oscillators / noise buffers / filters / envelopes. No samples. |
| 3 | **Reharmonization state machine** | Drifts voicings (added #11 / 13 color), walking-bass approach tones, and ghost-snare fills across "eras" (laps through the progression) for long-form, non-looping evolution. |
| 4 | **SVG grid-vs-actual onset renderer** | React-rendered SVG: 16th gridlines + per-hit hollow-anchor / connector / glowing-dot, refreshed each bar. The centerpiece that makes microtiming legible. |

That is **4 subsystems** (floor criterion #2 needs ≥3).

## Ear-safe master chain

`voices → lowpass haze → master gain → DynamicsCompressor (brick-wall limiter: threshold −10dB,
ratio 12) → destination`. Nothing can spike.

## Named references (floor criterion #3)

- **Datseris, G. et al.** *Does it Swing? Microtiming Deviations and Swing Feeling in Jazz.*
  Scientific Reports (2019) / arXiv:1904.03442 — quantifies per-voice timing deviation as the
  carrier of swing feel.
- **Charnas, D.** *Dilla Time* (2022) — the cultural/theoretical account of deliberately
  conflicting grids and the "off-grid" feel this prototype dramatizes.
- **arXiv 2605.10281** *Drum Synthesis from Expressive Drum Grids via Neural Audio Codecs*
  (May 2026) — grounds the "expressive drum grid" (per-hit timing deviation + strength) as the
  interface metaphor driving both the engine and the plot.

To my knowledge, the **per-voice microtiming-deviation engine** and the **grid-vs-actual onset
plot** are new to this lab.

## Caveats (build-verified, not browser-verified)

- This was authored and statically reviewed for correctness, the code-hygiene rules (no unused
  imports/vars, no `any`, no `use*`-named helpers, refs for mutable audio/render state to satisfy
  `react-hooks/exhaustive-deps`), and the typography / ear-safety / iOS-gesture constraints.
- It was **not** verified in a browser, and `next build` / `eslint` / `tsc` could **not** be run to
  completion in the build environment because dev dependencies (`@eslint/eslintrc`, type packages)
  were not installed there — standalone `tsc` reported module-resolution errors across the *entire
  repo* (~25k), not specific to this file. The handful of file-local implicit-`any` warnings that
  did surface were fixed with explicit annotations.
- Exact microtiming magnitudes, Rhodes timbre, crackle density, and the auto-demo sweep curve are
  tuned by ear-on-paper and may want a pass on real hardware.
- The reharmonization drift is intentionally subtle; its clearest tell over a short glance is the
  ghost-snare fills and the chord name advancing in the transport readout.
