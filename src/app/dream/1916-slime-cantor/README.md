# 1916 · Slime Cantor

**The question it answers:** *What if a living slime-mold (Physarum) transport
network were a musical instrument — and its emergent NETWORK TOPOLOGY were the
harmony you compose by placing food with your fingers?*

You drop food seeds onto a dish of dark-field agar with your fingertips. A
living slime colony grows luminous amber veins toward the food. When the slime
physically routes a vein between two seeds, an **edge** is born in a small
weighted graph. The **graph-Laplacian eigenvalues** of that graph — the
network's natural resonant modes — are sounded as an additive
"connectome-harmonics" drone. Rewire the network and the chord morphs.

## Tags

- **INPUT:** multitouch Pointer Events — place / drag / remove food seeds (up to
  ~10 fingers; mouse = one finger). Human-load-bearing: no seeds → no harmony.
- **OUTPUT:** WebGPU luminous branching veins (Canvas2D fallback).
- **SIM:** genuine agent-based Physarum in WGSL compute shaders (sense / rotate
  / deposit + diffuse / decay, ping-ponged storage buffers, ~260k agents).
- **HARMONY:** spectral graph theory — graph-Laplacian eigenvalues → additive
  drone modes. NON-pentatonic, continuous, unquantized.
- **PALETTE:** dark-field bio-microscopy — deep saturated teal agar
  (`#04201c`–`#062b24`), amber/gold/chartreuse veins (`#f4c14e`, `#c8e66a`, hot
  core `#fff3c4`), coral/vermilion food seeds. No violet/indigo/magenta.

## How the harmony works (the heart of the piece)

1. **Edge detection.** Every ~250 ms a tiny WGSL pass samples the freshest
   trail field along the segment between each pair of food nodes and writes the
   mean density into an 8×8 buffer. We read back only those ≤64 floats.
2. **Graph build.** An edge exists between nodes *i,j* when that mean density
   exceeds a threshold (the slime has bridged them); its weight is the density.
3. **Laplacian spectrum.** We form the symmetric weighted Laplacian
   *L = D − W* and diagonalize it with cyclic Jacobi rotations (exact for
   *n ≤ 8*). The eigenvalues are the network's natural modes.
4. **Sonification.** Frequencies ∝ √λ (as for a vibrating membrane), normalized
   by the largest √λ present and placed continuously on a log pitch scale
   between ~96 Hz and ~720 Hz. Lower modes are louder. The DC (zero) mode is the
   fundamental. New edges ring a soft bell; broken edges a soft damp.

This is genuinely non-pentatonic: eigenvalues are continuous real numbers mapped
continuously to pitch, with no scale quantization anywhere.

## Named references

- **Physarum polycephalum** — the true slime mold whose transport networks
  inspired the whole piece.
- **Jeff Jones (2010),** "Characteristics of pattern formation and evolution in
  approximations of Physarum transport networks" — the agent deposit / sense /
  rotate model implemented in the WGSL move shader.
- **Tero, Takagi, Saigusa, Ito, Bebber, Fricker, Yumiki, Kobayashi, Nakagaki
  (2010),** "Rules for Biologically Inspired Adaptive Network Design," *Science*
  327 — the Tokyo-rail optimal-transport behaviour that motivates veins routing
  *between* food sources.
- **Sage Jenson (mxsage),** "Physarum" — the visual language of dense,
  fine-filament slime rendering this piece reaches toward.
- **Spectral graph theory / graph-Laplacian "connectome harmonics"** — Atasoy
  et al., harmonic modes of a network as an orthogonal basis; here the
  eigenvalues serve as the harmonic basis of the drone.
- **ShaderVine (2026-04-12)** — recent evidence that browser-WebGPU Physarum
  runs at interactive framerates, which this prototype relies on.

## Determinism & safety

- All randomness is a single `mulberry32` stream (agent seeding, etc.). No
  `Math.random`, `Date.now`, or argless `new Date()`.
- Three default seeds are placed on load so something is alive immediately; the
  rich harmony still depends on the human adding / moving seeds.
- Master gain ≤ 0.18 through a `DynamicsCompressor`, 1 s fade-in, silent until
  the first user gesture resumes the AudioContext.
- No strobe/flicker: slow luminance drift only, peak brightness clamped below
  full white.
- `prefers-reduced-motion`: fewer agents and a smaller/slower field.
- Graceful degradation: no `navigator.gpu` → on-brand notice + Canvas2D slime
  fallback, audio still runs. `device.lost` is handled.

## Honest self-assessment (what's unverified)

- **Not run on real hardware in this environment.** The WGSL compiles in my head
  and follows patterns used by sibling prototypes, but I could not execute a
  WebGPU frame here. First-run risks: a WGSL type/binding mismatch, or the
  ping-pong parity being off by one (I chose bind groups so the render/edge
  passes read the buffer diffuse just wrote).
- **`EDGE_THRESHOLD` (0.22) is the main tuning knob** and is set heuristically
  against the deposit/decay balance. If veins read as "always connected" or
  "never connected," this is the value to move; the food `foodStrength`/`sigma`
  and `decay` interact with it.
- **Perf** at 260k agents × 1024² field × 2 substeps is plausible on a modern
  GPU per ShaderVine, but untested; the reduced-motion path (60k × 512²) is the
  safety net.
- The static-wash noise bed uses summed incommensurate sines (deterministic)
  rather than white noise, so it is intentionally soft/low.
