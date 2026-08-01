# 4952 · Confluence — the meeting of the waters

## The one question

When two rivers meet, their waters don't instantly blend. A coherent **mixing
interface** — a shear layer — persists downstream for a long way before the two
identities finally merge. **Can you SEE two watersheds erode themselves, meet at
a confluence, and HEAR the two river-voices flow side-by-side and only gradually
braid into one?**

This is the "meeting of the waters" extension of the single-watershed peak
`4776-contour`: two coupled basins, a shared confluence, and the persistent
downstream mixing interface — rendered as a Canvas2D shaded-relief map.

## What it is

A shared droplet hydraulic-erosion engine carves a seeded heightfield in real
time. This face re-moulds the engine's single dome into **two source mountains**
divided by a central ridge that fades before a bottom-centre spillway, so each
basin grows its own dendritic river tree and both drain to **one confluence**
before leaving the map. Downstream of that confluence a **mixing-interface
model** draws the trunk as two colour-tinted threads (basin A cool violet, basin
B warm/magenta) that run side-by-side and braid into a single mid-violet ribbon —
the seam persisting further when the two basins are more unequal.

The two basins' spines are also sonified: two panned marimba voices that pan to
centre, rise to the same octave and merge into one loop as the interface resolves
— **two-becoming-one**.

## How to use it

- The map **auto-runs on load**: it pre-warms the erosion so two river trees, a
  confluence and the braided seam are already visible within the first second,
  silently (browser autoplay policy). A cold reviewer sees the whole story
  hands-free.
- **Start · rain with sound** — unlocks Web Audio and starts the two spine
  voices. Press again to fall back to the silent demo. The simulation never
  stops.
- **Drag on the map** — "rain here": a soft brush concentrates rainfall under
  your finger, carving a starter valley the sim elaborates. This is the primary
  input (pointer / touch — no keyboard, no mic).
- **Reseed** — a fresh two-peak terrain from a new deterministic seed (rebuilt at
  the current contrast).
- **Basin contrast** slider — the research knob. Higher contrast makes the two
  mountains more unequal; the mixing seam survives further downstream and the two
  voices take longer to resolve into one. This live-controls the interface
  persistence and the audio convergence; the terrain inequality applies on the
  next Reseed.

Give it minutes — minute five looks and sounds nothing like minute one: channels
deepen, the confluence sharpens, and the braided seam lengthens then slowly
resolves.

## The technique

- **Erosion (shared engine).** Thousands of water droplets pick up sediment on
  steep ground and drop it on flat ground, mutating a heightfield and a
  flow-accumulation field each frame. Imported read-only from
  `../_shared/erosion/engine` — not re-implemented.
- **Two-basin coupling.** The engine's dome bias is a known closed form, so we
  recover its fractal-ridge texture and re-mould it into two Gaussian peaks, a
  fading central divide, a bottom-centre spillway trench, and containment rims so
  the only outlet is the shared confluence mouth. The confluence therefore
  *emerges* from the shared `erode()` — both basins cut channels that meet.
- **Mixing-interface model (the novel subsystem).** Along the trunk downstream of
  the confluence we model a 1-D relaxation of the A|B interface,
  `sep(s) = e^(−s/L)`, where `s` is normalised downstream distance and `L` is a
  persistence length set by the basin contrast. At the confluence the two threads
  are fully separated (`sep = 1`, pure cool / warm colours at ±half-width); as `s`
  grows they converge to the centreline and their colours lerp to the merged
  mid-violet (`sep → 0`) — a visible, legible "meeting of the waters" seam.
- **Sonification.** Each basin's spine (source → mouth) is resampled by altitude
  into a marimba loop — A darker/panned-left, B brighter/panned-right. As the
  interface resolves the voices pan to centre, rise to a common octave and play
  the merged loop. `drainageMaturity()` moves both loops from sparse/searching to
  a settled pentatonic over a low drone; live carve events add sparse, panned
  accents. Voices are capped and bussed through a compressor.

## Output constraints (tags)

- **INPUT** — pointer / touch "rain here" drag. Not keyboard, not mic.
- **OUTPUT** — Canvas2D shaded-relief raster (hillshade + glowing rivers + the
  braided mixing interface). Not inline SVG, not WebGL/WebGPU.
- **TECHNIQUE** — droplet hydraulic erosion (shared engine) + two-basin
  confluence coupling + a downstream mixing-interface relaxation model.
- **VIBE** — cartographic / geological / "meeting of the waters", long-form and
  evolving.

## Deterministic by contract

All randomness comes from `mulberry32(...)` seeded from a fixed constant
(`0x4952`); timing uses only `performance.now()` / `AudioContext.currentTime`. No
`Math.random`, `Date.now`, or `new Date`. The seeded auto-demo self-runs on load.
Degrades gracefully: no Web Audio → the map still carves itself in silence with a
`text-destructive` notice; no pointer → the auto-demo carries the story. The rAF
loop is cancelled and the AudioContext closed on unmount.

## References

- F. K. Musgrave, C. E. Kolb & R. S. Mace, "The Synthesis and Rendering of
  Eroded Fractal Terrains," *SIGGRAPH* 1989 — the founding hydraulic-erosion idea.
- X. Mei, P. Decaudin & B.-G. Hu, "Fast Hydraulic Erosion Simulation and
  Visualization on GPU," *Pacific Graphics* 2007 — the shallow-water formulation.
- Jiang et al., "A Numerical Study of the Effects of Density Contrast on Flow,
  Turbulence, and Mixing at the Negro/Solimões Confluence, Brazil," *Water
  Resources Research* (2026), doi:10.1029/2025WR041934 — the confluence-mixing
  science this piece's interface model implements: density/velocity contrast
  governs how far downstream the two waters stay distinct.
- Horton (1945) / Strahler (1952), stream ordering — background for basin spines.
- The real-world **"Meeting of the Waters" (Encontro das Águas)** at Manaus,
  where the black Rio Negro and the tan Solimões flow side-by-side for ~6 km
  before mixing — the phenomenon this renders.
