# 327 · Physarum Choir

**What if you didn't play notes, but planted _tones as food_, and a living
slime-mold network autonomously decided — over seconds — which ones to connect,
the harmony emerging from the topology it grows?**

A *Physarum polycephalum* (slime-mold) agent trail-field routes between
tone-source "food" nodes. **The chord you hear IS which sources the network has
currently connected** — the slime composes the connections. As veins reach a
food node and thicken the trail around it, that node's voice swells in; when a
vein dies back, the voice fades. The evolving consonance = the live
connectivity graph.

## How to use

1. Open `/dream/327-physarum-choir`.
2. Press **Plant the first tones**. This boots the audio engine, fetches one of
   Karel's real piano recordings, taps onsets/pitches from it, and scatters
   those pitches as glowing **food nodes** across the field. The slime then
   starts growing toward them.
3. Watch the veins find the nodes. Each time a vein joins a node, that node's
   just-intonation voice fades up and brightens. The HUD shows
   `connected voices: N / total`.
4. **Click anywhere** to plant another tone (its pitch is chosen by where you
   click — higher up = higher scale degree). The network will try to reach it.

You never choose the chord directly. You choose where the food is; the slime's
topology chooses the harmony.

## The connectivity → harmony idea (the actual novelty)

Every food node owns one sustained voice tuned to a **D-rooted just-intonation
modal set** (`1, 9/8, 6/5, 4/3, 3/2, 5/3, 9/5, 2`), deliberately *not*
C-major-pentatonic. Each frame the sim reads the trail intensity in a small
**ring** around each food node — skipping the node's own injected hot core, so
we measure the *vein* that reached it, not the bait. That per-node intensity,
smoothed over time, becomes a connection value in `[0,1]`:

- gain rises with connection (the voice swells in),
- lowpass cutoff opens with connection (the voice brightens).

So the **set of currently-connected nodes is the live chord**, and the chord
mutates as the network re-routes itself. An always-on faint root drone keeps the
field from ever going silent; a faint loop of the source recording sits under
everything as a bed. Master gain ≤ 0.5 into a brick-wall `DynamicsCompressor`,
procedural `ConvolverNode` reverb, everything glided with `setTargetAtTime`.

## How it's built

- **INPUT** — Karel's real recording seeds the food. Public no-auth GET
  `/api/featured` (album matching `/welcome|karel/i`) → `/api/audio/[id]`
  (handles both the `{url}` JSON form and a raw audio `arrayBuffer`) → decoded
  with `decodeAudioData`. A coarse onset + autocorrelation pitch tap turns the
  music into pitch-mapped food positions. Fallbacks: if the fetch fails we
  offline-render a short D-modal arpeggio **and** auto-seed a ring of food, so
  it is always demoable. Provenance is labeled: emerald `♪ Karel's recording`
  vs amber `synth fallback`.
- **OUTPUT** — a **WebGPU compute** trail-field. A move pass advances ~1M agents
  (`x, y, heading`), each sensing ahead-left / center / right of a shared trail
  buffer and steering toward the strongest chemoattractant (Jones/Jenson rule),
  depositing via atomic fixed-point adds. A diffuse pass does a 3×3 blur + decay
  and injects a hot spot at each food node (ping-ponging two storage buffers). A
  reduce pass downsamples the field for cheap async connectivity readback. A
  full-screen render pass tone-maps the field to a bioluminescent indigo → teal
  → gold glow and draws the food halos.
- **Fallback** — no WebGPU → a smaller CPU agent sim (same model, ~4k agents,
  256² field) drawn to **Canvas2D**, with the identical connectivity read-out,
  so a no-GPU review device still gets the real experience and the real audio.
- **TECHNIQUE** — Physarum agent simulation whose **node-connectivity graph
  drives the harmony engine**.
- **VIBE** — systems / emergent / organic / Anadol-adjacent.

## Honest note on lineage

**Physarum already exists in this lab**, at `260-kids-slime-garden` — a
Jones/Jenson agent sim running on the **CPU and rendered through WebGL**. This
piece is **not** the lab's first slime mold and does not claim to be. The honest
novelty here is twofold:

1. the **application** — mapping the network's *connectivity graph to harmony*
   (the slime as composer, the chord as topology), which 260 does not do; and
2. the **implementation** — the simulation runs in a **WebGPU compute shader**
   (WGSL, atomic storage-buffer deposits, ping-pong diffuse), where 260 ran on
   the CPU. This rides the 2026 WebGPU-physarum creative-coding wave.

## Named references

- **Andrew Adamatzky** — *Physarum* sound-synthesis / biocomputing
  (arXiv:1212.1203). Slime mold as a substrate that can be *heard*.
- **Jeff Jones** — the canonical Physarum multi-agent transport-network model
  this simulation implements.
- **Sage Jenson (mxsage)** — the contemporary GPU Physarum aesthetic.
- ***Simulacra Naturae*** (arXiv:2509.02924, 2025) — agent-ecosystem driving
  spatial audio; kindred "the system composes" framing.
- The **2026 WebGPU-physarum wave** (e.g. SuboptimalEng/slime-sim-webgpu) — the
  current frontier this rides.

## Honest, unverified risks

- **WGSL on real hardware is unverified.** This environment has no GPU, so the
  compute/render pipelines were written to be correct by inspection only. Likely
  failure points if a driver disagrees: atomic `u32` trail deposits (fixed-point
  scale / overflow clamp), the `override`-constant reduce pipeline, async
  `mapAsync` readback timing, and `storage` buffer size limits at 1024² (4 MB
  per trail buffer × 2 — within default limits, but adapter-dependent). If
  anything throws, the code falls back to the CPU/Canvas2D backend.
- **Connectivity thresholds are hand-tuned.** The ring-sample radii and the
  `mx / 6` (GPU) / `mx / 1.2` (CPU) normalizations were chosen by reasoning
  about the deposit/decay balance, not measured on-device, so on real hardware
  voices may swell faster or slower than ideal. The time-smoothing keeps it
  musical either way.
- **Onset/pitch tap is coarse** by design (it only needs a plausible spread of
  seed pitches, not transcription accuracy). Thin taps are topped up with ring
  seeds.
- The CPU fallback's full-field diffuse is O(N²·9) per frame at 256²; it targets
  a steady but modest frame rate, not 60fps on weak machines.
