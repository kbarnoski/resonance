# 1136 · Theta Engine

## The one question

**What if a drug-free psychedelic visual were organised not by SPATIAL geometry
(the usual form-constant warp) but by the visual cortex's own psychedelic
TEMPORAL rhythm** — the ~5 Hz theta oscillation that 5-HT2A psychedelics amplify,
with ~40 Hz gamma bursts nested inside each theta cycle (theta–gamma
cross-frequency / phase-amplitude coupling)?

This is the **intense, 2D raw-WebGL2 shader-field** take (approach A of a 3-way
exploration). The temporal structure is the star; spatial form is deliberately
secondary.

## How it works

### Audio — where the REAL coupling lives (`audio.ts`)

Fast 5/40 Hz coupling is a *visual*-flicker hazard, not an auditory one, so the
literal coupling is synthesised in sound:

- **Sub drone** — a steady 55 Hz sine plus two detuned partials (110 Hz, 165 Hz)
  for body.
- **Theta AM** — a ~5 Hz (3–6.5 Hz) sine amplitude-modulates a mid carrier
  (~139 Hz), so the theta pulse is plainly audible.
- **Gamma PAC** — a 40 Hz oscillator is fed through a VCA whose gain is driven by
  a `WaveShaper`-sharpened function of the theta phase (`max(0, sin θ)^p`). The
  gamma therefore fires in **bursts concentrated at each theta peak** — genuine
  phase-amplitude coupling, the nested rhythm you can hear. `coupling` scales both
  the theta AM depth and the gamma burst depth; "deep coupling" sharpens the gate.

Everything sums into a master gain → `DynamicsCompressor` limiter → output. Onset
is a click-free `setTargetAtTime` ramp; teardown ramps down, stops oscillators,
and fully `close()`s the context. An `AnalyserNode` taps the master to draw the
small on-screen envelope meter and to feed a glow value back to the shader.

### Visual — the coupling made safely visible (`field.ts`)

A raw WebGL2 fragment shader draws a full-screen field:

- **Secondary spatial layer** — a log-polar form-constant field (imported
  `LOGPOLAR_GLSL`): a spiral layer whose density and angle **reorganise each
  visual-theta cycle** (it re-blooms), mixed with a concentric tunnel layer.
- **Gamma sparkle** — a fine, sparse spatial hash texture that clings to field
  ridges. Its *amplitude* is gated by the theta-phase envelope × coupling — so the
  fine "gamma" detail rises and falls with the theta phase. That is the coupling
  rendered visible.
- **Palette** — cool / electric on near-black: deep indigo → electric violet →
  cyan, with a soft filmic knee.

### Control (`page.tsx`)

Active pointer drag steers live: **X → coupling depth**, **Y → theta rate
(3–6.5 Hz)**, shown as readable labels. Idle for ~4 s and it gently
auto-modulates so the page always breathes and sounds.

## Safety — photosensitive epilepsy

5 Hz and 40 Hz sit inside the seizure-risk band for *visual* flicker, so:

- The literal 5/40 Hz coupling lives **only in the audio**.
- Every visual luminance modulation is routed through the shared **SafeFlicker**
  engine (`_shared/psych/safeFlicker.ts`): hard-capped at ≤8 Hz, ≤3 Hz soft
  default drift (≤6 Hz in deep mode), sine waveform, luminance floor 0.6 — it
  never blacks out and is never a hard strobe.
- "Gamma" is expressed as a **spatial** sparkle whose amplitude tracks theta
  phase, never a full-screen 40 Hz luminance strobe.
- The visual theta is a *slowed* proxy (≈0.42×) of the audio theta.
- `prefers-reduced-motion` is honored (SafeFlicker downgrades to sub-perceptual
  drift; the sparkle clock also slows).
- Deep-coupling mode is an explicit opt-in with a one-line warning, and there is
  an instant **Stop** that kills flicker the same frame and tears down the audio.

## Honesty

This piece **evokes phenomenology**; it makes **no medical or entrainment
claim**. Theta–gamma coupling is a real, well-documented cortical phenomenon, but
nothing here "entrains your brain" — that framing would be overstated. It is an
art prototype that lets you hear and steer a nested rhythm.

## References

- **"Psychedelic 5-HT2A agonist increases spontaneous and evoked 5-Hz
  oscillations in visual and retrosplenial cortex"** (2026), NCBI PMC12894671 —
  the motivating finding that 5-HT2A agonism amplifies ~5 Hz (theta-band) cortical
  oscillations.
- **Lisman, J. E. & Jensen, O., "The theta-gamma neural code,"** *Neuron* (2013)
  — the canonical account of gamma cycles nested within a theta cycle
  (phase-amplitude coupling).
- **Bressloff, P. C. & Cowan, J. D.** et al. — geometric visual hallucinations
  and the retino-cortical (log-polar) map underlying Klüver's form constants; used
  here for the secondary spatial layer via the shared `logpolar.ts` engine.
