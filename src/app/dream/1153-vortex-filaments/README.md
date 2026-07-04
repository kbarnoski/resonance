# 1153 · Vortex Filaments

**What if you could STIR a superfluid and watch its quantized vortices tangle, ripple with Kelvin waves, and hear each reconnection fire?**

A true-3D (three.js) instrument for quantum turbulence. Glowing electric-cyan filament loops drift and writhe inside a containment sphere on near-black `#03040a`. Drag to stir: you inject Kelvin waves and, on fast strokes, birth new vortex rings. When two strands cross they reconnect, recoil, and ring a bell.

Route: `/dream/1153-vortex-filaments`

## The physics

A superfluid cannot carry vorticity smoothly the way an ordinary fluid does — circulation is **quantized** into thin, discrete **vortex filaments** (Feynman, *quantized circulation in superfluids*, 1955). We model each filament as a closed 3D polyline of 96 points living in a bounded sphere of radius 2.

**Local Induction Approximation (LIA).** Each point moves along its **binormal** at a speed proportional to the local **curvature** (Da Rios, 1906; rediscovered by Arms & Hama). For point *i* with neighbours *i−1*, *i+1* we take `e1 = p[i]−p[i−1]`, `e2 = p[i+1]−p[i]`, and set the induced velocity `v ∝ β · cross(e1, e2) / segLen²` — this is exactly `β · curvature · binormal`, since `|cross(e1,e2)| ≈ segLen² · k`. Under LIA a planar **ring translates** along its axis and a **helical wave rotates and propagates** along the line — the two signature superfluid motions. Points are redistributed by arc length every frame so the loop stays smooth and doesn't bunch, and are softly reflected at the sphere boundary.

**Kelvin waves.** Filaments are seeded as rings carrying a helical displacement of mode *m* and small amplitude (Lord Kelvin, *helical waves on vortex lines*, 1880). LIA then propagates them; stirring adds more. This is the phenomenon visualized on the vortex lattice in arXiv **2607.00821** (July 2026), *"Visualization of Inertial and Kelvin Waves on the Quantum Vortex Lattice in Superfluid Helium."*

**Reconnection + the 2025 asymmetry law.** Every few frames we check point pairs across *different* filaments (subsampled, O(N²) over a small budget) for near-crossings. On a crossing we fire a reconnection event: both strands flash, receive a localized Kelvin-wave kick, and are pushed apart along their separation vector **harder than they approached** — the 2025 universal reconnection-asymmetry law (reconnecting vortices *separate faster than they approach*, releasing an energy burst). We deliberately use this stable "flash + recoil + Kelvin-kick" model rather than exact topological surgery (swapping connectivity), which is numerically fragile at 60 fps; the recoil dynamics are the physically load-bearing part and are what the ear hears.

## Interaction

- **Idle:** three interlocked rings evolve under LIA from the moment the page mounts — the piece is alive before any gesture.
- **Drag (pointer / touch):** the cursor is projected onto a plane through the origin facing the camera. Slow drags inject a transverse **Kelvin-wave kick** into nearby points; a fast, sustained stroke **spawns a new vortex ring** oriented along the drag direction (retiring the oldest filament if all six slots are full).

## Rendering

Raw three.js (`three` only — no addons, no postprocessing). Each filament is a `LineLoop` with an additive `LineBasicMaterial` (crisp cyan→white core) plus a `Points` cloud sampling the same geometry with a soft radial-gradient sprite (pale-blue halo). Additive blending over the dark background fakes bloom without `EffectComposer`. Reconnections spawn short-lived additive `Sprite` glints — small and **localized**, never full-frame flashes. A `PerspectiveCamera` slowly auto-orbits; exponential fog gives depth.

## Audio (Web Audio API, no libraries)

- **Bed:** three detuned oscillators at A1 / ~E2 / A2 through a lowpass with a slow (0.06 Hz) gain LFO, plus a very quiet band-passed noise shimmer panned slowly — a low, breathing superfluid drone.
- **Reconnection burst:** each event rings a fast-decay bell (a 3-partial sine cluster through a bandpass). Pitch climbs a pentatonic-ish scale with the reconnection **energy** (relative approach speed of the two strands); brightness scales too. The envelope encodes the **asymmetry**: near-instant attack, then a snappier/brighter release that sweeps the filter down — the "cardiac ripple" of strands recoiling faster than they met. A 6-voice pool plus a master compressor keep a turbulent tangle from clipping.

Audio starts/resumes only on the first "Stir the superfluid" gesture (autoplay-policy compliant).

## Accessibility / safety

- `prefers-reduced-motion: reduce` slows the camera orbit and the simulation step.
- Reconnection glints are small localized sprites; the only global brightness motion is the drone's ≤0.06 Hz gain LFO — no strobe, no full-frame luminance flicker (photosensitive-epilepsy safety).
- Text meets the house contrast floor; the no-WebGL / renderer-failure notice is shown in `text-rose-300`.
- On unmount: RAF cancelled, all geometries/materials/textures disposed, `renderer.dispose()` + `forceContextLoss()`, AudioContext closed.

## Named references

- R. P. Feynman — *Application of quantum mechanics to liquid helium* (quantized circulation), 1955.
- L. S. Da Rios (1906); D. W. Arms & F. R. Hama — Local Induction Approximation for vortex filaments.
- Lord Kelvin (W. Thomson) — helical waves on vortex lines, 1880.
- arXiv **2607.00821** (July 2026) — *Visualization of Inertial and Kelvin Waves on the Quantum Vortex Lattice in Superfluid Helium.*
- The 2025 universal reconnection-asymmetry law — reconnecting vortices separate faster than they approach.

## Known limitations

- LIA is a local approximation: it omits the non-local Biot–Savart interaction between distant filament segments, so long-range mutual induction is not captured.
- Reconnection is modelled as recoil + Kelvin-kick, not true connectivity surgery, so loop topology (number/linking of loops) is fixed between spawns — the burst dynamics are faithful, the topology is not.
- The velocity buffer accumulates LIA induction with light damping rather than integrating a pure per-material-point LIA; this trades exact quantitative timescales for a stable, lively 60 fps tangle.
- No superfluid mutual friction / normal-component drag, so Kelvin waves and rings do not decay thermally the way they would in real helium II.
