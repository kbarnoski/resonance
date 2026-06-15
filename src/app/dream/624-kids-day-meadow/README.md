**For**: kids (4+)

# A Whole Day — 624-kids-day-meadow

Route: `/dream/624-kids-day-meadow`

## The question

What if a kids music toy were a whole **DAY**? Not a loop, not a one-shot — a
slow, self-evolving ~9-minute journey through **dawn → morning → midday → dusk →
night → back to dawn** that is genuinely *different at minute 8 than at minute 1*,
and that a 4-year-old decorates by planting living things that wake, sleep, and
age with the time of day.

This is the lab's first kids **long-form generative journey-arc with state &
memory**. The piece plays itself and slowly evolves; the child decorates it.
There is no reading, no score, no "wrong", no fail state, and no scary or
sudden-loud sounds — everything the child plants is musically valid forever.

## The engine

**1. Diurnal phase state machine (the spine).** A full day is a configurable
`DAY_SECONDS ≈ 540`. A continuous phase ∈ [0,1) is sampled every frame
(`sampleDay`) and **cross-fades** smoothly through five musical regions — each
with its own scale, root, tempo, brightness, and 3-stop sky palette. Region
weights are soft circular bumps, so there are no hard cuts: at any instant the
scale, ostinato speed, sky gradient, cloud tint, sun/moon arc height, and star
opacity are all blended values. dawn = major pentatonic / Lydian shimmer, deep
indigo→rose, slow; morning = bright major, livelier, clear blue; midday =
fullest playful major, brightest, sun at the top of its arc; dusk = warm
Mixolydian/suspended, amber→violet, slowing; night = low glassy lullaby
pentatonic + drone, near-black sky with stars and a moon.

**2. Motif-memory bank (the ambition — the "anchor" idea).** Every planted
living thing stores a tiny **motif**: abstract scale-degrees + a rhythm. The
generative engine **re-voices** each stored motif into whatever scale the day is
in *right now* (`voiceDegree`), so everything the child planted keeps fitting as
the harmony evolves. Motifs also slowly **mutate** with age (`mutatedDegrees`:
transpose / ornament / thin out) so accumulated material coheres and evolves
rather than drifting or looping. This memory bank is what makes minute 8 ≠
minute 1.

**3. Chris-Wilson look-ahead scheduler.** A `setInterval` (~25 ms) pump schedules
notes ~120 ms ahead via `osc.start(when)` against `audioCtx.currentTime`. It
drives an always-on ambient bed (a soft drone whose root + filter shift with the
phase — never silent), an evolving ostinato bed-line, and every planted voice.
Notes are never scheduled from rAF.

**4. Touch to plant persistent living things.** Tap low → a **flower** (blooms by
day, closes/sleeps at night, sings morning→dusk); tap mid → a **bird** (sings &
glides in the morning/midday, roosts with eyes closed at night); tap sky → a
**star** (only visible & singing at night). Color = pitch register. Things
persist across the whole day, capped at 24 with oldest recycled. Every tap is
confirmed in <50 ms with sound + a visual bloom.

## Renderer

A single `<canvas>` 2D painterly side-on landscape diorama: a full-height
day-cycling sky gradient, a visible sun/moon arc with the luminary traveling
along it, drifting tinted clouds, layered parallax hills, twinkling stars at
night, and cut-paper creatures with simple friendly faces whose eyes close as
they fall asleep. DPR-aware, with a resize listener; rAF + scheduler + the
AudioContext are all torn down on unmount.

## Kid-safe audio chain

All audio routes through `masterGain (≤0.55) → lowpass (≤7500 Hz) →
DynamicsCompressor (threshold -18, knee 6, ratio 12, fast release) → destination`.
The master fades in over 2.5 s so nothing thumps on start. The AudioContext is
created **inside** the first user gesture (the "Begin the day" sun button) for
iOS unlock.

## Idle auto-demo

If untouched for ~2.5 s, a "ghost hand" plants things on its own, and the day
runs at an **accelerated preview rate** (~14×) so a silent glance still *sees*
the sun travel, the sky shift, and creatures wake/sleep, and *hears* the music
evolve. On the first real interaction the rate eases down to the full ~9-minute
day.

## References

- Brian Eno — *Music for Airports* / *Bloom* (generative, self-evolving, calm).
- Gary Hustwit — *ENO* (2024) (generative film; the day as a system that plays
  itself).
- arXiv **2604.05343** — *Anchored Cyclic Generation* (the motif-memory "anchor":
  re-voice and gently mutate stored material so a long generation coheres and
  evolves instead of drifting or looping).

## Next-cycle deepening

- **Weather & seasons** as a second, slower phase layer (rain motifs, a winter
  that thins the scale) wrapping the day.
- **Inter-creature listening**: let a flower's motif answer a nearby bird's,
  so anchors converse rather than each running independently.
- **Memory of yesterday**: persist a faint echo of the previous day's planted
  field so each new day starts from where the last one settled.
- Per-region timbres beyond osc synthesis (small wavetables / additive bells)
  for a richer midday vs. night contrast.
