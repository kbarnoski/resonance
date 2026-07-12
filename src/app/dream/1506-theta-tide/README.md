# 1506 · Theta Tide

## What this is

The psychedelic "breathing surfaces" hallucination, rebuilt from its likely
cortical mechanism instead of faked as a texture effect. A traveling wave sweeps
across a model of visual cortex — a lattice of **coupled phase oscillators**
living in *cortical* coordinates (u, v), where u = log r. Because the retina→V1
map is approximately a complex logarithm, the inverse warp r = exp(u) turns a
cortical plane wave into the classic expanding / contracting concentric rings of
an LSD "breathing tunnel". Each wavefront that crosses a fixed listening ring
rings an inharmonic struck-bell tone, panned to the front's screen angle — so
**the visible wavefront is the audible sweep**. It is a long-form (~7 minute),
self-evolving, non-looping piece: an entropy / REBUS arc raises coupling, noise
and the number of interfering wave sources over time — one calm wave at the
cosmic onset, multiple interfering wavefronts + spirals at the melt, then a
gentle settle. Minute 6 is never minute 1.

## Research anchor

- **Communications Biology (12 Jan 2026):** a 5-HT2A psychedelic agonist
  amplifies ~5-Hz oscillations in V1 and retrosplenial cortex that propagate as
  **cortical traveling waves** (~0.083–0.12 m/s, ~18 ms V1→RSC lag). This is the
  concrete anchor for the piece. **Honestly: this paper is ~6 months old, not a
  <14-day-fresh finding** — it is the mechanistic hook, not breaking news.
- **Bressloff & Cowan (2001)** — geometric visual hallucinations arise from
  plane-wave / hexagonal cortical patterns seen through the log-polar retino-
  cortical map. This is why cortical stripes read out as tunnels and spirals.
- **Klüver's four form constants** — tunnels/funnels, spirals, lattices/
  honeycombs, cobwebs — the recurring vocabulary the warp produces.
- **Carhart-Harris — REBUS / entropic brain** — the arc that raises disorder
  (coupling, noise, source count) toward a peak and settles.
- **Kuramoto** — the coupled phase-oscillator model the lattice integrates.

## The see == hear mapping

The lattice is a **driven Kuramoto model**: each cell integrates
`dθ/dt = K·Σ sin(θ_neighbor − θ) + F·Σ_s amp_s·sin(Θ_s − θ) + noise`, where the
`Θ_s` are the phases of a few cortical traveling-wave sources. The **same**
source phases drive the audio: a wavefront's cortical phase at a listening ring
crosses a multiple of 2π at exactly the instant the bright ring visibly reaches
that radius, and that crossing triggers the tone. Sight and sound therefore share
one clock and one location (pan = the front's screen angle). Early in the arc the
forcing `F` is high, so the lattice locks tightly to the drive and the rings are
clean and concentric — this is where the coupling is tightest. Later `F` drops
while `K` and noise rise, so local coupling reorganises the field: the rings warp,
interfere and "melt". Pitch is continuous and inharmonic (a Risset-flavoured
struck-bell partial cluster, `[1, 2.76, 5.4, 8.93]`) — **no** just-intonation or
pentatonic scale index, **no** Reich phasing. The slow pedal drone and the
Shepard glissando are the shared `_shared/psych` helpers.

## Safety

5 Hz sits **above** the 3-Hz photosensitive-epilepsy flicker ceiling, so the wave
is never a full-field luminance flash. Two safeguards:

1. **Spatial, not temporal.** The wave is a moving *ring* — a spatial
   displacement (the surfaces literally breathe outward/inward) plus a smooth
   local hue drift. Because half the field is bright and half dark at any moment
   and the pattern only translates, the *mean* screen luminance stays roughly
   constant. There is no global luminance strobe.
2. **Slowed into theta.** The per-point oscillation rate is held at ~1–1.8 Hz
   (theta band — hence "Theta Tide"), an honest slowdown of the 5-Hz finding for
   comfort and safety. `prefers-reduced-motion` slows all motion further and
   de-saturates.

## Rendering

- **Primary: WebGPU compute.** The oscillator lattice is a WGSL `@compute` shader
  with two ping-ponged storage buffers (per-cell phase). It is drawn as ~123k
  instanced additive quads via a WebGPU render pipeline; each instance's screen
  position is the log-polar warp of its cortical (u, v) coordinate, and its
  brightness / size / hue come from cos(local phase).
- **Fallback: CPU + Canvas2D.** If `navigator.gpu` is unavailable or init fails,
  the **same** driven-Kuramoto simulation runs on the CPU at a small lattice
  (92×62 ≈ 5.7k cells) and draws additive points through the same warp. A
  `text-destructive` notice states the fallback is active, but it keeps running
  and — because audio is driven by the shared engine, not the renderer — stays
  audible. (No full-screen fragment shader anywhere; that surface is banned this
  cycle.)

## Cycle plan (multi-cycle commitment)

- **Cycle 1 (this):** the traveling-wave engine + log-polar breathing +
  see==hear tones + the REBUS arc. Done.
- **Cycle 2:** richer multi-source interference + genuine spiral waves + the
  "attentional" wave-direction flip wired to a real input (pointer / key), and a
  matching Shepard direction reversal.
- **Cycle 3:** palette / bloom polish, fully spatialised bells, and a legible peak
  "melt" (field decoherence read as a visible dissolve).

## Known limitations (honest)

- **Headless-unverified feel.** eslint + tsc are clean, but this was built without
  a live GPU / audio device in the loop, so the exact tightness of the see==hear
  coupling and the perceived intensity of the melt are unverified by ear/eye.
- At the peak, the lattice deliberately decoheres from the analytic drive, so
  see==hear is tightest at onset and loosens (by design) into the melt.
- The Shepard glissando direction is fixed at construction; the wave-direction
  flip is a cycle-2 feature, so for now direction only folds into brightness.
- The research anchor is ~6 months old (see above).
