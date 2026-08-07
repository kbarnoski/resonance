# 7960 · Fold paper into music

## The one question

*What if you composed by folding paper — authoring a crease pattern of mountain
and valley folds, then folding it in 3D — and the geometry of your folds became
the music, with a vertex that is **flat-foldable** ringing consonant and one
that isn't clashing?*

This is the dream lab's **first origami / crease-pattern / flat-foldability
piece** (grep-verified: 0 prior across the gallery). It is a genuine VERB with
**player-authored structure that the player discovers by ear** — you design the
crease pattern, and you find the flat-foldable (consonant) configurations
yourself. Nothing named is handed to you to watch; you fold, you listen, you
discover.

## How to use it

1. **Author creases.** In the left panel, click any grid edge. Each click cycles
   it: none → **mountain** (warm violet, solid) → **valley** (cool periwinkle,
   dashed) → none. Every interior vertex where creases meet becomes a voice.
2. **Watch it fold.** The right panel folds the sheet in 3D on a slow loop
   (Play / Pause fold). Valid patterns fold cleanly; invalid vertices gap.
3. **Listen.** Press **Sound on** (audio only starts on a user gesture). A
   flat-foldable vertex rings a clean, just-tuned tone. A vertex that cannot
   flatten detunes and buzzes. Edit until the clashing red vertices turn violet
   and the chord resolves — that is discovering a flat-foldable pattern by ear.
4. **Starters.** Miura-ori, Fan, and Bird base give you a flat-foldable pattern
   in one tap so you hear the idea in under a second — but authoring your own is
   the point.

Vertex dots: **violet = flat-foldable / consonant**, **red = clashing**. Hover a
vertex to read its Kawasaki error and Maekawa mountain−valley count.

## How flat-foldability maps to consonance

Each interior vertex is judged by two classic single-vertex theorems:

- **Kawasaki's theorem.** A single-vertex crease pattern is flat-foldable iff
  the alternating sum of the sector angles between consecutive creases is zero —
  equivalently, the odd sectors and the even sectors each sum to 180°. We compute
  that alternating sum and normalize its distance from zero into a
  `kawasakiError ∈ [0,1]`. Low error → a clean partial from a **just-intonation**
  scale (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8). High error → the voice's detuned twin
  pulls away, producing audible **beating / dissonance**. Odd crease counts can
  never flatten, so they read as maximum error.
- **Maekawa's theorem.** At a flat-foldable vertex, (mountains − valleys) = ±2.
  We reward the correct parity with a brightness/purity bonus (a more open
  low-pass), so a Kawasaki-flat vertex with the right MV assignment sings the
  cleanest.

As the global fold parameter sweeps 0→1, voices are lit in sequence, so a single
fold plays as a phrase. Everything sums through a shared low-pass into a
`DynamicsCompressor` limiter with a hard 0.14 ceiling.

## References

- **Toshikazu Kawasaki** — Kawasaki's theorem (alternating-angle flat-foldability).
- **Jun Maekawa** — Maekawa's theorem (mountain − valley = ±2).
- **Miura-ori** (Koryo Miura) — the rigid, flat-foldable tessellation used as a starter.
- **Robert J. Lang** — *computational origami*, TreeMaker, crease-pattern design.
- **Erik Demaine** — the mathematics and algorithms of folding.

## Ambition (floor criteria hit)

- **#1 — genuinely new technique.** The lab's first origami / crease-pattern /
  flat-foldability instrument (grep-0). Crease authoring drives a driven 3D fold
  and a per-vertex Kawasaki/Maekawa consonance map — a mechanism not present
  elsewhere in the gallery.
- **#3 — named references.** Kawasaki, Maekawa, Miura-ori, Robert Lang, Erik
  Demaine, and just-intonation ratios, all cited and load-bearing.

## Honest notes — what is simplified

- **The fold is DRIVEN, not solved.** Panels (connected regions of triangles not
  separated by a crease) rotate about their shared crease lines along a spanning
  tree of panel adjacencies. This keeps the sheet connected along the tree and
  folds convincingly, but it is **not** a rigorous rigid-origami solver: it does
  not enforce consistency around loops or prevent self-intersection, so a
  non-flat-foldable vertex visibly **gaps**. That gap is intentional and honest —
  you can see the clash you hear. A real rigid solve (Lang, Demaine, Tachi's
  Freeform Origami) is a research problem out of scope here.
- **Consonance is Kawasaki-dominant.** Kawasaki drives detune; Maekawa only adds
  brightness. Kawasaki is *necessary but not sufficient* for true flat-foldability
  (global layer-ordering can still fail); we voice the local single-vertex
  condition, which is the honest, audible part.
- **Discretization.** Creases live on a fixed tessellation (a grid whose cells
  fan from their centres), so every interior grid vertex has 8 symmetric crease
  directions at 45° steps. Cell-centre vertices fold but are not voiced. Angles
  are therefore quantized to multiples of 45°.
- **Self-demo.** On load, a seeded deterministic autopilot (`mulberry32(0x7960)`)
  lays a starter pattern plus one deliberate clash and folds/unfolds on a gentle
  loop — muted, zero input — so the concept reads visually in a headless review.
  Real audio and the true edit loop begin on the first user gesture.

## Not verifiable headless

The audio (consonant vs. clashing voices, the fold-as-phrase sequencing) needs a
user gesture to create the `AudioContext`, so it cannot be heard in the 06:30
headless review — only the muted visual fold and the vertex consonance colouring
are visible there. Motion is slow and loops gently; `prefers-reduced-motion`
freezes the fold to a static folded pose.
