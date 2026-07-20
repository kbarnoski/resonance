# 2036 · Eternal Groove

**A Shepard tone for TEMPO.** A percussion loop that accelerates (or decelerates)
forever without ever actually getting faster, while the underlying pattern is
static and loops seamlessly.

## The one question

> What if a groove could accelerate forever without ever actually getting faster
> — a Shepard tone for TEMPO?

## How to use

1. Press **Begin** (Web Audio needs a user gesture). Within ~2s a scripted
   auto-demo starts sweeping — you'll hear the groove speeding up, then slowing,
   then shimmering in place, on a loop.
2. **Set the pulse (base tempo):** tap the **Tap the pulse** button, press
   **Spacebar**, or tap/click anywhere on the stage. Two or more taps set the
   centre BPM.
3. **Set direction & speed:** drag up/down anywhere on the stage (up =
   accelerate forever, down = decelerate forever, release near centre = hold),
   or use the **Accelerate / Hold / Decelerate** buttons, or the labelled
   **sweep** slider. Any manual change hands control from the auto-demo to you.
4. Press **Stop** to silence and tear everything down.

The illusion is strongest with headphones or decent speakers and 15–20s of
listening — the ear keeps hearing "faster" long after any real pattern would
have run away.

## How it works — the Risset-rhythm math

**Octave tempo stack.** Five percussive layers are stacked one octave apart in
tempo. In log-tempo space, layer *k* sits at position

```
o_k = (phase + k) mod N            (N = 5 layers / octaves)
```

and fires at

```
tempo_k = baseBPM · 2^(o_k − N/2)   [BPM]
```

So the layer at the window peak (o = N/2) always plays at the base tempo; layers
below it are octave-slower, above it octave-faster.

**Sweeping log-spaced window.** A *fixed* raised-cosine (Hann) window over the
log-tempo axis sets each layer's loudness:

```
w(o) = 0.5 − 0.5·cos(2π·o / N)
```

The window doesn't move — the **layers** glide through it. Advancing `phase`
slides every layer up (accelerando) or down (ritardando) the octave ladder at
once. A layer that reaches the top wraps back to the bottom, but the window
weight there is ~0, so the wrap is inaudible and the loop is seamless. Because
the layers are spaced exactly one octave apart over exactly *N* octaves, the
**sum** of the Hann weights is constant regardless of `phase` (= N/2), so overall
loudness never pulses as layers cross the band.

**Look-ahead scheduler.** Strike timing comes from `AudioContext.currentTime` via
a ~25ms poll / ~100ms horizon look-ahead scheduler (the "Tale of Two Clocks"
pattern), never from rAF. The `phase` control value is integrated in the rAF
loop (smooth 60fps) and read by the scheduler — timing off the audio clock,
control values off rAF. Each strike is a purely percussive voice (a pitch-swept
sine "tom" plus a bandpassed noise transient); higher layers are brighter and
shorter, lower layers woodier and longer. There is no scale, melody, chord, or
pitched drone — pure rhythm and timbre.

**CSS compositor visuals.** No canvas / WebGL / SVG animation. Each tempo layer
is one DOM ring; the rAF loop writes `transform` (rotate + scale), `opacity`, and
`filter` only. A ring's radius tracks its position in the stack, its spin tracks
its tempo, its opacity/colour track its window weight, and it flashes on each
scheduled strike (flash events are drained from the scheduler in sync with the
audio clock). The active band therefore visibly streams outward for accelerando
and inward for ritardando.

## Reference

Jean-Claude Risset — the **"endless accelerando" / rhythmic Shepard-tone
illusion** (foundational). This is the rhythmic transposition of Roger Shepard's
original endless-pitch illusion; Shepard and Kenneth Knowlton sit in that lineage
of perceptual-loop experiments.

## Known rough edges

- The brightest band sits at a **fixed** radius (the window is fixed); the
  direction cue is the radial *drift* of the rings, which is intentionally slow
  (~15s to cross the stage at full sweep) so the reset stays subliminal. The
  spin speed carries the more immediate "faster/slower" read.
- At very fast base tempos the topmost audible layer approaches a buzz rather
  than discrete hits — expected, and it lives at the quiet edge of the window.
- Tap-tempo uses a short median of the last few taps; a single stray tap after a
  long pause is discarded, but erratic tapping can still nudge the BPM.
- The illusion is perceptual: on tiny laptop speakers the octave-spread of the
  layers compresses and the effect weakens. Use headphones.
