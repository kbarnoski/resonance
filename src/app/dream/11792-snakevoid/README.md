# 11792-snakevoid

**What if a field of light that is NOT actually moving could make you feel it
breathing and rotating — and the illusion's speed answered to sound?**

A full-screen **peripheral-drift illusion**: concentric rings of a repeated
four-step asymmetric luminance sawtooth that the visual system reads as
continuous rotation and breathing **while the pixels are essentially static**. A
self-driving generative drone bed plays; its slow spectral swell modulates the
ring contrast and a sub-threshold real drift, so the illusory rotation appears to
speed, slow, and reverse with the sound. Optional mic lets the room drive it.

This is a neuroscience-of-perception, altered-state piece: the art is the
_illusion_ of motion from (near-)zero real motion.

## The illusion mechanism

Each ring is tiled with a repeated micro-element whose luminance follows the
classic Kitaoka order — **black → dark-gray (slate) → white (ivory) →
light-gray**, then a sharp drop back to black. That asymmetry (a gradual ramp up,
a sharp edge down) is the whole trick: the low-level motion system integrates the
ramp/edge polarity as directional self-motion. Adjacent rings reverse the element
order, so the bands curl in opposite directions — the signature "snakes" look.

- Drawn procedurally in a single **WebGL2** fragment shader (`gl.ts`) in polar
  coordinates: `ring = floor(r / ringWidth)`, a constant-arc element count per
  ring, and a 4-step antialiased sawtooth around each ring.
- Fixate any one ring and it stalls; leave it in your periphery and it turns.
  That contrast between foveal and peripheral perception _is_ the effect.

## Sound → illusion

- `audio.ts` runs a self-driving just-intonation drone (`startDroneBank`) through
  a cavernous convolution void (`createVoidReverb`), tamed by `createSafeMaster`.
  Never `ctx.destination`.
- The visual driver sets the bed's `drive` each frame, so the bed itself swells;
  the piece then reads the bed's **real output spectrum** back off the safe-master
  analyser and hands that swell to the illusion — the rotation genuinely answers
  to the sound you hear.
- The swell modulates **ring contrast** and a **sub-threshold real drift rate**
  (which reverses sign as the swell crosses its midpoint → apparent
  acceleration / stall / reversal).
- Optional mic (`getUserMedia`, time-domain only, never routed to output — no
  feedback) lets room / voice energy push the same swell harder.

## Named references

- Akiyoshi Kitaoka, **"Rotating Snakes"** (the canonical peripheral-drift figure).
- Faubert, J. & Herbert, A. M. (1999). **"The peripheral drift illusion: A motion
  illusion in the visual periphery."** _Perception_, 28(5), 617–621.

## Safety

- The illusion is **static** — there is no flashing, and that is the point and the
  safety win.
- The only real temporal luminance change is a soft sine "breath" routed through
  the shared **SafeFlicker** engine, hard-capped at ≤3 Hz with a high luminance
  floor (never a strobe), plus a sub-threshold phase drift far too slow to read as
  flicker.
- `prefersReducedMotion` freezes **all** real drift and slows the breath to a
  sub-perceptual crawl — a still image that still appears to move.

## Determinism

No `Math.random()`, `Date.now()`, or `new Date()`. Ring offsets are hashed in the
shader; the self-driving breath comes from a seeded `mulberry32` (`prng.ts`,
`demo.ts`); all time is `performance.now()` deltas / the rAF timestamp. Every
visit — and the muted phone at 06:30 — sees the same field breathing within ~1s.

## How to use

1. The illusion renders from mount with no audio and no mic; watch the periphery.
2. **Begin · sound the field** — a user gesture resumes audio and starts the bed;
   the swell now drives the drift from the real spectrum.
3. **Let the room drive it** — opt into the mic so room / voice energy pushes the
   swell. Denied mic keeps the self-driving bed running.
4. **Read the design notes** (top-right) for the mechanism in-app.

## Files

- `page.tsx` — mount, always-on draw loop, controls, teardown.
- `gl.ts` — WebGL2 fragment-shader illusion field (palette lives here).
- `audio.ts` — self-driving drone bed + spectral read-back + optional mic.
- `demo.ts` — seeded deterministic breath driver (muted-phone contract).
- `prng.ts` — seeded PRNG + math helpers.
