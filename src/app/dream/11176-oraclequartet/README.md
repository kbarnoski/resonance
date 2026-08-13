# Oracle Quartet (11176)

**A self-playing jazz combo that improvises you back.**

> What if a whole jazz combo — soloist, walking bass, comping — grew itself from a
> melody you give it and improvised over it endlessly, never repeating?

## What it is

A faithful **Factor Oracle** machine-improviser (the OMax engine) drives the
**solo** line, wrapped in a self-playing trio. The oracle is fed a bebop head on
mount — or _your_ melody, dropped as an audio file — and thereafter improvises by
walking its automaton over a looping ii–V–I, swung, with walking bass and
comping underneath. Audio (Web Audio) + visuals (Canvas2D). Self-contained.

## The Factor Oracle algorithm

The soloist is a genuine Factor Oracle, the automaton behind IRCAM's OMax /
Somax2 machine improvisers.

- Assayag & Dubnov, _Using Factor Oracles for Machine Improvisation_ (Soft
  Computing, 2004). — the improvisation model.
- Allauzen, Crochemore & Raffinot, _Factor oracle: a new structure for pattern
  matching_ (1999). — the online `add_letter` construction used here.

Implemented in [`oracle.ts`](./oracle.ts):

- **Symbols** are quantized musical events — one C-major scale-degree bucket per
  note (`midiToStep`).
- **Online construction** (`FactorOracle.addLetter`): for each new symbol we add
  the forward transition, back-fill factor transitions along the suffix chain
  until a state already has one, then set the new suffix link `sfx[i]` and the
  longest-repeated-suffix length `lrs[i]`. State arrays: `trans[]` (symbol→state
  maps), `sfx[]` (`sfx[0]=-1`), `lrs[]`, `symbol[]`.
- **Improvisation walk** (`oracleStep`): a read-head `p`. Each step, with
  probability `pRecombine` AND `sfx[p] > 0` AND `lrs[p] >= 2`, it **jumps**
  `p ← sfx[p]` (recombine into a matching context); otherwise it **continues**
  `p ← p+1` (replay forward). Past the end it wraps via `sfx[last]`, else a
  random low state. The emitted `symbol[p]` decodes to a solo note.

Transitions and suffix links are exact; `lrs` is the bounded agreeing-suffix
count (it only gates jump quality). Recombination jumps are marked on stage as
expanding gold rings.

## The band (this folder's distinct approach: a self-playing trio)

Over a 4-bar **ii–V–I in C** (Dm7 · G7 · Cmaj7 · Cmaj7), all in one tonal center
so the oracle's scale-degree always sits over the changes:

- **Walking bass** — quarter notes, root on beat 1, chord tones on 2 & 3, a
  chromatic approach tone into the next chord's root on beat 4 (`buildWalkingBass`).
- **Comping** — sparse rootless-ish voicings, stabbed on the off-beats of 2 & 4,
  restrained.
- **Swing** — a swung eighth grid (down-eighth = 60% of the beat) plus a soft
  synthesized ride/hat. No samples.
- One **look-ahead scheduler** (`setInterval` 25 ms, ~120 ms ahead on
  `ctx.currentTime`) sequences bass + comp + solo + ride together. The oracle's
  notes quantize onto that grid.

Everything routes through the shared ear-safety master
(`_shared/visionary/safeMaster`), with bounded polyphony + voice-stealing.

## Interaction

- **Mount:** seeded head (`mulberry32(0x11176)`) → the combo is visually alive at
  once; the first tap unlocks the AudioContext.
- **File drop / picker:** WAV/MP3 → `decodeAudioData` → onset + autocorrelation
  pitch pass → scale-degree quantize → feed the oracle, so it improvises _your_
  melody. Degrades gracefully (unclear/failed decode → keep playing + a
  `text-destructive` note).
- **Live feed:** click the stage (height = pitch) or press `a s d f g h j k` to
  add live solo material to the oracle.
- **Sliders:** recombination probability (0–60%) and solo density.

## Rendering / palette

Canvas2D, HiDPI-correct, jazz-noir and **cool**: deep blue-black stage, the solo
as a scrolling **brass-gold** contour ribbon up top, **cyan** bass pulses low,
soft **teal** comp blocks mid-field. Gentle eased beat bloom, well under 3 Hz;
honors `prefers-reduced-motion`. Art layer uses raw hex; all UI chrome uses
semantic tokens.

**Tags:** factor-oracle, omax, machine-improvisation, generative-jazz,
walking-bass, web-audio, canvas2d, jazz-noir.

## Next-cycle deepening

Per-chord scale swapping (real modal interchange instead of one tonal center); a
form-aware soloist that builds and releases tension across choruses; trading
fours between two oracles; a bass line that reharmonizes; motif-conditioned jump
selection (Somax2-style reactive listening).
