# 2264 · Crystal Bloom

**The one question:** *What if PLAYING a keyboard grew an ecstatic crystalline
cathedral of light — an altered state where geometric structure PROLIFERATES into
being and BUILDS around you, instead of the self dissolving away?*

This is the **intense / ecstatic pole** of the altered-states family: structure
**accumulates** into an over-bright plenum. It is not dissolution, not a fade to
void — it is *arrival*.

## What it is

A played instrument. The computer keyboard's home row is a bright modal scale;
each key sounds a glassy bell **and** seeds a self-similar polyhedral cell that
recursively buds child cells outward. Sustained and chorded play accretes a
growing crystalline architecture radiating from a luminous core — the more you
play, the brighter and denser the cathedral becomes.

- **Input:** the computer keyboard, played in real time.
- **Output:** a three.js scene-graph — one additively-blended `InstancedMesh` of
  emissive icosahedra, a slowly orbiting camera, a glowing central core.
- **Sound:** Web Audio — soft glassy additive/FM bell voices, gentle attack, long
  (bell-like) release, light synthesised reverb, a quiet drone floor.

## How to play

- Press the home row **`A S D F G H J K L`** = ascending **C-Lydian** scale
  degrees (C D E F♯ G A B C D). On-screen keys do the identical thing for
  pointer / touch.
- **Hold** a key to sustain the tone and keep that branch proliferating outward.
- **Press several keys** = a chord = several structures growing at once.
- A **~15 s seeded autopilot** plays a phrase on load with no input and no
  permissions, so the grow → bright-plenum arc demonstrates itself headless.
  Press any key to take over; after ~7 s idle the autopilot resumes.
- **Shimmer** engages a safe, slow luminance drift; **Kill** stops it instantly.
- **Design notes** reveals a short prose panel with the idea and the reference.

## The technique — recursive geometric subdivision

Each played note creates a **branch** with a seeded axis (fanned across a
Fibonacci sphere so chords radiate coherently). A gen-0 cell sits just off the
core; the branch's *frontier* is then **budded**: every frontier node spawns 2–4
scaled (`×0.66`), rotated children in a cone around the branch axis, and those
children become the new frontier. A tap grows 2–3 self-similar levels
immediately; a held key keeps budding its frontier every ~0.3 s, so structure
proliferates outward the longer you play. Cells are drawn as one `InstancedMesh`
(cap **4000** instances, oldest recycled via a ring buffer) with additive
blending, so density literally sums into brightness. Colour runs **violet → gold
→ white** with recursion depth — deep structure reads as the over-bright arrival.

## The named reference

Gallimore & Hoffman, **"The Mathematical Architecture of Altered Consciousness"**
(*Neuroscience News*, 2026-06-03): DMT *perturbs the perceptual interface,
expanding the accessible region of experience space* — crossing a threshold lets
normally-imperceptible **structured** form proliferate into perceptibility
(coherent structure, not noise). Crystal Bloom renders that literally: play
deeper and more coherent crystalline structure condenses and arrives. It also
draws on the DMT-realm phenomenology where "geometry proliferates, then
structure."

## Constraints honoured

- **Determinism:** no `Math.random` / `Date.now` / argless `new Date` in shipped
  code. All randomness is a seeded **mulberry32** (`seed = 0x2264`) — reverb
  noise, bud directions, cell orientation, autopilot phrase. Time comes from
  `performance.now()` / the AudioContext clock.
- **Flicker safety:** all luminance shimmer routes through the shared
  `_shared/psych/safeFlicker` engine (off by default, ≤3 Hz soft sine drift,
  never a hard strobe, honours `prefers-reduced-motion`).
- **Self-contained:** the only cross-folder import is the shared safe-flicker
  engine. three.js + Web Audio only, no new dependencies, no network / fetch /
  API routes.
- **Graceful degradation:** no WebGL → on-brand `text-destructive` notice; audio
  failure → visuals keep running with a `text-destructive` note; audio is created
  lazily on the first user gesture.
- **Clean teardown:** animation frame cancelled, three.js geometries / materials
  / renderer disposed, AudioContext closed on unmount.

## Honest limitations

- No true bloom/glow post-processing — brightness is achieved purely with
  additive blending and a newborn "flash". A `postprocessing` UnrealBloom pass
  would make the plenum genuinely radiant.
- Growth is fractal-coherent but geometrically simple (icosahedra in cones); it
  reads as a crystal thicket more than named sacred-geometry lattices.
- The autopilot phrase is a single seeded gesture that loops; it demonstrates the
  arc but is not a curated composition.
- Not verifiable headless in this environment: the actual rendered look, audio
  timbre/level, real-time performance at the 4000-cell cap on low-end GPUs, and
  the exact feel of the autopilot → live handoff.

## Next-cycle deepening

1. **Real bloom + refraction.** Add an UnrealBloom post pass and a thin glassy
   shell material so cells read as faceted crystal, not just emissive blobs — the
   over-bright arrival would land far harder.
2. **Harmonic architecture.** Map recursion generation to harmony (deeper cells
   ring higher Lydian partials) and let a sustained chord slowly *resolve* the
   whole plenum toward a shimmering unison — sound and structure arriving together.
3. **Symmetry fields.** Let held chords impose a kaleidoscopic symmetry group on
   new buds (mirror / rotational), so the cathedral crystallises into named
   lattices as you commit to a chord — structure condensing out of proliferation,
   exactly the reference's threshold-crossing.
