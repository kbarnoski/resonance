# 6728 · Comma Walk

**The one question:** *What if playing chords in pure tuning were a WALK across
an infinite lattice of just-intonation pitches — every chord change steps you
along it, and you can see how far pure harmony has carried you from home?*

This is the **comma-lattice cartography** road through LIVING TUNING —
self-retuning harmony made visible. The tuning state is a **position** on the
2-D just-intonation lattice; a chord progression is a visible **walk** whose
accumulated distance from the 12-TET origin *is* the drift.

## The lattice (Euler / Riemann Tonnetz)

Every pitch is a lattice vector **(a, b)** whose frequency ratio is

```
(3/2)^a · (5/4)^b     →     prime exponents  3^a · 5^b   (octave-agnostic)
```

- **axis a = pure fifths** (3/2, 701.955 ¢)
- **axis b = pure major thirds** (5/4, 386.314 ¢)

This is the 3-5 lattice Leonhard Euler drew as the *Tonnetz* and Hugo Riemann
later used for harmonic space. A **major triad** is the cluster
`{(0,0), (0,1), (1,0)}` (root, pure third, pure fifth); a **minor triad** is
`{(0,0), (1,-1), (1,0)}` (root, pure 6/5 third, pure fifth).

A pitch's **comma offset** is its cents distance from the nearest 12-TET
semitone — how far off the equal-tempered grid the pure interval sits. Nodes on
the map are tinted by that offset (flat → indigo, sharp → magenta, both inside
the violet range).

## The walk = adaptive placement

On each chord change, `placeChord()` searches lattice positions near the
previous chord and picks the one that **shares the most common tones** with it,
breaking ties by **least movement** — exactly what adaptive just intonation does
to keep held notes pure. The chosen root's lattice cell becomes the new "you
are here"; the map re-centers on it (CSS transform + transition) so **HOME
(0,0) slides away** while a breadcrumb trail records the path.

The drift readout accumulates, per step, the **residual**:

```
stepDrift = (pure interval in ¢) − (its nearest 12-TET interval in ¢)
```

## Verified: a I–vi–ii–V–I lap = one syntonic comma

Feeding the classic comma-pump progression through the placer (roots C A D G C,
qualities maj min min maj maj), the walk is:

| chord | root (a,b) | common tones kept | step residual |
|-------|-----------|-------------------|---------------|
| I     | (0, 0)    | —                 | —             |
| vi    | (−1, 1)   | 2 (C, E)          | −15.64 ¢      |
| ii    | (−2, 1)   | 1 (A)             | −1.96 ¢       |
| V     | (−3, 1)   | 1 (D)             | −1.96 ¢       |
| I     | (−4, 1)   | 1 (G)             | −1.96 ¢       |

Net root displacement **(−4, +1)** = ratio **80/81**, and the summed drift is
**−21.506 ¢** — exactly the **syntonic comma** (81/80). Each completed lap sinks
the tonal center one syntonic comma flat; three laps ≈ −64.5 ¢, audibly flat.
This is the pitch-drift that makes unaccompanied choirs sink. The
**Pythagorean comma** (23.460 ¢, the fifths-only mismatch 3^12 vs 2^19) is
exposed in `lattice.ts` for reference and would emerge from a fifths-only walk.

## Hearing it

An additive drawbar-organ voice (sine partials 1× / 2× / 3×) plays a sustained
triad pad plus a low center drone. In **Adaptive JI** mode the drone's frequency
is multiplied by `2^(drift/1200)`, so as the walk laps you literally hear the
center slide (`setTargetAtTime` glide). The **12-TET** toggle snaps every pitch
back to equal temperament — the drone stops sinking. Polyphony is capped at ~10
voices (oldest-steal) into a `DynamicsCompressor` limiter; master gain ≤ 0.18.

## Input / output

- **Input:** computer keyboard `A S D F G H J K` = C D E F G A B C, black keys
  `W E T Y U` = C♯ D♯ F♯ G♯ A♯ (auto-repeat guarded via `e.repeat`); an on-screen
  key row (≥44×44 px) plays identically for touch/mouse. Chord shortcut buttons
  (I vi ii V), a hands-free auto-walk cycler, a single **Step →**, and
  **Teleport home** (reset to the 12-TET origin).
- **Output:** pure DOM + CSS only — no canvas, no SVG, no WebGL/WebGPU. The map,
  nodes, trail, "you are here" marker, meter and readouts are styled
  `<div>`/`<span>` with CSS transforms/transitions.

Alive on load: a seeded auto-progression walks the lattice silently on first
paint (zero permission); sound unlocks only on the **Start** gesture. With no
`AudioContext`, visuals keep moving and a `text-destructive` notice shows. Full
teardown on unmount. All randomness is a seeded `mulberry32(0x6728)` (star
field only); timing uses `performance.now()` / rAF. Respects
`prefers-reduced-motion`.

## Files

- `page.tsx` — client component: map, controls, keyboard, rAF walk loop.
- `lattice.ts` — lattice math, adaptive `placeChord`, comma constants, scale
  map, seeded PRNG (no React/DOM).
- `audio.ts` — `CommaOrganAudio`: drawbar-organ voices, glide, voice-stealing,
  limiter.
- `README.md` — this file.

## References

- **Leonhard Euler**, *Tentamen novae theoriae musicae* (1739) — the Tonnetz /
  Euler–Fokker genus lattice of 3- and 5-limit pitches.
- **Hugo Riemann** — the Tonnetz as harmonic space of fifths and thirds.
- **William Sethares**, *Tuning, Timbre, Spectrum, Scale* — adaptive tuning and
  tuning-timbre relationships.
- **Syntonic comma** 81/80 (21.506 ¢) and **Pythagorean comma** 531441/524288
  (23.460 ¢) — the two mismatches this walk makes visible.

## Next-cycle deepening

- Let the map **shear/breathe** with drift magnitude so the whole plane warps as
  home recedes.
- A **fifths-only "spiral" mode** to walk the Pythagorean comma around the
  circle of fifths and compare the two commas side by side.
- Optional **7-limit axis** (harmonic seventh 7/4) turning the plane into a 3-D
  lattice you tilt through.
- Record a walk and **replay it as a score**, or let two players walk from
  opposite corners and hear where their tunings collide.
- A "**pitch budget**" mode: cap allowed drift and force the placer to choose
  enharmonic detours that stay near home.
