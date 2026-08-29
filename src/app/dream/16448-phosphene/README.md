# 16448 · phosphene

**The one question:** *What if his music grew a living crystalline light-body you
could turn in your hands — an entoptic lattice of phosphene light whose whole
structure is carved by the harmony of his real take?*

An INTENSE / visionary-breakthrough piece. One of Karel's real piano takes
("Welcome Home") plays and loops, and from it grows a single luminous crystal
that floats in front of you. It is an **object you orbit and steer** — not a room
you stand inside, and not a flat shader-field you passively watch.

## What it is

- A compact **crystalline light-body**: ~15,000 additive-glow GPU points folded
  into kaleidoscopic (dihedral) symmetry so they read as a faceted jewel, sheathed
  in a thin **silver icosahedral facet-cage** that gives it edges and a solid 3D
  read as the camera turns around it.
- **You turn it in your hands.** Desktop: pointer-drag rotates it, the wheel
  pushes the camera into it. Phone: `DeviceOrientationEvent` tilt — left/right
  spins it, forward/back tilts the view and a strong forward lean pushes in. A
  slow idle rotation means a reviewer sees it turning hands-free.

## How the harmony carves it

The crystal is a set of shader uniforms driven by the music:

- **Chord → fold order.** The current chord is walked against playback time from
  `loadTrackAnalysis`. Its root sets the kaleidoscopic fold order (3–8 lobes),
  eased live, so a chord change **visibly re-cuts the facets**.
- **Chord color → jewel-tone.** Minor / diminished chords lean toward a deep
  **amethyst**; major toward a cold **teal**. The root nudges the hue within that
  arc. This is the single saturated jewel-tone against the silver-mercury core.
- **Chord tension → spiral twist.** Minor chords shear the shells into a tighter
  spiral (a Klüver spiral form-constant); major chords relax it.
- **Note density → brightness.** How many notes sit under the playhead sets the
  point brightness, so busy passages blaze and sparse ones settle.
- **Onsets → bloom-pulse.** Loud onsets, detected from the **master analyser's**
  energy, launch a gaussian wavefront that travels outward through the shells,
  pushing and lighting the points it passes, then decays.
- **Continuous shimmer** from the analyser adds a subtle live breathing between
  the big structural moves.

If the track analysis is unavailable, it degrades gracefully: hue, fold order and
brightness come from the analyser spectrum (spectral centroid + energy) alone, and
the crystal still lives, breathes and blooms.

## Constraints honored

- **Audio = Karel's real catalog only.** `loadRealTrackBuffer(ctx, TRACK_ID)` from
  `_shared/welcomeHome` (the "Welcome Home" title take), looped. Zero oscillators,
  zero noise, zero synthesis — the only sound is his decoded buffer.
- **safeMaster on the only audible path.** Everything routes into
  `createSafeMaster(ctx).input`; nothing touches `ctx.destination`. Visuals read
  from `master.analyser`.
- **Idle auto-demo.** After Start (and the iOS motion-permission prompt), his take
  plays immediately and the crystal grows and slowly turns on its own — steering is
  an enhancement, not a requirement to see or hear anything.
- **Reads as an orbited object,** not a walkable room and not a passive full-screen
  generative field.
- No drug/substance language — the state is named (entoptic, visionary, luminous),
  never a substance. No film grain / noise overlay.
- Graceful teardown: source stopped, three.js geometries / materials / renderer
  disposed, `cancelAnimationFrame`, listeners removed, `AudioContext` closed;
  double-start guarded. WebGL failure keeps the audio playing behind an on-brand
  `text-destructive` notice; tilt denial falls back to drag + wheel.

## Named reference

Heinrich Klüver's **form constants** (1926) — the lattice, honeycomb, tunnel and
spiral geometry the visual cortex generates as entoptic phenomena — is the direct
lineage for the lattice/spiral treatment here. The crystalline-symmetry look draws
on the long **kaleidoscopic-instancing** tradition in creative coding. Cited
honestly: the lab has many three.js and instanced-geometry priors; this is one
more, and the technique (harmony-driven folding of an additive point lattice with
an onset bloom-pulse) is described plainly, with no claim of being "first."

## Files

- `page.tsx` — `"use client"` React shell (idle / loading / running / error), audio
  boot + teardown, steering, harmony walking + onset detection, the three.js scene.
- `lattice.ts` — the crystalline light-body: shader-driven point lattice + facet-cage,
  with `setHarmony` / `pulse` / `update` / `dispose`. Pure geometry, no audio.
- `README.md` — this file.
