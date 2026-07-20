# 2052 · Slow Radiance

## The one question
Can a screen and a sound — with **no interaction whatsoever** — carry a visitor
into a boundless, altered, meditative state the way a substance might, purely by
**evolving themselves** over six-plus minutes? You take nothing and do nothing.
One "Begin" button (only to satisfy the browser autoplay policy), then it plays
and journeys on its own.

## The inversion: audio leads, visual follows (Approach B)
This is not a visualiser. An **autonomous harmonic engine is the driver.** A
generative ambient sequencer evolves a drifting cluster of 6 sustained spectral
voices; each currently-sounding voice is handed to the light field as a **coloured
diffusion source**, positioned by its pitch class (angle) and register (radius),
hued by its role. As the harmony migrates, the nebula re-voices with it — you are
literally **seeing the chord you hear**, not a spectrum bar chasing it.

## The visual: a real diffusion-curve Poisson solve (not a blur)
- WebGL2 **ping-pong Jacobi solver** on two RGBA8 200×200 textures.
- Each frame the active voices are re-imposed as **fixed Dirichlet colour cells**
  (soft discs, radius/brightness scaled by voice gain), then **~24 Jacobi passes**
  run: every free cell becomes the average of its four `texelFetch` neighbours;
  fixed cells are excluded. The steady state is the **harmonic (Laplace)
  interpolation** between the coloured sources — the maths behind Diffusion Curves.
- The field is **not cleared between frames**; passes run on the persistent buffer,
  so the nebula relaxes and trails as voices glide — a living field, not a snapshot.
- Painterly display shader: soft additive glow, Reinhard tone-map, vignette, grain.
- **Graceful degrade:** no WebGL2 → Canvas2D CPU Jacobi on a 100×100 typed-array
  grid (same averaging rule, upscaled for glow + vignette). Neither → on-brand
  `text-destructive` notice while the audio keeps playing.

## The harmonic model and why it is non-lattice
**Bohlen–Pierce.** The *tritave* (3:1) is divided into **13 equal steps**, so a
pitch is `base · 3^(k/13)`. This is a genuinely non-octave scale — it is **not**
the banned just-intonation partial stack `[1, 9/8, 5/4, …]`, **not** 12-TET
major/pentatonic, and **not** the inharmonic bell ratios `1, 2.76, 5.40, 8.93`.
Consonance in BP clusters around the **3:5:7 chord** (steps 0, 6, 10). The engine
slowly transposes the root by small non-octave steps and swaps between the
consonant triad and a clustered voicing, so **consonance melts and re-forms** over
minutes. All pitches and positions **glide** (`setTargetAtTime` portamento, ~5.5 s),
never stepped.

## Long-form design
- 6 voices (each a fundamental + a stretched, detuned partial through a slow
  drifting lowpass) fade in and out over many seconds, so the texture is never
  static. A slow **breath LFO** (~16 s) rides the master level.
- Reharmonisation every ~16–28 s migrates the root and re-voices the cluster;
  per-voice life timers retire and re-introduce voices. The result genuinely
  differs at minute 6 vs minute 1 — a drifting, non-repeating state.
- Master gain ~0.14 → `DynamicsCompressor` → destination. Full teardown on unmount:
  rAF cancelled, oscillators/LFO stopped, WebGL resources deleted (`WEBGL_lose_context`),
  AudioContext closed after the fade rings out.

## References
- **Diffusion Curves** — Orzan, Bousseau, Winnemöller, Barla, Thollot, Salesin,
  *SIGGRAPH 2008*. Live-2026 thread: **arXiv:2408.09211**.
- **Bohlen–Pierce scale** — Heinz Bohlen / John R. Pierce; the 3:1 tritave in 13 steps.

## Ambition-floor criteria hit
- **#1** — a real-time **Poisson / Laplace diffusion-curve solve** (iterative Jacobi
  relaxation with Dirichlet constraints), not a post-process blur.
- **#3** — a **named academic reference** (Diffusion Curves, SIGGRAPH 2008) driving the visual method.
- **#4 (DEEP)** — genuinely **multi-cycle, long-form stateful**: migrating harmony,
  voice lifecycles, breath and timbre drift over 6+ minutes; the audio state *is*
  the visual state.

## Honest caveats
- Built and type-checked, but **not verified on real speakers or a display** in this
  environment — the induced felt state is unconfirmed.
- Jacobi glow spread is bounded by pass count; on very small viewports the nebula
  halo is tighter. The CPU fallback is coarser (100×100, 12 passes) and less lush.
- BP "consonance" is culturally unfamiliar by design; some listeners read the melt
  phases as tension rather than release.
