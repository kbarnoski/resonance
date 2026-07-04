# 1165 · The Third Ear

**Route:** `/dream/1165-third-ear`

## The one question

**What if the instrument were inside your own ear?**

An audio-first, eyes-closed, headphones-on piece. The melody you hear is one your
cochlea generates but no oscillator ever plays — a **difference / combination
tone** (a "Tartini tone" / Amacher's "third ear").

## The mechanism (the whole point)

When two loud, close pure tones `f₁` and `f₂` sound together, the nonlinear
mechanics of the human auditory system generate an audible **difference tone at
`Δ = f₂ − f₁`** — a real phenomenon of hearing, not a component of the signal.
(The cubic combination tone `2f₁ − f₂` rides along too, but the quadratic
difference `f₂ − f₁` is the strong one and the one we compose in.)

So the piece holds a pair of high primary tones in the ~1.2–2.7 kHz "sweet spot"
where the effect is vivid, and **moves them together so their difference traces a
melody** in a low/mid register (~150–500 Hz). The two real primaries ride high
and nearly steady; **the gap between them, Δ, is the actual music.** The listener
hears a phantom line in a register where nothing is playing. That is the
instrument.

## The mapping

Symmetric about the carrier so the pair genuinely "moves together":

```
f₁ = carrier − Δ/2
f₂ = carrier + Δ/2
difference tone = f₂ − f₁ = Δ      ← the phantom melody
```

- **`Δ` (the composition)** is drawn from a **just-intonation major-pentatonic**
  scale of *difference values*: `Δ = 150 Hz × {1, 9/8, 5/4, 3/2, 5/3, …}` across
  octaves, clamped to ~150–500 Hz. Only Δ carries pitch content.
- **`carrier`** is the mean of the pair and the one live control the user sweeps.
  Sweeping it moves both primaries up/down **without changing Δ** — the played
  pitch climbs, the phantom melody stays put. That is the proof-of-phenomenon:
  the tune is in your head, not the signal.
- A slow shared **LFO (±85 Hz, 0.06 Hz)** is summed identically into *both*
  primaries' frequency params, so the pair drifts gently (keeping the ear-tone
  vivid) while Δ is preserved exactly.

### Long-form, evolving, deterministic

A small state machine (`Composer` in `audio.ts`) develops the phantom phrase over
minutes: **statement → variation → rest → return**, with a transposition that
drifts each cycle, so the piece is different at minute 3 than at minute 0. All
randomness comes from a single **seeded `mulberry32`** generator (constant seed
`0x7ea3ea2`) — no `Math.random`, no `Date.now`. The phrase glides legato (only
frequencies ramp; the oscillators never retrigger), so there are no hard onsets.

### The A/B proof

A toggle mutes the upper primary. With one pure tone there is no nonlinear
interaction, so **the difference tone vanishes** — the listener realises the
melody was never in the air. The diagram shows the phantom marker go silent to
match.

## Audio safety

- Master path ends in a `DynamicsCompressor` (limiter: −18 dB threshold, 12:1,
  3 ms attack) → a conservative master `GainNode` that starts at ~0 and only
  ever **ramps** (`setTargetAtTime`) up to **0.22**. Never an instant onset.
- All amplitude changes use `setTargetAtTime`; all pitch changes use anchored
  linear ramps. No hard gates on the sustained tones.
- Primaries stay in ~0.9–3.15 kHz (carrier 1.2–2.7 kHz ± Δ/2 + LFO), **capped
  well under 4 kHz** and at moderate gain — audible enough for the effect, never
  painful.
- Visible caption: *"Best with headphones. Start at low volume and raise
  gently."* plus a headphones recommendation.
- **Stop** ramps the master down (~0.18 s) then hard-stops every oscillator,
  disconnects all nodes, and closes the `AudioContext`. Same teardown on unmount.

## Visual (deliberately minimal / instructional)

Near-black, because the piece is anti-visual. The canvas is an **instructional
diagram**, not a glow field: a log frequency axis, two solid cyan dots for the
**played** primaries `f₁`/`f₂` with a bracket marking their gap Δ, and a distinct
hollow violet pulsing marker low on the axis for the **phantom** difference tone —
so a sighted user reads at a glance "these two are played; *this* third one is
only in your ear." A slow breathing ring is the calm anchor. Title, one-sentence
description, and the "headphones, eyes closed" instruction are crisp DOM text.

## Named references

- **Maryanne Amacher**, *Sound Characters (Making the Third Ear)*, 1999 —
  otoacoustic / combination "ear tones" composed as music.
- **Giuseppe Tartini** — *il terzo suono* / Tartini tones, 1714 (the difference
  tone, discovered on the violin).
- **Alvin Lucier** — interference / beating works.

## What's unverified (honest note)

This prototype was built **headless** — no speakers, no headphones, no ears in
the loop. The difference-tone **math and signal design are correct and standard**
(`f₂ − f₁`, symmetric carrier mapping, both primaries equal-loudness in the
effective band). But the actual **perceptibility** of the ear tone — whether the
phantom melody is clearly audible at these exact levels, on a given listener's
ears and headphones, in a given room — is **designed, not heard.** The effect is
real and well-documented, but it is level-, frequency-, and listener-dependent;
the carrier sweep exists precisely so each listener can hunt for the register
where their own ear-tone rings loudest. Treat the chosen gains and Δ range as a
sane starting point that would want real-ears tuning before calling it "verified."

## Files

- `page.tsx` — `'use client'` UI: gesture-gated Begin/Stop, the carrier sweep,
  the A/B phantom toggle, the instructional diagram canvas, full teardown.
- `audio.ts` — the ear-tone engine: primary oscillator pair, seeded difference-
  tone composer + state machine, shared carrier LFO, master compressor + safety
  ramps. Exports `ThirdEarEngine` (`start` / `setCarrier` / `setPhantom` /
  `stop` / `getState`) and `mulberry32`.
