# 10184 · Ferrobloom

**The one question:** *What if your voice were a magnet — and singing raised a
field of living metal spikes from a pool of ferrofluid that ripples, peaks, and
rings under the pull of your own sound?*

A voice-driven **Rosensweig (normal-field) ferrofluid instability**, simulated
as a WebGL2 height field and shaded as warm liquid metal. Sing louder and the
"magnetic field" crosses its critical threshold; a flat pool destabilises and
self-organises into a hexagonal lattice of molten spikes that the field answers
in inharmonic bell-metal.

---

## The model — Rosensweig instability as structure

The surface is a height field `h(x, y)` stored on **ping-pong WebGL2 framebuffer
textures** and evolved by a fragment shader. The evolution rule is a
**Swift–Hohenberg form** of the normal-field instability:

```
∂h/∂t = r·h − (1 + s²∇²)² h + g·h² − h³ + forcing
```

- **`(1 + s²∇²)²`** is the pattern-forming operator. It makes a *preferred
  spatial wavelength* neutrally stable and damps everything else — this is the
  capillary-vs-magnetic balance that sets the ferrofluid peak spacing. `s²`
  controls that wavelength.
- **`r`** is the control parameter = the **effective magnetic field**. For `r < 0`
  the flat interface (`h = 0`) is stable — a mirror pool. Cross `r ≈ 0` and the
  preferred wavelength grows: spikes erupt.
- **`g·h²`** is the quadratic term that breaks up/down symmetry, so the winning
  pattern is a **hexagonal lattice of UP-spikes** — exactly the classic
  Rosensweig peaks, not a symmetric ripple. **`−h³`** saturates their height.
- State is packed as `(h, q)` with `q = s²∇²h` from the previous step, so the
  biharmonic `∇⁴h` the operator needs is available in a single pass (`∇²q`).

Rendering reconstructs **surface normals** from the height gradient and shades
screen-space **liquid metal**: dark bronze/basalt base, amber/copper/gold
Blinn speculars (a tight hot highlight on the sharpest facets), a Fresnel copper
rim, ambient-occluded valleys, and a **faint slow heat-glow** at concave peak
tips. It reads as a real 3D spiky molten surface, not a flat texture.

Sim grid: 160². dt 0.04, 3 substeps/frame — chosen so the explicit biharmonic
stays inside the stability bound across the whole `s²` range.

## How the voice drives it (the sensor)

The **microphone is a real sensor**, analysed every frame (`mic.ts`):

| Feature | Drives | Effect |
|---|---|---|
| **RMS loudness** | `r` — magnetic field strength | Louder → past critical → more / taller spikes |
| **Spectral centroid** (brightness) | `s²` — lattice spacing | Brighter voice → smaller `s²` → finer, tighter spikes |
| **Onsets** (spectral flux) | forcing injection | Each attack seeds a ripple/disturbance on the surface |

## The audio — inharmonic metal (`audio.ts`)

Deliberately **not** just-intonation or pentatonic. The material is struck/bowed
metal:

- A **singing-bowl partial bank** on non-integer, non-JI ratios
  `[1, 2.41, 3.83, 5.17, 6.63, 8.21]`, each with a detuned twin for metallic
  beating. Level, brightness (a tracking lowpass) and roughness all follow the
  **field energy** — the more supercritical the pool, the brighter and rougher.
- A **low ferric drone** (two detuned low voices through a soft lowpass) that
  breathes with the field but never drops out — **never silent**.
- A bright **inharmonic "ting"** `[1, 2.76, 5.4, 8.93]` fired on every **spike
  birth** (onsets, plus a seeded birth schedule while strongly supercritical).

Everything routes through the shared **`createSafeMaster(ctx, { gain: 0.16 })`**.

## Degrade ladder

1. **Mic granted** → your voice is the magnet. Full experience.
2. **Mic denied / unavailable** → a **seeded mulberry32 breathing LFO** (seed
   `0x10184`) drives `r` up and down across the threshold, so a muted phone still
   watches spikes rise and fall and hears the metal. Badged `text-destructive`.
3. **No float render targets** (`EXT_color_buffer_float` absent) → falls back to
   an **8-bit packed** height/curvature encoding (two 16-bit values per texel).
   Badged.
4. **No WebGL2 at all** → a warm CSS gradient backdrop + `text-destructive`
   notice; **audio and controls stay alive**.

The self-demo runs **silently on mount** (visual only, no gesture needed); audio
starts on the first button press (autoplay policy).

## Named references

- **Cowley & Rosensweig, "The interfacial stability of a ferromagnetic fluid,"
  *J. Fluid Mech.* 30 (1967)** — the normal-field (Rosensweig) instability and
  its hexagonal spike lattice; the physics this piece animates.
- **Robert Leitl's WebGL ferrofluid experiment** — the web-technique lineage for
  a browser ferrofluid.
- Swift–Hohenberg is used as the numerically-friendly wavelength-selecting proxy
  for the full magnetostatic surface problem (a standard reduction for real-time
  hexagon formation).

## Ambition criteria (honest 4/5)

1. **Never-used technique — NOT CLAIMED (honest).** The Rosensweig / normal-field
   instability was already built once as the paused-track *kids* toy
   `456-kids-ferro-magnet` ("Rosensweig Singing Toy" — tilt/drag a magnet under a
   small 2D spike-cluster with rim-bells), so this is NOT grep-0 and #1 is
   declined. The fresh value here is the **inversion + re-registering**: your
   *voice is the magnet* (sing to cross the critical field), a real **WebGL2
   height-field hex-lattice** (Swift–Hohenberg wavelength selection, not a handful
   of drawn spikes), warm liquid-metal screen-space shading, and **inharmonic
   struck-metal** audio — an adult, sensor-driven instrument, not a kids toy.
2. **≥3 subsystems — HIT (4).** Mic analysis + Rosensweig height-field sim +
   WebGL2 metallic screen-space render + inharmonic metal synth.
3. **Named reference — HIT.** Cowley & Rosensweig (1967) + Leitl, cited above.
4. **Multi-cycle commitment — CLAIMED.** Designed to deepen over 2–3 cycles.
   Cycle-2: a **second steerable magnetic pole** (drag a pointer to add a local
   field maximum the spikes lean toward) + spatialized per-region metal voices;
   cycle-3: true traveling capillary ripples via a wave term + polish.
5. **Fresh research — HIT.** This cycle's (§1098) metallic sound↔structure dive:
   the Rosensweig instability as a voice-playable instrument.

**Honest floor: 4/5 (#2 + #3 + #4 + #5), #1 explicitly declined.**

## Honest limits

- Swift–Hohenberg is a *phenomenological* stand-in for the full magnetostatic +
  Navier–Stokes ferrofluid problem: it nails the wavelength selection and hex
  up-spikes but is relaxational, so onset "ripples" are injected local
  perturbations that seed spikes rather than fully-modelled traveling waves.
- Audio energy is driven from the same control signals (field / centroid) rather
  than a per-frame GPU read-back of the height texture, to avoid a stall — so the
  ting rate is a faithful proxy for spike births, not a literal count.
- 160² grid keeps spikes readable and the biharmonic stable; a much finer lattice
  would need a semi-implicit solver.

## Files

- `page.tsx` — chrome, control mapping, rAF loop, degrade ladder, teardown.
- `webgl.ts` — WebGL2 backend: ping-pong Rosensweig sim + metallic render;
  float/packed paths.
- `audio.ts` — inharmonic singing-bowl bank + ferric drone + spike-birth ting.
- `mic.ts` — microphone RMS / centroid / onset analysis on the shared context.
