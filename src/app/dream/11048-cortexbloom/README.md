# cortexbloom

**The one question:** *What if you could watch your music grow a cortex?*

A Kohonen self-organizing map is fed a corpus of sounds, and a 2-D neural sheet
self-organises into a topographic **timbre-map** — the same way the auditory
cortex forms its tonotopic map. You watch that sheet fold into being as a living
3-D terrain, and you play it.

## What it is

- A **22×22 SOM** trains live on mount (no click needed). Within a second the
  flat neural sheet begins buckling into cortex-like gyri.
- The sheet is rendered in **three.js as real height-field terrain** — each SOM
  neuron is one vertex of a `BufferGeometry` grid (not a shader-on-a-quad).
- **Vertex height = the U-matrix** (a neuron's average L2 distance to its four
  grid-neighbours). Ridges rise between dissimilar timbre regions; valleys sit
  inside coherent clusters. Heights lerp smoothly frame-to-frame.
- **Vertex colour = the learned timbre**: hue runs teal→violet by the weight
  vector's spectral centroid, brightness by its energy — a bioluminescent
  teal/violet/pale-cyan palette on near-black.
- **Sound:** as each best-matching unit fires during training you hear its timbre
  — the 12 band values drive 12 additive partials over a low C2. The texture
  settles as the map orders itself. Click any fold to sustain that neuron's voice.

## How the SOM works (Kohonen 1982)

Each of the G×G neurons holds a weight vector `w ∈ R¹²`. For each input `x`:

1. **BMU** — find the neuron `c` minimising `‖x − w_c‖²`.
2. **Update every neuron** `i`:
   `w_i += α(t) · h(i,c,t) · (x − w_i)`,
   with neighbourhood `h(i,c,t) = exp(−gridDist(i,c)² / (2σ(t)²))`.
3. Learning rate `α(t)` decays 0.5 → 0.02 and radius `σ(t)` decays G/2 → 0.8
   exponentially over `T ≈ 6000` steps; a floored trickle keeps the map alive
   afterward.

The page runs ~320 steps per animation frame, so the map visibly self-organises
over ~10–20 s. The emergent order — similar timbres laid next to each other with
smooth gradients — is the payoff.

### The corpus (`corpus.ts`)

256 vectors in R¹² are generated **procedurally** with a seeded `mulberry32(0x11048)`
RNG, so there is real structure to discover: five timbre archetypes
(bright / dark / hollow / buzzy / bell-like) are sampled, interpolated in pairs,
jittered, and L2-normalised. No file upload is required — the demo is fully
self-contained.

## How to use it

- Open the page — the cortex is already training and folding.
- Press **Begin** to let sound through (browsers block audio until a gesture);
  the visuals never wait for it.
- **Click / tap any fold** to play that neuron's learned timbre.
- **Read the design notes** opens an in-page explainer.

## Named references

- Teuvo Kohonen, *"Self-organized formation of topologically correct feature
  maps,"* Biological Cybernetics **43** (1982).
- The auditory cortex's tonotopic map; and *"Cortical topographic motifs emerge
  in a self-organized map of object space,"* Science Advances (2023).

## What a next cycle would deepen

- **Drop-an-audio-file corpus** (deliberately skipped here to protect a clean
  build): decode via `decodeAudioData` + an `OfflineAudioContext`/`AnalyserNode`
  FFT framed into 12 log-spaced bands, so the map organises *your* sounds.
- A **BMU comet** that visibly lands on the firing neuron each step.
- Post-processing bloom on the ridges for a truer bioluminescent glow.
- Pointer-drag orbit and a scrubber over the α/σ decay to explore the phase
  transition between disorder and order.

## Files

- `page.tsx` — three.js terrain, training loop, camera, raycast, UI chrome, teardown.
- `som.ts` — the Kohonen engine (BMU, update, U-matrix, centroid, energy).
- `corpus.ts` — seeded archetype corpus + `mulberry32`.
- `audio.ts` — additive sonification through the shared safe-master bus.
