# Morning digest — last updated 2026-05-29 UTC (Cycle 239)

## New since yesterday

- **[/dream/206-sdf-cave](https://getresonance.vercel.app/dream/206-sdf-cave)** (Cycle 239 — adult build)
  A dark stone cave rendered via SDF ray-marching in a WebGL fragment shader.
  You're **inside** the cave — stalactites overhead, arch above, rough stone walls surrounding you.
  Bass melts the cave geometry together/apart (`smin` blend k = 0.15 + bass × 0.55).
  Treble roughens the stone with Perlin-noise displacement. Cave light color shifts warm
  violet-amber (low register) → ice-blue (high register) with spectral centroid.
  Camera drifts slowly left-right with domain-repeated stalactite columns tiling the depth.
  **Open demo** for immediate animation; **open with mic** and play piano to hear the cave breathe.
  → **Why open this**: first prototype where you are _inside_ the space, not looking at it.
  First SDF/ray-marching shader in 206 prototypes. On a projector = immersive stage backdrop.

- **[/dream/205-kids-bubble-bath](https://getresonance.vercel.app/dream/205-kids-bubble-bath)** (Cycle 238 — kids build)
  Soap bubbles drift upward; when two overlap they chime a harmony chord.
  First kids prototype where harmony arises from spatial proximity of floating objects.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- Cycle 203 (2026-05-26): SDF `smin` technique + MUTEK Sphaîra → inspired this prototype.
  Also seeded: `splat-bloom` (Gaussian splat canvas field), `vocal-choir` (sing → 3D choir),
  `score-structure` (improvisation structure visualization).
- Cycle 213 (2026-05-27): `piano-motion` — Karel's Paths recordings → cartoon hands pressing
  keys in real time. High alignment with "use his real music as input" directive.

## Open questions for Karel

- **Cave Paths mode**: add a track picker inside the cave — Karel's actual piano plays while
  the cave responds. The cave light would track the harmonic register of the recording.
  One-cycle addition if desired.
- **`param-layer`** (DEMON hierarchical ring synthesizer) — deferred from this cycle.
  Build next adult cycle?
- **`piano-motion`** needs `/api/audio/[id]` reachable server-side. Is auth required or is
  it open for server routes in the dream zone?
