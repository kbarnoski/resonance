**For**: kids (4+)

# Every Note

> What if a 4-year-old had the WHOLE chromatic palette — no "safe" pentatonic
> cage — and any note they touched was instantly embraced into beauty, because
> the HARMONY chases the note?

This is the inverse of the pentatonic "no-wrong-notes" crutch. Instead of
restricting the child to 5 safe pads, **Every Note** gives all 12 chromatic
petals and reharmonizes the underlying chord under every tap — so a "wrong"
note becomes the color of a new chord. The child learns, pre-verbally, that
consonance is *contextual*: no note is wrong; the world just blooms a new color
to hold it.

## How to play

Tap any of the twelve colored petals in the ring (each is a big tap target).
A soft bell plays the literal note you touched, while 3–4 sustained pad voices
glide to a freshly chosen chord and the aurora field re-tints to that chord's
hue. Borrowed/chromatic chords add an extra shimmer. There is no fail state,
no microphone, no reading. Desktop keys: `Z S X D C V G B H N J M`.

## The harmony engine (`harmony.ts`)

The heart is a small **reharmonizer** built as a decomposed
**RETRIEVE → EDIT → RERANK** pipeline:

1. **RETRIEVE** — the tapped pitch class is a hard constraint. We pull a lush
   candidate palette of ~10 chords in C: diatonic I/ii/iii/IV/V/vi
   (Cmaj9, Dm9, Em7, Fmaj7, G13, Am9) plus borrowed colors — ♭VI (A♭maj7),
   ♭VII (B♭maj9), V/V (D7), and a chromatic-mediant (E♭maj7).
2. **EDIT / score** — each candidate is scored by fit: a chord-tone landing
   beats a 9th/13th extension beats a faint "color" landing, minus a penalty
   when the tapped note sits a harsh ♭9 (minor-9th) above any chord tone.
3. **RERANK** — we add a greedy nearest-voice **voice-leading** cost vs. the
   previously sounding chord, so the pad voices move minimally and *glide*
   rather than jump. A small "stay" bias keeps re-taps from churning.

The winner's 3–4 voices are glided via `setTargetAtTime` (~0.12s). The engine
guarantees that whatever note is tapped lands as a chord tone or a warm
extension of the chosen chord — so all 12 chromatic notes are always embraced.

This is deliberately **not** a pentatonic scale-snap: the note never moves; the
harmony moves under it.

## Audio (Web Audio API, pure client)

- An always-on ambient **drone bed** (C2 sub + G2 fifth) so it never feels
  broken.
- 4 gliding sine/triangle **pad voices** that chase the reharmonized chord.
- A soft **bell** on top playing the literal tapped note (darker/softer for
  color notes so nothing ever stabs).
- Kids-safe master chain:
  `gain (master ≤0.36) → lowpass (≤7.5kHz) → DynamicsCompressor (limiter) →
  destination`. Triggers are rate-limited; AudioContext is created/resumed on
  the first user gesture (iOS unlock). **Test bar:** safe to play near a
  sleeping toddler.

## Visual (Canvas2D)

A dark, calm aurora/garden field that drifts on its own (alive before the first
touch) and re-tints toward the current chord's hue. Each tap blooms a soft ring
of light at its petal; borrowed chords add shimmer particles. Twelve petals sit
in a ring, each a distinct saturated color and a generous tap target, with a
live chord-name readout so the reharmonization is visible. If the Canvas2D
context is null, a readable rose notice appears and audio still plays.

## Auto-demo

Before any interaction, a scripted ghost-finger taps a short phrase that
*includes deliberately out-of-key/chromatic notes* (F#, D#, A#), so a silent
06:30 glance both looks alive (drifting field + blooms) and demonstrates the
chord chasing a "wrong" note. The demo loops gently and stops on the first real
touch.

## Read the design notes

The in-page "Read the design notes" link (corner of the page) explains the
rationale: kids' music toys usually hide wrong notes behind a pentatonic cage;
this hands over the full chromatic palette and lets a contextual reharmonizer
make every note belong. The aim is a pre-verbal lesson that consonance is about
context, not a list of allowed notes.

## Reference

He, Li, Sun & Huang, *A Decomposed Retrieval-Edit-Rerank Framework for Chord
Generation*, arXiv:2605.07489 (May 2026). The retrieve → edit → rerank
decomposition for chord generation directly inspired this prototype's
real-time chord-chasing engine.
