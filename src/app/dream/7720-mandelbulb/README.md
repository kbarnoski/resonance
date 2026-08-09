# 7720 · mandelbulb — fall into the jewel

**State:** visionary breakthrough / hyperdimensional bloom · **Pole:** intense, "more real than real"
**Input:** MIC (live) · **Fallback:** seeded virtual performer
**Question it answers:** *What does it feel like to fall INTO a living, jeweled, hyperdimensional fractal — the canonical visionary-breakthrough geometry — grown by your own voice?*

---

## The concept

A fullscreen WebGL2 fragment shader raymarches a **distance-estimated power-8
Mandelbulb** and slowly rotates the whole sample space so it endlessly unfolds.
Your voice grows the geometry in real time: quiet sound is a calm, slow drift; as
you get louder the fractal blooms into an ultra-saturated, iridescent
hyperdimensional jewel — the breakthrough. The camera falls inward as it blooms.

This is the lab's **first raymarched, distance-estimated escape-time 3D
fractal** — grep across 7000+ prototypes returns zero prior Mandelbulb / DE
raymarchers.

## The math (Mandelbulb DE)

The classic White–Nylander formula iterates `z → z^n + c` in spherical
coordinates, with `c = ` the original sample point:

```
r      = |z|
theta  = acos(z.z / r)
phi    = atan(z.y, z.x)
zr     = r^n
z      = zr · (sin(nθ)cos(nφ), sin(nθ)sin(nφ), cos(nθ)) + c
```

Alongside the iteration we track the running scalar derivative

```
dr = n · r^(n-1) · dr + 1
```

which yields the **analytic distance estimate**

```
dist = 0.5 · log(r) · r / dr
```

The raymarcher steps by `dist` each iteration (a guaranteed-safe sphere-trace),
capped at **64 march steps** and **8 fractal iterations** so it runs on a mobile
GPU. Surface normals come from the tetrahedron gradient of the DE. **Orbit-trap
coloring** (the running minimum `|z|²` of the orbit) feeds an IQ cosine palette
for the jeweled iridescence; ambient occlusion is read from the march step
budget; a Fresnel rim + specular sparkle give the "jewel" read.

Distance-estimation + sphere-tracing technique follows **Íñigo Quílez's**
raymarching / distance-estimation writeups.

## Mic → parameter mapping ("the sound grows the geometry")

| Audio feature            | Drives                                             |
| ------------------------ | ------------------------------------------------- |
| Bass energy (bands 0–1)  | Fractal exponent **n: 7 → 9** (the bloom)         |
| Overall loudness         | Camera push-in + saturation / color gain          |
| Treble energy (bands 4–5)| Palette hue shimmer + specular sparkle            |
| Same energy scalar       | Opens the drone's lowpass + swells the shimmer    |

Louder / brighter sound = the fractal blooms and intensifies (visionary breakthrough);
silence = it settles into a slower, calmer drift.

## Self-demo (Karel reviews on his phone at 06:30, no mic, no interaction)

On load the GL scene starts immediately and a **seeded virtual performer**
(`mulberry32(0x7720)`) drives a deterministic **move-burst → settle** loop:
48 precomputed gesture events, bass events bloom the geometry, treble events
sparkle, over a slow breathing baseline so even the quiet stretches drift. The
whole arc plays with zero input. When the real mic **is** granted it seamlessly
takes over; if denied, the performer just keeps driving (not an error — the
normal review path).

## Audio (never a silent page)

A **just-intonation drone** (root C2 + octave + fifth 3/2 + major third 5/4 +
twelfth 3/1, lightly detuned via the same seeded PRNG) through a lowpass, plus a
**shimmer stack** two octaves up gated by the energy scalar. When the fractal
blooms the filter opens and the shimmer swells — the ear hears the breakthrough
the eye is falling into. A slow ~0.15 Hz amplitude LFO adds swell (never a
flutter). It swells with the virtual performer even when the mic is denied.

## Safety

- Any luminance flicker routes through `createSafeFlicker({ maxHz: 3, floor: 0.72 })`
  — **off by default**, opt-in via the "Pulse" toggle, clamped to ≤3 Hz soft
  sine, never a hard strobe.
- `prefers-reduced-motion` slows the unfolding rotation and the camera push-in.
- The default experience is slow luminance drift, not flicker.

## Performance

- Renders to a **downscaled buffer**: DPR capped at 1.5× and the long side
  clamped to ~720px, then CSS-scaled to fill.
- Raymarch capped at 64 steps, fractal at 8 iterations, `powerPreference:
  "low-power"`, one fullscreen triangle, one pass.
- rAF is cancelled and the GL context is released (`WEBGL_lose_context`),
  the AudioContext closed, and mic tracks stopped on unmount.

## Degrade gracefully

- **No WebGL2:** on-brand `text-destructive` notice; the drone bed still plays.
- **Mic denied:** silent fallback to the virtual performer (normal review path).

## Ambition rationale

- **#1 — new object:** first raymarched Mandelbulb / distance-estimated
  escape-time 3D fractal in the lab (grep-verified 0 across 7000+ prototypes).
- **#3 — named references:** Daniel White & Paul Nylander (Mandelbulb, 2009);
  Íñigo Quílez (distance-estimation & raymarching writeups).
- **#5 — charter fit:** sits squarely on the lab's PRIMARY visionary charter
  ("raymarch a 4D polytope / negatively-curved SDFs") and rhymes with fresh 2026
  audio-reactive-shader work — Robert Borghesi's *ASTRODITHER* (WebGPU / TSL,
  2026-07-01).

## Determinism

No `Math.random`, `Date.now`, or `new Date` anywhere. The clock is the rAF
timestamp; all randomness is `mulberry32(0x7720)`; the energy→visual mapping is
a pure function of the clock. A headless render of time *T* is byte-identical
run to run.

## Honest limits

- Raymarched fractals are GPU-heavy; despite the 720p downscale and step caps, a
  low-end phone may drop below 60fps on the deepest blooms (exponent near 9,
  camera closest). The step budget is the first knob to lower if so.
- Orbit-trap coloring + the 8-iteration cap means the very finest filigree can
  alias into shimmer at small internal resolutions — a known trade-off for the
  mobile budget, softened by the downscale + tone-map but not eliminated.
- Shader color output and true on-device framerate were reasoned about but not
  verified in a live browser in this build; the math, teardown, and determinism
  are the parts I can stand behind cold.
