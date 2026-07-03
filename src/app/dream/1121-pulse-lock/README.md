# 1121 · Pulse · Lock

**Pole:** cosmic-ambient (warm) · **State:** interpersonal entrainment /
co-regulation, meditative · **Input:** two press zones (multi-touch / left+right
click / F+J keys) as embodied metronomes · **Output:** Canvas2D two-lobe mandala +
Web Audio · **Technique:** two-body Kuramoto phase-coupling you can *feel*.

## The one question

> What if two people, sharing one phone, could **feel their two rhythms fall into
> sync** — and hear the moment of entrainment as the piece blooms into consonance?

Hold one device between two people. The left half of the screen is Person A, the
right half is Person B. Each person taps (or presses) their own **pulse** — an
embodied metronome, your heartbeat or breath rhythm. This is not tap-to-seed-a-
field: each zone is a personal tempo tapper, and the instrument works to bring the
two of you into phase.

## The Kuramoto mapping (the core mechanism)

Each person is modelled as a phase oscillator with phase θᵢ and natural angular
frequency ωᵢ. The two are coupled by the classic **Kuramoto** term:

```
dθ₁/dt = ω₁ + K · sin(θ₂ − θ₁)
dθ₂/dt = ω₂ + K · sin(θ₁ − θ₂)
```

- **Natural frequency ωᵢ** — set from the interval between a person's taps
  (a running mean of the last few intervals → tempo in bpm → ω = 2π·bpm/60). A
  tap also gives that oscillator a *soft* phase nudge toward the beat you just
  marked (a partial pull, never a hard reset), so the coupling term is still free
  to do its work.
- **Coupling term K** — eases up over the opening ~13 s (drift first, then
  entrainment), toward a ceiling `K_MAX`. Exposed in the engine state (`state.K`).
  Because two oscillators lock only when `K > |ω₁ − ω₂| / 2`, near tempos lock and
  far-apart tempos keep beating — the mechanic you *feel*: get close to lock.
- **Phase difference / order parameter** — `Δ = wrap(θ₂ − θ₁)` and, for two
  oscillators, the order parameter `r = |cos(Δ/2)| ∈ [0,1]` is the phase-alignment
  meter (`state.alignment`, shown as `phase-lock %`).
- **Phase-lock reward** — a smoothed `lock ∈ [0,1]` rises as alignment holds high.
  It drives the bloom: the two mandala lobes slide together and fuse into one
  symmetric form, a connecting filament brightens, a third **union** voice swells,
  reverb and brightness open, and the union's detune collapses from a beating
  shimmer to a fused unison.

## Sonification

- Master chain: `voices → toneBus → lowpass(brightness) → master → DynamicsCompressor
  (limiter) → destination`, with a convolution reverb send whose wet level opens
  with alignment.
- Person A / B each drive a warm swelling pad + a bell on every beat, tuned to a
  shared **just-intonation** scale (root 1:1 and fifth 3:2 over G3 ≈ 196 Hz), so the
  two are always consonant.
- The **union voice** (two roots + a soft fifth) blooms with `lock`; its detune
  `∝ (1 − alignment)` so approaching lock is heard as beating that slows and fuses.

## Visual

Canvas2D two-lobe mandala on a warm, non-black field. Rose (Person A) and amber
(Person B) rotating flowers orbit their own phases; as phases align the anchors
slide together and the lobes fuse into one symmetric bloom, with a brightening
filament between them. A ring meter shows phase-alignment; ripples mark each beat.

## Degrade / accessibility

- **Solo mode:** if only one side is being tapped, a deterministic **ghost partner**
  (mulberry32 PRNG, fixed constant seed `0x9e3779b9` — never `Math.random` /
  `Date.now` at module scope) taps the other side at a near-miss tempo, so a lone
  visitor still watches and hears the two drift toward lock. A hint says it is
  better with two. Source readout reads `two-players` only when both sides have a
  recent human beat, else `ghost-partner`.
- **Input:** multi-touch pointer events (two fingers register independently),
  left/right mouse taps on a laptop, and keyboard fallback (**F** = A, **J** = B).
- **prefers-reduced-motion:** orbital and spin motion are scaled down.
- **Safety:** no flicker/strobe — the field is fully repainted each frame with slow
  luminance drift only; no 3–30 Hz full-screen flashing.
- Client-side only. No network, no API routes, no AI.

## Named references

- **Yoshiki Kuramoto** — the coupled-oscillator synchronisation model
  (*Chemical Oscillations, Waves, and Turbulence*, 1984); here in its minimal
  two-oscillator form.
- **Interpersonal physiological / rhythmic synchrony** — entrainment and joint-
  action rhythm research: e.g. Strogatz's synthesis of coupled oscillators (*Sync*,
  2003), and work on interpersonal entrainment / joint action (Sebanz, Bekkering &
  Knoblich; Richardson et al. on unintended rhythmic coordination).
- Extends the lab's Kuramoto standout **1082 · Dissolve · Return** (a solo
  "hold still to lock" mechanic) into a genuine **two-body** coupling.

## Honest notes / unverified

- The "physiological synchrony" framing is *metaphorical*: this couples two tapped
  tempos, not real heartbeats or breath sensors. No biometrics are captured.
- Tap-tempo estimation is a simple running mean of the last few valid intervals
  (0.28–2.4 s); very erratic tapping produces noisy ωᵢ, which is intended (hard to
  lock when unsteady) but not tuned against user studies.
- Reverb is a synthetic exponential-noise impulse (its per-sample noise is the only
  runtime `Math.random`, at audio-buffer build time — not part of the coupling
  dynamics), not a measured room; timbre is approximate.
- Whether two strangers reliably *feel* co-regulation from this is an open,
  unverified claim — the piece is a provocation toward that feeling, not evidence.
