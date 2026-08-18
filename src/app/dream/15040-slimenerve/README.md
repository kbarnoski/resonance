# 15040 · slimenerve

**The one question:** *What if your recording grew its own nervous system?*

A swarm of ~200,000 physarum (slime-mold) agents forages across the screen and
self-organises into a living transport network — a filament web driven, live, by
one of Karel's real piano recordings. The emergent network is a **portrait of the
piece's form growing over its duration**, not a fader bank or a mixer.

## What it is

Physarum polycephalum, a single-celled slime mold, builds efficient transport
networks with no brain at all: it lays a chemical trail and follows the strongest
trail it can sense. Jones (2010) reduced that to a swarm of trivial agents on a
shared 2D trail-map, and the same emergent filament web appears. Here that whole
model runs on the GPU, and Karel's music shapes how the network grows.

## How it reads Karel's music

Audio is his **real catalog** only — routed through the shared `safeMaster`
safety bus, never to `ctx.destination` directly, and looped so the piece runs
unattended. Every frame the visuals read `master.analyser` (fftSize 1024):

- **Spectral flux + high-frequency energy** → *sharpen the sensor angle and raise
  deposit strength*. Busy, bright passages knot the net into tight, nervy
  filaments; calm passages widen the sensors and let the web breathe.
- **Loudness (RMS)** → *agent move speed and overall trail brightness* — the web
  quickens and glows with the dynamics.
- **Chord changes** (from `loadTrackAnalysis`, when available) → periodically
  *re-seed bright "attractor" nodes* the swarm grows toward, so the network
  reorganises at the recording's real structural seams. The chord's root nudges
  where the node lands.
- **Pointer drag** → drops a bright **food attractor** into the trail-map that the
  swarm reaches for and rewires around.

## The technique (all WebGPU / WGSL)

Agents live in a GPU storage buffer (`pos.xy`, `heading`). Two compute passes per
frame, ping-ponging two trail buffers:

1. **Agent pass** (`@workgroup_size(64)`): each agent senses the trail at three
   points ahead (forward, +sensorAngle, −sensorAngle), steers toward the
   strongest, moves forward, wraps **toroidally**, and deposits into an
   `atomic<i32>` fixed-point trail buffer (`atomicAdd`, so many agents can write
   the same cell safely).
2. **Diffuse + decay pass** (`@workgroup_size(8,8)`): a 3×3 blur times a decay
   factor grows and fades the classic filament web, and additively injects the
   live food attractors as Gaussian wells.

A **render pass** bilinearly samples the trail buffer and applies a silver tone
curve (`1 − exp(−v·gain)`) over near-black. WebGPU is the whole point — there is
**no Canvas2D or CPU fallback** for the art path.

- **Trail grid:** sized to the viewport aspect, capped at 1024 on the long side
  (rounded to a multiple of 8 for the workgroup tiling).
- **Agents:** 200,000.

## Palette

Achromatic **silver luminance on near-black** — a deliberately rare, essentially
monochrome register for this lab. Only a faint cool tint lifts the very brightest
filament peaks. No warm/amber/gold, no rainbow.

## Named reference / lineage

- Jones, J. (2010). *Characteristics of pattern formation and evolution in
  approximations of Physarum transport networks.* Artificial Life 16(2), 127–153.
- Sage Jenson's `mold` physarum visuals as visual lineage.

## How it degrades

- **No WebGPU** (`navigator.gpu` / adapter / device unavailable) → an on-brand
  `text-destructive` notice ("This piece needs WebGPU — try desktop Chrome/Edge"),
  not a broken canvas.
- **No published chord map** for a track → the network re-seeds on a spectral-flux
  novelty spike instead; audio still plays the real recording.
- **Audio load failure** → an inline `text-destructive` message, never a thrown
  error.
- **`prefers-reduced-motion: reduce`** → slower agents, gentler turns, and
  longer, calmer attractor lifetimes. Brightness drifts smoothly; nothing
  strobes (no flashing above ~3 Hz).

## Teardown

On unmount: cancel the RAF, `source.stop()` + `disconnect()`, `master.disconnect()`,
`ctx.close()`, and destroy the WebGPU device plus every buffer (agents, both trail
buffers, the sim and attractor uniforms). No audio survives leaving the page.
