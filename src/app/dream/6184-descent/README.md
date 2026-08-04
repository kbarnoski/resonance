# 6184 · descent

**What if you could HEAR a synth think — descend a spectral-loss gradient, step
by audible step, sliding its own parameters downhill until its timbre becomes
your live voice — the optimization loop itself as the instrument?**

A played, live duet: you (or a synthetic singer) and a small FM voice that
audibly optimizes toward you. Each frame the synth measures how far its own
sound is from the target and takes a few gradient-descent steps on its five
continuous parameters — you hear the knobs slide, and you watch the point roll
downhill across a live loss landscape.

## How to use

- Press **Hear it descend** — the duet starts (browsers require one gesture
  before audio). Visuals run from the moment the page loads.
- By default you are in **Auto**: a seeded synthetic singer whose timbre slowly
  drifts is the moving target. You hear the singer (panned left) and the
  chasing synth (centre), and you watch the synth re-chase as the target drifts.
  No microphone, no permission — fully alive and demoable.
- Press **Use my mic** to make the target your live voice. Hum or sing a steady
  note; the synth slides toward your timbre. The mic feeds analysis **only** and
  never reaches the speakers (no feedback). Denied/absent mic → a clear message
  and it stays in Auto.

## The four subsystems

1. **Live timbre analysis** (`features.ts`, `page.tsx`). Mic → `AnalyserNode`
   (analyser is a dead-end sink; never routed to output). Per frame the linear
   FFT magnitudes are resampled into a 48-band log-frequency spectrum,
   peak-normalized to a dB-ish profile so the loss compares timbre *shape*, not
   loudness. A small feature vector (centroid, spread, flatness, RMS) is shown
   in the HUD.
2. **The gradient optimizer** (`optimize.ts`). A five-parameter FM model
   (fundamental, modulator ratio, FM index, cutoff, Q). Per frame it computes a
   spectral loss L(params) = MSE between the synth's analytic log-band spectrum
   and the target's, then takes `STEPS_PER_FRAME` gradient-descent steps.
   Gradients are **finite-difference**: perturb each parameter, measure ΔL.
   Stability comes from momentum, gradient normalization and a clamp on the
   per-step move — the "macro-controls that keep it stable." Loss and gradient
   magnitude are exposed for the viz/HUD.
3. **Resynthesis voice** (`synth.ts`). The actual audible synth is a 2-operator
   Web Audio FM patch through a resonant lowpass, whose parameters **are** the
   descending parameters. Every parameter is ramped (`setTargetAtTime`), so you
   hear a continuous slide, not discrete steps. In Auto a second voice plays the
   drifting singer target (the duet); in Mic mode only the chaser sounds.
4. **Immersive viz** (`gl.ts`). WebGL2 where the descent *is* the image: the
   glowing valley is the loss evaluated live over a 44×44 grid of the two most
   salient parameters (ratio × index), uploaded as a linear-filtered texture;
   the bright point rolls downhill toward the basin star; a fading comet trail
   marks its trajectory; two luminous curves at the base are the target and
   synth spectra, converging as the loss falls. On a silent, static frame it
   reads as "a point rolling down a glowing valley toward a target." A Canvas2D
   fallback draws the same idea.

## References

- **ADAC — "Compiling Differentiable Audio Graphs to Real-Time DSP"**
  (arXiv 2606.21277, DAFx26, 2026) — the framing of optimization-made-audible as
  an interactive instrument, with macro-controls that keep the loop stable.
- **DDSP** (Engel et al., ICLR 2020) — the differentiable-synth spectral-loss
  lineage: describe a synth by a compact spectral representation, optimize a
  distance to a target.
- **`5784-converge`** (this lab) — a one-shot "synth becomes a sound you give
  it" via an **evolutionary population search**, which explicitly chose
  evolution *instead of* gradients. `6184-descent` walks the exact gradient road
  5784 named and did not take: continuous, per-frame, played.

## Honest limits

- **Is the descent audible/legible?** Yes, but with caveats. Because the target
  keeps moving (the singer drifts; your voice wobbles), the point rarely "snaps
  and sits" — it lags slightly and re-chases, which is what makes the slide
  legible as a continuous chase rather than an instant jump. When the target is
  perfectly steady the descent can converge in well under a second and then just
  track, which reads as "arrived."
- **Gradient stability.** Finite differences on a Bessel-structured FM loss give
  a genuinely rippled, non-convex landscape; without the guards it would jitter
  or overshoot. Momentum + gradient-direction normalization + a per-step clamp
  tame it, and audible params are ramped so instability never becomes a click.
  The trade-off: normalization makes the step size roughly constant, so the
  point can idle with a tiny back-and-forth near a flat minimum (a small seeded
  exploration kick keeps it from freezing). It is a local optimizer — it finds a
  nearby basin, not a global argmin, and only two of five dimensions are drawn,
  so the on-screen point may settle slightly off the on-screen basin when the
  true optimum needs the hidden parameters.
- **The mic path** matches a mic spectrum against an analytic FM spectrum; a
  rich human voice is only approximated by five FM parameters, so "becomes your
  voice" means "chases the broad shape of your timbre," not a clone.
- **Performance.** The live 44×44 loss field is ~2k spectrum evaluations per
  frame; comfortable on a laptop, and fine on phones, though a very weak device
  may drop frames. `prefers-reduced-motion` slows the drift and stills the
  luminance breathing.
