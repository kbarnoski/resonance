# 1752 · Dissolve

**state:** dissociative ego-dissolution (k-hole descent+return) · **pole:** cosmic-ambient / dissociative

## The one question

**What if Resonance could dissolve your sense of self with sound ALONE — no screen?**

A drug-free dissociative / ego-dissolution descent-and-return rendered **entirely in
spatialized audio**. This is the screen-bias test: the visual is deliberately near-absent —
a near-black presence field, one dim slow-breathing violet glow, one instruction line, and a
single hairline that fills left→right as the descent deepens then empties on the return.
**Sound does all the work.**

## How to experience it

1. **Put on headphones** (binaural HRTF panning only works over headphones).
2. Press **Begin descent**.
3. **Close your eyes.** Do not look at the screen — that's the point.
4. Over ~75 seconds a single point of tone directly in front of you comes loose, orbits,
   decorrelates between your ears and diffuses into an enveloping field until front, back,
   self and not-self are no longer distinguishable (the k-hole peak). Over the next ~75
   seconds it slowly re-coheres back to the single front point (the return).
5. Press **Descend again** to restart the arc.
6. Optional: on a phone that exposes device orientation, physically turning your head steers
   the listener's yaw through the field. Silently skipped where the sensor is unavailable.

## How it works (Web Audio)

Everything is driven from a single normalized `depth` 0→1→0 envelope over 150 s
(descend ~75 s, return ~75 s), mapped to five simultaneous dissolution mechanisms:

- **HRTF spatialization** — four voices, each its own `PannerNode` (`panningModel="HRTF"`),
  clustered tight at the front point `(0,0,-1)` early, then lerped onto wide **Lissajous
  orbits** at different radii and speeds so the scene envelops the listener at the peak.
- **Progressive interaural decorrelation** — each voice crossfades from a mono-correlated
  path onto a per-ear-decorrelated path (two independent 5–25 ms delay lines that destroy
  interaural correlation, so the source stops having a place).
- **Granular smear** — the per-ear delay times are re-jittered every frame (deterministic
  seeded PRNG) to smear the onset.
- **Diffuse-field `ConvolverNode` reverb** — a code-synthesised exponentially-decaying stereo
  impulse response (`_shared/psych/convolutionVoid`); everything routes *through* it so the
  wet/dry knob is the literal direct-to-reverb ratio, collapsing toward a pure diffuse field
  at the peak.
- **Inharmonic carrier bed** — slightly-stretched pad partials plus near-unison voices whose
  detune fans WIDE at the peak, so the k-hole is a beating, unplaced smear — **never** a
  pretty just-intonation drone.

Master chain: `[pad + orbiting voices + decorrelated smear] → ConvolverNode reverb →
GainNode master (≤0.18) → DynamicsCompressor → destination`. The AudioContext is created and
resumed only inside the Begin-descent click handler (gesture-gated, never autoplays), and is
fully torn down (oscillators stopped, listeners removed, context closed) on End and on unmount.

## Named reference

Browser spatial-audio maturity 2026 — Google **Resonance Audio** / **Omnitone** ambisonic
decoding + binaural HRTF rendering; *"Web Audio API: Immersive Soundscapes for WebXR 2026."*
Phenomenology: ketamine / NDE **ego-dissolution and unity** — the loss of the self / other
boundary. The build **inverts** the usual "place sounds precisely in space" goal — it
**un-places** them until the listener's spatial self dissolves.

## Design notes

- **Screen-bias dodge:** the only visuals are a dim violet glow (a slow < 0.3 Hz luminance
  drift, held steady under `prefers-reduced-motion`) and one hairline tracking `depth`. If you
  cover the screen, nothing is lost.
- **Safety:** no flicker or strobe; slow luminance drift only; master level capped and
  compressed.
- **Graceful degradation:** DeviceOrientation permission denied / unsupported → head-steer is
  silently skipped and the piece still works. Genuine audio-engine failure is surfaced in
  `text-destructive`.
- **Determinism:** all smear jitter comes from a fixed-seed `mulberry32`, so the dissolution
  is identical every run.
