# 2020 · Magnet Basin

A magnetic-pendulum fractal-basin **instrument**. Release a damped pendulum into
a field of magnets, watch which one captures it — the release plane is carved
into fractal **basins of attraction** — and hear each capture ring as a tone in
an evolving, inharmonic chord.

## The one question

> What if you could **play** deterministic chaos — release a magnetic pendulum,
> watch which magnet catches it trace out an infinitely-detailed fractal
> boundary, and hear each capture as a tone in an evolving chord?

## The physics

A damped pendulum bob swings over three fixed magnets. Each timestep three
forces act on the bob (`pendulum.ts`):

1. a linear **restoring** pull toward the pivot/centre: `−k·p`
2. viscous **friction** opposing velocity: `−c·v`
3. attraction toward each magnet, softened by a small height offset `h` so the
   pull stays finite at the magnet:
   `strength · (mᵢ − p) / (|mᵢ − p|² + h²)^(3/2)`

Integrated with a fixed-timestep semi-implicit Euler scheme. The bob is
considered **captured** once it is both slow and close to a magnet.

Which magnet finally wins depends with extreme sensitivity on where the bob was
released — the plane splits into fractal **basins of attraction**, one per
magnet, whose shared boundary is a fractal set. That is *deterministic chaos*:
fully determined by the equations, yet practically unpredictable near the
boundary.

## The map (three.js)

The warm-metal field is the basin map. For each grid cell the bob is integrated
to its captor on the CPU, **a few rows per frame**, and the result written into a
`THREE.DataTexture` uploaded to a plane's `MeshBasicMaterial`
(`WebGLRenderer`, orthographic camera). Colour encodes the captor
(copper · brass · verdigris), and each cell is **darkened by how long it took to
settle**, so the fractal boundary appears as a dark filigree threading between
the smooth basin interiors. A live trajectory is drawn as a `THREE.Line` whose
`BufferGeometry` is extended every frame. All geometries, materials, textures
and the renderer are disposed on unmount. If WebGL is unavailable, a readable
notice appears and an audio-only fallback loop keeps the piece demoable.

## Playing it

- **Click / drag on the plane** → release a bob from that point; drag to paint a
  stream of releases (capped at 7 in flight).
- **Drag a magnet** → reshape *and re-tune* the whole basin (the field recomputes
  progressively).
- A **seeded auto-demo** (mulberry32, `0x2020`) drops a handful of bobs on mount,
  so the screen is never dead.

Release near a basin interior and the bob settles fast on one clean tone; release
near a boundary and it wanders — long, uncertain, musically alive — before it
commits.

## Harmony — geometry-derived 12-TET (NON-JI)

Harmony is **equal-tempered and geometry-derived — not just intonation.** For
each magnet (`geometryToFreq`):

- its **angle** around the pivot selects a degree from a 12-tone **equal-tempered
  pentatonic** (semitone offsets `0, 2, 4, 7, 9` — an equal-tempered set, *not* a
  JI ratio stack);
- its **radius** from the pivot selects the octave (near the centre → high, flung
  wide → deep).

So every magnet owns a pitch and dragging it re-tunes it. In flight a sustained
`triangle` voice glides toward the **inverse-distance blend** of the magnet
pitches while a low-pass filter opens with the bob's **speed** (a bob racing
through a boundary brightens). On **capture** the captor rings an **inharmonic
bell**: additive sine partials at stretched, non-harmonic ratios
`1, 2.01, 2.76, 5.40, 8.93` with fast attack and per-partial decay — several
captures pile into an evolving, shimmering chord. Everything runs through a short
deterministic convolution reverb into a compressor/limiter at a calm `~0.14`
master (`audio.ts`).

## Determinism

Fixed timestep, integer frame counter, `AudioContext` clock. The only randomness
— the auto-demo's release jitter and the reverb impulse — is drawn from a
mulberry32 seeded with `0x2020`. No `Math.random` / `Date.now` /
`performance.now` in any audio, visual, or state path.

## Safety

Steady basin colour (no flashing). The only luminance motion is a slow
(`~0.28 Hz`) halo breathing on the magnet markers, well under 3 Hz and disabled
under `prefers-reduced-motion`.

## References

- The **magnetic pendulum** / three-magnet desk toy.
- **Basins of attraction** and *sensitive dependence on initial conditions*
  (Poincaré; the Julia–Fatou theory of fractal basin boundaries).
- **Deterministic chaos.**

## Files

- `page.tsx` — three.js scene, progressive basin texture, trajectory lines,
  pointer interaction, auto-demo, WebGL/audio-only fallback, notes modal.
- `pendulum.ts` — magnetic-pendulum ODE, basin integration, live bob, seeded RNG,
  geometry→pitch mapping.
- `audio.ts` — flight voice + inharmonic struck bells + reverb/limiter.
- `readme-text.ts` — in-app design-notes text.
