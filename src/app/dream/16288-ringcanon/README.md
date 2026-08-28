# 16288 · Ring Canon

**A canon whose answering voice is not a replay of his recording, but the resonance his own playing rings out of a tuned body.**

Two heads read one of Karel's real piano takes at decoupled time-bases — a canon
from a single recording (this is the mechanism 15824-canon established). The
first head is his **live** voice, near-dry. The second, drifting head is that
same take fed as the **excitation** into a bank of parallel high-Q bandpass
**modal resonators** tuned to the take's key center. The resonated sum is the
"modal body" his playing rings — a ghost instrument that answers him, in canon.
*He plays; the room he plays in answers.*

## How to play

Press **Ring the canon**. The full idea sounds on its own within about a second —
a baked canon lag and a modal bank tuned to the take's key, no input required. A
06:30 phone reviewer with no gamepad hears the whole piece immediately.

To refine it:

- **Gamepad (primary):** left stick **Y** opens the canon drift between the two
  heads; left stick **X** transposes the modal set (± an octave); right stick
  **Y** sets ring length (bounded feedback + resonator Q); the **A** button
  cycles to the next take. Sticks are deadzoned (~0.12) and integrate a dial, so
  you hold to change and release to hold.
- **No gamepad (fallback, works on a phone/trackpad):** **drag the canvas** —
  up/down opens the drift, left/right transposes the modal tuning. **Arrow keys**
  — up/down set ring length, left/right open the drift. An on-screen **Next take**
  button and the **take** selector switch recordings.

A small readout shows which input is live ("gamepad" vs "drag / arrow keys").

## What you see (Canvas2D, graphite + one chartreuse signal)

A spare, legible field on warm graphite. Two read-heads orbit his loop: a solid
chartreuse dot (the live voice) on the outer ring, a hollow chartreuse ring (the
answering ghost) on the inner ring — the angular gap between them is the canon
drift, drawn as a faint chartreuse chord. Around them, a **corona of tuned
modes**: one spoke per resonator, inert grey until his excitation energy hits its
band, then flaring chartreuse (read live from the safeMaster analyser's frequency
data — the mode nearest each band lights). A soft core pulses with his live
energy. Chartreuse is used *only* for the live/active signal; everything else is
graphite and neutral grey.

## Audio graph (all of it is his real audio)

```
his decoded AudioBuffer ──┬─ source A (live head, rate 1.0×) ─→ highpass 38Hz ─→ gain ─┐
                          │                                                             │
                          └─ source B (answering head, decoupled rate ~0.90–1.10×,      │
                                       started at a baked canon lag)                    │
                                   │                                                    │
                                   └─ excitation gain ─→ [ MODAL BANK ]                 │
                                                            │                           │
   MODAL BANK: 12 parallel "bandpass" BiquadFilters, Q 46–90, tuned to a               │
   pentatonic degree set on the take's key center, spread across octaves.              │
   Each mode → per-mode trim → sum.                                                     │
   Bounded regeneration: sum → delay → lowpass (900–3500Hz) → feedback gain            │
   (0.12–0.82, always < 0.85) → back into the bank input, so modes ring longer.        │
   sum → makeup gain ──────────────────────────────────────────────────────────────────┤
                                                                                        │
                                                          BOTH voices → safeMaster.input┘
                                                          → (shelf/cap/limiter) → speakers
```

Visuals are driven from `safeMaster.analyser` (fftSize 1024). Nothing connects to
`ctx.destination` directly — the shared safeMaster limiter is the only path to
the speakers and the final safety net for the feedback loop.

## Honest novelty statement

Modal / resonator / waveguide **synthesis** is common in this lab —
`827-waveguide-mesh`, `2086-bell-vault`, `6680-resonate`, `13488-striketemple`,
and others. **This piece does not claim a "first."** The fresh angle is narrow and
disciplined: **his real recording is the excitation** fed into the modal bank —
resonators as a *filter on his audio*, the same way `16160-roomtone`'s convolver
is a filter on his audio — used as the **answering voice of a canon** that drifts
in time against his live take.

References:

- **"Rigid-Body Sound Synthesis with Differentiable Modal Resonators"**
  (arXiv:2210.15306) — a bank of resonant IIR filters standing in for a modal
  body, learned from real recordings. Here the bank is hand-tuned to the take's
  key and driven by his own audio rather than a learned impulse.
- **Julius O. Smith III, "Physical Audio Signal Processing"** — digital
  waveguides and modal synthesis, the foundational treatment of resonant filter
  banks as physical bodies.
- **15824-canon** (the lab's lone 5/5) and the broader canon / Reich phase-music
  lineage it extends — one recording read at two time-bases so it plays in
  counterpoint against itself.

## Rule-10 compliance (audio source)

Every sample that reaches the speakers originates as Karel's real decoded
`AudioBuffer`, loaded via `loadRealTrackBuffer` from his verified catalog
(`REAL_TRACKS`). The resonators are **filters on his audio** — there are **no**
oscillators, **no** noise buffers, **no** Karplus-Strong, **no** generated tone
of any kind. The answering "instrument" is entirely his playing, band-selected
and rung by tuned filters.

## Limits I could not verify (built headless — no speakers, no gamepad)

- Whether the resonated answering voice reads by ear as a **ringing ghost** or as
  **mud** — the Q, feedback ceiling, and per-mode trims are reasoned defaults, not
  ear-tuned. If it muds, lower the mode count or the feedback default.
- Whether the **drift reads as a canon** (a recognizable delayed answer) versus a
  vague smear, at the baked lag and rate offset.
- Whether **chartreuse-on-graphite** reads well — contrast, flare legibility, and
  whether the two orbiting heads are distinguishable at a glance on a real phone.
- Gamepad mapping is written to spec but untested against a physical controller's
  axis/button indices, which vary by pad.
