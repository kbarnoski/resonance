# 5480 · The Composer That Develops Itself

## The one question

*What if a piece of music composed itself forward over a long arc — stating a
seed motif, then developing it (inversion, retrograde, augmentation,
fragmentation, sequence, modulation) with real memory of everything it has
played, so minute 6 is demonstrably a transformation of minute 1, never a loop?*

## The technique

A **symbolic motivic-transformation engine**. A germ motif is an array of
`{ degree, duration }` (scale-degree integers over a natural-minor / Aeolian
scale). The classical & dodecaphonic operators are implemented as pure
functions:

- **Prime (P)** — the germ stated plainly.
- **Inversion (I)** — `invert()` mirrors each degree around an axis.
- **Retrograde (R)** — `retrograde()` reverses the note order.
- **Retrograde-Inversion (RI)** — invert then reverse.
- **Transposition** — `transpose()` shifts degrees.
- **Augmentation / Diminution** — `scaleDurations()` stretches / compresses time.
- **Fragmentation** — `fragment()` takes a contiguous sub-cell.
- **Sequence** — `sequence()` repeats a cell at rising / falling steps.
- **Modulation** — the tonal centre (a semitone offset) shifts.

Each transformation has an audible identity: augmentation slows and broadens,
fragmentation is terse, the climax stabs diminished fragments an octave up, and
modulation moves the whole key.

## The arc, the operators, the memory

A `Conductor` state machine walks the narrative arc and rolls into a new
movement (up a fourth) when a movement's beat-budget is spent, so the piece
never stops:

`exposition → development → climax → recapitulation → coda → (new movement)`

Each phase draws operators from its own palette applied to **remembered**
material:

- **Exposition** states the germ, then transposes it and sequences its head cell.
- **Development** inverts / retrogrades / RI / augments / fragments / sequences /
  modulates recently-remembered phrases.
- **Climax** fires terse, diminished fragments and driving rising sequences,
  brighter and an octave up.
- **Recapitulation** brings the germ back transformed (inverted or broadened) and
  quotes earlier phrases in retrograde.
- **Coda** settles the centre home and augments the germ to rest.

Every emitted phrase is stored in a **memory array** with its `parents` and a
`lineage` of op-tags (`seed → I → aug → …`). This is what makes late material a
provable descendant of the germ, and it is what recapitulation quotes. The live
UI shows the current lineage as a derivation trace.

## Audio & visual

- **Audio:** Web Audio API, no libraries. A warm pluck/saw **lead**, a triangle+sine
  **bass**, and a soft detuned-saw **pad**, mixed through a feedback delay and a
  compressor. A **look-ahead scheduler** (`setInterval` at 25 ms scheduling
  ~200 ms ahead against `AudioContext.currentTime`) keeps timing tight.
- **Visual:** a self-writing **Canvas2D piano-roll** — pitch = y, time = x —
  scrolling under a fixed playhead. Lead notes are bright violet, pad/bass
  dimmer. No three.js / WebGL / WebGPU.
- **Degrades gracefully:** if `AudioContext` is unavailable, a `SilentDriver`
  runs the same conductor against a wall-clock so the score still composes and
  scrolls, silently.

## UI

Play/Pause (primary), **New seed** (re-rolls the germ via a seeded mulberry32
PRNG and restarts the arc), a phase / key / movement / elapsed readout, the live
transformation label, the derivation trace, and a "Read the design notes"
overlay.

## Tags

self-playing · Canvas2D · symbolic motivic-transformation engine ·
compositional / musical / architectural.

## Reference

Arnold Schoenberg, *developing variation*; the twelve-tone row operators
(Prime / Inversion / Retrograde / Retrograde-Inversion).

## Files

- `engine.ts` — types, scale/pitch mapping, mulberry32, the pure operators, seed
  motifs, and the `Conductor` state machine + memory.
- `audio.ts` — the `Composer` (Web Audio synth + look-ahead scheduler), the
  shared `MusicSource` interface, and render/state types.
- `silent.ts` — the `SilentDriver` audio-free fallback.
- `renderer.ts` — the Canvas2D piano-roll.
- `page.tsx` — the client component wiring it together.

## Next-cycle deepening (from the two sibling explorations this fire)

This shipped as the winner of a DEEP fan of three attacks on *"a piece that
composes itself forward and remembers."* The two runners-up are banked (IDEAS
§994); their best ideas graft onto this engine:

- **A "distance-from-germ" drift meter** (from `5496-grammar`): show a live
  scalar of how far the current phrase has travelled from the seed — a measurable
  "minute 6 ≠ minute 1" readout to sit alongside the derivation trace.
- **Multi-voice agents with canon attention-lines** (from `5512-ensemble`): give
  each of the lead/bass/pad their own developing line that imitates the others
  after a canon delay, drawn as attention arcs — turning the single developing
  voice into a small self-listening ensemble developing the *same* germ.
- **Seed from Karel's real Path piano**: extract an opening motif from one of his
  recordings and let the engine develop *his* germ, not a synthetic one.

## Known rough edges

- Voicing is deliberately spare (one lead line + root bass + triad pad) — this is
  a proof of the engine, not a finished orchestration.
- Phase boundaries are driven by elapsed beats, so a long augmentation can
  overshoot a boundary slightly.
- "New seed" restarts the arc from the exposition rather than morphing live.
- The `SilentDriver` duplicates a little scheduling math from `audio.ts`.
