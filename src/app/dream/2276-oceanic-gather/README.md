# 2276 — Oceanic Gather

An audio-first, eyes-closed instrument for **ecstatic oceanic union**. Twelve
detuned "world-voices" sit on a sphere all around your head in HRTF 3D space. You
**play** them with your whole body: tilt gathers them inward until their detuning
collapses to unison and they spatially converge into a **single fused presence at
the centre of your skull**. Many → one.

## The one question

> What if an ecstatic OCEANIC UNION were something you PLAY with your whole body,
> eyes closed, in headphones — a 360° sphere of many detuned "world-voices" that
> you TILT to gather inward until they phase-lock, their detuning collapses to
> unison, and they spatially converge into a single fused presence at the centre
> of your skull?

This targets the **bliss pole** of the oceanic / mystical-union state: the
self–world boundary dissolving into unity, not anxious loss. The core sensation is
**spatial** — many sounds "out there, all around" becoming one sound "here, inside
me" — which is why HRTF spatialization is the substrate: the self–world boundary
*is* acoustic space here.

## How to play

1. Put on **headphones** (HRTF panning needs both ears). Press **Begin**.
2. **Phone:** grant motion access when prompted, then **tilt** the device to
   gather the voices; hold it flat to let them disperse.
3. **Desktop:** move the **pointer outward from screen-centre** — distance from
   centre is the tilt proxy. Centre = dispersed, edges = union.
4. **Hands-free:** leave it alone and a **seeded autopilot** (mulberry32, seed
   `0x2276`) walks the whole disperse → gather → UNION → release arc over ~18 s,
   looping. It yields to any live tilt/pointer input and resumes after ~7 s idle —
   so a 6:30 phone glance both SEES the dots converge and HEARS the fusion.

## What's happening (the technique)

A single played **Union parameter U ∈ [0,1]** — a slew-limited **asymmetric**
follower of tilt magnitude (gathers fast, disperses slow) — simultaneously:

- **(a) Position** — lerps every voice's HRTF PannerNode from its sphere seat
  (radius ~4) toward head-centre `(0, 0, 0.2)`.
- **(b) Detune → unison** — eases each voice's independent microtonal detune
  (±35 ¢, plus a slow per-voice wander) to `0`, and glides the twelve pitches to a
  shared unison **D**.
- **(c) Beat-lock** — fades each voice's independent tremolo so the field stops
  beating and fuses into one steady presence.
- **(d) Bloom** — opens each voice's lowpass (900 → ~4200 Hz), raises reverb wet
  (0.15 → 0.70), and adds a warm master swell held under the compressor ceiling.

This is the spatial-audio **source-clustering / downmix** technique used as the
DSP analogue of the union collapse: grouping many spatial sources into one fused
cluster.

**Signal chain:** 12 voices, each = 3-partial FM-ish bell → per-voice lowpass →
GainNode → HRTF PannerNode (`distanceModel: 'inverse'`) → master GainNode (0.18) →
void ConvolverNode reverb → DynamicsCompressor → destination. An AnalyserNode is
tapped off master (never routed onward) to drive the visual's breathing halo.

## Harmony

Voices ride the degrees of **D-Dorian** (root D3 = 146.83 Hz), each with an
independent slow **±35-cent** detune at U=0, all easing to a shared **unison D** at
U=1. Deliberately **not pentatonic, not a just-intonation ratio stack, not
Bohlen–Pierce** — the many-to-one collapse is the whole idea.

## Tags

- **INPUT:** device tilt (DeviceOrientation β/γ) primary; pointer-distance proxy on
  desktop; seeded autopilot.
- **OUTPUT:** audio-only HRTF 3D spatial (primary) + a minimal, dim Canvas2D
  spatial map (secondary aid for sighted reviewers).
- **TECHNIQUE:** N HRTF PannerNodes on a sphere; one played Union parameter U that
  lerps position inward, eases detune to unison, raises beat-lock, blooms
  brightness + reverb.
- **POLE:** intense / ecstatic UNION / oceanic — presence BUILDS (many bind into
  one). Not dissolution-as-loss.

## References

- **Unterrainer, H-F.** "Oceanic states of consciousness — an existential-
  neuroscience perspective," *Frontiers in Human Neuroscience*, 2025-08-11. The
  OCEANIC scale; DMN-quieting; oceanic unity / timelessness; the embodied subject
  embedded in the world (Merleau-Ponty).
- **Spatial-audio source-clustering / downmix** — grouping many spatial sources
  into one fused cluster; the DSP analogue of the union collapse.

## Safety

- **No strobe.** The visual is a slow (<3 Hz) luminance breath routed through the
  shared `createSafeFlicker` engine (capped ≤ 2 Hz, soft sine, floor 0.72).
  `prefers-reduced-motion` pins it steady.
- The master bus runs through a `DynamicsCompressor`, so the union swell is a warm
  bloom, never a volume jump.
- Full teardown on unmount: rAF cancelled, listeners removed, oscillators stopped,
  AudioContext closed.

## Graceful degradation

- **No Web Audio:** a `text-destructive` notice; the visual map still runs.
- **No DeviceOrientation / desktop:** pointer proxy + autopilot (the UI says so).
- **iOS:** `DeviceOrientationEvent.requestPermission()` is called inside the Begin
  tap.

## Honest notes on what's unverified

- **HRTF fusion is untested headless.** I could not put on headphones in this
  environment. The convergence *math* is verified (positions lerp to centre,
  detune → 0, pitches → unison D), but how convincingly the binaural "out there →
  inside my skull" collapse *reads perceptually* depends on the browser's HRTF
  implementation and the listener's own head-related transfer function. This is the
  biggest open question.
- The neutral tilt pose (β ≈ 45°) and the tilt→U normalization are educated
  guesses; they may want tuning on a real device.
- Whether the beat-lock tremolo genuinely reads as "phase-lock" versus just an
  amplitude settle is a perceptual claim I couldn't confirm without listening.
- Voice count (12) and reverb tail are tuned by ear-of-the-mind only; on hardware
  the master swell headroom under the compressor may need a small nudge.
