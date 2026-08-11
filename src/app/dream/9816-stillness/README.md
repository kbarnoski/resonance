# 9816 · Stillness — an anti-instrument

**What if the instrument rewarded STILLNESS instead of action?** A conceptual
anti-instrument with the gate inverted: pointer/touch **motion is silence**, and
holding **perfectly still** is what plays it. The less you do, the more you are
given — a meditation trainer disguised as an instrument, and a quiet critique of
an attention economy that pays only for motion.

## How it works

- A stillness meter `s ∈ [0,1]` (the thin outer ring) **rises slowly** during
  calm (~6.5 s to fill) and is **knocked down sharply** the instant you move —
  a flick of the pointer, a tap, a keypress, or a scroll all cost stillness.
- As `s` climbs, a **just-intonation drone** blooms one partial at a time:
  fundamental (1/1) → fifth (3/2) → octave (2/1) → octave+third (5/2) →
  twelfth (3/1) → maj7 (15/4) → double octave (4/1). Pure integer ratios only,
  never a tempered or pentatonic scale. A master lowpass also opens with
  stillness, so the timbre itself blooms. At full stillness you reach a rich
  shimmering JI chord — the deep-listening payoff.
- The visual is a Canvas2D **cool, near-white mandala** (concentric rings + slow
  radial petals + a luminous core) that grows from a point to a full field as
  `s` rises and contracts when you move. No warm amber, no cosmic-indigo
  particle nebula — a clinical pale void.

## Muted-phone read (idle = maximum stillness)

With no interaction the viewer **is** perfectly still, so `s` starts at 1 and the
field is **fully bloomed on load**. A seeded, deterministic breathing modulation
(`mulberry32`, seed `0x9816`) keeps it gently alive and identical every load —
no `Math.random` / `Date.now` / `new Date` anywhere. Audio stays silent until the
first gesture (browser policy); the visual is alive immediately. The first touch
makes the bloom **contract** — that is the "aha."

## Use

Press **Begin** to start audio, then do nothing. Hold still and watch the chord
and light bloom. Move to hear it duck toward silence. Works fully without audio
(the bloom still responds) and honors `prefers-reduced-motion` (slower breathing,
no fast drift).

## References

- **Pauline Oliveros — _Deep Listening_**: attention itself as the instrument.
- **John Cage — _4'33"_**: the frame placed around silence and non-action.
- The **attention-economy critique**: an interface that rewards not-doing.

## Files

- `page.tsx` — client component, input/motion gating, rAF loop, teardown.
- `audio.ts` — the just-intonation drone whose partials fade in with stillness.
- `bloom.ts` — the seeded, breathing Canvas2D mandala.

**Status**: demoable

## Next-cycle deepening

Add a slow "settling" hysteresis so a single micro-jitter doesn't fully reset a
long-held bloom (reward sustained attention over perfection); introduce a second,
higher octave that only unlocks after a minimum unbroken hold time; and let the
mandala's geometry (petal count, symmetry order) encode _how long_ stillness has
been kept, not just its current depth — a visible memory of held attention.
