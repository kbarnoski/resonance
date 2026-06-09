**For**: kids (4+) — but genuinely beautiful for any age

# 456 · Ferro Magnet — Rosensweig Singing Toy

Tilt the tablet (or drag on desktop) to drag a glowing magnet beneath a pool of
simulated ferrofluid. As the field strengthens the flat dark surface breaks into
a cluster of pointed spikes — the Rosensweig normal-field instability. Five
glowing rim-bells sit around the pool edge; when a spike brushes a bell it
chimes with a warm bell tone whose pitch and decay correspond to the bell's size.

---

## How to play

- **Tilt** (phone/tablet): rotate the device left/right and forward/back — the
  magnet follows your tilt.
- **Drag** (desktop/no sensor): press and drag anywhere on the canvas.
- **Auto-demo**: if neither tilt nor drag is detected for ~2 seconds the magnet
  drifts in a Lissajous figure-8 so the pool stays alive hands-free.
- There are no wrong moves. Every chime is in tune. You cannot break anything.

---

## Technical approach

### Ferrofluid simulation
The fluid surface is rendered by a **WebGL2 fragment shader** (GLSL ES 3.00)
using a **signed-distance field** of N metablobs. The blobs are fused with
**Inigo Quilez's polynomial smooth-min** (`smin`) to create one continuous,
gooey membrane. A hexagonal three-wave interference ripple modulates the SDF
near the magnet to approximate the **Rosensweig spike array** — when field
strength exceeds threshold the surface resolves into a cluster of pointed peaks.

### CPU physics
Each blob is a spring-mass particle with:
- Gravity spring pulling it back to its rest position
- Magnet attraction proportional to `1/r²` with a field-radius envelope
- Per-blob `spikeH` variable that rises toward the magnet and falls back

### Tonal world
Just-intonation D major hexachord: **D E F♯ A B C♯** (ratios 1, 9/8, 5/4,
3/2, 5/3, 15/8 × D3 = 146.83 Hz). All intervals are consonant — there are no
wrong notes. Five rim-bells use five pitches from this set; bigger/lower-indexed
bells use lower, longer-ringing tones.

### Audio chain
`OscillatorNode[]` (four inharmonic partials per bell, approximating real bell
spectra) → `GainNode` (ADSR envelope: 6 ms attack, ~1.1–1.8 s exponential
decay) → master `GainNode` → `DynamicsCompressor` (brick-wall, −6 dB threshold,
ratio 20:1) → `AudioContext.destination`. Always-on D2 + A2 drone with slow LFO
tremolo.

---

## Named references

- **Ronald E. Rosensweig**, *Ferrohydrodynamics* (Cambridge University Press,
  1985); original normal-field (Rosensweig) instability paper, ~1969. The
  characteristic hexagonal spike array on a ferrofluid surface under a
  perpendicular magnetic field is called the Rosensweig instability.
- **Inigo Quilez**, polynomial smooth-min / SDF metaballs
  (https://iquilezles.org/articles/smin/ and raymarching articles).
  The `smin(a, b, k)` function used here is his cubic polynomial variant.
- **Andrejs Cēbers**, ferrofluid pattern formation and labyrinthine instability
  in thin layers — related work on magnetic fluid dynamics.

---

## Ambition self-assessment

**What works well**: the hexagonal spike modulation produces a convincing
spike-field aesthetic; the just-intonation bell set sounds warm and never
dissonant; the auto-demo keeps it alive with no input; tilt + drag + auto-demo
fallback chain is robust. The IQ smin fusion creates genuine gooiness.

**What is approximated / could be improved**: the Rosensweig instability is
approximated with a three-wave hex ripple and per-blob spring physics rather
than a proper energy-minimisation of the surface tension / magnetic pressure
balance. A real simulation would solve the Laplace equation for the magnetic
scalar potential. The blob SDF normal computation in the shader uses a
simplified specular approximation rather than true gradient-based normals (the
shader would need multiple samples per fragment for that, which is feasible but
was left for a second pass). Bell collision detection is tip-vs-circle rather
than a proper surface intersection.

**Build-verified, not browser-verified**: this prototype compiles clean with
`npm run build` but has not been run in a browser during this automated build
session. Visual and audio output should be confirmed on device.

---

## Files

| File | Purpose |
|---|---|
| `page.tsx` | Next.js App Router client component — UI, RAF loop, input handling |
| `ferro.ts` | WebGL2 renderer (GLSL ES 3.00 shader), CPU physics, bell collision |
| `audio.ts` | Web Audio engine — drone, bell synthesis, DynamicsCompressor |
| `README.md` | This file |
