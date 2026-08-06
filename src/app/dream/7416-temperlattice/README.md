# 7416 · Temperlattice

**Watch your tuning re-crystallize as you reshape your instrument's timbre.**

Cycle 3 of the dream lab's living-tuning line:
**6728-commawalk (c1) → 6808-spectrascale (c2) → 7416-temperlattice (c3).**

The scale is never assumed. Every degree you play is a *valley* of the live
dissonance curve computed from the current timbre, and the derived degrees are
rendered as **sites in a living crystal lattice** that physically **migrate** to
the new consonance valleys as you morph the spectrum. So you literally *see* the
tuning re-form.

## The one question

> Can you SEE a tuning re-form as you reshape the timbre it comes from?

## How it works

**Dissonance curve → valleys → lattice sites → migration.**

1. **Timbre → spectrum.** Three controls — inharmonicity `B`, octave-stretch `A`,
   and brightness (partial-amp rolloff) — plus a preset row build a spectrum of
   `N_PARTIALS = 8` partials. Partial *n*:
   `ratio_n = n^log2(A) · sqrt(1 + B·n²)`, normalised so `ratio_1 = 1`.
   (`A = 2, B = 0` is exactly the harmonic series.)

2. **Spectrum → dissonance curve.** A *second copy* of that same spectrum is
   swept across the octave `alpha ∈ [1, 2]` over `CURVE_SAMPLES = 200` steps; at
   each interval the pairwise Plomp–Levelt / Sethares sensory dissonance
   (`dissmeasure`, with the ~0.24 critical-bandwidth point and the
   two-exponential roughness model) is summed.

3. **Curve → valleys → scale.** Local minima with a prominence gate (~1.2 % of
   span) and merging of minima closer than ~18 cents give the consonant steps.
   The scale is `[unison] + valleys`, ascending. Each degree carries its nearest
   low-complexity just ratio (search `p/q`, `q ≤ 16`, complexity-penalised) for
   the readout.

4. **Scale → lattice sites.** Each degree is a site: pitch-class angle around a
   gently outward spiral, radius nudged by degree index so dense clusters still
   separate, brightness = valley depth. Site data (xy, depth, played-glow) lives
   in an **RGBA32F data texture** — sampled with `texelFetch` in a fullscreen
   fragment shader that draws glowing crystalline **nodes** via SDF plus faint
   structural **bonds** between consecutive degrees. This is core WebGL2 with no
   extensions (the float texture is only ever *sampled*, never rendered to; the
   feedback buffers are RGBA8).

5. **Migration.** Morph the timbre and the whole curve re-flows, so each
   degree's valley moves. The i-th site eases toward its new home each frame and
   a **ping-pong RGBA8 feedback** pass decays the previous frame in place — so a
   migrating site leaves a comet-tail. You watch the crystal re-crystallize.

**Adaptive-JI dyad snap (the cycle-3 signature verb).** Hold *exactly two* keys
and the newer voice's fundamental glides (`setTargetAtTime`) toward the live
curve's nearest valley to the held interval, every frame. That forming bond is
drawn specially — a bright strut, with a travelling glint, that thickens and
snaps into place as the glide locks in. One held note, or three-plus, behaves
normally.

## Controls

- **Keyboard as instrument:** `a w s e d f t g y h u j k` → derived scale
  degrees, unison first, ascending. Real `keydown`/`keyup` give true held notes
  (auto-repeat ignored).
- **Sliders:** inharmonicity `B`, octave-stretch `A`, brightness.
- **Presets:** Harmonic / Stretched / Metallic / Odd-only.
- **Play / Pause:** toggles a seeded (`mulberry32(0x7416)`) auto-demo that, from
  first paint, slowly morphs the timbre *and* plays a gentle phrase — so the
  re-crystallization is visible on a silent screen with zero interaction. Any
  player input (key, slider, preset) pauses it.
- **Audio needs a gesture** (browser autoplay policy). The visual auto-demo runs
  silently before that; click / press a key / hit Play to start sound.

## Audio

A spectral-morph **additive** synth: each held note is `N` sine partials placed
at the *current* spectrum's ratios/amps, so what you hear is exactly the timbre
the curve is computed from — a derived degree sits in a valley of its own curve.
Poly cap 10 with oldest-steal, through a `DynamicsCompressor`
(threshold −14, ratio 12), master gain ≤ 0.18.

## Refs

- William A. Sethares, *Tuning, Timbre, Spectrum, Scale* — dissonance-curve /
  related-scale construction.
- R. Plomp & W. J. M. Levelt, "Tonal Consonance and Critical Bandwidth," *JASA*
  (1965).
- V. Guillet, "Elementary spectrum for the dissonance curve," *Journal of
  Mathematics and Music* (2026).
- Lab lineage: 6728-commawalk (c1), 6808-spectrascale (c2) — the verified
  cycle-2 dissonance math is carried forward here unchanged.

## Honest limits (unverified without a browser / GPU)

- `tsc --noEmit` and `next lint` are clean, but the piece has **not** been run in
  a real browser in this environment. WebGL2 program linking, RGBA32F-sampling
  support on a given GPU, exact node/bond visual weight, and audio timing are
  untested live. A graceful `text-destructive` notice covers a missing WebGL2
  context, but per-GPU float-texture quirks are unverified.
- Valley detection is discrete (200 samples): very shallow or very close valleys
  can flicker in/out of existence as the timbre morphs, momentarily changing the
  degree count. The lattice fades those slots rather than snapping, but the
  keyboard mapping shifts when the count changes mid-hold.
- The adaptive-JI octave placement uses a nearest-of-{½,1,2} heuristic; unusual
  dyads spanning wide intervals may snap to a less-obvious octave.
- Auto-demo morph amplitude is tuned for gentle, visible drift; it is *not*
  guaranteed to exercise every possible valley topology.

## Cycle-4 deepening note

Where c3 makes the lattice *sites* migrate, c4 could make the **bonds** carry
meaning: render the full dissonance *surface* (not just its minima) as a
deformable crystal whose bond tension = local curvature of the curve, so you
feel consonance as structural rigidity. Add per-degree **comma drift** so a
sustained chord slowly retunes itself into the timbre's just lattice (closing
the loop back to commawalk's comma-pump), and let two lattices in different
timbres share bonds — an inter-timbral modulation you can hear *and* watch
re-crystallize across a seam.
