# 283 · Piano Isosurface

**What if a piano performance — ideally Karel's real Welcome Home recordings — sculpted a living 3D isosurface in real time:** sound becoming a breathing volumetric blob you watch fold, swell, and split as the music moves?

This prototype routes audio into an FFT analyser, splits the spectrum into bands, and uses those bands to drive a field of metaballs inside a **three.js Marching Cubes** volume. The marching-cubes algorithm extracts a smooth isosurface from that field every frame, so the music literally re-sculpts a single connected 3D form — bass swells a central core, mids orbit around it, highs flick small flecks at the edges, and the whole thing breathes with overall loudness.

## What's novel here (clears the floor)

- **(1) Technique never used in the lab before.** This is the first **marching-cubes / volumetric isosurface extraction** prototype in Resonance. Every prior visual was meshes, particles, shaders, or 2D canvas — none reconstructed a surface from a scalar field.
- **(3) Named reference.** Built directly on **Lorensen & Cline 1987** (see below).
- **(2) ≥3 distinct subsystems** (see list).
- **(5) Built from this cycle's recent-research hook.** GPU-parallel marching cubes in the browser is now real-time (2024 work, below), which is what makes a *sound-driven* isosurface feasible live rather than as an offline bake.
- Uses **Karel's real Welcome Home music** via the loved `163-paths-visualizer` track-id pattern (read-only `/api/audio/[id]`), continuing the 163 / 227 / 243 cluster.

## Subsystems

1. **Multi-source audio input** — four ways in, with an always-on fallback so it's never silent:
   - **File drop / picker** → `decodeAudioData` → looping `AudioBufferSourceNode`.
   - **Mic** → `getUserMedia` → analysis only (never routed to destination).
   - **Track id** → `fetch("/api/audio/<id>")`, handling both JSON `{ url }` (then fetch + decode that url) and raw audio bytes (`arrayBuffer()` → decode). This is Karel's path to feed his real piano.
   - **Generative D-dorian synth pad** — a few detuned voices with slow note changes, playing from the first Start gesture so the surface is alive with no input. Non-pentatonic on purpose.
2. **FFT band + centroid analysis** — one `AnalyserNode` (fftSize 2048). Each frame computes 5 frequency bands (sub / bass / low-mid / high-mid / high), overall RMS (from the time domain), and a normalized **spectral centroid**.
3. **Marching-cubes metaball field** — `MarchingCubes(48, …)`; each frame `reset()`, then ~8 `addBall` calls whose positions orbit slowly and whose strengths are driven by the bands; bass pulses a central ball, mids orbit at mid radius, highs are small fast flecks. RMS drives global scale + isolation; centroid drives material hue (cool/deep when dark → warm/bright when brilliant).
4. **three.js render** — `WebGLRenderer({antialias:true})`, `MeshStandardMaterial` with emissive glow, two directional lights + ambient, fog, slow auto-rotation, and hand-rolled pointer-drag orbit. Dark clear color, resize handling.

## Named references

- **William E. Lorensen & Harvey E. Cline, "Marching Cubes: A High Resolution 3D Surface Construction Algorithm," SIGGRAPH 1987** — the algorithm that turns the scalar metaball field into a polygonal isosurface. three.js's `MarchingCubes` addon is a direct descendant.
- **Freshness anchor:** WebGPU / WebGL marching cubes now runs at near-native speed in the browser — Will Usher, *"WebGPU Marching Cubes"* (2024) and his Twinklebear GPU-parallel marching-cubes work. GPU isosurface extraction being real-time in a browser is precisely what makes a *sound-driven*, per-frame isosurface feasible live; this is the cycle's research hook.
- **Refik Anadol** — data and sound rendered as volumetric living form; the contemplative, organic vibe this aims for.

## How it degrades

- **No WebGL** → a `text-rose-300` notice; the HUD still works, the surface simply cannot render.
- **Mic denied** → `text-rose-300` notice + the synth pad keeps driving the surface.
- **File decode failure** → rose notice + synth fallback continues.
- **Track fetch/decode failure** → rose notice naming the id + synth fallback continues.
- The synth pad starts on the first Start gesture, so there is never a silent or frozen surface.

## Honest limits

- **Marching-cubes resolution (48) is a perf/quality tradeoff.** Higher resolution looks smoother but costs CPU every frame (the addon polygonizes on the CPU). 48 keeps it fluid on a laptop; very busy scenes can dip.
- **The band → metaball mapping is hand-tuned**, not derived. The orbit speeds, radii, strengths, and the centroid→hue curve are aesthetic choices, so different material (a dense orchestral mix vs. solo piano) may want different gains.
- **Centroid normalization is approximate** (bin index / bin count), good enough to separate "dark" from "brilliant" but not a calibrated brightness measure.
- The hand-rolled orbit is intentionally minimal (yaw/pitch on drag, plus auto-rotate); it is not a full OrbitControls with zoom/pan.

## Next-cycle deepening

- **WebGPU compute isosurface** — move the field evaluation + marching cubes to a compute shader for much higher resolution at frame rate (the freshness-anchor path).
- **Per-note ball spawning from onset detection** — spawn a transient metaball on each detected attack so individual piano notes visibly bud off the surface.
- **Save a still** — capture the current frame to PNG for sharing a sculpted moment.
