# Chladnichord — the shape of the chord

## The one question
What if you could SEE the standing-wave *shape* of your own music — the geometry
of each chord as a physical vibration pattern?

## How it works
Karel's real piano loops through the ear-safe master bus. A square-plate
**Chladni** simulation is driven by that live sound. Thousands of grains of
"sand" (11,000 particles in a `Float32Array`) migrate to the plate's **nodal
lines** — the places on a vibrating plate that stay still — so the figure on
screen literally *is* the standing-wave geometry of the sound right now.

The classic square-plate nodal function on the unit square is

```
f(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
```

Nodal lines are where `f ≈ 0`. Each frame, every grain is nudged **down the
analytic gradient of `f²`** (`∇(f²) = 2·f·∇f`) toward the nearest `|f|` minimum,
using simple Euler integration with no per-particle allocation. On top of that
sits a jitter that scales with loudness *and* with each grain's distance from the
node — so grains already sitting on a nodal line stay put while the rest keep
scattering, and the figure crystallizes as the music quiets. Louder passages
"shake the plate harder" and scatter the sand before it re-settles.

As the harmony shifts, the plate mode `(m,n)` changes and is interpolated over
~0.8 s (slower under reduced motion), so figures **morph** into one another
instead of snapping.

Rendering is Canvas2D only: a deep indigo / near-black plate and luminous
cyan-white sand drawn with `globalCompositeOperation = "lighter"`, so grains that
pack densely onto a nodal line glow brighter than the scattered field.

## What reads his music
- **Playback** — one real track from `REAL_TRACKS` (default `REAL_TRACKS[2]`,
  "Welcome Home"), looping through `createSafeMaster`; a track selector switches
  among all of them live.
- **Mode selection** — `loadTrackAnalysis(id)` gives the chord progression. The
  current chord's **root** (and a minor-quality nudge) sets the base geometry `m`,
  while the analyser's **spectral brightness** (centroid of the FFT) sets `n`.
  Together they choose the target `(m,n)` each frame.
- **Loudness → scatter** — the analyser's overall amplitude scales the jitter, so
  the plate visibly "shakes harder" in loud passages and settles in quiet ones.
- **Degrade gracefully** — if `loadTrackAnalysis` returns null, mode is driven by
  the analyser spectrum alone (a "spectral-only mode" badge shows in the readout).
  If audio fails to load, an on-brand `text-destructive` error is shown.
- **Pointer sprinkle** (secondary) — dragging on the plate re-scatters a batch of
  grains near the pointer so a reviewer can watch them re-migrate to the current
  nodal lines.

## Tags
- **INPUT**: catalog playback + track selector (+ pointer-sprinkle). Not mic, not
  MIDI/keyboard.
- **OUTPUT**: Canvas2D particle field (no WebGL2, no three.js).
- **TECHNIQUE**: Chladni modal nodal-line particle migration — cross-modal
  physics (sound → standing-wave geometry).
- **PALETTE**: deep indigo / near-black plate + luminous cyan-white sand, glowing
  brighter where grains pack onto nodal lines. No warm/amber, no full-chromatic
  rainbow, no flat grayscale.

## Named reference
- **ChladniSonify** — "A Visual-Acoustic Mapping Method for Chladni Patterns in
  New Media Art Creation" (arXiv 2605.09846, 2026).
- **Ernst Chladni**, plate experiments with a bow and sand (1787).
- **Nigel Stanford**, "Cymatics" (2014).

## Known rough edges
- Mode numbers are interpolated as floats during a morph, so mid-transition
  figures aren't perfectly symmetric — this reads as an organic reorganization
  rather than a defect, but it isn't a "pure" mode until the morph lands.
- The root→`m` mapping is a musical choice, not a physical derivation: it keeps
  distinct chords producing distinct figures, but it is not claiming that a given
  chord has one "true" plate mode.
- 11,000 `fillRect` calls per frame under `"lighter"` compositing is comfortable
  on a laptop GPU but could dip on very low-end mobile; particle count is a single
  constant to tune.
- Brightness (spectral centroid) is a coarse proxy for "higher harmony"; on very
  bass-heavy passages the mode can sit low even when the chord is rich.
