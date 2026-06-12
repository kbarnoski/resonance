**For**: kids (4+)

A living dusk sky filled with thousands of starlings — touch to shepherd the murmuration, watch the cloud split into harmonizing flocks, and hear the birds sing.

---

## How 3D Flocking Works (Reynolds Rules in 3D + Spatial Hash)

The simulation implements Craig Reynolds' "Boids" algorithm (SIGGRAPH 1987, "Flocks, Herds and Schools: A Distributed Behavioral Model") in full 3D:

1. **Separation** — each bird steers away from neighbours within a short radius (~0.8 units) to avoid crowding
2. **Alignment** — each bird steers toward the average heading of neighbours within a medium radius (~2.2 units)
3. **Cohesion** — each bird steers toward the average position (centre of mass) of neighbours within a larger radius (~3.0 units)

All three forces are computed in 3D world space, weighted, clamped to a maximum force, and integrated via simple Euler integration each frame.

**Spatial hash** — instead of O(N²) neighbour checks, all 2,800 birds are bucketed into a 3D hash grid (cell size = alignment radius). Each bird only queries the ~3³ = 27 surrounding cells, reducing average neighbour lookups from 2,800 to ~30–50. This keeps the simulation smooth on mobile CPUs.

**Attractors** — the child's touch (or the ghost demo path) injects a "steer toward" force that blends with the Reynolds rules. Two fingers create two attractors, and the flock organically splits because the nearest sub-group follows its closest attractor.

---

## How Flock State Maps to Harmony

All sound is synthesised via Web Audio API — no samples, no network.

| Flock emergent property | Audio mapping |
|---|---|
| **Order parameter** (Vicsek: magnitude of avg normalised velocity, 0=chaos → 1=aligned) | Low order → sparkle layer louder, more harmonic voices, tremolo depth; high order → warm settled pad |
| **Flock centroid height (Y)** | Maps across the C-major pentatonic register (C2–A5): flock flying high = higher notes |
| **Sub-flock clusters** (grid-bucket detection every ~200ms, up to 4 clusters) | Each cluster gets its own sustained oscillator voice at a different pentatonic interval; a visible split is AUDIBLE as harmony (clusters = major third, perfect fifth, octave apart); merge resolves toward unison |
| **Average speed / turbulence** | Drives tremolo rate and depth; faster scattered flock = faster gentle shimmer |

**Always-on ambient pad**: C2 + G2 detuned sine/triangle layers so it is never silent.

**Master chain**: `GainNode → BiquadFilter (lowpass ≤8 kHz) → DynamicsCompressor (threshold −6 dB, ratio 18:1, fast attack 3ms) → destination`. All parameter changes via `setTargetAtTime` (no clicks or transients).

**C-major pentatonic** (C D E G A): every note consonant, nothing ever "wrong".

---

## Auto-Demo (Ghost Shepherd)

On load, before any touch, a scripted ghost attractor follows a Lissajous-like 3D path through the sky volume. Every ~12 seconds a second ghost attractor phases in (driven by a sine cycle), pulling part of the flock away — creating a visible split into two harmonizing sub-flocks, then re-merging. This drives both render and audio from frame one. Cancelled on first pointer-down; resumes after ~4 s of idle.

---

## Named References

- **Craig Reynolds**, "Flocks, Herds and Schools: A Distributed Behavioral Model", SIGGRAPH 1987. The canonical boids paper.
- **Vicsek et al.** (1995) — order parameter for collective motion (magnitude of average normalised velocity).
- **Starling murmuration / collective motion** — real murmurations (up to ~500,000 birds) exhibit scale-free correlations studied by Cavagna et al. (2010, PNAS). This prototype models the visual and emergent character, not the exact physics.
- **three.js** — WebGL renderer used for the 3D Points cloud with additive blending and per-particle depth colour.
- **Web Audio API** — all synthesis, scheduling, and master chain dynamics processing.

---

## Degradation Paths

1. **Normal** — three.js WebGL scene; ~2,800 birds as `THREE.Points` with a soft sprite texture; full 3D boids + audio.
2. **WebGL failure** — caught in a try/catch; falls back to a Canvas 2D dot-flock (~300 agents, simplified 2D boids). Audio continues unchanged (Web Audio does not depend on WebGL).
3. **Audio failure** — caught separately; render continues silently.
4. **Low-end device** — `dt` is capped at 33ms (≈30fps floor); neighbour checks capped at 24 per bird; `Math.min(devicePixelRatio, 2)` for renderer resolution.

---

## Honest Unverified Notes

- **Performance on very old devices**: The 2,800-bird 3D simulation with spatial hash runs smoothly on modern phones, but has not been tested on older iPads (pre-2018) or budget Android devices. If frame rate is poor, reducing `NUM_BIRDS` in `flock.ts` to 1,500 should help with no visible quality loss.
- **iOS Safari AudioContext**: The engine is created inside the Start button gesture (`handleStart`). This is the standard iOS unlock pattern but behaviour may vary across iOS versions — some iOS 15 builds occasionally require a second tap.
- **Sub-flock harmony audibility**: The cluster-to-voice mapping produces clearly distinct pitches when the flock splits into two or more geographically separated groups. If the flock splits but immediately re-merges (common in the first few seconds), the harmonic difference may be brief. The ghost demo is tuned to hold the split for ~3–4 seconds to make it clearly audible.
- **No network / no mic / no camera** used at any point. Fully offline safe.
