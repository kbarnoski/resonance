# 1862 — Strobe Atlas

**State:** flicker-induced form constants / Ganzflicker · **Pole:** intense-geometric

## The one question

Klüver's four form constants (tunnels, spokes, spirals, honeycombs) are only
*part* of the map. What does the *newly-mapped* hallucination geometry look and
sound like when we morph a safe photic field through **both** the classic four
**and** the Cartesian/hyperbolic motifs a 2026 large-scale study found the
classic taxonomy misses?

## What it is

A fullscreen WebGL2 fragment-shader field that crossfades a seeded, deterministic
arc through **seven planform families**:

| # | Family | Provenance |
|---|--------|-----------|
| 0 | Tunnels / funnels | log-polar (classic) |
| 1 | Radial spokes | log-polar (classic) |
| 2 | Spirals | log-polar (classic) |
| 3 | Honeycomb lattice | log-polar (classic) |
| 4 | Concentric squares | Chebyshev / L∞ — **newly-mapped** |
| 5 | Crosses / Cartesian grid | Cartesian — **newly-mapped** |
| 6 | Hyperbolic planform | hyperbolic — **newly-mapped** |

Families 0–3 are generated the *only* way they can be — a periodic pattern seen
through the retina→V1 complex-log (`exp()`) warp, imported verbatim from
`_shared/psych/logpolar.ts` (`LOGPOLAR_GLSL`, `formConstant`, `honeycomb`).
Because that warp is purely radial, it **cannot** produce families 4–6. The
concentric squares use a Chebyshev metric `max(|x|,|y|)` (visibly *square*
rings); the crosses use an axis-aligned `sin(kx)+sin(ky)` lattice; the
hyperbolic planform uses saddle level-sets of `x²−y²` and `x·y`. An on-screen
**Atlas** readout names the current motif and tags it `log-polar` (classic) or
`Cartesian`/`hyperbolic` (newly-mapped) — that label is the argument: the viewer
sees which forms the classic engine can't make.

The arc is deterministic: a `mulberry32` seeded with the literal `0x1862` lays
out a fixed playlist across all seven families, and every animated quantity is a
pure function of an integer frame counter (no `Math.random`, no `Date.now()` in
the render/arc path), so a headless review gets identical output. Wall-clock time
is used only for audio scheduling.

Palette is the canonical dream violet→indigo→magenta ramp (`_shared/palette.ts`
`PALETTE_GLSL`) with subtle chromatic aberration, a traveling-wave phase sweep,
and a breathing zoom for the "alive" feel.

## Audio

A soft generative bed matched to the intense-geometric mood: a detuned
just-intonation drone carrier from `_shared/psych/droneBank.ts`
(`startDroneBank`), plus an **opt-in isochronic pulse** whose LFO rate is locked
to the safe photic rate, so when the Photic-pulse mode is engaged, sound and the
safe luminance flicker breathe together. Autonomous (no mic, no FFT). Chain:
`drone + pulse → master (≤ 0.2) → DynamicsCompressor → destination`, ~1 s
fade-in, `ctx.close()` on teardown.

## Safety (photosensitive epilepsy)

Non-negotiable, and all luminance flicker is gated through
`_shared/psych/safeFlicker.ts`:

- **Default is slow luminance drift, not flicker** — beautiful and safe with
  zero flicker on load (`uFlicker` uniform is `1.0` until the user opts in).
- **Photic pulse is opt-in only**, behind a visible warning ("May affect people
  with photosensitive epilepsy"), capped at **≤ 3 flashes/sec** via the safe
  engine, using a soft floor-limited sine (never a hard 0↔1 strobe), with an
  instant **Stop pulse** kill control.
- **`prefersReducedMotion()` is honored** — the pulse opt-in is hidden and the
  engine forces a sub-perceptual drift.
- No full-screen high-contrast strobe. When in doubt, it drifts.

## Named references (§807)

- **Klüver, H. (1926/1966)** — *Mescal and Mechanisms of Hallucinations*; the
  four form constants (lattice/cobweb/tunnel/spiral).
- **Bressloff, P. C. & Cowan, J. D. (2001–2002)** — the log-polar (complex-log)
  retina→V1 cortical map that turns one periodic pattern into the four constants.
- *"A Large-Scale Computer-Vision Mapping of the Geometric Structures of
  Stroboscopically-Induced Visual Hallucinations"* — **bioRxiv 2026.02.18.705710**;
  10,598 participant drawings of flicker hallucinations, finding — beyond
  Klüver's classic four — recurrent **concentric squares, crosses, and
  hyperbolic planforms**. This piece is a direct argument-in-code with that
  finding.
- **Brion Gysin, *Dreamachine* (1959)** / Ganzflicker — the stroboscopic
  lineage that evokes the constants with no drug.

## Files

- `page.tsx` — client component: WebGL2 setup, deterministic render loop, Atlas
  readout, chrome, safety controls, notes modal.
- `atlas.ts` — family metadata, `mulberry32`, the seeded playlist, `computeArc`,
  and the vertex + fragment shaders (all 7 families in one shader).
- `audio.ts` — `AtlasAudio`: drone bed + opt-in isochronic pulse.
- `README.md` — this file.

## Ambition self-score

**Concept 8/10, execution 7/10.** The strongest idea here is that the piece
doesn't just *show* seven forms — it argues *why* three of them exist by tagging
exactly the ones the shared log-polar engine provably cannot render, so the label
carries the thesis. Honest weaknesses: the Cartesian/hyperbolic families are
plausible renderings of the study's motifs rather than reproductions validated
against the actual drawings, and the crossfade "morph" is a field-blend rather
than a true geometric homotopy between metrics — a reviewer reads the atlas
clearly, but the *transitions* are cross-dissolves, not transformations.
