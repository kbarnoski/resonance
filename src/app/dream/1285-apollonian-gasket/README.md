# 1285 · Apollonian Gasket

## The one question

**What if you could PLAY the Apollonian gasket — tap a circle to sound its tone and
grow three new tangent circles into the gap beneath your finger, packing an infinite
self-similar fractal that you compose by ear?**

The gasket is not a picture here; it is a chord structure. A circle's curvature (bend)
is its pitch, so packing the gasket literally builds a chord.

## Tags

| axis | value |
| --- | --- |
| **state** | altered-states / fractal-regress (purely audiovisual) |
| **pole** | instrument (PLAYED, not a screensaver) |
| **input** | tap-to-spawn-and-sound (pointer / touch — no mic, no sensors) |
| **output** | Canvas2D nested-tangent-circle **structure** (line drawing, not a filled shader field) |
| **technique** | Apollonian packing via the Descartes Circle Theorem (complex form for centres) |
| **palette** | nacre / mother-of-pearl on deep ink — luminous thin rings |

## How it works

### The mathematics

Every circle is stored as a **signed curvature** (bend) `b = ±1/r` and a **complex
centre** `z = x + iy`. The outer bounding circle has a negative bend.

New tangent circles are placed with the **Descartes Circle Theorem**. For three mutually
tangent circles with bends `b₁, b₂, b₃`, the two circles tangent to all three have bend

```
b₄ = b₁ + b₂ + b₃ ± 2·√(b₁·b₂ + b₂·b₃ + b₃·b₁)
```

and — by the **Complex Descartes Theorem** — centre

```
b₄·z₄ = b₁·z₁ + b₂·z₂ + b₃·z₃ ± 2·√(b₁·b₂·z₁·z₂ + b₂·b₃·z₂·z₃ + b₃·b₁·z₃·z₁)
```

(with a complex square root). The correct centre sign is chosen by testing tangency
against all three parents. `gasket.ts` implements `soddyPair()` (both solutions) and
selects the **larger-bend** solution as the circle inscribed *inside* a curvilinear
triangular gap.

**Seed.** The classic `(−1, 2, 2, 3, 3)` gasket: an outer circle of radius 1 (bend −1)
enclosing two radius-½ circles (bend 2), then two radius-⅓ circles (bend 3) inscribed
above and below — five circles bounding six triangular gaps. (The two inscribed bend-3
circles are re-derived straight from Descartes in the self-check to confirm the seed.)

**Recursion.** Placing the inscribed circle of a gap splits it into three smaller gaps;
each recurses. The packing is capped by a **minimum radius** (both an absolute world
floor and a live per-frame ≈1.6 px screen floor) and a **maximum count** (~3200), so it
terminates while still diving many levels toward the self-similar limit.

**Reflection shortcut.** After the first Soddy step, sibling circles satisfy a linear
relation (`b_new = 2(b₁+b₂+b₃) − b_old`), the Vieta reflection of the two Descartes
roots — but this build computes each gap's inscribed circle directly from the complex
theorem for clarity.

### The play model

- **On mount** the seed gasket is packed to a handful of levels and drawn immediately —
 the image and the resting root chord read at a single glance, silent until *Begin*.
- **Tap** a circle → it sounds (curvature → pitch), and the gaps beneath your finger
 grow their next generation of tangent children, each chiming higher and quieter — a
 small ascending chord condensing out of the gap.
- **Drag** to pan; **pinch / scroll** to zoom (tangency-preserving) and dive toward the
 infinite-nesting limit. **Reset view** re-fits; **reseed** starts a fresh gasket.

### The sound (`audio.ts`, output only)

- Bend → frequency, quantised to a **5-limit just-intonation pentatonic**
 (`1, 9/8, 5/4, 3/2, 5/3`) across octaves, so bigger circles ring lower and every tap
 harmonises.
- A pool of 16 voices with soft attack and a long release scaled by circle size.
- A low **root + fifth drone bed** (shared `droneBank`) ties the chord together and
 swells gently with tap density.
- Signal path: voices + drone → **convolution void** reverb (shared `convolutionVoid`) →
 **DynamicsCompressor** limiter → master gain (≤ 0.3, short fade-in) → destination.
- The `AudioContext` is gesture-gated behind *Begin*; full teardown on unmount (rAF
 cancelled, oscillators stopped, context closed, ResizeObserver disconnected).

### Palette & safety

Mother-of-pearl rings: pale, low-saturation hues that shift with depth over a slow global
phase, drawn additively as thin strokes on near-black ink — a **structure**, never a
filled glowing field. All luminance change is slow, continuous drift; **there is no
strobe**. `prefers-reduced-motion` coarsens the packing and freezes the drift.

## Named references

- **René Descartes (1643)** — the Descartes Circle Theorem, in a letter to Princess
 Elisabeth of Bohemia.
- **Apollonius of Perga** — *Tangencies*; the problem of circles tangent to three given
 circles.
- **Frederick Soddy (1936)** — "The Kiss Precise," *Nature* 137, verse statement of the
 theorem (the "Soddy circles").
- **Mumford, Series & Wright, *Indra's Pearls* (2002)** — the modern visual grammar of
 circle packings, limit sets, and Möbius symmetry.
- **Heinrich Klüver (1966)** — the form
 constants (tunnels, spirals, honeycomb, cobweb) whose fractal-regress phenomenology
 the infinite nesting evokes.

## Next-cycle deepening

- **Regenerate on deep zoom.** Right now the world radius floor bounds detail; a scale
 ceiling of ~4M px is reachable. Re-pack the visible neighbourhood at higher resolution
 as you dive, so the fractal is genuinely inexhaustible under the finger.
- **Möbius drift.** Slowly apply a tangency-preserving Möbius transformation (as in
 *Indra's Pearls*) so the whole gasket breathes and rotates through the limit set while
 staying a valid packing — a living form constant.
- **Sustained chord voicing.** Let tapped circles *hold* (a plucked-then-sustained
 layer) so the packed gasket becomes a chord you can build up and hear all at once,
 with a gesture to release voices.
- **Curvature colour = pitch class.** Tint each ring by its quantised pitch class, so the
 visual iridescence and the harmony are the same map.
- **Two-finger "bend field".** Drag to warp the seed configuration (three arbitrary
 mutually tangent circles) and hear the whole chord retune as the gasket re-solves.
