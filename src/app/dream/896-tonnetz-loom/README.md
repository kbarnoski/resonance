# 896 · tonnetz loom

**The one question:** What if you could **walk the geometry of harmony**?

The Tonnetz (Euler/Riemann triangular pitch lattice) rendered as a crisp,
luminous **inline SVG**. Every node is a pitch class; every triangle is a
consonant triad; the three axes are the perfect fifth, the major third, and the
minor third. Tap a triangle to hear that triad in **just intonation**; move
across the lattice with the three classic **neo-Riemannian transforms (P / L /
R)**, each of which shifts exactly one voice (smooth voice-leading). Your path is
woven as a glowing ribbon over the lattice and can be **exported as an `.svg`**.

## How to use

1. **Tap any triangle** — audio starts on first tap (covers iOS autoplay). You
   hear that triad in just intonation and it lights up on the lattice.
2. **P / L / R** — move to an adjacent triad. The current chord glides exactly
   one voice while the two common tones hold; the highlight hops to the new
   triangle and your ribbon grows.
3. **drift (auto-walk)** — toggles a gentle hands-free P-L-R-L… loop so it sounds
   and moves on its own (a sounding glance with zero input).
4. **export SVG** — serializes the live lattice + your path ribbon to a
   standalone downloadable `.svg`. **clear path** resets the ribbon.

## The lattice (geometry)

Nodes sit on an axial integer grid `(i, j)` anchored so `(0,0) = C`:

- `+1` in **i** → **+7 semitones** (a perfect **fifth**), horizontal axis.
- `+1` in **j** → **+4 semitones** (a major **third**), up-and-right axis.
- the remaining triangle edge → **+3 semitones** (a minor **third**), since a
  fifth minus a major third is a minor third (`7 − 4 = 3`).

Each rhombus cell splits into two triangles:

- **up-pointing** triangle `{R, R+4, R+7}` → a **major** triad (root `R`);
- **down-pointing** triangle `{R+4, R+7, R+11}` → a **minor** triad (root `R+4`).

The visible 7×5 patch contains all **24** triads (12 major + 12 minor roots), so
any P/L/R move always resolves to a visible, highlightable triangle.

## Just-intonation synthesis

A triad is built from **pure ratios on its root**, so the thirds are truly
consonant rather than the tempered approximation:

- **major triad → 4 : 5 : 6** (i.e. `1, 5/4, 3/2`)
- **minor triad → 10 : 12 : 15** (i.e. `1, 6/5, 3/2`)

The equal-tempered pitch only chooses the root register; the chord intervals on
top of it are exact JI. Each voice = two slightly detuned `triangle`
oscillators → a soft gain envelope → shared **procedural reverb**
(`ConvolverNode` fed a synthesized exponential-decay impulse) + a master
**limiter** (`DynamicsCompressorNode`) → destination. Warm, never harsh.

## P / L / R voice-leading (the heart)

Each neo-Riemannian transform flips quality and moves **exactly one voice** by a
small step while the other two pitch classes are held as common tones:

| transform | name         | example          | moving voice            | common tones |
| --------- | ------------ | ---------------- | ----------------------- | ------------ |
| **P**     | parallel     | C maj ↔ C min    | **third** ± 1 semitone (E↔E♭) | root, fifth  |
| **L**     | leading-tone | C maj ↔ E min    | **root** ± 1 semitone (C↔B)   | third, fifth |
| **R**     | relative     | C maj ↔ A min    | **fifth** ± 2 semitones (G↔A) | root, third  |

Each is an involution (`T(T(x)) = x`) and holds exactly 2 of 3 tones — verified.
On a move the engine **glides** the sustaining oscillators to the new
frequencies (rather than re-striking), so you literally *hear* the single voice
slide while the held tones ring through — the "harmony is a SPACE" payoff.

## The loom (SVG vector export)

Every visited triad appends its screen-space centroid to a glowing polyline
ribbon (blurred halo + bright core + step dots) drawn over the lattice. **Export
SVG** clones the live `<svg>`, inserts a dark background rect, serializes with
`XMLSerializer`, and downloads it as `image/svg+xml` via Blob + object URL — the
lattice and your harmonic path travel together as one vector file.

## Constraints honored

- `"use client"`; prerender-safe (no `AudioContext`/`window` at module top
  level — the engine is constructed lazily on first tap and held in a ref).
- Renders with **inline SVG via React** — no canvas, no WebGL/WebGPU/three.js.
- Audio gesture-gated; `AudioContext.resume()` on first tap (iOS). No dead
  screen, no unhandled error if audio is unavailable — the visual still works.
- Touch-friendly: triangles are large tappable `<polygon>`s; every button is
  `min-h-[44px]` with generous padding.
- No new npm dependencies (Web Audio + React SVG only). No API route. Full
  teardown on unmount (`AudioContext.close()`).
- Self-contained in `src/app/dream/896-tonnetz-loom/`
  (`page.tsx`, `audio.ts`, `tonnetz.ts`).

## Named references

- **Leonhard Euler, _Tonnetz_ (1739)** — the triangular pitch lattice.
- **Richard Cohn**, neo-Riemannian theory — the P/L/R group of triadic
  transformations.
- **David Lewin**, transformational theory.

Research anchor: RESEARCH.md §533 (dated 2026-06-24) — arXiv 2606.11246, "Nineteen to the Dozen: Embedding the Neo-Riemannian Tonnetz into a Cyclic 19₃ Symmetric Configuration" (June 2026), which folds the neo-Riemannian Tonnetz and its P/L/R voice-leading into a closed symmetric lattice.
