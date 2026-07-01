# 1090 · Threshold Descent

`state: NDE tunnel-to-light / ketamine dissolution · pole: cosmic-ambient → luminous-intense`

An **audio-first** prototype: a near-death / ketamine "tunnel-to-the-light"
dissolution you steer with almost no screen — using only spatial audio and the
pace of your own body, so you can close your eyes.

## The one question

> What if Resonance could induce a near-death / ketamine "tunnel-to-the-light"
> dissolution with almost NO screen — using only spatial audio and the pace of
> your own body, so you can close your eyes?

This is the lab's screen-bias breaker. The visual is deliberately austere
(minimal inline SVG), so the sound carries the whole experience and it works on
headphones with your eyes shut.

## How to use it

Press **Begin the descent**. Tap a pulse — spacebar, a tap anywhere on screen,
or the "tap the pulse" button. Then let each tap fall further apart, and finally
go **still**. Stillness takes you deepest, where a warm light blooms out of the
dark. If you never tap, a gentle scripted auto-descent runs so the piece is alive
and audible within ~2 seconds.

## How it works (technically)

- **Tap-pace state machine** (`tapPace.ts`). Measures the inter-tap interval.
  Short interval = agitated, near the surface (shallow). As intervals lengthen,
  `depth` (0..1) rises. Stopping taps entirely lets a stillness term ease `depth`
  toward 1.0 (deepest). Resuming fast taps pulls it back down. `depth` is
  exponentially smoothed (τ ≈ 1.1 s) so audio never clicks. An `autoStep` drives
  a scripted ~14 s settle for the demo / headless case.
- **HRTF ring** (`audio.ts`). Eight just-intonation voices (1, 9/8, 5/4, 4/3,
  3/2, 5/3, 15/8, 2 over A2) each on a `PannerNode` with `panningModel:"HRTF"`,
  positioned around the head. As `depth` rises the ring **contracts inward**
  (radius 6 → 0.8) and higher voices fade in — the field closes in as you let go.
- **Shepard–Risset endless fall.** Uses the shared `startShepard` engine with
  `{ dir: -1 }` for a perpetual descent; `setDrive(depth)` makes the plunge
  faster and more committed the deeper you go. Routed through the void reverb.
- **Void + drone bed.** Shared `createVoidReverb` (wet grows with depth, more
  cavernous) and `startDroneBank` for the low just-intonation floor.
- **The difference-tone "light".** Two upper partials (550 Hz and 660 Hz) sit a
  just interval apart; their **difference frequency** lands on the root (110 Hz).
  We synthesise that warm low partial directly (a made-real *missing
  fundamental*) and fade the whole cluster IN only above `depth ≈ 0.8`, so the
  light feels earned — a reward for stillness, not a constant.
- **Austere SVG** (`page.tsx`). Concentric rings that contract toward a central
  dot; the dot and a radial halo brighten with the light partial. Slow luminance
  drift only — never a strobe/flicker.

Graceful degradation: if Web Audio can't start, a readable rose notice explains
that this piece is audio-first and needs sound. Audio starts only on a user
gesture (autoplay policy).

## Named references

- **Jean-Claude Risset** — the "endless glissando" / Risset rhythm (the auditory
  illusion of perpetual descent).
- **Roger Shepard** — Shepard tones (octave-spaced partials under a fixed
  log-frequency envelope).
- **Susan Blackmore**, *Dying to Live* — the tunnel-to-light NDE phenomenology.

## Shared engines reused

From `src/app/dream/_shared/psych/`:

- `shepard.ts` — `startShepard(..., { dir: -1 })` for the endless fall.
- `convolutionVoid.ts` — `createVoidReverb` for the cistern-like void tail.
- `droneBank.ts` — `startDroneBank` for the just-intonation drone floor.

The HRTF panner ring and the difference-tone light are hand-rolled here.

## Next-cycle deepening

- Accept device **stillness** (accelerometer quiet) as a second descent channel
  alongside tapping.
- A breath-locked shimmer at the threshold.
- Per-tap micro-timing to detect an intentional *ritardando* (a deliberate slow).
- Head-tracked HRTF so turning your head moves the ring around you.
- A longer scored arc that eventually releases you back up to the surface.
