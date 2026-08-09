# 8680 · Dripsong

**One question:** _What if the pitch of an instrument came from the REAL physics
of a water drop's "plink" — and you composed music by placing drips into a still
pool, weaving a water-clock?_

A dark pool seen from directly above. You place **taps** (drip emitters) by
touching the water. Each tap drips at its own period; every drop, on impact,
(1) synthesizes a physically-modeled plink and (2) launches an expanding ripple
ring. Several taps at incommensurate periods weave a shifting, non-repeating
canon — a musical clepsydra.

## The plink physics (the fresh technique)

The characteristic "plink" of a dripping tap is **not** the splash. It is a tiny
air bubble entrained beneath the surface on impact, ringing at its **Minnaert
resonance frequency**. For an air bubble in water at 1 atm the Minnaert relation
collapses to a beautifully simple form:

```
f · r ≈ 3.26   (Hz · metre)      →      f ≈ 3.26 / r
```

So a **big drop traps a big bubble and plinks LOW**; a **small drop plinks
high**. Each tap has a size control (drag vertically while placing, or the ± on
the tap's card) that maps to a bubble radius; the resulting frequency is clamped
to a musical band (~180–2600 Hz), i.e. bubble radii of roughly 1.25–18 mm.

Each plink is synthesized as:

- a **fast-decaying sine** at the Minnaert frequency (amplitude decays over
  ~35–70 ms, longer for lower plinks);
- with the characteristic **rising-pitch chirp** — the real plink glides UP as
  the bubble shrinks while it rings; we ramp the oscillator up ~18% across the
  decay;
- a very short **band-passed noise "tick"** at onset (the impact click);
- a tiny **sub thump** for body.

The reachable bubble sizes are **quantized to a minor-pentatonic scale**, so the
physics sets the timbre and glide while quantization keeps the pitches musical.
A very soft low-passed noise "still-pond" ambience sits underneath. There is
**no** sustained drone.

## The authored water-clock

Each tap owns a drip **period**. Placing several taps at mutually incommensurate
periods (the seeded demo uses 1.7 s / 2.3 s / 2.9 s / 3.7 s) produces an
evolving polyrhythm that never quite lands back in phase. Where you place a tap,
how big its drop is, and how often it drips **is** the composition. Taps can be
re-pitched, re-timed, and removed from the selected-tap card.

On load, with zero input, a **seeded auto-performer** pre-places four taps and
begins dripping a canon, so the pool visibly animates within ~1 second even on a
muted phone. (Real audio only starts on the first touch — browsers require a
gesture — but all visuals run silently before that.)

## Determinism & teardown

- All "randomness" comes from a seeded `mulberry32(0x8680)`; timing is
  `performance.now()` and `AudioContext.currentTime`. No `Math.random`, no
  argless `Date`.
- Unmount cancels the RAF loop, removes listeners, ramps audio down, and
  `ctx.close()`s the AudioContext.
- Graceful degrade: if the AudioContext can't open, the ripples still animate
  and a `text-destructive` note appears. `prefers-reduced-motion` calms the
  ripples (slower, thinner, single ring). No full-screen strobe; luminance
  changes are slow (photosensitive-safe).

## Honest note — physically-modeled vs cosmetic

- **Physically modeled:** the pitch of every plink (Minnaert f · r ≈ 3.26), the
  rising up-chirp, the decay-time trend with size, and the size→pitch inversion.
  These are the real acoustics of an entrained bubble.
- **Cosmetic:** the ripple field is drawn with additive alpha — overlapping
  rings brighten where they cross, but it is a visual approximation, **not** a
  solved wave PDE, and the rings do not feed back into the sound. The scale
  quantization is a musical choice layered on top of the physics, not part of
  it.

## References

- **Samuel Phillips & Anurag Agarwal**, "The Sound Produced by a Dripping Tap is
  Driven by Resonant Oscillations of an Entrapped Air Bubble," _Scientific
  Reports_ 8, 9515 (2018). — establishes the entrained-bubble mechanism and the
  rising-frequency chirp of the plink.
- **Marcel Minnaert**, "On musical air-bubbles and the sounds of running water,"
  _Philosophical Magazine_ (1933). — the f · r ≈ 3.26 resonance relation this
  instrument is built on.
- **SIGGRAPH 2026 Real-Time Live!** — "A MIDI-Controlled Water-Droplet Interface
  for Generating Droplet Impact Sounds" (July 2026). — the this-week hook: real
  droplet impacts driven as a playable instrument.
- **The clepsydra / water-clock** — the ancient leaky-vessel timekeeper,
  reimagined here as a musical timekeeper where incommensurate drip periods keep
  the canon alive.

## Files

- `page.tsx` — client component: Canvas2D pool, pointer authoring, control card,
  intro + design-notes modals, RAF loop, full teardown.
- `engine.ts` — `mulberry32`, the Minnaert functions, the pentatonic scale, and
  the `DripEngine` (taps, ripples, the drip clock, the seeded demo).
- `audio.ts` — `makeDripAudio`: the plink synthesis and the still-pond ambience.
