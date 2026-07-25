# 2656-loom — The Loom of Memory

**The one question:** *What if a piece of music kept an explicit MEMORY — a
growing library of little motifs it has played — and wove the future out of the
past, recalling old motifs transformed (inverted, augmented, fragmented) so the
piece is audibly a DIFFERENT piece at minute 8 than at second 0, and you can
watch each motif enter the library and return altered?*

Route: `/dream/2656-loom`

---

## What it does

On load, with zero interaction, a chamber-scale generative piece begins weaving
itself and its visual **loom** starts filling in left→right. It runs for ~8
minutes and ends in a recognizable **recapitulation**.

The engine keeps an **explicit, growing library of motifs**. A *motif* is a short
sequence of `(pitch, duration, dynamic)` events. New motifs are *seeded* only
occasionally (a handful of germ cells). **Almost all future material is made by
recalling an existing motif and transforming it** — this is the whole idea, and
it is Schoenberg's *developing variation* made mechanical.

Every motif is a visible glyph on the loom:

- **x = birth time** (the weft — time runs left→right across the 8-minute arc).
- **y = register** (mean pitch; higher motifs sit higher).
- **a lineage thread (the warp)** connects each motif to the parent it was
  recalled and transformed from — so the picture is literally a family tree /
  weave of the memory.
- **hue = dissonance** of that motif against the sounding drone root, running
  **violet (consonant) → magenta (tense)**.
- **thickness = recurrence** — motifs that keep getting recalled thicken.
- a **playhead** sweeps the present; motifs **pulse** (a ring) as they sound.
- the **tension band** at the bottom draws the structural arch (faint dashed
  violet) and the *actual* per-motif dissonance curve (magenta).

## The transforms (developing variation)

Each recall picks a parent from the library (weighted toward recent +
often-recalled, with a floor so deep-old motifs can always resurface) and applies
one transform, producing a **child** motif that is itself added to the library:

- `transpose` — shift the whole contour.
- `invert` — mirror around the first pitch.
- `retrograde` — reverse in time.
- `augment` / `diminish` — stretch / compress durations.
- `fragment` — take a head or tail and echo it (a classic liquidation gesture).
- `contract` — shrink intervals toward the axis.
- `expand` — **multiply intervals outward**, pushing notes *off the tempered
  grid* into microtonal territory.
- `chromatic` — insert leaning neighbour tones a fraction of a semitone off,
  guaranteed to bite against the root.
- `recap` — recall the earliest, lowest-generation motif near-original.

Because transforms **compound along lineage chains** (generation depth reaches ~6
in a run), the descendants late in the piece no longer resemble the seeds: a
headless run ends on motifs with pitches like `19.0, 20.4, 16.2, 13.5` —
fractional, expanded, microtonal — that trace back through the loom to a plain
diatonic seed like `3, 2, 2, 2, 3`. Same ancestry, unrecognizable surface.

## The tension curve & how it reaches recapitulation

A structural **tension arch** `tensionTarget(t)` rises to a late-middle climax
(~0.9 around the 5-minute mark) and falls back toward zero by the end. When the
weaver recalls a motif, it generates a *spread of candidate transforms* and
picks the one whose resulting dissonance is **closest to the arch's current
target**. So the piece deliberately climbs into tension (expansion + chromatic
neighbours dominate near the climax) and then relaxes (transpose / fragment /
contract dominate on the way down). Measured dissonance in a full run spans
**0.00 → 0.81**.

Near `t = 0.82·duration` (and any time the viewer asks), the weaver forces a
**recapitulation**: it recalls the earliest seed, transposed to the current drone
root — recognizable, but changed by its new harmonic home. That return, against
the resolved (low-tension) drone, reads as the close.

## The dissonance axis (hard mandate)

Dissonance is a **first-class, controllable, resolvable** structural device, not
an accident and not snapped away. Nothing is quantized to a consonant just /
pentatonic lattice: `expand` and `chromatic` transforms produce genuinely
microtonal, chromatic pitches, and the synth honours fractional semitones, so
they **beat audibly against the sustained drone root** (root + fifth + octave)
that provides the sounding harmony. Dissonance is measured against that root
(distance from the consonant interval classes plus a microtonal-beating term),
steered by the arch, and **resolved** at the recapitulation. The `+ dissonance` /
`− dissonance` buttons nudge the whole arch up or down live.

## Audio

Web Audio API only, no libraries. Each note strikes a **plucked/struck voice**:
two lightly-detuned oscillators (triangle + saw) through a per-note low-pass whose
cutoff tracks an attack→decay envelope (brighter when louder), into a **shared
bus** — dry + a generated **convolver reverb** + a **feedback delay** for air.
Voices are created per note and reclaimed on `onended`; a registry kills every
voice + the drone on teardown, then `ctx.close()`. A slow drone follows the
harmonic plan and is the harmony everything else is tense (or consonant) with.

## Visuals

Pure **SVG** art layer (no Canvas2D, no WebGL needed). Glyphs, lineage threads,
gridlines, the tension band, the seed-sketch preview and the playhead are all SVG
primitives. Raw hex / `hsl` colours appear **only** inside the art layer and stay
within the violet→magenta brand ramp; all chrome uses semantic Tailwind tokens.
No strobe/flicker — only slow luminance drift and gentle per-note ring pulses.

## Interaction (secondary — it plays itself)

- **Begin** — unlocks + resumes the AudioContext (required by autoplay policy);
  visuals are already running.
- **Jump ahead 4 min** — fast-forwards the development so a reviewer can hear/see
  minute-8 material without waiting.
- **Toward recapitulation** — forces an early motif to return now.
- **± dissonance** — nudges the tension arch.
- **Plant a seed** — click the loom a few times to sketch a pitch contour; it
  enters the library at the playhead and gets developed like any other motif.

## Determinism

Seeded `mulberry32(0x2656)` drives every engine choice *and* the reverb tail. No
`Math.random`, `Date.now`, or argless `new Date()` anywhere in logic;
`performance.now()` is used only for animation timing. Two runs to `t = 480`
produce byte-identical note lists.

## Named references

- **Arnold Schoenberg — "developing variation."** The governing principle:
  perpetual variation of a small stock of motifs rather than literal repetition.
- **David Cope — *Experiments in Musical Intelligence* (EMI).** Recombining a
  stored memory of motivic material into new long-form music; this piece is a
  small, transparent, browser-buildable cousin of that idea.
- **arXiv:2603.00576, "Efficient Long-Sequence Diffusion Modeling for Symbolic
  Music Generation" (Feb 2026).** The fresh research anchor for long-range,
  hierarchical, *memory-driven* structure. This prototype does **not**
  reimplement the model — it is the algorithmic, deterministic cousin of its
  concern (making the far future depend legibly on the remembered past).

## Honest headless caveats

- **Reviewed headless at 06:30 with nobody interacting:** the visual
  self-evolution *is* the demo — the loom fills in, hue warms toward magenta into
  the climax, and the recapitulation thread appears late. **Audio stays silent
  until a user gesture** (browser autoplay policy); this is unavoidable without a
  click, and the piece is designed so the on-screen weave tells the whole story
  regardless.
- The arch is deterministic, so every headless run looks identical — intended.
- The recall weighting favours recent material, so the lineage tree branches
  (depth ~6) rather than forming one deep chain; this is deliberate for a
  readable loom, and transforms still compound enough that late material is
  microtonal and unrecognizable relative to the seeds.
- If the AudioContext can't be created, a `text-destructive` notice appears and
  the loom keeps weaving silently.
