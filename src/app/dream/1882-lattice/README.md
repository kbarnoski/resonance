# 1882 — The Lattice

A **played** just-intonation harmonic lattice. An instrument, not a demo: it makes
no music on its own. A faint tonic-and-fifth drone bed keeps the screen alive, and
a clearly-labelled idle "attract" pulse walks one node at a time — but **no note
sounds until a human plays it**, and the pulse stops the instant a key is pressed.

## The one question

> What if you could *play* Resonance's harmony as a living just-intonation lattice —
> every note an exact small-integer frequency ratio, and consonance is visible as
> geometric closeness?

## The just-intonation math (the point)

Each node is a frequency

```
f = base · 3^a · 5^b        (base = 261.63 Hz, the 1/1 tonic)
```

folded into a single octave `[1, 2)` and kept as an **exact integer fraction** — the
reduction is done on an integer numerator/denominator pair, so floating point never
decides what "3/2" means. Consequences:

- Stepping one node **right** multiplies by a **pure perfect fifth, 3/2**.
- Stepping one node **up a row** multiplies by a **pure major third, 5/4**.
- The lattice coordinates literally *are* the prime exponents `(a, b)`, so
  **geometric closeness == harmonic consonance**: neighbours are the simplest
  ratios; distant nodes are complex and tense (`45/32`, `75/64`, …).

Every voice is tuned to its exact frequency, so held nodes ring as **genuinely just
chords**: a `1/1 · 5/4 · 3/2` major triad is beat-free; wider lattice jumps stack
into thicker, more restless spectra. This is deliberately **not** 12-TET and **not**
a pentatonic "no-wrong-notes" scale — the whole prototype exists to let you *hear*
the difference. Each sounding node shows its ratio label (`3/2`, `9/8`, `5/3`, …).

## How you play it

- **Computer keyboard** (primary): the QWERTY block is a 2-D patch of the lattice.
  Each physical row runs along the fifths axis; each row *up* adds a major third.
  The tonic `1/1` sits under **G** on the home row. Hold several keys for chords.
- **Web MIDI** (optional): a real MIDI keyboard is picked up automatically via
  `navigator.requestMIDIAccess()` when the browser allows it; feature-detected and
  silently skipped otherwise. Incoming 12-TET notes are routed to the nearest just
  node so a played chord stays just.
- **Pointer / touch** (secondary): tap the nodes; multi-touch rings chords.

## Named references / prior art

- **Leonhard Euler — _Tonnetz_** (the fifths/thirds pitch net) and the
  **Euler–Fokker genus** lattice this layout descends from.
- **Harry Partch — _Tonality Diamond_** (the canonical geometric picture of just
  ratios as consonance-space).
- **Erv Wilson's pitch lattices** (the leaning-lattice drawing idiom).
- Distinct from the 2026 **web 15-limit tonality diamond** (Web MIDI; Zenodo
  **6772144**) and the **tune.js** JI library — those are a reference diamond and a
  tuning toolkit; this is a **keyboard-mapped Tonnetz you perform**.

## Ambition criteria hit

- **Played by a human** — keyboard + optional Web MIDI + touch; the instrument is
  silent until played; the attract pulse is visual-only and self-cancels.
- **Real 5-limit JI**, exact integer fractions, audible beat-free 3/2 and 5/4.
- **Paper-and-ink palette** — aged-cream page, ink strokes, one warm terracotta
  accent for sounding nodes; **no violet, no near-black** in the art.
- **SVG-DOM** — the lattice is built once as `<circle>`/`<line>`/`<text>` and
  **mutated per frame via refs** (radius / opacity), never rebuilt; no canvas/WebGL.
- **Warm polyphonic voices** — three harmonic partials, soft attack/release, gentle
  lowpass, a pooled 16-voice engine → `DynamicsCompressor` → master gain (0.18) →
  destination; AudioContext born on the Begin gesture, fully disposed on unmount.

## Honest limitations

- The visible patch is a finite **window** on an infinite lattice — no comma-pump
  wrap-around, so you can walk "off the edge" of the mapped keys.
- The **MIDI mapping approximates** a few chromatic pitch classes to the nearest
  node in the patch (a couple of enharmonic choices are pragmatic).
- The timbre is a simple three-partial additive voice, not a physical model.
- Horizontal touch-panning of a very wide lattice is limited (the SVG claims touch
  for playing); on small screens the lattice scrolls in its container.

## Safety

- No strobe or flicker. The idle attract pulse drifts **one node per ~3.6 s** with a
  slow triangular fade — well under ~0.1 Hz luminance motion — and is **damped
  entirely** under `prefers-reduced-motion`. It stops the instant you play.
- Peak art brightness stays on warm paper, never pure white.
- No stuck notes: holds are ref-counted and released on key-up, pointer-up, and
  window blur.

## Files

- `page.tsx` — chrome, SVG lattice, input handling (keyboard / MIDI / pointer),
  the ref-mutation animation loop, design-notes overlay.
- `lattice.ts` — exact ratio math, the keyboard→lattice patch, MIDI mapping.
- `audio.ts` — the pooled polyphonic just-intonation voice engine + drone bed.
