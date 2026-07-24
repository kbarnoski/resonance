# 2428 · The circle of fifths that will not close

## The one question
**What if you could HEAR and SEE why 12 perfect fifths don't add up to 7 octaves — the Pythagorean comma — and watch the circle of fifths fail to close, then temper it shut?**

A clinical, instructional tool. Not about consciousness — about a 2,500-year-old crack in the arithmetic of tuning.

## How it works
- Start from a root (C, 261.63 Hz) and stack **pure 3:2 fifths** one at a time — a button, or the auto-walk.
- Each stacked note is placed on a **spiral of fifths**: its angle is its pitch class (cumulative cents around the ring), its radius grows one notch per fifth so the thread visibly winds *past its own tail*.
- After 12 pure fifths the running pitch is (3/2)¹² = 129.746× the root — seven octaves **plus a comma**. The 12th point overshoots the start ray and the ring **fails to close**. The leftover is drawn as a warm arc with a live `+23.46¢` readout.
- The **Temper** slider (0 → 1) distributes the comma evenly across all 12 fifths. At 1 each fifth is narrowed to exactly 700¢, the spiral collapses onto a single closed 12-point ring — **equal temperament** — and the error snaps to 0¢.

## The math — (3/2)¹² vs. 2⁷
```
pure fifth        = 1200 · log2(3/2)      = 701.955 cents
twelve fifths     = 12 · 701.955          = 8423.46 cents
seven octaves     = 7 · 1200              = 8400.00 cents
Pythagorean comma = 8423.46 − 8400        =   23.46 cents
                  = 1200 · log2( (3/2)¹² / 2⁷ )
                  = 1200 · log2( 129.746 / 128 )
```
Tempering shares the comma out: each fifth loses **23.46 / 12 = 1.955¢**, shrinking from 701.955¢ to 700¢ = 2^(7/12) ≈ **1.4983**. Now 12 fifths = exactly 7 octaves; the circle closes. That is 12-tone equal temperament — every key equally usable, every fifth equally (and audibly) wrong.

## The audio — the beating is real
Web Audio only. Two persistent voices (lower + upper of the current fifth), each the **sum of 6 sine partials** at f, 2f … 6f with amplitude 1/k, through per-voice gain → master → destination.
- A **pure** 3:2 fifth lines the upper voice's 2nd partial (2 · 1.5f = 3f) exactly onto the lower voice's 3rd partial → it locks, nearly beatless (just-intonation consonance).
- A **tempered** fifth pulls those partials a fraction of a hertz apart → a slow, restless beat you can hear as you drag the slider (equal temperament's faint dissonance, in Helmholtz's sense).
- When the walk reaches the 12th fifth, a short **wolf ping** sounds the leftover comma as a rough near-unison.

All audio starts on the Start gesture; a single AudioContext is created and disposed on unmount. If AudioContext fails, a `text-destructive` notice shows and the visual keeps running.

## Idle self-demo
After Start it runs deterministically: walk 0→12 fifths (~1.1 s each), dwell on the overshoot, sweep temper 0→1 (ring closes), dwell on the closed ring, sweep back, loop. A silent glance already tells the whole story. Any control (Add a fifth, Reset, the slider) takes over; "Resume auto-demo" hands control back.

## Tags
- **input:** button + slider (played)
- **output:** Canvas2D
- **technique:** Pythagorean-comma / circle-of-fifths / additive-partial synthesis with audible beating
- **vibe:** clinical / instructional TOOL

## References
- **Pythagoras** — the Pythagorean comma, (3/2)¹² ≠ 2⁷.
- **J. Murray Barbour**, *Tuning and Temperament: A Historical Survey* (1951).
- **Hermann von Helmholtz**, *On the Sensations of Tone* (1863) — beating and roughness as the substrate of dissonance.

## Next-cycle deepening
- Let the viewer choose the **regular temperament**: sweep past ET into 1/4-comma and 1/6-comma meantone, watching a *different* interval (the major third) close instead, and hear the wolf fifth land on a chosen key.
- Add a **key selector** so the wolf's position on the ring is audible and visible, not just the anonymous gap.
- Render each stacked note's **frequency and named pitch** on hover, with its running deviation from ET in cents.
- A spectral inset drawing the two voices' partials as vertical lines, so the beating partials can be *seen* sliding together and apart as temper changes.
