# 1722 · Breath Nimbus

**Pole:** cosmic-ambient · meditative Oceanic-Boundlessness
**Input:** `mic-breath` — microphone RMS envelope → a ~0.1 Hz breath-phase estimator
**Output:** a large luminous particle nimbus (~60,000 raw WebGL2 point-sprites; Canvas2D fallback at 4,000)
**Technique:** breath-phase estimation + coherence tracking + curl-noise (divergence-free) particle advection

## The one question

> What if a nimbus of tens of thousands of luminous motes **gathered** toward you
> when you inhale (condensation, a self drawing inward) and **dispersed** outward
> to a boundless veil when you exhale — steered by your real breath — and
> coherent slow breathing tightened them into one calm, phase-locked cloud?

This is a **breath biofeedback** piece, not an instrument. You do not play it; you
breathe, and the cloud answers. Breathe slowly and evenly near six breaths per
minute and the swarm condenses into a still, coherent ring; breathe erratically
and it stays turbulent and diffuse.

## How it works

1. **Mic → analyser only.** On *Start — breathe* we `getUserMedia({audio})`, create
   an `AudioContext`, and wire `source → analyser` and **nothing else**. The mic is
   never connected to `ctx.destination` or any node that reaches output, so there
   is no possibility of howl-round feedback. The analyser's time-domain data is
   read each frame and reduced to an RMS envelope.

2. **Breath-phase estimation** (`sim.ts › BreathEstimator`). The RMS envelope is
   slow-smoothed (breathing is a ~0.1 Hz signal) and passed through a
   self-calibrating adaptive envelope — a rolling floor/ceiling that drops or
   rises instantly to catch each extreme and creeps back — yielding a normalized
   breath amplitude in `[0,1]` (0 = peak exhale, 1 = peak inhale). Rising envelope
   = inhale; the inhale peaks are detected to measure breath-to-breath **period**
   and hence breaths/min.

3. **Coherence tracking.** A coherence score in `[0,1]` rewards breathing whose
   period sits near the ~10 s (≈6 breaths/min) resonance target **and** is steady
   from breath to breath (low coefficient of variation). This is the
   HeartMath / resonance-frequency idea, driven by breath rather than heart rate.

4. **Particles** (`sim.ts › ParticleNimbus`). Motes are initialised on a soft disc
   with a fixed-seed **mulberry32** PRNG (never `Math.random`). Each fixed-timestep
   frame they:
   - advect on a **divergence-free curl-noise flow field** built as the 2D curl of
     a small sum-of-sines stream function `ψ`, so the velocity is `(∂ψ/∂y, −∂ψ/∂x)`
     — analytic gradients, no finite differences, cheap enough for 60k motes on the
     CPU each frame;
   - feel a **breath-driven radial force**: inward (gather to the core) on inhale,
     outward (disperse to the veil) on exhale, plus a spring toward a breathing
     rest-radius;
   - are **calmed by coherence**: high coherence quiets the curl turbulence and
     firms the ring-spring, tightening the swarm into a phase-locked cloud; low
     coherence keeps it lively and diffuse.
   Positions are uploaded to a dynamic VBO each frame and drawn as `gl.POINTS` with
   additive blending and a soft Gaussian falloff. At peak inhale the whole field
   blooms brighter — the boundary-dissolving luminous veil.

5. **Audio bed** (`audio.ts`). A sparse, deliberately **inharmonic** pad: four
   oscillators at non-integer ratios (`1.0, 1.503, 2.017, 2.711`) with small cent
   detunes so they beat gently — not a clean just-intonation chord. Its amplitude
   follows the **same** breath phase that drives the motes, routed through a
   `DynamicsCompressor` and a low master gain (0.12) into the shared convolution
   **void reverb** (`_shared/psych/convolutionVoid`). This graph is output-only;
   the mic never touches it.

## Palette

Cool violet → pale-luminous motes on a near-black violet wash, warming to a gold
accent as motes gather into the core. Not a cosmic starfield — a gathered,
breathing data-mist.

## Determinism & headless self-demo

The morning review runs headless (no mic, no display), so the piece must never be
blank or silent on its own:

- The ghost loop starts **on mount**. With no mic, the breath envelope is a pure
  sine of the integer frame counter: `0.5 + 0.5·sin(frame/60 · 2π · 0.1)`. The
  nimbus gathers/disperses and the pad swells with no interaction. A *Breathe for
  me (demo)* button makes this explicit.
- Absolute determinism in the animation/state/audio path: **no** `Math.random`,
  `Date.now`, `new Date`, or `performance.now`. Time is the integer frame counter;
  randomness is fixed-seed mulberry32; `ctx.currentTime` is used only for audio
  scheduling.

## Safety

No strobe/flicker. The only periodic brightness change is the ~0.1 Hz breath
bloom — far below any photosensitive band — and it is still multiplied through the
`_shared/psych/safeFlicker` gate (which returns 1.0 while disabled) and eased for
`prefers-reduced-motion` users. When in doubt: slow drift, not flicker.

Graceful fallbacks: mic denied → on-brand `text-destructive` note **and** the ghost
keeps running; WebGL2 unavailable → Canvas2D nimbus (fewer motes) with a notice.

## References

- **"Breathing Space: Spatial Mapping of Breath & Cardiac Biofeedback for
  Coherence Training"** (HCI-Alps 2026) — and the 2026 particle-breath
  visualization in which motes move *toward the body on inhale* and *spread outward
  on exhale*. This piece is a direct implementation of that mapping.
- **HeartMath / resonance-frequency breathing** — coherence peaks near ~0.1 Hz
  (≈6 breaths/min); the coherence score rewards proximity to that period and
  breath-to-breath steadiness.
- **Bridson, Hourihan & Nordenstam, "Curl-Noise for Procedural Fluid Flow"**,
  SIGGRAPH 2007 — the divergence-free advection: velocity as the curl of a scalar
  potential, so the mote cloud neither compresses nor rarefies.
- **Refik Anadol** — the point-cloud "data-mist" aesthetic of boundless
  gathered/dispersed particle fields.

## Honest knocks

- 60k motes advect on the CPU each frame and re-upload a ~470 KB VBO; on a weak
  GPU/CPU this can dip below 60 fps. A GPGPU ping-pong FBO sim would scale further,
  but the CPU path was chosen to guarantee it actually runs headless.
- Mic-driven breath detection is heuristic: airflow noise near the mic reads as the
  "breath," so a very quiet nose-breather or a noisy room can confuse the
  envelope. The adaptive floor/ceiling mitigates but does not eliminate this; the
  synthetic ghost is always the reliable demo.
- The coherence score is a proxy built from breath period and steadiness only — it
  makes no physiological/HRV claim. Phenomenology, not medicine.
- The "peak-inhale scatter to a boundary-dissolving veil" is rendered as a
  brightness bloom over the gathered core rather than literally flinging motes
  outward, to keep the gather-on-inhale reading coherent.
