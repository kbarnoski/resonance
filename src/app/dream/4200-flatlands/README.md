# 4200-flatlands

**The ONE question:** *What if — taking no drug — the music and slow geometry
could walk you through the derealization of the dissociative / K-hole descent:
the solid world loses its depth and dissolves into a receding stack of flat,
cardboard-cutout planes drifting apart into a white void, then reassembles as
you return?*

This is the **three.js** answer to the dissociative-descent concept:
derealization rendered as literal geometry, not a shader field and not a point
cloud.

## Concept

The world is an `InstancedMesh` field of ~460 thin, lightly tessellated **flat
planes** — cardboard cutouts held in a loose receding formation inside a
desaturated-steel fog. As the arc descends the planes **drift apart** (gaps of
void opening between them), turn **edge-on** and **thin toward transparency**
(they lose their "realness"), the fog swallows the far field, and the whole
scene **blooms toward a calm near-white void** at the still point — then
re-coheres on return. The camera pulls back into third-person **detachment** as
it goes.

The palette is the DPDR steel/silver → white void: no cosmic black, just a flat,
unglamorous, stage-set greyness that washes out to white at the peak.

## Named references

- **Edwin Abbott, *Flatland: A Romance of Many Dimensions* (1884)** — the
  derealization metaphor. Objects lose a dimension of "realness" and become flat
  props; here the entire world is literally flattened into a plane-field.
- **The clinical phenomenology of depersonalization / derealization (DPDR)** —
  the dissociative state in which the world looks flat, unreal, two-dimensional,
  stage-set or dreamlike, and the self feels detached and observing from
  outside. The arc is shaped after that felt sequence.
- **Roger Shepard (1964) / Jean-Claude Risset** — the endless auditory
  glissando; here a perpetual *descent* (`dir: -1`), the floor of pitch dropping
  out forever.

## The arc (audio-conducted, ~5m55s, self-running after Begin)

1. **Derealization** — the world present but subtly wrong: planes near-solid, a
   faint unreal shimmer, colour slightly off.
2. **Detachment** — planes drift apart, void opening between them; camera pulls
   back; the Shepard descent becomes audible.
3. **Dissolution** — full recession; slabs thin toward transparency and turn
   edge-on; fog swallows the far field; the drone deepens.
4. **The still point / white void** — motion nearly stops, everything blooms to
   a calm near-white, the drone thins to one held partial, the void reverb is
   wide open. Peak = stillness.
5. **Return** — planes re-cohere, edges and desaturated colour come back, the
   camera settles, the drone resolves.

A single `performance.now()` clock drives a keyframed parameter track
(`arc.ts`); `sampleArc(t)` maps arc-position → Shepard drive, drone drive,
reverb wet, plane-spread, fog density, bloom, camera dolly, whiteness, colour
presence, and a safeFlicker-gated exposure.

## Shared infrastructure used (`_shared/visionary/`)

- `startShepard(ctx, verb.input, { dir: -1, … })` — the endless descent; driven
  and stepped each frame.
- `startDroneBank(ctx, verb.input, { root, ratios })` — the just-intonation
  steel bed; its filter opens with drive.
- `createVoidReverb(ctx, { seconds: 5, decay: 2.5 })` — the cistern void; the
  descent and drone are routed through it and the wet mix opens toward 1.0 at
  the still point.
- `createSafeFlicker({ maxHz: 3, defaultHz: 1.2 })` — the mandatory
  photosensitive gate; its `value(t)` multiplies tone-mapping exposure.

Rendering is raw three.js (`three` 0.182) with `three/examples/jsm`
`EffectComposer` + `UnrealBloomPass` + `OutputPass` for the white-void bloom.

## Safety

- **Flicker is OFF by default.** Any luminance flicker is routed through
  `SafeFlicker` (≤3 Hz soft sine with a luminance floor, never a hard strobe),
  opt-in via a toggle with an instant **Stop** kill. The default experience is a
  slow luminance *drift*.
- **Reduced motion** is honored: `prefersReducedMotion()` slows the camera orbit
  and the flicker engine forces a sub-perceptual drift.
- **Graceful degradation:** no WebGL → an on-brand `text-destructive` notice and
  the sound-bed plays on, no crash. Mic denied → the arc keeps running.
- **Determinism:** the plane field is seeded with an inline `mulberry32`; no
  `Math.random` / `Date.now`. The descent is identical every run.
- **Full teardown:** on unmount the rAF is cancelled, listeners removed, mic
  tracks stopped, `AudioContext` closed, and every three.js resource
  (geometry, material, mesh, bloom pass, composer, renderer) disposed with
  `WEBGL_lose_context`.

## Optional mic

`Add mic (optional)` grants microphone access; RMS loudness (breath / room) is
smoothed and **added** to the Shepard descent rate, so breathing quickens the
fall. The piece fully self-demos with no mic and no interaction after Begin.

## Next-cycle deepening

- Per-instance opacity/edge-dissolve via a custom `onBeforeCompile` or
  InstancedBufferAttribute, so individual planes fade at their own rate (right
  now transparency is a single global material opacity).
- A depth-sorted or WBOIT transparency pass to remove the mild blend-order
  muddiness when many translucent planes overlap.
- Map the live drone spectral centroid to a subtle per-band tint of the plane
  field, so the sound leaves a faint colour on the geometry.
- A "self" plane — one instance that never fully dissolves and drifts to the
  camera at the still point, dramatizing the observing self of DPDR.
