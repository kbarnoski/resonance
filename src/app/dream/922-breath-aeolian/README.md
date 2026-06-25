# 922 · Breath Aeolian

**The one question:** *What if you could breathe into a living cloud of air and
hear the air sing back — your breath injects wind into a fluid, and the vortices
it stirs make aeolian tones whose pitch is set by airflow physics, not by any
scale?*

This is a lab-first prototype: live fluid-simulation **aeroacoustics** driven by
the human breath. There is no chord, no scale, no key. Pitch is deliberately
dumb — it follows the physics of vortex shedding (`f = St·U/d`), nothing else.

## The chain: breath → fluid → aeolian tone

1. **Breath energy (MIC).** `getUserMedia({ audio: true })` feeds an
   `AnalyserNode`. Every frame we read the time-domain buffer, compute RMS, and
   smooth it strongly (~150 ms time constant) into a single `breath` value in
   `0..1`. This is **breath energy, not pitch** — we do no pitch detection. Louder
   breath = stronger gust.

   **Mic-routing safety:** the microphone source is connected **only** to the
   `AnalyserNode`. It is **never** connected to `audioCtx.destination`. Routing a
   live mic to the speakers would create an acoustic feedback howl, so we
   deliberately avoid it.

2. **GPU fluid (TECHNIQUE).** A 2D **stable-fluids** solver (Jos Stam) runs
   entirely on the GPU in WebGL2 with ping-pong float render targets. Each frame:
   advect velocity → inject the breath gust (a Gaussian upward force at
   bottom-center whose magnitude = `breath`, plus turbulent jitter so the column
   curls) and let the reeds deflect local flow → **vorticity confinement**
   (re-inject swirl) → **Jacobi pressure projection** (24 iterations, keeps the
   field divergence-free) → advect dye, dissipate. Grid is **256²** with `RGBA32F`
   targets when `EXT_color_buffer_float` is present, degrading to **128²** /
   `RGBA16F` half-float otherwise. The dye + curl are rendered as glowing vapor:
   warm amber where dense, cooling to violet at the edges, on deep charcoal.

3. **Aeolian reeds.** Seven fixed thin obstacles ("reeds") with varied diameters
   `d` stand in the rising column. They deflect local velocity, which seeds
   vortex shedding downstream.

4. **Aeroacoustic synthesis (OUTPUT).** For each reed we sample the flow just
   downstream using a **tiny 5×5 px GPU readback** (never the full grid). From the
   probe we get local speed `U` and `|curl|`. Then per reed:

   - **`f = clamp(St · U / d, 60, 2000)` Hz**, with **St ≈ 0.2** (the Strouhal
     number). This is the Aeolian tone — the note a wire sings in the wind, the
     voice of an aeolian harp. Smaller `d` → higher pitch.
   - A **high-Q band-pass-filtered noise whistle** plus a quiet **sine partial**
     at `f`, so the reed actually sings.
   - Amplitude ∝ shedding strength (a function of `U` and vorticity),
     hysteresis-smoothed via `setTargetAtTime` (~80 ms) so it swells and fades
     like breath and never clicks.
   - A gentle **FM warble** on the band-pass center frequency, scaled by local
     vorticity — the Ffowcs Williams–Hawkings "pressure fluctuation" flavor.
   - A **broadband breath-noise bed** (filtered noise whose cutoff and gain track
     total field kinetic energy) so there is always texture while air moves.

   Master chain: voices → master gain (0.3) → lowpass (7 kHz) →
   `DynamicsCompressor` → destination. Gentle and intimate.

## Always-alive demo + mic fallback

If the mic is denied or unavailable, a **synthetic-breath LFO** (a slow
inhale/exhale envelope) drives the gust instead, so the cloud breathes and the
reeds sing within ~1 s of pressing Start — fully demoable with no microphone. A
`text-rose-300` notice makes this state visible. When the mic **is** granted and
real breath is detected, the synthetic breath fades out and your breath takes
over.

## Compositional logic

**BREATH + TIMBRE + TEXTURE**, not pitch theory. The instrument is the flow
field. You shape it by how you breathe — a slow exhale opens a low, breathy
drone; a sharp puff spikes the gust, accelerates flow past the thin reeds, and
their pitch jumps upward because `f ∝ U`. Nothing is quantized to a scale.

## Named references

- **Jos Stam, "Real-Time Fluid Dynamics for Games" (GDC 2003)** — the
  stable-fluids solver (advection + Jacobi pressure projection) this build
  implements on the GPU.
- **Aeolian tone / Strouhal vortex shedding:** `f ≈ St · U / d` with `St ≈ 0.2`.
  Wind singing past a wire; the voice of an aeolian harp.
- **Ffowcs Williams–Hawkings aeroacoustic analogy:** surface pressure
  fluctuations radiate as sound. Applied to real-time interactive flow in
  **arXiv:2601.15982**, *"Real-Time Inviscid Fluid Dynamics and Aero-acoustics on
  a Sphere"* (Jan 2026). Our per-reed vorticity → warble coupling is in the spirit
  of this analogy.

## Degrade paths

- **No WebGL2** → `text-rose-300` notice; the real experience is GPU fluid, so we
  do not fake it. Nothing throws.
- **No `EXT_color_buffer_float`** → automatic degrade to 128² / `RGBA16F`
  half-float targets; the probe readback converts half-float manually.
- **No Web Audio** → notice; visuals still animate.
- **No mic** → synthetic-breath fallback (above), clearly flagged.
- **Full teardown** on unmount: cancel rAF, stop mic tracks
  (`getTracks().forEach(t => t.stop())`), delete all GL programs / textures /
  framebuffers / buffers / VAO, stop oscillators & noise sources, `audioCtx.close()`,
  remove the resize listener.

## Honest status — UNVERIFIED

This was built in a sandbox with **no GPU, no audio output, and no microphone**.
It typechecks cleanly (`tsc`) and passes ESLint, but the following are
**unverified** because they cannot be exercised here:

- **Unverified: visual output.** The fluid shaders have not been run on a real
  GPU; shader compile/link is only guaranteed at runtime. Float-target
  feature-detection and the 16F degrade path are untested on real drivers.
- **Unverified: sound.** No audio device, so the actual timbre, the
  `f = St·U/d` pitch range/feel, click-free swells, and the breath-noise bed
  balance have not been heard.
- **Unverified: mic.** No microphone, so real-breath capture, RMS scaling, and
  the synthetic→real crossfade have not been confirmed end to end.
- **Unverified: probe readback fidelity.** `IMPLEMENTATION_COLOR_READ_TYPE`
  branching and the half-float conversion are correct per spec but untested
  against a live context; readback values feeding the synth may need rescaling
  (the `U` scale factor is a first guess).

Expect to tune the gust strength, the `U → frequency` scale, and the amplitude
mapping the first time it runs with real audio and a real GPU.
