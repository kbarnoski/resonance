# 21-three-mesh-av — Audio-Reactive 3D Mesh

**Route**: `/dream/21-three-mesh-av`  
**Cycle**: 24  
**Status**: demoable

## What it does

An icosahedron (sub-divided sphere-like shape) whose surface breathes with audio.
Six frequency bands from the Web Audio FFT drive vertex displacement in a custom GLSL
vertex shader:

- **Sub-bass + bass** push the **equatorial band** outward (vertices with `abs(normal.y) < 0.3`)
- **High-mid + treble** push the **polar caps** outward (vertices near top and bottom)
- **Low-mid + mid** contribute a global swell to all vertices
- A time-varying value noise term adds organic breathing motion even at silence

Color is driven by spectral centroid:
- Dark/bassy audio → **indigo** (hue ≈ 0.72)
- Bright/treble audio → **orange** (hue ≈ 0.08)
- Brightness scales with displacement magnitude

Edge glow (Fresnel-like): surfaces facing away from the camera receive a rim light
computed in the vertex shader via `normalMatrix * normal` (view-space normal). When
the mesh puffs outward, the bright displaced regions naturally face the camera, while
the undisplaced regions become edge-lit.

**Bloom** from `@react-three/postprocessing` wraps the render with a luminance-thresholded
bloom pass (`intensity=1.4`, `threshold=0.08`). The displaced regions exceed the threshold
and bloom outward into hazy halos — this is what makes the mesh look alive and glowing
rather than flat and shaded.

## Technical choices

**Why IcosahedronGeometry(1.35, 4)?**  
Detail level 4 gives ~2500 unique vertices — enough for the displacement to look smooth and
organic at any view angle. Lower detail (level 3) shows visible icosahedron edges through the
displacement, especially near poles. Higher detail (level 5, ~10k vertices) is overkill for
a 60 fps prototype.

**Why custom ShaderMaterial instead of TSL node materials?**  
Three.js TSL (Three Shading Language) compiles down to WGSL/GLSL transparently and is the
post-R171 way to write shaders. However, the TSL + `@react-three/fiber` integration for
**per-frame uniform updates** requires either `NodeMaterial.onBeforeRender` or `uniform()`
reactive nodes — the R3F bridge for NodeMaterial is not as mature as for ShaderMaterial.
For a one-cycle build, `ShaderMaterial` with `useFrame` uniform updates is simpler and
more reliable. TSL node materials are worth revisiting in a polish cycle.

**Value noise in the vertex shader**:  
Inigo Quilez's hash → trilinear interpolation gives smooth organic noise across the mesh
surface. The noise advances in the `y` and `z` dimensions of the normal coordinate over
time, creating a slow surface undulation even when audio is quiet. At loud input, the noise
amplitude scales up (`0.04 + amplitude * 0.10`), making the idle breathing grow into a
dramatic pulse.

**normalMatrix for Fresnel**:  
`normalMatrix` is injected by Three.js's shader preamble (it's `mat3(transpose(inverse(modelViewMatrix)))`).
Multiplying by it gives the vertex normal in view space, where `vViewNormal.z ≈ 1.0` means
the surface faces the camera and `vViewNormal.z ≈ 0.0` means it's edge-on. Using
`pow(edgeFactor, 2.5)` sharpens the rim light to a thin halo.

## Audio pipeline

**Demo mode**: 6 sine oscillators at [55, 140, 380, 1100, 3000, 9500] Hz with LFO-modulated
gain, connected only to the AnalyserNode (not speakers). The 6 LFOs at different rates
(0.07–0.24 Hz) create slow independent band modulations. With 6 bands tied to 6 oscillators
at different frequencies, each band's energy varies independently → the mesh deforms
differently in each zone over time.

**Mic mode**: live `getUserMedia` → `AnalyserNode(fftSize=2048)`. Same band energy extraction
as the rest of the dream zone prototypes (20–60 Hz sub-bass through 4–20 kHz treble).

Data flows from the page component → `audioDataRef` (plain object ref) → read inside R3F
`useFrame` callback (runs inside the Canvas reconciler, same JS thread). No React re-renders
needed for the per-frame updates — the ref is a direct memory channel.

## What to play with

- **Piano**: bass notes pulse the equator while treble notes extend the poles. A single
  sustained chord makes the mesh breathe along the harmonic it emphasizes.
- **Voice**: sustained vowels with strong formants create asymmetric deformation (one band
  dominant). Consonants flash treble energy and spike the poles briefly.
- **Music**: on bass drops the equatorial belt expands dramatically; high hat drives the
  polar peaks; the full mix shapes a complex asymmetric organic form.

## Polish ideas

1. **Wire frame overlay** — secondary pass with `wireframe: true` + low opacity, showing
   the underlying icosahedron geometry as a faint grid. Reveals the mesh structure.

2. **Multiple meshes** — two concentric icosahedra with slightly different detail levels
   and complementary frequency mappings (inner = bass, outer = treble). The gap between
   them fills with bloom.

3. **TSL node materials** — port the vertex displacement to `NodeMaterial` using Three.js
   TSL. Would enable WebGPU-native shaders (WGSL) automatically on Chrome/Edge.

4. **Onset sculpt** — on a percussive onset (drum hit), temporarily spike the
   displacement amplitude by 2× with a 200ms decay envelope. Makes beats feel physical.

5. **Torus knot variant** — same shader on a `TorusKnotGeometry` instead. The
   intrinsic topology of the torus knot interacts differently with the polar/equatorial
   weighting — treble might trace the tube's twist instead of a pole.
