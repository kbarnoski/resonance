# 1133 · Resonant Bowl

**state: meditative resonance-bath — boundlessness · pole: cosmic-ambient**

## The one question

_What if striking a Tibetan singing bowl made the whole space around you ring into
visible, breathing shells of light — a sound-bath you sink into?_

You **strike** (tap/click) and **rub** (drag) a virtual singing bowl. Each strike
excites a cluster of real, inharmonic bowl overtones; the sustained ringing becomes
concentric, slowly-breathing 3D light-shells that expand into a vast cool space.
Rubbing the rim sustains and swells the "sung" tone and makes the shells shimmer.
Calm, weightless, luminous — a place your attention settles into, never a void.

## How the overtone synth works (`bowl-audio.ts`)

- **Additive inharmonic synthesis.** Seven sine partials at measured-ish singing-bowl
  ratios `1, 2.76, 5.4, 8.93, 13.34, 18.64, 24.7` (× a low ~196 Hz fundamental).
  These climb faster than the harmonic series — that inharmonicity is the metal.
- **Per-partial decay.** Each partial has its own exponential decay (low partials ring
  ~9 s, high partials die in ~2 s), so the timbre evolves as it rings.
- **The wobble.** The fundamental is two oscillators detuned by ~1 Hz, so it slowly
  **beats** — the characteristic singing-bowl wobble. Each strike randomises the beat.
- **Rim-rub / "singing" mode.** Drag speed feeds a driven `rub` level that swells a
  sustained mix of the lower partials and opens a low-pass tone filter, so holding a
  drag makes the bowl brighten and sing.
- **Space.** A synthetic impulse response (decaying, one-pole-filtered noise, ~4.5 s)
  runs through a `ConvolverNode`; a `DynamicsCompressor` acts as the output limiter.
- **Never silent.** The per-partial amplitude envelope is computed in plain JS and
  mirrored onto both the WebAudio gains and the visuals, so the light is literally the
  sound. If idle > ~5.5 s the bowl softly self-strikes.

## How the 3D shell field works (`bowl-scene.ts`)

- True **three.js / WebGL**. Seven nested icosphere **point-shells** surround a central
  lathe-form bowl. Shell _i_ is driven by partial _i_'s amplitude.
- Each point is displaced along its radius by a **Chladni-like spherical-harmonic
  scalar** of its direction (increasing nodal degree on inner shells), times a slow
  shimmer LFO. Strikes light the whole nested stack; rubbing lifts the shimmer.
- Additive transparent blending + a central bloom sprite give a cheap volumetric glow;
  the camera drifts on its own slow multi-second orbit. Palette: deep indigo/near-black
  space → electric teal → soft violet shells.

## Named references

- **Tibetan singing-bowl acoustics** — inharmonic overtone spectra, the two dominant
  modes and the beating that creates the "wobble."
- **Ernst Chladni** — standing-wave nodal patterns / spherical harmonics.
- **Alvin Lucier, La Monte Young, Éliane Radigue** — the drone-listening tradition of
  sustained tones as a meditative object.

## Rough edges

- The spherical-harmonic scalar is a hand-tuned zonal+sectoral approximation, not a
  true `Y_l^m` basis — visually Chladni-ish, not physically exact.
- Reverb IR is generated synchronously on the main thread at Start (a brief hitch on
  slow devices); an `OfflineAudioContext` render would be smoother.
- Rub sensitivity is tuned for mouse/trackpad; touch drag feels a touch lighter.
- Shell displacement is CPU per-frame (~7 × 642 verts) — fine on desktop, could be a
  vertex shader for very low-end mobile.
