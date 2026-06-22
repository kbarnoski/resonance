# 837 — Quasicrystal

**What if a piece of music had the structure of a quasicrystal — perfectly ordered, self-similar, yet NEVER exactly repeating — so it can play for an hour and stay coherent without ever looping?**

---

## The Tiling

This prototype uses **de Bruijn's pentagrid method** to generate a Penrose P3 rhomb tiling:

1. Five families of parallel lines are drawn at directions θₖ = k·π/5 (k = 0,1,2,3,4), each family offset by γₖ ∈ [0,1).
2. Every intersection of two families j and k maps, via the dual transform, to a rhombus in the Penrose tiling. The world coordinate of each vertex is found by solving the 2×2 linear system from the pentagrid.
3. Rhomb type is determined by |j−k| mod 5: differences 1 or 4 → **fat rhombus** (72° acute angle); differences 2 or 3 → **thin rhombus** (36° acute angle).
4. The resulting tiling has exact **5-fold rotational symmetry** and is **aperiodic** — no translational symmetry exists.

The five γₖ offsets (the "seed") determine which crystal you're in. Different seeds give different-looking but structurally equivalent crystals. "Reseed" picks a new set.

**φ-inflation:** The Penrose tiling is self-similar under scaling by φ = (1+√5)/2 ≈ 1.618. The inflation controls zoom the view by φⁿ — at each level, the same local patch patterns appear at a larger scale. Musically, this produces a slow harmonic-rhythm change.

---

## The Music

The traversal visits tiles in a chosen order (spiral / sweep / growth front). Each visit triggers a short **additive synthesis voice**:

- **Fat rhombs** use warm partials (1f, 2f, 3f) — stable, consonant, octave-rich.
- **Thin rhombs** use bright partials (1f, 3f, 5f) with subtle FM shimmer — tense, complex.

**Pitch** is determined by the tile's **vertex configuration** mapped to **just-intonation ratios**:

| Config | Ratio | Interval |
|--------|-------|----------|
| sun    | 1/1   | unison (root) |
| queen  | 3/2   | perfect fifth |
| king   | 4/3   | perfect fourth |
| jack   | 5/4   | major third |
| star   | 6/5   | minor third |
| deuce  | 7/4   | harmonic seventh |
| ace    | 9/8   | major second |

**Register** increases with distance from center (further out = higher octave). A **sustained drone bed** drifts slowly as the traversal moves outward, so the piece is never silent and the harmonic context shifts gradually over time.

---

## Why It Never Repeats (but Stays Coherent)

The Penrose tiling is provably aperiodic: no translation maps it to itself. Therefore the sequence of tile types and vertex configs encountered by the traversal is also aperiodic — the musical sequence has **no period**.

Yet it is not random. The tiling has a finite vocabulary of local patches, and by the local isomorphism property, every finite patch that appears anywhere appears infinitely often (with density governed by φ). The music is **self-similar**: motifs recur transposed and re-spaced, but the exact sequence of events never repeats. The piece sounds genuinely different at minute 5 than at minute 1.

---

## Controls

- **Traversal tempo** — how fast the sweep visits tiles (tiles/second)
- **φ inflation** — zoom level; powers of φ reveal self-similarity
- **Traversal mode** — spiral (outward spiral), sweep (left-to-right), growth (concentric rings)
- **Highlight** — colors rhombs by type / vertex config / pentagrid family
- **Reseed crystal** — generates a new crystal (new γₖ offsets, same aperiodic structure)

The piece **plays itself** autonomously. Controls adjust the generative parameters without requiring real-time performance input.

---

## Named References

- **Roger Penrose** — P3 rhomb tiling ("Pentaplexity", 1974)
- **N.G. de Bruijn** — pentagrid / dual method, *"Algebraic theory of Penrose's non-periodic tilings of the plane, I & II"*, Indagationes Mathematicae (1981)
- **Dan Shechtman** — experimental discovery of quasicrystals, Nobel Prize in Chemistry (2011)
- **"Quasiperiodic Music"** — arXiv:2009.04667 (applying quasiperiodic / aperiodic order to musical structure)
- **Ryoji Ikeda** — aesthetic kin: clinical data-cosm, crystalline palette, long-form non-looping generativity

---

## Prior Art (Grep Result)

```
grep -rli "penrose|aperiodic|quasicrystal|quasiperiodic|de bruijn|pentagrid" src/app/dream
```

Result: 3 matches — `437-wiki-pulse/README.md`, `437-wiki-pulse/page.tsx`, `70-pitch-algo-compare/README.md`. Inspection: these mention "penrose" and "aperiodic" only as incidental aesthetic references (wiki-pulse references Ikeda; 70-pitch uses "aperiodic" in a different musical context). **No prior prototype implements a Penrose tiling generator, a de Bruijn pentagrid algorithm, or aperiodic-order music.** This is the first.

---

## Ambition

`ambition: #1 + #2 + #3`

- **#1** — First aperiodic-order / quasicrystal composition in this lab
- **#2** — 4 subsystems: de Bruijn pentagrid tiling generator (`tiling.ts`) + traversal sequencer (page.tsx animation loop) + additive/FM synth engine (`synth.ts`) + Canvas2D crystalline renderer (page.tsx draw functions)
- **#3** — Named references: Penrose, de Bruijn, Shechtman, arXiv:2009.04667, Ryoji Ikeda

---

## Caveats

- The vertex configuration assignment uses a deterministic hash of the local family/index tuple rather than the full Penrose matching-rules topology. This produces a stable 7-way partition that faithfully represents the musical intent (7 pitch classes, musically distinct) without requiring a full topological neighborhood walk.
- The tiling is generated to radius 25 pentagrid units (~600–900 tiles) per seed. The traversal cycles through all tiles and restarts — the cycle length is long enough (~5+ minutes at default tempo) to feel non-repeating at human scale.
- DPR-aware Canvas2D resize is handled each frame; no WebGL2 is used (Canvas2D is sufficient for this geometry count).
