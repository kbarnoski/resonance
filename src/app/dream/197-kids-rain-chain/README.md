# 197 · Rain Chain

**For**: kids (4+) · **Cycle**: 230 · **Status**: demoable  
Zero permissions · Zero API · Zero deps · 3.11 kB

## What it does

Five glowing cups hang in a staircase from top-left (biggest, C3, violet) to
bottom-right (smallest, C4, sky). Rain falls autonomously. Rain collects in each
cup. When a cup overflows, a glowing water stream arcs into the next cup — and
a pentatonic bell rings. The cascade plays C3 → E3 → G3 → A3 → C4 as an
ascending arpeggio, ~0.22 seconds between each note. Tap anywhere for a burst
of rain. Drag for sustained downpour.

BANDIMAL rule: bigger cup = lower pitch = collects more rain = fills first.

## Design choices

**Physics writes the arpeggio.** The melody C3-E3-G3-A3-C4 isn't scripted —
it emerges from the staircase geometry. Whoever positioned the cups positioned
the music. A child doesn't need to understand harmony to hear it; they just see
water flow downhill and hear bells follow.

**Pre-fill cup 0 to 38%.** Without this, the first cascade takes ~30 seconds of
autonomous rain. The pre-fill means the first cascade arrives in ~12 seconds —
long enough to create anticipation, short enough that a 4yo doesn't disengage.
A single tap brings it even sooner.

**CASCADE_DELAY = 0.22s between cups.** Enough gap to hear each pitch distinctly
as an arpeggio rather than a chord (a chord would require < 50ms between notes).
0.22s ≈ a sixteenth note at 68 BPM — musically natural.

**STREAM_DUR = 0.70s.** The bezier arc stream stays visible 0.48s after the
cascade has already triggered the next cup. This means you see the stream while
the next bell rings — causal clarity for kids: "the water went there and THEN
it rang." The timing overlap is intentional.

**Overflow FILL = 1.0 (instant).** Each cascade guarantees the next cup overflows
without waiting for rain to trickle in. The cascade sound is reliable: one
overflow always triggers the next four within 1 second. Rain between cycles
is the slow buildup; overflow is the release.

## Inspired by

- Karel's loves: `169-kids-marble-run` ❤ (physics = music), `133-kids-ripple-pond` ❤
  (collisions = notes), `196-kids-wind-chimes` (cascade as arpeggio)
- Japanese kusari-doi (rain chains) — architecture that routes water as music
- Cycle 229 STATE.md note: "kids rain-chain" as the top new-build candidate

## Polish ideas for future cycles

- Variable rain intensity: autonomous wind gusts → brief heavy rain shower every
  60-90s, forcing a cascade even if the player hasn't tapped
- Tap sparkle: a raindrop splash particle at the tap point (currently taps just
  spawn drops at y=-12 with no visual at tap position)
- Cup fill percentage glow: the cup's color intensity varies with fill level
  (dim when empty, bright when near-overflow) — gives more visual feedback for
  how close each cup is to cascading
- 6th cup at ground level (below cup 5): plays C4 again as an octave echo splash,
  then drains. Extends the cascade one more step.
