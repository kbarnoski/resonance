# 3056 · Clearlight

**What if you could _breathe_ a boundless clear light into being?**

A drug-free meditation instrument. A soft, edge-free **Ganzfeld** field fills the
screen; calming and slowing your breath brightens it until faint hallucinatory
**form-constants** — concentric rings and a soft spiral — surface from the light.
The whole piece is driven by a single scalar: your breath.

This is the meditation / hypnagogia corner of the psychedelic-states lab. The
pole is **cosmic-ambient** — slow, weightless, luminous, never intense.

## How to use

1. Find a quiet place, put on headphones, turn screen brightness down.
2. Press **Begin** (this is the user gesture that starts audio + mic).
3. Breathe _with_ the slow **pacer ring**: inhale as it grows, exhale as it
   shrinks. Aim for long, calm, even breaths (~5.5 / min).
4. Over a minute or two of sustained calm, faint rings and a spiral fade up from
   the field. Fast, agitated breathing scatters them back into noise.
5. Optional: **Photic pulse (opt-in)** adds a slow, safety-capped luminance
   drift behind an explicit warning. **Stop photic pulse** kills it instantly.
6. No microphone? The piece falls back to a **seeded synthetic breath**
   (`mulberry32(0x3056)` driving a ~5.5-bpm sine) so it fully self-demos.

Live readout (top-left): `breath %` (envelope), `calm %` (accumulator), `bpm`.

## The mapping — breath → light → sound

One scalar `breath ∈ [0,1]` from a self-scaling amplitude follower (fast attack,
slow release; a slow envelope, never pitch / FFT tone):

- **Light — center-out bloom.** The inhale expands and warms a radial
  "clear light" bloom growing from the center; the exhale softens it.
- **Light — field brightness.** Base Ganzfeld luminance rises with breath _and_
  the accumulated `calm`, with an imperceptibly slow hue/lightness drift held
  inside the brand violet arc.
- **Sound — drone drive.** A low just-intonation drone bed (shared
  `droneBank`) swells on the inhale and softens on the exhale, routed through a
  long convolution **void** tail (`convolutionVoid`) so each swell blooms and
  hangs. A barely-there Shepard–Risset shimmer (`shepard`) rises underneath for
  boundlessness. Continuous — never snapped to a scale/JI grid on the fly.
- **Form-constants — gated by calm.** A separate `calm` accumulator rises on a
  ~34 s time-constant only while breathing is slow and steady, and falls on a
  ~4.5 s constant when agitated. Above a threshold it fades up concentric rings
  (the Klüver **tunnel** constant, `formConstant` from the shared `logpolar`
  engine along `log r`) and a logarithmic **spiral** — near-subliminal, brighter
  the calmer you are. `agitation` jitters them apart back toward noise.
- **Pacer.** A 5.5-bpm ring (`0.0917 Hz`) to breathe with.

## Safety

Safety is non-negotiable. By default the field is a slow **luminance drift** with
**no flicker at all**. The optional photic pulse is:

- **opt-in** behind an explicit two-step photosensitivity warning;
- routed through the shared `SafeFlicker` engine, **hard-capped below 3 Hz**;
- a soft sine luminance drift with a floor — never a high-contrast 0↔1 strobe;
- instantly killable (**Stop photic pulse**);
- forced to a sub-perceptual drift when `prefers-reduced-motion` is set (which
  also thins the form-constants and slows the visual clock).

This is **phenomenology, not medicine** — no medical claims are made.

## Named references

- Brion Gysin, _Dreamachine_ (1959) — flicker → closed-eye form-constants.
- Collective Act, _Dreamachine_ (2022).
- Ganzflicker alpha-brightening research (dual-alpha: entrainment + eye-closure
  rebound).
- _"From dots to faces"_, Neuroscience of Consciousness **2026(1) niag016** —
  imagery capacity predicts flicker-hallucination content.
- Klüver form constants; Bressloff–Cowan log-polar cortical map (via the shared
  `logpolar` engine).

## Shared-kit usage

First real composition of the shared psych audio + safety kit:
`droneBank.ts` (swelling drone), `convolutionVoid.ts` (long tail),
`shepard.ts` (endless-ascent shimmer), `logpolar.ts` (`formConstant` for the
rings), `safeFlicker.ts` (`createSafeFlicker` / `prefersReducedMotion`).

## Files

- `page.tsx` — the `"use client"` route: start gate, canvas, readout, photic
  opt-in, design-notes modal, frame loop, full teardown.
- `field.ts` — the Ganzfeld / bloom / form-constant / pacer Canvas2D renderer.
- `breath.ts` — the self-scaling breath follower, calm accumulator, and the
  seeded synthetic-breath fallback (`mulberry32`).
- `audio.ts` — wires the drone + void + Shepard and maps the breath scalar; owns
  the mic analyser and `readLevel()`.

## Next-cycle deepening

- **Dual-alpha entrainment.** Make the opt-in pulse phase-lock its (safe, sub-3-Hz)
  drift to the detected breath rate, chasing the Ganzflicker dual-alpha response.
- **Content that grows with imagery.** Let the form-constant _selection_ drift
  with sustained calm (rings → spiral → honeycomb via `logpolar.honeycomb`),
  echoing the "from dots to faces" progression.
- **Breath-hold detection.** Detect the natural pause at the top of the inhale
  and hold the bloom at its brightest during it — rewarding the retention.
- **Two-person Ganzfeld.** A shared field whose brightness is the _product_ of
  two breathers' calm, so the light only fully blooms when both settle together.
