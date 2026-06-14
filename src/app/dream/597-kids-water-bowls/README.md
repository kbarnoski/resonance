# Singing Water

A touch-first instrument for a four-year-old: a row of six glowing water bowls.
**Tap** a bowl to ring it like a bell. **Rub** a finger round and round the rim to
make it **SING** — a sustained, breathy glass-armonica tone that gets louder and
brighter the faster you rub, and fades away softly when you stop. No reading, no
menus, no wrong notes. Every bowl is a bold saturated color, because color is the
language a small child can already read.

## How to play

- **Tap** (a quick touch on a bowl) → it rings like a struck glass bell, with
  concentric ripples spreading out and a bright bloom.
- **Rub / drag** (move your finger across or around a bowl) → it sings a
  sustained tone. The faster you rub, the louder, brighter and more focused the
  sound; slow down and it softens; lift off and it gently decays over ~0.6s.
- **Two hands welcome.** Multi-touch is supported (Pointer Events tracked by
  `pointerId`), so two bowls can sing at once.
- Leave it alone and after ~2.5s it quietly demos itself — a ghost finger rubs a
  rim so a bowl sings, with an occasional tap. Touch it and the demo stops
  instantly.

## Synthesis approach — friction-excited resonator (subtractive)

Each bowl is **one resonator** excited two different ways. This is the heart of
the piece.

- **Rub = sustained friction tone.** A looping pink-ish noise source runs through
  a **high-Q bandpass** (`BiquadFilter`, type `bandpass`, Q ≈ 14 → 26) tuned to
  the bowl's pitch, plus three very quiet sine **shimmer partials** at inharmonic
  ratios (2.01, 3.0, 4.2). Drag speed (computed from `pointermove` deltas in
  px/ms, smoothed) drives, in real time: **amplitude** (faster = louder),
  **brightness** (the bandpass center frequency opens upward), **Q** (rises with
  speed, so the tone focuses into a singing partial), and the shimmer level. Stop
  moving and the level decays smoothly. The rub voice is pre-created and always
  alive at zero gain, so there is no spin-up latency — it responds within a frame.
- **Tap = struck inharmonic bell.** A short additive strike: sines at ratios
  **1, 2.01, 3.0, 4.2×** the bowl pitch, ~4ms attack, with higher partials
  decaying faster (≈2.4s → 0.6s) for a glassy, organic ring.

### Safe master chain

Everything routes through a deliberately gentle, kid-safe chain:

```
masterGain → lowpass (7200 Hz) → DynamicsCompressor (thr −18, ratio 6, knee 12) → destination
```

No sudden loud transients, no harsh high ringing, levels kept low. A soft water/
pad drone always plays underneath so it is never totally silent.

## Tuning rationale

Deliberately **not** pentatonic. The six bowls use just-intonation ratios over a
root of ~F3 (174.6 Hz):

| Bowl | 1 | 2 | 3 | 4 | 5 | 6 |
|------|------|------|-----|------|-----|-----|
| Ratio| 1/1 | 9/8 | 5/4 | 11/8 | 3/2 | 5/3 |

This is a Lydian-ish color; the **11/8** raised fourth gives a watery, floating,
slightly otherworldly shimmer that suits glass and water. Just intonation means
the partials lock together and beat slowly — the bowls sound *consonant and
glassy*, never tempered or harsh.

**Higher water level = lower pitch.** That is real physics (more water in a glass
lowers its tone), and it teaches itself: the bowls are drawn with the lower-pitched
ones holding visibly more water, so a child connects "fuller" with "deeper" by eye
and ear at once.

## References

- **Jal Tarang** — the classical Indian instrument of tuned porcelain/metal bowls
  filled to different water levels and struck with sticks. Singing Water is a
  glowing, touchable descendant.
- **Benjamin Franklin's glass armonica (1761)** — a set of nested glass bowls
  rubbed with wet fingers to produce ethereal sustained tones. The *rub-to-sing*
  friction voice here is a digital homage to that instrument's breathy,
  otherworldly sound.

## Next-cycle deepening

- **Pour to retune.** Let a child tip or drag water between bowls to change the
  fill level and therefore the pitch live, turning tuning into play.
- **Sympathetic resonance.** When one bowl sings, let neighboring bowls at
  harmonically related pitches faintly bloom and hum in sympathy — a whole row
  that breathes together.
- **Stir patterns.** Recognize circular rubbing direction/speed to bend the tone
  or add tremolo, rewarding the natural "round and round" gesture.
