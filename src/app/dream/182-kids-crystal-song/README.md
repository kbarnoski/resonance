# Crystal Song

**For**: kids 3+  
**Route**: `/dream/182-kids-crystal-song`  
**Status**: `demoable`  
**Cycle**: 214  
**Zero permissions · Zero API · Zero deps · ~3.1 kB**

---

## What it is

Six glowing crystal formations grow from a dark cave floor. Each crystal is a
different height — taller = lower pitch (BANDIMAL rule, same as `108-kids-kalimba`
and `169-kids-marble-run`). **Tap any crystal** to make it ring. **Hold** to
sustain the note. **Tap multiple crystals** for polyphony — hold four or more
simultaneously and the cave pulses with a resonance flash.

The crystals shimmer autonomously at different rates, so the cave is alive before
the first touch. The canvas is never silent — a sub-bass C2 drone fills the space
from the moment the first tap creates the AudioContext.

---

## Sound design

Each crystal uses three sine oscillators (fundamental + octave + 2-octave) with
different gain weights (1.0 / 0.14 / 0.04). This layering gives a glass-bell
timbre: clean fundamental, a faint halo from the upper harmonics. The decay is
~2.2 seconds after release — long enough to sustain a chord but not so long that
the sound turns muddy with many taps.

Crystal pitches: **C3 · E3 · G3 · A3 · C4 · E4** — a major hexatonic cluster.
Every combination is consonant. The lowest crystal (C3, 130 Hz) pairs especially
well with any of the upper crystals.

Ambient cave drone: C2 (65.4 Hz), gain 0.013 — below the threshold of hearing
on small phone speakers but felt as a presence on headphones or a tablet. Adds
a sense of space without competing with the crystals.

---

## Visual design

Each crystal is a 5-point polygon (two shoulder corners + one tip + two base
corners), lit with a vertical gradient from dark base to bright tip. Two inner
facet lines divide the body into three visual faces, giving a 3D crystalline
appearance without any WebGL.

On tap: sparkle burst (16 particles) from the crystal tip + two concentric
expanding ripple rings. The ripple at the base widens to ~42% of the column
width; the tip ripple is smaller and faster. Both fade over ~0.5 seconds.

The shimmer is a per-crystal sinusoidal amplitude variation at ~10-second period
(`ts * 0.00058`), each crystal offset by π/3 from its neighbors. At any moment
roughly half the crystals are brightening and half dimming — the cave breathes
at a natural, organic rhythm.

Resonance flash: when 4+ crystals are held simultaneously, the canvas gets a
brief cool-white overlay (opacity decaying from 0.12 to 0 over ~1 second). The
flash makes the "full chord" moment feel ceremonial.

---

## What's new about this

180+ prior kids prototypes use tap/drag/draw gestures, many with KS synthesis
or pentatonic pitch grids. Crystal Song introduces:

1. **Sustained tones while held** — most kids prototypes play-on-tap-down.
   Crystal Song sustains while the finger is down and decays on release. A child
   learns: hold longer = longer note.

2. **Glass bell timbre** — different from KS pluck (string/percussion),
   triangle wave (bell), or sine (pure tone). The additive synthesis with
   octave + double-octave partials creates a uniquely glassy, slightly metallic
   character that no prior prototype has.

3. **Autonomous shimmer before first touch** — the cave is animated immediately,
   so the child sees something alive and wants to touch it. Contrast with most
   kids prototypes that are static until tapped.

4. **Multi-crystal resonance** — touching 4+ crystals simultaneously rewards
   the child with a whole-cave flash. Encourages using all fingers at once.

---

## Design lineage

- `105-pluck-field` ❤️ — physical resonance as primary metaphor  
- `166-kids-lantern` ❤️ — dark canvas, glowing objects to discover  
- `169-kids-marble-run` ❤️ — height → pitch physical analogy  
- `181-kids-texture-drum` — timbral variety as a design axis  

---

## Polish ideas (future cycles)

- **Stalactites from ceiling**: small triangular crystal drips hanging from the
  top edge — purely decorative, gives depth to the cave setting.
- **Crystal growth animation**: on the first time a crystal is held for >3 seconds,
  it grows slightly taller (max 10% height gain per session). The cave
  responds to extended play.
- **Mic mode**: RMS amplitude from mic causes all crystals to shimmer faster —
  the cave responds to the child's voice even without touching.
- **Resonance arpeggio**: when the 4-crystal resonance fires, auto-play a
  fast upward arpeggio of all 6 crystals instead of just a visual flash.
