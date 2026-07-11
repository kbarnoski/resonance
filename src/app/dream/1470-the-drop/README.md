# 1470 · The Drop

## The one question
**What if self-organized criticality were an instrument you play — grains rain
onto a landscape, slopes steepen invisibly to a critical angle, then TOPPLE in
scale-free avalanches, and the avalanches ARE the music: mostly tiny ticks, the
rare "big one" a full-spectrum drop?**

This is the ecstatic **build-and-drop** (the EDM riser → drop) rendered as real
physics. Tension accumulates to a threshold and discharges in a cascade whose
size follows a power law, so the piece **composes itself and never loops**. The
pole is **intense / kinetic / ecstatic** — a hot molten-ember landscape that
builds and releases, not a cosmic void that dissolves.

## The technique — an abelian sandpile (SOC)
A CPU **abelian sandpile** on an 80×80 integer grid `h[x][y]`
(**Bak–Tang–Wiesenfeld**, *Self-Organized Criticality*, Phys. Rev. Lett. **59**,
1987; Per Bak, *How Nature Works*, 1996):

- Each frame **drives** the pile — but only while it is **quiescent**. This is
  the canonical slow-driving SOC protocol: a grain is rained, the resulting
  avalanche is allowed to fully relax, then the next grain falls. Continuous
  fast driving would smear every cascade together and destroy the power law.
- A cell with `h ≥ 4` **topples**: `h −= 4`, and each of its 4 orthogonal
  neighbours gets `+1`. Grains that fall off the edge are lost (open boundary).
- The relaxation is **budgeted** (≤3500 topples/frame) and **carried forward**:
  a huge cascade unfolds over several frames as a visible wave of light rather
  than resolving in one hitch. Unfinished cells stay on the work stack.
- **Avalanche size** = the number of topple events in a cascade. Because the
  pile self-organizes to its critical state, these sizes are **power-law
  distributed** — most drives topple nothing or a few cells; rarely one grain
  triggers a cascade that sweeps the whole terrain. That distribution is the
  self-composing rhythm.
- **Tilt** leans the pile via a light *directed-sandpile* bias (cf. Dhar &
  Ramaswamy, PRL 1989): a toppling cell occasionally redirects its uphill grain
  downhill (the 4-grain sum is preserved), so avalanches drift with gravity.

Everything is **deterministic**: a seeded `mulberry32` PRNG places every grain;
`performance.now()` only advances animation time. No `Math.random`, no `Date`.

## The render — three.js instanced-column terrain
A three.js **scene-graph** (not a fragment shader, not Canvas2D): one
`THREE.InstancedMesh` of 80×80 unit columns.

- Each column's **height = its grain count** (`instanceMatrix` Y-scale); each
  column's **colour** is an ember ramp by height with a **white-hot highlight**
  driven by a per-cell "heat" field that spikes when the cell topples and decays
  smoothly (`instanceColor`). An avalanche is therefore a wave of light rippling
  across the landscape.
- Unlit `MeshBasicMaterial` — nothing can render black from a lighting
  misconfiguration. The camera drifts slowly over the terrain (frozen / sub-Hz
  under reduced motion). Background/fog are near-black molten ember, and a big
  drop lifts a uniform ember bloom across the whole terrain.
- WebGL init is guarded **three ways** (capability check, constructor
  `try/catch`, `getContext()` null-check). If WebGL is unavailable the visuals
  degrade to a `text-rose-300` notice and the audio still plays (audio is
  render-independent).

## The audio — build and drop (Web Audio)
Master gain ramps from silence to ≤0.2 through a `DynamicsCompressor` limiter;
≤14 concurrent voices (oldest stolen). Gesture-gated behind **Begin**.

- **Riser (build):** the tension scalar is a **"reload" sawtooth** — grains
  accumulated since the last big release. It climbs as the pile reloads and
  collapses when a big one drops. (Physical criticality pins mean height at
  ~2.1, so a criticality *measure* can't drive a riser; the reload cycle can,
  and it stays honestly coupled to the SOC timing — sometimes a quick reload,
  sometimes a long build to a huge release.) Tension opens the shared
  `startDroneBank` bed's filter and raises an **accelerating pulse** (~0.5 Hz at
  rest → ~6 Hz at full tension). A live low **rumble** bed tracks the per-frame
  topple rate, so a big cascade audibly builds as it unfolds.
- **Drop (release):** each settled avalanche's **size** picks the release —
  - tiny (`< 40`): a granular **tick** (band-passed click) — the shimmer,
  - small (`< 500`): an airy **swell** (band-passed noise + tone),
  - medium (`< 2600`): a clean, punchy **drop** (short inharmonic tom + noise
    transient, no sustained sub, so frequent drops stay clean),
  - large (`≥ 2600`): the rare **full-spectrum DROP** — sub-bass thud with a
    downward pitch envelope + an **inharmonic chord bloom** + a downward noise
    sweep, and the terrain flashes.

  Measured over a long run: ~9–10 events/sec (mostly ticks), a punchy drop
  every ~2 s, and a full-tension mega-drop roughly every ~14 s.
- **Pitch is continuous and inharmonic.** Base pitches glide via
  `setTargetAtTime` from the cascade's spatial centroid/extent, and the chord
  uses stretched **drum-membrane-like partial ratios** `[1, 1.593, 2.135,
  2.295, 2.917, 3.5]`. No JI, no pentatonic, no scale index, no 12-TET.

## Input model
- **Pointer / tap-drag:** raycast to the ground plane and **pour grains** where
  you point.
- **Space:** a **seismic shock** — nudge ~55% of the pile one grain toward
  toppling (a deterministic subset), usually setting off a big cascade.
- **Device tilt** (`deviceorientation`, phones): leans gravity so avalanches
  drift downhill. **Desktop fallback:** arrow keys apply the same tilt.
- **Self-plays with no input:** grains auto-rain every frame, so it is never
  blank/silent and avalanches fire on their own — it idle-demos on a phone with
  no interaction.

## Safety
No strobe: the topple "flash" is emissive/luminance **drift** (heat decays over
many frames; the big-drop bloom decays at ≤3 Hz), never a hard on/off flicker.
`prefers-reduced-motion` freezes the camera drift and slows the flash decay.
Full teardown on unmount: cancel RAF, stop/disconnect every oscillator + the
rumble source, ramp and `close()` the `AudioContext`, dispose all three.js
geometries/materials/renderer, lose the GL context, remove every listener.

## Known limitations & honesty
- Pointer→grid pouring raycasts the ground plane, so grains land under the
  column footprint you clicked; on very tall columns the visual "pour point" can
  look slightly offset from where the spike is.
- Redrawing all 6400 instance matrices + colours every frame is CPU-side; on a
  weak device the frame rate can dip. Pixel ratio is capped at 2×.
- The directed-tilt bias is a light embellishment on the canonical BTW rule; a
  strong tilt slightly perturbs (does not preserve exactly) the pure isotropic
  power-law statistics — a deliberate playability trade.
- Avalanche "size" counts topple *events* (a cell that topples twice counts
  twice), which is the standard SOC size measure and what drives the audio.
- The rare truly-huge cascade is genuinely rare (that is the physics); if you
  want to force the drop, press Space.

## Lineage
Abelian sandpile / self-organized criticality — **Bak, Tang & Wiesenfeld**,
PRL 59 (1987); Per Bak, *How Nature Works* (1996). Directed variant — Dhar &
Ramaswamy, PRL 63 (1989). Built with `three` (InstancedMesh) + the Web Audio API
+ React only; the drone bed is the lab's shared `_shared/psych/droneBank`.
