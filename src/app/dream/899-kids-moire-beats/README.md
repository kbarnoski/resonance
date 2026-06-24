# Roughness & Calm — Moiré Beats

A self-contained audio-visual prototype in the Resonance dream lab.

## The one question

**What if a 4-year-old could SEE and HEAR a sound's roughness at the same
time — by sliding two striped patterns over each other so the moiré band they
make IS the acoustic beating they hear?**

## How it works

Two overlapping op-art grids fill a Canvas2D field: a fixed set of concentric
**rings** underneath, and a layer of straight **stripes** on top. They are
composited with `multiply` so the two layers physically interfere — where their
bright and dark zones overlap, a slow rolling **moiré band** emerges, exactly
like ink-on-acetate moiré.

The child drags anywhere with one finger (touch or mouse, via Pointer Events).
A left/right swing **twists** the top stripe layer relative to the rings. A
roughly 280px swing covers the full range — huge and forgiving, no reading, no
"wrong" move.

A warm consonant drone is always playing: a perfect fifth, **A2 (110 Hz) + E3
(164.81 Hz)**. Each pitch is made of **two sine oscillators**. The child's twist
doesn't change the pitch — it changes the **detune** of the second oscillator of
each pair, from 0 Hz (aligned) up to ~9 Hz (fully twisted).

## The moiré = acoustic-beats mapping

| Child's hand | Visual | Audio |
| --- | --- | --- |
| Grids **aligned** | moiré band slows to almost nothing; a green calm ring shrinks to a dot | the two oscillators converge → **one clear, calm tone** |
| Grids **twisted apart** | moiré band shimmers fast; amber ring pulses | oscillators detune → **WAH-WAH-WAH amplitude beating** |

The key coupling: the visual band's roll speed (`phase += 0.25 + beat*0.9`) and
the audio beat rate (`detune = |twist| * 9 Hz`) are driven by the **same**
`twist` value. So the rate the band shimmers and the rate the sound wobbles are
literally the same parameter — the moiré beat *is* the acoustic beat.

## References

- **Gerald Oster**, "Moiré Patterns" (Scientific American, 1963) and related
  moiré-fringe research — the founding work on how two superposed periodic grids
  produce slow, large-scale interference fringes. This prototype borrows the ring
  + line superposition directly.
- **Bridget Riley** — op-art: high-contrast periodic fields that read as motion.
  The cream/ink palette and stripe density aim for that perceptual shimmer
  while staying warm and kid-readable rather than harsh.
- **Acoustic beating** — two tones a few Hz apart sum to an amplitude envelope
  that throbs at the difference frequency; below ~20 Hz we hear "roughness," and
  as it approaches 0 Hz the sound smooths to one tone. This is the audio twin of
  the moiré fringe.
- **RESEARCH §536 (2026-06-24)** — this prototype implements that dated dive's
  build hook directly: *moiré is the visual analogue of acoustic beating, so a
  child can SEE the roughness they HEAR with no reading and no scale-safety
  crutch.* The lab corpus is grep-verified 0× on moiré.

## How it degrades

- If the Web Audio API is unavailable (or construction throws), a
  `text-rose-600` notice appears and the **visuals stay fully alive** — the child
  can still slide the moiré bands. The page never throws and never goes dead.
- On iOS the `AudioContext` is created and resumed **inside the Play tap**, as
  required by mobile autoplay policy.
- The drone is **always on** (soft 0.9s fade-in, master gain ≤ 0.24, lowpass at
  6 kHz, smoothed detune glides) — never harsh, never silent.
- **Auto-demo:** if untouched for ~2s the stripe layer drifts on its own, so a
  hands-off glance is moving and sounding within ~1s. Any real input cancels it
  and it resumes after the next idle.
- Full teardown on unmount: `cancelAnimationFrame`, stop every oscillator, ramp
  master to zero, `close()` the context, remove all listeners.

## Ambition

The dream is a toy that teaches a real perceptual fact without a single word:
that "rough vs. smooth" sound and "shimmering vs. still" pattern are the *same
phenomenon* — interference — felt through the hand. A four-year-old playing
roughness↔calm is, without knowing it, doing the experiment that connects Oster's
fringes to the physics of beats. The honest next step would be to let two
children each hold one layer, so the moiré (and the beating) is something they
make *together*.
