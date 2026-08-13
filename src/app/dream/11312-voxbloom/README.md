# Voxbloom

## The one question
_What if you could sing into a rotating 3-D sculpture of your own voice — every
harmonic a glowing shell of points you can orbit, blooming outward when you're
loud and collapsing inward when you're quiet?_

## What it is
A GPU point cloud (~60k points on WebGPU, ~24k on the fallback) arranged as
**24 concentric spherical shells** — one per log-spaced frequency band. Each
point owns a fixed unit direction on its shell and a fixed band index; the only
thing that ever moves is its **radius**. A slow hand-rolled orbit camera drifts
around the sculpture (well under 1 Hz).

## How the WebGPU compute mapping works
Two storage buffers hold the cloud:

- `dirs` (read-only): `vec4` per point — `xyz` = unit direction, `w` = band index.
- `state` (read/write): `vec4` per point — `x` = current radius, `y` = smoothed
  intensity (for colour).

Each frame the CPU collapses the analyser's FFT magnitudes into 24 band
amplitudes and uploads them in a uniform buffer. The compute shader
(`@compute @workgroup_size(64)`, dispatched with `ceil(N/64)` workgroups) reads
each point's band amplitude `a` and eases its radius toward

```
target = floor(band) + a² · bloom
radius += (target − radius) · clamp(rate · dt, 0, 1)   // attack rate > decay rate
```

`a²` sharpens the bloom; the attack-faster-than-decay asymmetry gives a crisp
outward pop and a slow settle. This is a **kinematic radius lerp only** — no
physics, no fluid, no PDE. The render pass expands every point to a 2-triangle
sprite and shades it cyan→white by intensity with **additive blending**, so
overlapping shells glow. Palette: cool cyan→white phosphor on near-black.

## The fallback (still 3-D GPU geometry)
If `navigator.gpu` is missing (common on phones) the piece builds a
`THREE.Points` cloud instead — WebGL, additive `PointsMaterial`, vertex colours —
and runs the exact same `floor + a²·bloom` radius lerp on the CPU with the same
auto-orbit. The path is chosen once at startup. It is never Canvas2D.

## Seeded self-demo (phone-at-06:30 robustness)
On mount, before any permission prompt, a soft **A-minor-pentatonic arpeggio over
a slow detuned pad** starts through the shared safe master bus and feeds the same
analyser, so the sculpture is blooming within ~1s even on a muted device. If the
audio context is still suspended or silent, a gentle **synthetic spectrum** (two
drifting gaussian harmonics) drives the shells so there is always visible life.
"Start microphone" swaps the analyser source to live voice (mic is tapped into
the analyser only — never to the speakers, so no feedback) and stops the demo. If
the mic is denied, the self-demo resumes and an on-brand `text-destructive` note
appears.

## Ear / strobe safety
- All audio routes through `createSafeMaster` (gain 0.5): high-shelf cut, lowpass
  safety cap, brick-wall limiter.
- No strobing: the only motion is the sub-1 Hz orbit and smooth radius easing.
  `prefers-reduced-motion: reduce` stops the orbit and the elevation wobble.
- Full teardown on unmount: cancel rAF, stop oscillators + arpeggio scheduler,
  stop mic tracks, `master.disconnect()`, `ctx.close()`, `device.destroy()` /
  dispose the three.js renderer + geometry + material.

## Named influences
- **Ryoji Ikeda** — data as cool monochrome light, phosphor on black.
- **Refik Anadol** — point-cloud sculpture as a living, breathing volume.
- Classic **oscilloscope / spectrogram** vector aesthetics.
- The overtone series itself: shells as literal harmonics of the voice.

## Next-cycle deepening
- Per-point angular drift synced to spectral flux for a shimmer within each shell.
- Pitch tracking to snap the whole sculpture's scale to the sung fundamental.
- A depth-sorted or bloom-postprocess pass for softer additive falloff.
- Persist a "bloom trail" so a held note leaves a fading afterimage shell.
- WebGPU timestamp queries to auto-scale point count to the device.
