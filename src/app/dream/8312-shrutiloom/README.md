# Shruti Loom

**Route:** `/dream/8312-shrutiloom`

> *What if singing a sustained pitch strung a **sympathetic string** across the
> space — and JI-related strings physically resonate each other, so the drone
> you build is a woven loom of coupled strings that hum in sympathy, like a
> tanpura's jawari?*

## What it is

A long-form, stateful drone instrument. You sing; each pitch you **hold** long
enough is quantized to a just-intonation lattice and strung across a 3D loom as
a glowing standing-wave line, sounding a tanpura-like plucked drone that rings
for tens of seconds. The distinctive mechanic is **sympathetic coupling**:
strings that share low harmonics physically drive one another, so the drone
you weave keeps swelling and shimmering on its own — minute 8 is a dense,
cross-talking web, not minute 1's lone string.

## The DO-verb

**Hold a steady sung pitch (~0.7 s, above an amplitude gate, steady within a
~38-cent window) → it commits.** On commit the pitch is snapped to the nearest
just frequency, a line is woven across the loom, and a sustained drone voice
starts at that exact JI frequency. Re-singing near an existing string refreshes
and swells it instead of duplicating. Everything else — the humming, the
brightening of strings you did *not* sing — is the coupling doing its work.

## The just-intonation + sympathetic-coupling model (`loom.ts`, `audio.ts`)

- **Tonic:** ~146.8 Hz (≈ D3), fixed. Lattice degrees: `1/1, 16/15, 9/8, 6/5,
  5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 16/9, 15/8`, across four octaves.
- **Quantization:** the sung f0 (from our own detector, below) is matched to the
  nearest lattice frequency by cents distance; the readout shows the degree name
  and cents-off.
- **Coupling weight** between two strings = a shared-harmonic sum: for the first
  12 harmonics of each, every partial that coincides within ~14 cents
  contributes `1/(k+l)`, so *low* coincident partials dominate. Unison ≈ 1,
  octave/fifth strong, tritone ≈ 0. This is exactly the JI-consonance condition
  behind sympathetic resonance.
- **Audio:** each voice is additive (six tanpura-weighted partials with slight
  detune for a jawari shimmer) through a per-voice gain, a warm low-pass, and a
  synthesized convolution reverb. A JS-side energy scalar per voice decays over
  ~24 s and drives the gain. Every frame, loud strings inject energy into their
  consonant neighbours (`weight × energy × headroom`), and committing/exciting a
  string splashes an immediate swell into its kin — **audible** sympathetic
  ring, not a static stack.
- **Pitch detection (`pitch.ts`):** the shared mic hook only gives band energy +
  centroid, so this piece runs its own monophonic detector — a McLeod
  Pitch Method / normalized-square-difference (NSDF) estimator over a
  time-domain buffer with parabolic interpolation and an amplitude gate — to
  recover a clean sung f0.

## Long-form state

The lattice accumulates (capacity 14; the quietest voice is evicted when full)
and its coupling graph densifies, so the texture continuously thickens. Once the
loom fills, the self-demo stops adding and instead keeps re-exciting consonant
strings, so the sympathetic swells evolve indefinitely — the piece is designed
so minute 8 does not sound or look like minute 1.

## Visual (`page.tsx`, three.js)

Dark, cosmic-ambient. Strings are additive glowing lines woven across a sphere;
each carries a standing-wave displacement whose amplitude tracks its live drone
energy. Pitch maps to a warm→cool hue ramp (violet is reserved for chrome, used
only for the faint filaments that trace energy transfer between consonant
pairs). Endpoint nodes brighten with energy. Slow auto-orbit camera (optional
pointer-drag). **No strobe / no fast flicker** — smooth motion only; honors
`prefers-reduced-motion` by damping vibration and orbit speed.

## Self-demo

On load, with no input, a **seeded** virtual player (`mulberry32(0x8312)`, timed
with `performance.now()` — no `Date.now`/`Math.random`) auto-strings a slow,
consonant sequence: it anchors on an existing string and weights new pitches by
coupling, so the loom visibly weaves itself and the sympathetic swells are
plain to see. Granting the mic hands control to your voice. (Audio starts
suspended without a gesture per autoplay policy; the visuals weave regardless
and sound resumes on the first pointer/CTA.)

## Graceful degradation

- **No mic / denied / no `getUserMedia`:** the seeded player keeps weaving; a
  small `text-destructive` notice explains. Never blank.
- **No WebGL:** a house-styled fallback card.
- **Unmount:** full teardown — RAF cancelled, mic tracks stopped, AudioContext
  closed, all three.js geometries/materials disposed, renderer removed.

## Named references

- The **tanpura jawari** sympathetic-resonance principle (the buzzing bridge
  that lets overtones ring and neighbouring strings sing in sympathy).
- **La Monte Young & Marian Zazeela, *Dream House*** — sustained just-intonation
  drone environment.
- *"The Moving Drone: Negotiating Agency Between the Voice and the Virtual"*
  (arXiv:2606.13640, 2026).
- Sympathetic-string instruments: **sitar tarab strings**, **Hardanger fiddle**,
  viola d'amore.

## Tags

- **input:** mic / sung-pitch
- **output:** three.js
- **technique:** voice-f0 → JI-lattice sympathetic-coupled drone loom
- **pole:** cosmic-ambient
