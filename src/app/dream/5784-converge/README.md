# 5784 · Converge

**What if a synthesizer could hear a sound you give it — a hum, a whistle, a
seeded tone — and _re-derive its own patch_ until it becomes that sound, while
you watch a swarm of candidate synths hunt the target down in timbre-space?**

This is the "synth that becomes a sound you give it" built with an
**evolutionary / population search** instead of gradients. You provide a
target timbre (via the microphone, or a built-in seeded target); the system
analyzes it and automatically searches its own FM synthesis parameters to
imitate it. On a silent screen the whole idea reads: a glowing point-cloud of
candidate synths collapsing onto a bright target star, generation by
generation, the match-percentage climbing.

## The instrument (what is being searched)

A small **2-operator FM patch** — deliberately non-convex, with nasty
gradients, which is exactly why a population search beats differentiation here:

- **f0** — carrier fundamental (log-scaled 70–660 Hz)
- **ratio** — modulator : carrier frequency ratio (0.5–7; wildly multimodal)
- **index** — FM modulation index (0–9; energy into the sidebands)
- **cutoff** — resonant lowpass cutoff (log-scaled 260–9000 Hz)
- **Q** — lowpass resonance (0.6–8)

Five parameters are optimized against the spectral loss. The audio voice adds a
short **AR envelope** (attack/release) so the played note has shape — the full
patch is a 7-parameter FM/subtractive instrument.

FM sideband amplitudes are the Bessel functions `J_k(index)` (Chowning 1973):
partials sit at `f0 ± k·(f0·ratio)`, scaled by the analog 2-pole lowpass
magnitude response. This analytic spectrum is what lets thousands of candidates
be scored per second without touching Web Audio — the same idea as compiling a
differentiable audio graph down to fast DSP.

## The fitness (how a candidate is scored)

Each candidate's analytic magnitude spectrum is binned into 48 log-spaced
bands, converted to a peak-normalized dB profile (loudness discarded, timbre
shape kept), and compared to the target's profile by **mean-squared spectral
distance** — a multi-scale spectral loss in the DDSP spirit (Engel et al.
2020). Lower = timbrally closer. `match% = exp(-loss·7)`.

## The search (how it teaches itself)

A **separable CMA-ES** ("CMA-ES-lite"): maintain a Gaussian over the
normalized parameter space — a mean, a global step-size σ, and a per-axis
(diagonal) covariance. Each generation:

1. sample a population of λ = 44 candidates from the Gaussian (seeded RNG);
2. score each by the spectral loss and rank them;
3. recombine the μ best into a new mean (log-decreasing weights);
4. adapt σ by the cumulative step-size path, and the diagonal covariance by
   rank-one + rank-μ updates.

Best-so-far improves monotonically; the swarm contracts onto the target. This
is the diagonal variant of Hansen's CMA-ES (Hansen 2006; Ros & Hansen 2008),
chosen because the FM timbre landscape is non-convex and multimodal.

## The visual (raw WebGL2)

Hand-written GLSL, `gl.POINTS`, additive blending:

- **candidate point cloud** — each synth projected to a 2-D timbre plane
  (x = spectral centroid, y = spectral spread), brighter when it fits better;
- **target star** — a bright, gently pulsing violet-white point;
- **best-so-far trail** — a fading violet track of the winner's path;
- **background** — a slow violet luminance drift (no strobe/flicker).

If WebGL2 is unavailable it degrades to an equivalent Canvas2D renderer with a
`text-destructive` notice.

## Silent auto-demo

On load, with zero sound and zero interaction, a seeded target is synthesized
and the full search runs automatically — the swarm converges on the star and
the match-percentage climbs. When it settles it re-seeds a new target and hunts
again, an endless gallery loop. Grantable audio (A/B of target vs best-so-far)
and microphone input are opt-in on top of this.

## Subsystems

- `rng.ts` — seeded **mulberry32** PRNG + Box–Muller Gaussian (deterministic).
- `synth.ts` — FM patch model, parameter ranges/denormalization, Web Audio voice.
- `features.ts` — Bessel FM spectrum, lowpass magnitude, log-bin analysis,
  spectral loss, centroid/spread projection, mic-spectrum resampling.
- `es.ts` — the separable CMA-ES.
- `render.ts` — raw WebGL2 point-cloud renderer + Canvas2D fallback.
- `page.tsx` — orchestration: mount-time silent demo, generation loop, eased
  rendering, Web Audio A/B, microphone capture, design-notes modal.

## References

- Engel, Hantrakul, Gu, Roberts. **"DDSP: Differentiable Digital Signal
  Processing."** ICLR 2020.
- Hansen. **"The CMA Evolution Strategy: A Tutorial."** 2006. (with Ros &
  Hansen, "A Simple Modification in CMA-ES Achieving Linear Time and Space
  Complexity," PPSN 2008 — the separable variant used here.)
- **arXiv:2606.21277**, "Compiling Differentiable Audio Graphs to Real-Time
  DSP." June 2026.
- Chowning. "The Synthesis of Complex Audio Spectra by Means of Frequency
  Modulation." JAES 1973 (the FM/Bessel sideband model).
