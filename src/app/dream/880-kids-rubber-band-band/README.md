# 880 · Rubber-Band Band

## What is this / how to play

A kids touch instrument: a wall of ~7 stretchy glowing rubber-bands strung
across a warm dark stage, each a different color and a different note in a sweet
C-major-pentatonic mode. Tap **Start**, then drag a band sideways with your
finger (or mouse) and let go — it twangs a plucked-string note and visibly
wobbles on a spring before settling. Pluck gently and you get a clear, in-tune
note. There's always a soft warm pad humming underneath, so it's never silent,
and within a second or two of starting (with no input) the band plays itself a
short demo before going quiet again on your first touch.

## Design notes (the jury-driven idea)

The whole point is **a wrong choice that persists**. If a child pulls a band
**too far** — over-stretches it — the band goes **slack and out of tune**: it
sags downward, its glow dies, and it now twangs a **flat, buzzy, detuned** note.
And it *stays that way*. Nothing rescues it automatically; there is no
auto-resolve and no timeout. To fix it, the child has to **earn the fix**: grab
the little tuning-peg knob at the band's left end and turn/drag it back **up**
until the band snaps taut and glows true again, restoring the real pitch. The
mistake is visible (sag + dimmed color + a pulsing amber halo on the loose peg),
audible (an unmistakably flat, dull, lightly-buzzing tone), and lasting.

The out-of-tune note is deliberately a **large, obvious contrast** a 4-year-old
can hear — but it is **never louder or harsher** than an in-tune note: it's
quieter-decaying, duller (loop low-pass drops from ~5.2 kHz to ~1.4 kHz), drops
nearly two semitones flat, and adds only a soft sub-buzz. No blast.

### Technique

- **SVG spring-string animation** — the whole instrument renders as inline
  `<svg>`: each band is an animated quadratic `<path>` whose mid-point
  displacement is integrated through a **damped spring** (stiffness/damping scale
  with the band's tension) so it wobbles and settles after a pluck. No canvas,
  no WebGL.
- **Pluck synth** — a **Karplus–Strong-style** plucked string: a short white-noise
  burst excites a tuned `DelayNode` + feedback comb with an in-loop low-pass
  (the classic averaging damping filter). Detuning flattens the pitch, shortens
  the decay, darkens the loop filter, and adds a quiet sub-buzz.
- **Detune / retune state machine** — each band carries a latched `detuned` flag
  and a `taut` health value. Over-stretch drops `taut` below the in-tune
  threshold and latches it; only turning the peg upward raises `taut` back, and
  it doesn't clear until the band is fully true.

### Kid-safety

Usable by a 4-year-old, no reading required. Band and peg hit areas are large
(70-px-wide band strokes, 38–76-px peg halos). Audio chain is
master gain (0.26, ≤ 0.3) → low-pass (7.2 kHz, ≤ 7.5 kHz) →
`DynamicsCompressor` → destination, with an always-on soft pad. The
`AudioContext` is created/resumed inside the Start tap (iOS gesture rule); if it
can't start, a `text-rose-300` notice appears and the SVG bands still play
visually. Everything tears down on unmount (cancel RAF, stop/disconnect nodes,
`ctx.close()`).

## Research / refs

- **Karplus & Strong (1983)** — "Digital Synthesis of Plucked-String and Drum
  Timbres" — the noise-burst-into-tuned-feedback-comb method behind the pluck.
- The **monochord / rubber-band as a child's first tunable string** — the oldest
  intuition that tension sets pitch and that a string can be tuned by turning a
  peg.
- **Consonance-contrast design law** (RESEARCH §528, 2026-06-23; PMC11336827):
  the out-of-tune note is intentionally a **LARGE, unmistakable** contrast so a
  young child unambiguously perceives "wrong," while keeping it no louder or
  harsher than the in-tune note.
