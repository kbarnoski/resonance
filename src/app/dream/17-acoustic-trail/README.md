# 17 — Acoustic Trail

**What if your audio was its own coordinate system?**

Every prototype in this sandbox uses audio *as a trigger* for abstract visuals —
bass hits scatter particles, onsets flash colors. This prototype inverts that:
audio becomes the *space itself*, and the music traces a path through it.

## The three axes

| Axis | Audio feature | Meaning |
|------|---------------|---------|
| X | Spectral centroid (Hz, normalized) | Left = dark/bassy, right = bright/treble |
| Y | Treble ratio (high-freq energy / total) | Up = treble-dominant |
| Z | Bass energy (sub-bass + bass bands) | Forward = bass-heavy |

These three numbers describe the perceptual "color" of a sound moment
completely — brightness, timbral emphasis, and weight. The trail you leave
is the acoustic fingerprint of the performance, not a reaction to it.

## What to expect

**A single clean pitch**: traces a vertical column (constant centroid and bass,
no treble) — a thin spike rising from the floor.

**A chord with many harmonics**: spreads wide in X (centroid shifts as harmonics
blend) and rises in Y (harmonics add treble content).

**A bass note**: pulls the trail toward the Z wall (high bass energy) and to the
left (low centroid).

**A rising scale**: traces a diagonal arc — centroid rises as pitch rises.

**Demo mode**: six oscillators at 40, 125, 350, 1000, 3000, 10000 Hz with slow
independent LFOs (~0.07–0.32 Hz). The LFOs make different oscillators dominant
at different times, causing the centroid to oscillate slowly. The trail traces
a slow Lissajous-like curve through the 3D space over ~30 seconds. Silent.

## Design choices

**Canvas 2D over WebGPU**: The 4000-point trail with per-frame rotation recomputes
all projected positions every frame, which is 4000 × [cosY, sinY, cosX, sinX,
multiply, add] = ~32k floating-point ops. At 60fps this is ~2M ops/sec — easily
within V8 JIT performance. WebGPU would be overkill and adds boilerplate.

**Additive blending** (`globalCompositeOperation = "lighter"`): Dense clusters
where the trail revisits the same acoustic region glow brighter automatically.
This is perceptually meaningful: repeated patterns leave a burn-in.

**HUE_LUTS precomputed cache**: 360 CSS `hsl()` strings at startup, indexed by
hue integer. Avoids 4000 string allocations per frame.

**Early break**: The per-point loop breaks when `alpha < 0.012`. Since points are
iterated newest-first and alpha decreases monotonically with age, all subsequent
points are also invisible. Typical savings: 60-70% of the buffer skipped.

**Color = centroid**: Hue goes from indigo (centroid ~0 Hz) to orange/red
(centroid ~7000 Hz). This means the trail's color at any moment matches the
perceptual "warmth" of the audio — indigo clusters = bass passages, orange
wisps = treble-heavy moments.

## Polish ideas

- Add a "project to XZ plane" shadow of the trail — shows the centroid×bass
  shape without the treble dimension, useful for seeing chord structures.
- Record + replay: store timestamped trail positions so the user can watch their
  performance play back as an animated path.
- Per-note pitch detection (autocorrelation, same as `13-piano-canvas`) as a
  4th axis → glyph size or alpha. A single held pitch becomes a glowing dot.
- Label grid ticks with Hz values on the centroid axis and energy values on
  the bass axis — makes the space legible for someone who wants to understand
  their sound analytically.
- WebGPU upgrade: at 4000 points Canvas 2D is fine, but at 40,000 points
  (full performance session) a WGSL vertex shader would be needed.

## Inspiration

SoundPlot (Cuesta et al., arxiv 2601.12752, Jan 2026): browser-based 3D
acoustic feature space visualization for birdsong analysis. Maps spectral
centroid → X, bandwidth → Y, pitch → Z. The core insight — that audio has
a natural coordinate system and the trajectory through it IS the fingerprint —
applies directly to piano/voice performance. This prototype is SoundPlot for
music.
