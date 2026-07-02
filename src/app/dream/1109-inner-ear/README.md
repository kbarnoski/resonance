# 1109 · Inner Ear

**A cabinet of auditory illusions: sound your brain invents.**

Put on headphones and walk through a small museum of psychoacoustics. Every
exhibit plays a signal that is objectively simple — two tones, a scale, a burst
of noise — yet what you *hear* is manufactured inside your own auditory system.
This is a deliberate palette break from the lab's house style: no black
background, no GPU shader. It lives on a warm paper-white gallery placard with
ink-colored diagrams. The sound is the exhibit; the diagram is the wall text.

**Headphones are required.** Most of these illusions depend on each ear
receiving a different signal. On speakers the two channels mix in the air and
the effect collapses.

## The exhibits

1. **Octave illusion** (Deutsch, 1974). Pure 400 Hz and 800 Hz tones alternate
   four times a second, and every step the two ears swap which tone they get —
   both ears always have a tone. Yet most right-handers hear a *single* tone
   bouncing from ear to ear while also jumping an octave. The percept is a
   grouping your brain imposes; it exists in neither channel.

2. **Scale illusion** (Deutsch, 1975). A C-major scale climbs from C4 to C5
   while a second scale descends, and successive tones are split between the
   ears. Each ear physically receives a jagged zig-zag, but the brain re-sorts
   the tones by pitch and location into a smooth high line (right ear) and a
   smooth low line (left ear) — a melody assembled by the listener.

3. **Tritone paradox** (Deutsch, 1986). Two Shepard tones (octave-complex tones
   whose absolute octave is deliberately ambiguous, built from ~6 octave-spaced
   sine partials under a fixed Gaussian envelope centered near C4) are played a
   tritone apart, to both ears. Whether the pair sounds like it *rises* or
   *falls* depends on the listener's own perceptual template — so the exhibit
   refuses to label it and shows a "?".

4. **Zwicker tone** (Zwicker, 1964; and the 2025 phantom-perception study in
   *Imaging Neuroscience*, MIT Press). Pink noise plays with a band cut out of
   its middle (~600–1200 Hz removed via cascaded notch filters), then stops
   abruptly. In the silence that follows, many listeners hear a faint phantom
   tone at the pitch of the missing band — a genuine auditory afterimage with no
   physical source. The 2025 study uses exactly this tone as a proxy for phantom
   auditory perception (the same machinery implicated in tinnitus).

5. **Your tritone template** (a personal-measurement twist). The paradox turned
   into a measurement of *you*: judge 12 tritone pairs, one per pitch class, as
   higher or lower, and your answers fill in a pitch-class circle — green for
   "rising", orange for "falling". The resulting shape is your perceptual
   template, which Deutsch found correlates with the pitch of a listener's
   speaking voice and their linguistic background.

## The core technique — strict per-ear routing

The Web Audio graph is built once, from a user gesture so the `AudioContext`
can resume:

```
tones → leftBus (Gain) ──┐
                          ├─→ ChannelMerger(2) → DynamicsCompressor → master → destination
tones → rightBus (Gain) ─┘   (input 0 = left channel, input 1 = right channel)
```

- **Dichotic** modes (octave, scale) route each tone to exactly one bus.
- **Diotic** modes (tritone, Zwicker, calibration) route to both buses.
- Every envelope is a **raised-cosine** attack/release (~12 ms), so nothing
  clicks, and all timing comes from a deterministic lookahead scheduler off
  `ctx.currentTime` — no `Math.random()` in the audio path (the Zwicker noise
  buffer uses a seeded PRNG).
- **"Left only"** ramps the right channel to zero in ~150 ms. The phantom
  collapses and you hear the raw physical stream — the built-in *aha*.
- **"Swap ears"** flips future routing; **auto-advance** rotates through the four
  illusions every ~14 s if you don't touch anything, so an idle glance always
  has sound and motion.

## Files

- `page.tsx` — client component: chrome, headphones advisory, gallery nav,
  controls, canvas, render loop, autonomy, design-notes disclosure.
- `audio.ts` — `InnerEarEngine`: per-ear graph, lookahead scheduler, all five
  modes, reveal/swap, Zwicker noise chain.
- `illusions.ts` — pure data + builders: note sequences, `shepardPartials`,
  seeded pink noise, mode metadata.
- `renderer.ts` — Canvas2D gallery-placard diagrams (three-lane score, tritone
  dial, Zwicker spectrum/timeline, calibration circle).

## References

- Diana Deutsch — the octave illusion (1974), the scale illusion (1975), the
  tritone paradox (1986); *Musical Illusions and Phantom Words* (Oxford, 2019).
- Roger N. Shepard — Shepard tones / circularity in pitch judgement (1964).
- Eberhard Zwicker — the Zwicker tone / negative auditory afterimage (1964); and
  the 2025 study in *Imaging Neuroscience* (MIT Press) using the Zwicker tone as
  a proxy for phantom auditory perception.

## Honest caveat

The **"what you probably hear"** lane is the typical *right-hander* model — a
prediction, not a measurement. Handedness, and for the tritone paradox your
own template, change what you perceive. And this build is **unverified on real
hardware in the sandbox**: correct per-ear routing and the phantom tone can only
be confirmed with headphones and human ears.

## Next-cycle deepening

- Save calibration results (localStorage) and overlay the population-average
  template from Deutsch's data for contrast.
- Add the **Glissando illusion** and **Cambiata** exhibits to widen the cabinet.
- A **handedness / voice-pitch** intake so the "what you hear" model adapts to
  the listener instead of assuming right-handedness.
- Binaural-beat and **missing-fundamental** rooms to round out "pitch the brain
  invents".
- Headphone-polarity check (a quick L/R confirmation tone) before the exhibits,
  since reversed earcups silently invert every dichotic effect.
- **A single-screen "one exhibit" mode** (folded in from the cycle-635 DEEP
  sibling `1108-two-ears`, which shipped the three Deutsch illusions as one
  always-visible scrolling score with no gallery nav): a toggle that drops the
  museum framing for a stripped, glance-legible single diagram — better for the
  06:30 phone review, worse for depth. Offer both.
