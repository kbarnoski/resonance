# Mosaic Field

Fly a sphere-gate through a volumetric 3-D cloud of your own piano recording's notes and re-sequence the performance in space — the order your motion sweeps the cells, not the original timeline, becomes the music.

**Status**: demoable

## What it is

Karel's take is shattered into a GPU point cloud of its **own** note-events. Every note becomes a **cell** — a `[time, time + duration]` window of his decoded buffer — floating in a genuinely volumetric field:

- **Y = pitch** (MIDI register, the dominant vertical read)
- **Z = time** (the original timeline extruded into depth, so you fly *into* it)
- **lateral spread = pitch-class**, placed on a circle-of-fifths rosette whose radius grows with velocity (louder notes fan wider)

You fly a translucent, billboarded **sphere-gate** through the cloud under the pointer: **X → the lateral arm you sweep, Y → how deep into time you fly**. Every cell whose 3-D position falls inside the gate ellipsoid **re-triggers its own slice** of his audio via a `BufferSourceNode.start(when, offset, dur)` at `playbackRate = 1` — his real pitch, untransposed — with a short click-free attack/release envelope. The result is **concatenative re-sequencing / musaicing**: the piece you hear is ordered by where you move, not by his original performance. **Every sound is a slice of his decoded take; nothing is synthesized** (no oscillators, no filters-as-the-engine).

Voice discipline: **≤12 simultaneous voices with oldest-first voice-stealing**, plus a **~320 ms per-cell cooldown** so the gate *phrases* instead of machine-gunning. Dragging (or opening your hand) widens the gate to catch more cells at once.

## Controls

- **Pointer-first (primary):** move to fly the gate, drag to widen it. Arrow keys + Space work too (a11y). The pointer path is 100% functional and audible with **no camera**.
- **Camera (labelled secondary enhancement):** one-hand MediaPipe tracking; your index/hand center overrides the **same cursor** the pointer writes, and hand openness widens the gate. The on-screen status line always says whether it is `tracking · live`, `hand lost — pointer still works`, or `pointer · live`.
- **Idle:** with no pointer and no hand, the gate sweeps itself on a slow Lissajous so the field is never silent — and the status line **labels it `idle`** so autonomous motion is never mistaken for live tracking.

## Look

Deliberately **not** a violet-glow-on-black sketch. The register reads as a dimensional volume you move through:

- crisp disc cells with **`NormalBlending`** and **`depthWrite`** (real occlusion — nearer cells hide farther ones), **no additive bloom**
- a cool slate-indigo **`FogExp2`** haze that dissolves distance into atmosphere (background is lifted off pure black)
- **size-attenuation** + a **parallax camera sway** flying through the cloud
- a faint persistent starfield for parallax depth, and a restrained cool indigo→violet color ramp by pitch

Audio-reactive shimmer (a subtle global size lift) is driven from `safeMaster.analyser`.

## Graceful degradation

- **No WebGL →** a `text-destructive` notice; nothing starts, no crash.
- **Audio load throws →** a designed `text-destructive` message; the context is closed cleanly.
- **Analysis null or < 20 notes →** the buffer is chopped into ~72 equal-window **grid-slices** (still his audio); the readout shows `grid-slices` vs `note-cells`.
- **Camera denied / model fails / no hand →** the pointer keeps full control with a visible mono status line.
- **Unmount →** geometries/materials/renderer disposed + `forceContextLoss()`, `ctx.close()`, camera tracks stopped, rAF cancelled, all voices stopped.

## Audio routing

Every voice terminates at `createSafeMaster(ctx).input`; nothing connects to `ctx.destination` directly (safeMaster owns the destination). Visual shimmer is read from `safeMaster.analyser`.

## References

A proximity-gate unit-selection **inspired by** — not a reimplementation of — the corpus-based concatenative synthesis lineage:

- **Diemo Schwarz — CataRT** and the **AudioGuide** musaicing tradition (corpus-based concatenative synthesis / descriptor-space unit selection).
- **"The Concatenator"** — Tralie & Cantil, ISMIR 2024 — real-time Bayesian musaicing.
- **DAFx26** (Abate & Hansen, Sept 2026) — gesture-traversed corpus browsing via self-organizing-map traversal ("concatenation-driven convolution"), which this piece's spatial gate-sweep echoes.

Here the "descriptor space" is simply the literal 3-D layout of his own notes (pitch / time / pitch-class), and the "unit selection" is spatial proximity to the gate — a legible, embodied take on the same core idea: re-sequence a corpus by moving through it.
