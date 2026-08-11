# 9944 · restrata

**Cycle 2 of the "unbind" line — per-voice fragmentation of the self.**

## The one question

*What if a dissociative void could un-bind you **voice by voice** — each stratum of
sound-and-image peeling onto its own uncorrelated timeline until the self is
scattered across many streams, and a gesture re-phases them one at a time back
into a single event?*

Cycle-1 (`9928-unbind`) used a SINGLE global time-offset: one swell, image at
`t`, sound at `t + offset`, a lone offset wandering ±0.5 s, one "Re-bind" button
collapsing it. This piece deepens that from ONE global offset to **N=5
independent per-voice offsets** — the self doesn't just lag itself, it
*fragments* into separately-drifting strata that you rebind one at a time.

## Tags

- **INPUT** · auto + pointer
- **OUTPUT** · WebGL (layered fragment-shader void; not Canvas2D, not WebGPU)
- **TECHNIQUE** · per-voice cross-modal desync engine (N independent offsets)
- **PALETTE** · cold jade / silver / teal-white on near-black
- **TUNING** · inharmonic / spectral void-drone (stretched partials; not
  major/minor, not pentatonic, not a plain just chord)

## How it works

One clock. One swell envelope (`pulseEnv`, period ~7.2 s, sharp-ish onset, long
fall). From that single shape everything is sampled:

- **Image.** Every stratum is a concentric ring. Each ring's *image* half samples
  the swell at `t` — so all image rings bloom **together**, the one reference
  event.
- **Voice.** Each stratum is paired with one spectral drone voice (its own
  stretched-partial fundamental, its own place in the stereo field). Its *voice*
  half samples the SAME swell at `t + offset_i`, where **each offset_i wanders on
  its own amplitude, period (17–41 s) and phase** (seeded from
  `mulberry32(0x9944)`). Over ~20–40 s the five offsets fully decorrelate.

The desync is made visible per stratum: the voice ring is drawn *split away* from
its image ring by an amount that grows as the stratum un-binds, and it glows on
its own timeline. Bound → the two rings sit on top of one another and pulse as a
single clean event. Adrift → they peel apart in space and fall out of phase in
time. The audio module never sees the offsets; it just plays whatever per-voice
envelopes the page hands it. That is the whole trick: the same shape, sampled at a
different time per voice.

**Interaction.**
- *Tap a ring* (pointer down): the nearest still-drifting stratum snaps its offset
  to 0 and locks — one voice at a time, visibly (crisp steady ring, primary-tinted
  dot) and audibly (its lowpass opens and it sits forward).
- *Let go*: every stratum re-loosens back onto its own timeline.
- *Auto*: a self-demo state machine binds the strata one by one, holds the unified
  event a beat, then lets go — so the piece performs the bound↔unbound contrast
  with no input. Any tap hands control back to you.

A `bound: X / 5` readout with per-stratum dots shows which streams are gathered
and which are still adrift.

## Named references

- **Audiovisual Temporal Binding Window** — Cary, Noppeney et al. (2024): the
  brain fuses sight and sound into one percept only when they fall inside a
  narrow temporal window; push them apart and the "single event" splinters. This
  piece drives N independent windows past their edges.
- **Cerebral bases of the audiovisual temporal binding window** — the Feb-2026
  awake-surgery / intra-operative bioRxiv study mapping the cortical substrate of
  that window; motivates treating binding as *per-channel* rather than global.
- **TPJ disembodiment & depersonalization/derealization (DPD)** — the
  temporo-parietal-junction literature on out-of-body and disembodied states, and
  the felt "unreality" of DPD, as the phenomenological target: a calm, weightless
  scattering of the self rather than a threat.

## Honest limits

- The "temporal binding window" here is a metaphor rendered as an offset between
  two samples of one envelope — it is an *evocation* of the phenomenon, not a
  psychophysical instrument, and the numbers (±0.28–0.62 s, 17–41 s wander) are
  tuned for legibility, not measured thresholds.
- Five strata is a legibility choice; the real self is not five streams.
- The visual split between image and voice rings is a deliberate exaggeration so
  the cross-modal desync reads on a muted phone; strict temporal-binding research
  keeps the *image* fixed and lets only timing vary.
- No claim is made that this reproduces, treats, or induces any clinical
  dissociative state. It describes a *state* (dissociative, derealization, void,
  weightless) — never any substance.

## Safety / house constraints

Self-contained (shared imports only from `_shared/`). Web Audio + WebGL only, no
new dependencies, no server routes. No `Math.random` / `Date.now` — all
randomness is seeded `mulberry32(0x9944)`; the reverb IR and drone are
deterministic. No >3 Hz full-screen flicker; `prefers-reduced-motion` slows the
clock. Full teardown on unmount: rAF cancelled, audio nodes disconnected,
`ctx.close()`, WebGL context lost. WebGL failure degrades to an on-brand notice.
