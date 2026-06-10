**For**: kids (4+)

# Wave Pond

A luminous top-down pond of light where a 4-year-old can tap, watch real waves
spread outward, bounce off the glowing rim, and cross through each other — and
*hear exactly that rippling field as sound*.

---

## The pitch

You tap anywhere on the glowing circle. A Gaussian pulse of displacement is
injected into the grid at that point. Ripples radiate outward, reflect off the
fixed boundary, and interfere (constructively = brighter; destructively =
dimmer). A small amber "pickup" dot in the field reads the local wave
displacement out as an audio sample stream, so the child literally hears what
they see. The audio and visual are the same solved field — not a simulation
layered on top of a separate sound engine.

---

## What's novel (the lab-first)

Most "pond" or "membrane" prototypes in the archive use a modal synthesis
bank (sum of pre-computed sine modes with individual decays) and overlay a
cosmetic ripple animation. This prototype is fundamentally different:

**A genuine time-domain 2-D finite-difference wave-equation solver** (FDTD),
specifically the Van Duyne & Smith 2-D Digital Waveguide Mesh (ICMC 1993).
Every audio sample is computed by stepping every cell of a 64×64 grid one
time step forward using the discrete wave update:

```
u_next[i,j] = 2·u[i,j] − u_prev[i,j]
            + c²·(u[i+1,j] + u[i-1,j] + u[i,j+1] + u[i,j-1] − 4·u[i,j])
```

with Dirichlet (fixed) boundaries at all edges (the "rim"). There are no
pre-computed modes, no spectral bank, no precomputed impulse response — the
propagation, reflection, and interference emerge from the coupled cell updates
alone. The same field that generates the audio sample stream also drives the
vertex colors of the Three.js plane each frame.

---

## Subsystems

| Subsystem | Description |
|---|---|
| **FDTD solver** | 64×64 2-D wave mesh; c = 0.35 (Courant-stable); DAMP = 0.0015 per step; Dirichlet boundaries |
| **AudioWorklet** | Owns the grid; steps at audio rate; posts field to main thread ~30×/s; inline Blob URL (no public/ file needed) |
| **ScriptProcessor fallback** | Identical FDTD loop, runs on main thread if `addModule` throws |
| **Pickup** | Cell (27, 38) — off-centre to avoid modal nulls; raw displacement → output sample |
| **Tone synth** | Pentatonic C4–A4 sine voice driven by pickup-area energy; tracks field liveliness |
| **Ambient pad** | 5-partial Lydian C3–C4 drone (always on, never silent; levels fade in over ~1.5 s) |
| **Master chain** | All audio → 9 kHz lowpass (kids-safe) → DynamicsCompressor (threshold −12 dB, ratio 10) |
| **Renderer** | Three.js OrthographicCamera top-down; PlaneGeometry 64×64 vertex-colored; no Canvas2D, no raw WebGL2 |
| **Color map** | Trough = deep violet; rest = deep indigo; crest = cyan → near-white |
| **Auto-demo** | 4 gentle ripples at t = 0.4 s, 1.1 s, 1.9 s, 2.6 s; cancelled on first real touch |
| **Multi-touch** | Each touch injects an independent pulse; waves cross and interfere |
| **iOS AudioContext** | Created inside the "Touch the Pond" button handler (user gesture unlock) |

---

## Reference

Dana C. Van Duyne & Julius O. Smith III, "Physical Modeling with the 2-D
Digital Waveguide Mesh," *Proceedings of the International Computer Music
Conference* (ICMC), Tokyo, 1993.

---

## Honest caveats (unverified without real device)

- **CPU load**: Stepping a 64×64 grid at 44100 Hz inside an AudioWorklet is
  ~180 million FP operations/second. On modern desktop/laptop this is fine;
  on a low-end phone it may fall behind. The ScriptProcessor fallback is even
  heavier (main thread). A production version should reduce grid size or use a
  sub-rate stepping scheme.

- **Boundary reflection accuracy**: The Dirichlet boundary is physically
  correct for a perfectly rigid rim (zero displacement). Absorbing boundaries
  (perfectly matched layers) would feel more like an open pond; the current
  choice makes reflections explicit and visible/audible, which is pedagogically
  appropriate for the brief.

- **Audio pickup sound**: The raw pickup output is a single-cell displacement
  signal. At audio rate it sounds like a low-amplitude, complex-toned
  "water-strike" rumble, not a pure sine. The pentatonic tone synth layered on
  top provides the pitched musical warmth.

- **Tuning / consonance**: The pentatonic mapping is approximate — pickup
  energy (mean absolute displacement in a 9×9 neighbourhood) is mapped
  linearly to one of five frequencies. Real consonance tracking would require
  spectral analysis of the pickup signal.

- **Touch latency**: The target is <50 ms tap-to-sound. Web Audio scheduling
  and React state updates can add latency on slow devices; the injection path
  goes directly through `injectRef.current` (bypassing React state) to
  minimise this.
