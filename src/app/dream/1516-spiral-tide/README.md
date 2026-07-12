# 1516-spiral-tide — "The Spiral States"

**Cycle 2 of [`1506-theta-tide`](../1506-theta-tide/).** Where cycle 1 breathed
concentric rings out of a coupled-oscillator lattice, cycle 2 makes the wave
**genuinely morph through three propagation geometries** and adds an
**attentional state / chirality flip** — plus a real, winding-number **spiral
vortex** you can hear turn.

## What it is

A single **closed-form complex traveling wave** `ψ(u, v, t)` lives in cortical
`(u, v)` coordinates and crossfades between three geometries:

- **PLANAR** — `ψ = A·exp(i·(k·(cosφ·u + sinφ·v) − ω·t))` → drifting stripes/tunnels.
- **CONCENTRIC** — `ψ = A·exp(i·(k·u − ω·t))`, a wave in `u = log r` → breathing rings.
- **SPIRAL** — `ψ = A·exp(i·(k·u + m·v − ω·t))`, where **integer `m`** is the spiral
  **winding number** (sign = chirality). The `m·v` term winds the phase around
  the origin, so under the warp it is a **genuine log/Archimedean spiral**, not a
  texture spun by a rotation matrix.

Under the inverse **log-polar retino-cortical map** `r = exp(u)` (Bressloff &
Cowan 2001) each geometry reads out as a distinct **Klüver form constant**. The
combined `Re(ψ)` sets each sample's brightness; the field is drawn as **additive
dots over a low-alpha clear** (LSD colour trails for free) through an
**audio-reactive Bayer 8×8 ordered dither**.

**Rendered entirely in Canvas2D `2d`** — no WebGL, no WebGPU, no three.js. The
value of that choice is being GPU-independent and, more importantly, letting the
see==hear be **exact and structural**: the same analytic ψ that lights a pixel is
the ψ that triggers the bell.

## References

- **Das, Zabeh, Ermentrout & Jacobs**, *Planar, spiral, and concentric traveling
  waves distinguish behavioral states in human memory*, **Nature Communications
  2026** (s41467-026-71386-z) — the three wave geometries as cognitive-state
  signatures. This piece treats each as a psychedelic form constant.
- **Bressloff & Cowan (2001)** — the log-polar V1 map that turns cortical plane
  waves into tunnels / rings / spirals.
- **Klüver form constants** — the four recurring hallucinatory geometries.
- **Robert Borghesi, *ASTRODITHER*** (webgpu.com, **1 July 2026**) — the
  audio-reactive custom-dither + bloom aesthetic anchor. Here the dither
  threshold/scale breathes with the audio amplitude, so the grain itself is
  audio-reactive.

## The see==hear map (this is the quality bar — exact / structural)

The same `ψ(u, v, t)` is evaluated at a small set of **fixed listening rings**
(cortical `u` values). When a wavefront crosses a ring — the same instant the
bright front visibly reaches that radius on screen — an **inharmonic struck-bell**
cluster (partials `[1, 2.13, 3.71, 5.94]`) rings, panned to the front's on-screen
angle:

- **PLANAR** → nearly silent bells; a low slow drone/pad carries the state.
- **CONCENTRIC** → the whole ring lights at once → **centred** breathing bells.
- **SPIRAL** → the bright point's angle `v* = −(k·u + ωt)/m` **winds and rotates**
  as the temporal phase advances, so the pan sweeps continuously L↔R — you
  **hear the spiral spinning**. Spiral also lifts the bell fundamentals into a
  higher shimmer.

One ψ, one clock (`performance.now()`-derived `dt`), one location. No GPU sim
sits between what you see and what you hear.

## Attentional input (cycle-2 feature)

- **Space / click** → advance the wave state (planar → concentric → spiral → …).
- **← / →** → flip the spiral **chirality** and the **wave direction** (sign of
  `m` and `ω`) with a matching **Shepard glissando direction reversal**. The
  temporal phase is integrated as a signed velocity, so a flip stays
  position-continuous; the winding sign morphs across ~0.6 s.

The arc **also auto-advances** on a mulberry32-seeded timeline, so it self-plays
with no input.

## The arc (~6 min, non-looping)

`PLANAR` (calm drift) → `CONCENTRIC` (breathing rings) → `SPIRAL` (the rotating
melt / peak) → gentle settle. A REBUS-style drive envelope rises then eases; the
wavenumber, planar angle and hue evolve slowly, so **minute 6 ≠ minute 1** even
where the geometry repeats.

## Safety

- Effective temporal rate held near **0.7 Hz** — well under the 3-Hz
  photosensitive ceiling — as a **spatial** moving ring/spiral with slow hue
  drift, never a full-field luminance flash. The dither animates slowly
  (< 0.2 Hz); no strobe anywhere. A retained-glow clear keeps mean luminance
  ~constant.
- Audio is **gesture-gated** (AudioContext created only in the Begin handler),
  ramps from silence to **≤ 0.2** through a `DynamicsCompressor` limiter, caps at
  **14 voices**, and tears fully down on unmount (stop oscillators,
  `cancelAnimationFrame`, `ctx.close()`).
- **Reduced-motion** slows everything ~0.4× and desaturates.
- Deterministic: seeded `mulberry32` + `performance.now()` only — no
  `Math.random`, `Date.now`, or `new Date`.

## Known limitations

- **Built headless — no audio device or eye in the loop.** The felt *tightness*
  of the see==hear coupling and the *intensity* of the spiral melt are unverified
  by ear or eye; they are correct by construction (one shared ψ), but the
  perceptual sync, loudness balance, dither grain and trail length may want
  hand-tuning on a real screen and speakers.
- The Shepard direction flip **rebuilds** the glissando bed rather than
  crossfading two beds; the reversal is intentional and gated by a fade, but a
  hard, rapid ←/→ mash could sound slightly abrupt.
- The dither's "audio amplitude" is the field's own smoothed gain envelope
  (drive + strike swell) — the value that also trims the audio master — not an
  `AnalyserNode` reading of the output bus. It is genuinely audio-*coupled*, but
  it is the envelope, not a post-mix FFT.
- Canvas2D draws ~6.6k additive rects/frame; fine on modern hardware but heavier
  than a shader on low-end machines.
