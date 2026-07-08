# 1294 · Indra's Descent

*A coupled circle-packing instrument you fall through forever.*

Cycle-2 deepening of two prior dream-lab winners — **1285 apollonian-gasket**
(a Descartes-curvature → pitch packing) and **1288 gasket-cathedral** (a
navigable bell cathedral). It answers one question:

> What if an Apollonian circle-packing were a *coupled* instrument — where
> striking one circle rings its just-intonation pitch and the tone ripples
> outward as a decaying chord along the **tangent-neighbour graph**, while a
> continuous **Möbius dive** slides you toward a boundary tangent point so the
> gasket re-tiles infinitely as you descend?

Two subsystems here have never been built in the lab before:

1. **Tangency-graph resonance propagation** — the packing is wired, not just
   drawn. One strike unfolds a self-similar arpeggio cascading down the graph.
2. **Möbius "dive" transport** — a continuous camera dilation toward a tangent
   cusp, with fresh nesting streaming in as you fall.

---

## The phenomenology

Endless self-similar regress: every cusp you fall into contains the whole
structure again, smaller. That *fractal-regress / infinite-tunnel* percept is
one of the **Klüver form constants** (tunnels, cobwebs, honeycombs) reported
across flicker, near-death, and psychedelic states — here reached drug-free,
driven purely by the geometry of the gasket and the sound of it ringing back at
you. The dive is the felt fall; the resonance cascade is the structure
answering.

Safety: no strobe or flicker. Newborn circles ease in over ~0.7 s; the vermilion
resonance is a smooth travelling highlight, never a flash. `prefers-reduced-motion`
coarsens the packing and slows the dive. Master gain ≤ 0.3 behind a limiter.

## The math

- **Descartes Circle Theorem (1643).** Three mutually tangent circles with signed
  curvatures (bends) `b = ±1/r` determine a fourth:
  `b₄ = b₁+b₂+b₃ ± 2·√(b₁b₂+b₂b₃+b₃b₁)`. The **complex Descartes** relation places
  the centre: `b₄z₄ = b₁z₁+b₂z₂+b₃z₃ ± 2·√(b₁b₂z₁z₂ + b₂b₃z₂z₃ + b₃b₁z₃z₁)`. The
  circle inscribed in a curvilinear triangular gap is the larger-bend Soddy
  solution; placing it splits the gap into three and the packing recurses.
- **The tangency graph.** A newly inscribed child is tangent to *exactly* the
  three circles that bounded its gap, so the adjacency graph is built exactly and
  incrementally — no geometric search. `bfsCascade` walks it breadth-first: hop
  distance → delay (~115 ms/hop), amplitude ×0.62 per hop, capped at 5 hops with a
  branch cap so the arpeggio stays musical.
- **Curvature → pitch.** Bigger circle (smaller bend) = lower tone. `log₂(bend)`
  is quantised to a 5-limit **just-intonation** scale (1, 9/8, 5/4, 4/3, 3/2, 5/3,
  15/8) over a low root (~123 Hz), so tangent neighbours land on consonant
  intervals and a cascade is a chord.
- **Möbius dive.** Points are complex numbers; the transport is a Möbius dilation
  `w = a·z` recentred on a chosen boundary tangent point — a similarity, hence a
  circle-preserving, tangency-preserving Möbius map. Because the gasket is
  self-similar, zooming into a tangent cusp reveals the same structure at every
  scale. `packForView` inscribes fresh children whose on-screen radius crosses a
  threshold, and `pruneOffscreen` recycles ballooned ancestors, so the descent
  never runs out.

A headless `runSelfCheck` logs to the console on load: it confirms every child is
tangent to its recorded neighbours to ~machine precision and that the adjacency
graph is symmetric.

## The interaction

- **Tap a circle** → it rings, then the resonance cascades outward along the
  tangent edges (a vermilion wave races the sound).
- **Hold anywhere** (or press-and-hold *hold to descend ▾*) → dive toward the
  tangent cusp under your finger; the gasket re-tiles into the gap and newborn
  circles glitter as they pass. Release to stop.
- **Drag** to pan · **scroll / pinch** to zoom · **reset** / **reseed**.
- **Begin** starts audio (browsers require a gesture) and rings a resting chord.

## Files

- `gasket.ts` — Descartes math, seed, packing, the tangency graph, `bfsCascade`,
  `packForView`, `pruneOffscreen`, and the self-check.
- `audio.ts` — just-intonation voice bank, scheduled cascade strikes, drone bed,
  void reverb, limiter, master gain, full teardown.
- `render.ts` — sumi-e ink strokes + the vermilion tangent-edge resonance wave.
- `page.tsx` — client component: render loop, dive transport, gesture handling, UI.

## Palette

Sumi-e ink-wash: near-black graphite ground, circles as fine luminous ink strokes
(`lighter` compositing on discrete arcs, never filled discs or a density field).
Exactly one accent — **vermilion `#e0402f`** — reserved for the resonance ripple.

## Next-cycle deepening

- **True elliptic/loxodromic Möbius transport** (not just dilation) so the dive
  can spiral and swirl the packing, à la the Kleinian limit sets of *Indra's
  Pearls*.
- **Standing-wave modes on the graph** — solve the graph Laplacian so a held cusp
  hums its eigen-chord, not just a decaying cascade.
- **Two-finger "bend the field"** — drag the outer frame's curvature live and hear
  the whole packing retune.
- **Depth-coupled timbre** — deeper generations shift from bell to glass to breath,
  so you can *hear* how far you've fallen.

## References

- R. Descartes, letter to Princess Elisabeth (1643) — the circle theorem.
- F. Soddy, "The Kiss Precise," *Nature* 137 (1936) — the theorem in verse.
- D. Mumford, C. Series & D. Wright, *Indra's Pearls: The Vision of Felix Klein*
  (Cambridge, 2002) — Möbius maps, Kleinian groups, circle limit sets.
- H. Klüver, *Mescal and Mechanisms of Hallucinations* (1966) — the form
  constants (tunnel / funnel / cobweb).

*Not verified on real hardware or ears.*
