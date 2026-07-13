# 1588 — glossolalia

**The question:** What if the whole field of vision flooded with language — the
DMT "everything is syntax" overload — and moving apertures of light resolved
fragments of it into legible meaning, which you steer and sound?

The viewport fills edge to edge with real generated pseudo-language, painted so
dim it reads as noise. Circular **apertures of clarity** glide across it; where
one passes, the flood resolves into bright, legible words — and the words it
touches ring. You steer an aperture through the language and play it like an
instrument.

## How to play

- **Type / arrow keys / WASD** — steer the primary aperture across the flood.
  Each keystroke ticks; printable keys also spawn a note into the aperture.
- **Tap / click anywhere** — ignite a burst-aperture there: the flood blooms
  legible around your finger and a just-intonation chord fires.
- **Words crossing an aperture** ring a JI bell whose pitch comes from height on
  the field (higher = brighter, higher-pitched).
- **Do nothing.** Seeded apertures drift on their own along Lissajous paths,
  resolving fragments of the flood over a low pad drone — a finished piece with
  zero interaction and no permissions. (Sound is gesture-gated by browser
  policy: the first key or tap lights the drone.)

A live corner badge reads `highlights: native` or `highlights: fallback`.

## The technique — CSS Custom Highlight API

This is the whole novelty. The flood is many drifting rows of real text in
ordinary `Text` nodes, styled dim by normal CSS — **no per-glyph DOM at all.**

- Eight highlight "buckets" are pre-registered once —
  `CSS.highlights.set('lume0', …)` … `'lume7'` — and styled bright→dim in a
  `<style>` tag via `::highlight(lume0){ color; text-shadow; -webkit-text-stroke-color }`.
- Each frame we compute the moving aperture centers, then for each build `Range`
  objects (`new Range(); r.setStart(node, i); r.setEnd(node, j)`) over the
  characters near the center and **distribute them across the buckets by
  distance** — closest characters go to the brightest bucket. Grouped with
  `new Highlight(...)` and mutated live via `.clear()` / `.add()`.
- Because `::highlight()` may only restyle color / shadow / stroke — never
  position — **all motion comes from re-ranging every frame.** The result is
  pools of legibility sliding over the language with essentially zero layout
  cost.
- **Progressive enhancement:** if the API is absent
  (`!("highlights" in CSS)` / `typeof Highlight === "undefined"`), the same
  aperture windows are wrapped in real `<span class="hl-fallback bkN">` nodes
  styled identically. This keeps the piece headless-verifiable.

## The generative flood — top-down "generative replay"

`text.ts` is a seeded morpheme assembler (onset · nucleus · coda → syllable →
word → line) that fills the field with meaning-*feeling* pseudo-language: asemic
overload that reads as language without reference.

We frame this as the **C×G×D computational-neurophenomenology model** (Fleming et
al., *Frontiers in Psychology*, 2026, doi:
[10.3389/fpsyg.2026.1819038](https://doi.org/10.3389/fpsyg.2026.1819038)): a
hallucination is the brain's **Generator** replaying learned structure top-down
— meaning-*shaped*, not noise. `text.ts` is that generator; each aperture is the
**Classifier** momentarily finding "effective causes" — legible words — in the
flood.

## Audio

Web Audio, self-contained, gesture-gated. A sustaining low just-intonation pad
drone (root + fifth + octave) under a slow filter LFO keeps it from ever going
silent, with a very quiet band-passed noise "language-wash" beneath it. Words
crossing an aperture ring an FM mallet/bell tuned to a 7-limit JI scale;
keystrokes tick; taps ignite a JI chord. Everything runs master gain ≤ 0.16 →
`DynamicsCompressor` → destination, with capped self-cleaning polyphony (≤ 12)
and full teardown (fade + `ctx.close()`) on unmount.

## Safety

A full-field piece, so luminance is handled deliberately: the flood stays dim
and near-black; only the small apertures are bright, layered on top. There is no
strobe and no full-frame flash — burst-apertures grow-then-collapse smoothly and
all change stays well under 3 Hz. `prefers-reduced-motion` slows the drift, drops
to a single ambient aperture, and tames bursts.

## Determinism

All randomness routes through a seeded `mulberry32` PRNG; all time comes from
`performance.now()` / `AudioContext.currentTime`. No wall-clock or unseeded
entropy — the flood is byte-for-byte reproducible from `SEED = 0x1588`.

## Cycle-2 deepening (this is a multi-cycle commitment)

Shipped this cycle as the intense pole of a DEEP fire on ONE concept — *language
that reads itself into being via the Custom Highlight API*. Two sibling
approaches were built alongside it and their best ideas fold in here as the
next-cycle plan:

- **The reader's real voice (the 5/5 weld).** Sibling `1586-reading-light` built
  a descending "reading light" designed to become a **score-follower over Karel's
  recorded Path piano** — the same Highlight-API machinery driven by a real
  recording instead of a synth. Fold that here: replace the seeded pad with his
  piano and let apertures *resolve words in time with his phrasing*, so the flood
  reads itself to his music. This is the concrete path to the lab's first clean
  5/5 — it welds the novel API (#1) to his real music and, once paired with a
  genuinely fresh (<14-day) finding, assembles every ambition criterion at once.
- **A radial aperture mode.** Sibling `1584-scripture-mandala` laid the scripture
  as a rotating japa-mandala with a spoke of light. Add it as an alternate
  aperture path — the clarity pool sweeps a Klüver spiral rather than drifting
  free — so the piece can breathe between free-flood and mandala registers.

## References

- **CSS Custom Highlight API** — MDN,
  <https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API>
- **C×G×D framework** — *Frontiers in Psychology*, 2026, doi
  10.3389/fpsyg.2026.1819038 (computational neurophenomenology of hallucination:
  Classifier × Generator × Dynamics).
- **Henri Michaux** — asemic writing; mescaline drawings (*Miserable Miracle*).
- **Terence McKenna** — "syntactic light," self-transforming machine elves, and
  glossolalia as visible language.
- **Heinrich Klüver** — form constants; the perceptual geometry of overload that
  this piece treats as a *linguistic* rather than a geometric flood.
