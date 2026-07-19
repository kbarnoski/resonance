# 1984 · Stretched Choir

**The one question:** *What if every chord you played were built from a
*stretched* octave — partials pulled slightly sharp — so the whole choir
shimmers and beats the way a real piano's extreme octaves do, and "in tune" is
redefined by the timbre itself?*

A playable additive / inharmonic spectral instrument. Press **Start choir**,
then play (Web MIDI, the on-screen keys, or your computer keyboard). Drag the
**pseudo-octave stretch** slider while holding a chord and hear consonance melt
and re-form.

## The harmonic model — stretched partials, matched scale (the novelty)

Each note is an additive stack of six partials, but the partials are
**stretched**, not harmonic. Partial *n* sits at

```
f(n) = f0 · n^β        where β = log2(stretch)
```

- `stretch = 2.0` → β = 1 → the ordinary harmonic series.
- `stretch = 2.05` (default) → β ≈ 1.036 → overtones drift progressively
  **sharp** — the Railsback piano-tuning stretch, generalised. Stacked notes
  therefore beat and shimmer in a way a pure harmonic timbre never does.

The playing **scale is derived from the same stretch**: a MIDI note is tuned to
`440 · stretch^((midi−69)/12)`, i.e. twelve equal steps span one *stretched*
pseudo-octave. Following **Sethares**, sensory dissonance is minimised when the
scale's step ratio matches the timbre's partial spacing — so a matched-stretch
triad locks into an eerie, glassy consonance *even though it is detuned from
equal temperament*. This is deliberately **not** the banned just-intonation
partial stack over a fixed drone.

**The demo:** the main slider drives the timbre stretch (and, while locked, the
scale with it — always consonant, but audibly *stretched* vs. plain harmonic).
Hit **Lock scale to timbre** to unlock, and now dragging the timbre away from
the frozen scale makes chords **melt** into roughness; drag back to matched and
they **re-form**. The live **Roughness** meter is the Sethares sensory-
dissonance sum of the currently held partials, so the number tracks what you
hear. (Verified numerically: a matched triad reads ~0.34 roughness at stretch
2.10 vs ~0.41 when the scale stays at 2.0.)

Held notes glide to the new tuning, so you can slide the stretch *while a chord
rings* and hear it move.

## Input — Web MIDI with full fallback

`navigator.requestMIDIAccess` is feature-detected; a connected MIDI keyboard
plays the choir directly. It **always** degrades silently to two fallbacks that
make the instrument fully playable with no device: an on-screen clickable piano
and the computer keyboard `a w s e d f t g y h u j k` (`z` / `x` shift octave).

## Substrate — CSS compositor only

There is **no canvas, WebGL, or SVG**. Every sounding partial is a single
radial-gradient **DOM `<div>`**, positioned by its frequency (log-frequency →
screen position), sized by partial index, and blended with
`mix-blend-mode: screen`. The shimmer is the **browser compositor** adding
overlapping translucent bone/warm-white voices on charcoal — where partials of
different notes nearly coincide (consonance) they pile up bright; where they
beat, a `requestAnimationFrame` loop pulses each div's opacity at its **real
acoustic beat rate** (the nearest-neighbour frequency gap). `prefers-reduced-
motion` freezes the beating to a steady glow.

**Consequential memory:** *Freeze chord* captures the current shimmer as a
persistent, static pane; each frozen pane can later be dissolved and removed —
editable, not merely additive.

## Palette / vibe

Bone / ash / warm-white luminous voices on charcoal — a pale glassy choir
glowing in the dark. Art colour lives only in the CSS gradients; all UI chrome
uses Resonance semantic tokens (`text-foreground`, `text-muted-foreground`,
`bg-primary`, `text-destructive`, `border-border`).

## References

- William Sethares, *Tuning, Timbre, Spectrum, Scale* (1998) — consonance as
  matched timbre & scale; sensory-dissonance model.
- The **Railsback curve** — measured piano octave stretch.
- Wendy Carlos's non-octave **alpha / beta / gamma** tunings.

## Files

- `page.tsx` — client component: compositor render loop, controls, MIDI +
  keyboard input, freeze/dissolve memory, design-notes modal.
- `spectrum.ts` — stretched-partial & stretched-scale math; Sethares dissonance.
- `audio.ts` — additive Web Audio engine (per-partial oscillators, live
  re-tuning, glassy reverb, visual snapshot).
- `midi.ts` — Web MIDI access with silent degradation (`runMidiAccess`).
