# Impact Cairn (`1990-impact-cairn`)

**The one question:** *What if you built music by stacking timed physical
impacts you can play eyes-closed — feeling every hit in your hand — and could
UN-build it by knocking a stone off?*

An audio-first, near-non-visual, **haptic** instrument where the music is made of
**collisions**, not notes on a scale. Each tap drops a stone; the collision *is*
the sound. The piece is meant to be played with your eyes closed — the screen is
a quiet index of what's sounding, not a spectacle. It deliberately tests the
screen-first bias of the whole lab.

---

## The thesis: impacts, not notes; no pitch lattice at all

There is **no harmonic model here on purpose** — no scale, no tuning, no pitch
lattice. Every sound is a struck object rendered by **modal impact synthesis** in
pure Web Audio:

- a short **broadband noise transient** (the excitation / "attack"), low-passed
  to the material's colour, plus a little raw click for the moment of contact;
- driving a small bank of **3–6 band-pass "modes"** placed at **inharmonic**
  ratios (never integers, never chords), each with an exponential decay;
- **±4% per-hit frequency jitter** so no stable pitch can ever crystallise, even
  when two layers phase against each other;
- summed → master gain (**0.16**, ≤ 0.18) → `DynamicsCompressor` → destination.

Four **materials** differ *only* in modal ratios, decay time, excitation colour,
and resonator Q — droplet (high, bright, short), ceramic (ringing, long), wood
(dry, mid), stone (dark, thuddy). Resonator Q is capped per material so even a
hard strike can never blow up. **Timbre + rhythm are the entire compositional
material.** No JI, no diatonic scale, nowhere.

## Consequential, editable memory (the point)

The cairn is memory you can un-make, not just accumulate:

1. **Lay** — the taps you play accumulate into a *figure*; press **Lay layer** and
   it becomes a looping layer. A look-ahead scheduler (schedules ~120 ms ahead,
   timed off the `AudioContext` clock — never rAF) loops each figure tightly.
2. **Phase** — each layer loops at a slightly independent rate, so layers drift
   and **phase** against one another (Steve Reich). The composite rhythm evolves
   as the cairn grows.
3. **Knock a stone off** — delete a layer and the loop *audibly loses* it (plus a
   short "tumble" so un-making is a sound, not just a gap). Layer count is bound
   to 5 so the cairn stays legible.
4. **Change a laid stone's material** — a *transform* of existing memory: the
   layer's timbre changes on its next pass, not a new layer.
5. **Mute / clear** — per-layer mute and a global clear.

## The haptic channel (load-bearing, not decoration)

`navigator.vibrate` fires a **velocity- and material-scaled pulse on every
strike** (feature-detected; a silent no-op where absent). Stone knock-offs and
material changes get their own tactile confirmations. Where the device provides
it, `PointerEvent.pressure` supplies real strike velocity (fixed fallback
otherwise). No mic, camera, or tilt.

## Output: minimal, but reactive

A dark field. Plain `<div>` stones — no `<canvas>`, no WebGL, no SVG art scene.
A tap drops a pebble that falls and settles; each laid layer is one settled stone
in the cairn that **pulses on every hit it sounds**; knocking one off scatters
falling debris. Near-monochrome graphite / bone (art colours live only in the DOM
stones; all UI chrome is on semantic tokens). Respects `prefers-reduced-motion`
and never strobes.

## Self-demo (headless)

After **Begin** — or if you just wait — a **deterministic seeded ghost drummer**
(mulberry32 from a constant seed; all timing from the audio clock) taps a figure,
loops it, adds a phasing layer, then **knocks a stone off** and **changes a
material**, cycling forever so the whole edit grammar self-demonstrates with zero
input on a phone. A real tap takes over instantly; the ghost re-arms after ~15 s
idle. There is no `Math.random` / `Date.now` anywhere.

## References

- **Kato & Baba (Tokyo Metropolitan University), "A MIDI-Controlled Water-Droplet
  Interface for Generating Droplet Impact Sounds," SIGGRAPH 2026 Emerging
  Technologies** (program live July 19–23, 2026) — impact/droplet sound as a
  physical, playable instrument.
- **Steve Reich, *Clapping Music*** — phasing of identical figures at drifting
  rates.
- **Pauline Oliveros, *Deep Listening*** — an eyes-closed, attention-first
  listening practice.

## What works

- Modal impact synthesis with four distinct materials; genuinely no pitch
  lattice — hits read as struck objects, and phasing layers never form a chord.
- The full edit grammar is real and audible: lay, phase, knock-off (with tumble),
  material transform, per-layer mute, clear.
- Tight look-ahead scheduling off the audio clock; velocity from real pointer
  pressure; per-strike haptics on supporting devices.
- Headless deterministic ghost that demonstrates un-making, not just building.
- Full teardown on unmount: all cleanup timers cleared, nodes disconnected,
  `AudioContext` closed.

## What's rough / honest limits

- Audible decay length is bounded by the per-material Q cap, so tails are on the
  percussive side — this is a safety trade (uncapped Q can blow up on a hard
  strike) rather than a long-ringing gong.
- Layer periods come from your tapped figure plus a small phasing drift; they are
  not quantised to a grid, so very sparse figures can feel loose. That's the
  intent (physical, not clock-locked) but it can drift further than some players
  expect.
- Browsers generally only honour `navigator.vibrate` inside a user gesture, so
  the ghost drummer's hits are silent-haptic; the tactile channel is really the
  *player's* channel. On desktop / unsupported devices haptics are a no-op.
- A material change applies on the layer's next loop pass (by design), so on a
  long loop the timbre swap can feel delayed.
