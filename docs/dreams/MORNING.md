# Morning digest — last updated 2026-05-24 UTC (Cycle 160)

## New since yesterday

- **[/dream/135-kids-wheel-song](/dream/135-kids-wheel-song)** — Wheel Song · *Cycle 160* · `demoable` 🆕
  A five-color spinning wheel makes music as it turns. The golden striker at 12 o'clock triggers a pentatonic note each time a color segment passes through it. Tap anywhere to add spin momentum — faster spin = denser, livelier music; slow drift = quiet spaced-apart notes. **First kids prototype where speed (not tap position or count) determines musical rhythm.** The wheel never stops — minimum drift at 0.3 rad/s, kids can always return to it and spin again. Violet→C3, rose→E3, amber→G3, emerald→A3, cyan→C4. Startup chime plays immediately. Zero permissions, zero API, zero deps. 2.45 kB.

- **[/dream/134-anemone-av](/dream/134-anemone-av)** — Anemone · *Cycle 159* · `demoable`
  Bioluminescent sea anemone (Three.js R3F). Eight cyan/violet tentacles react to audio — bass sways the whole organism, high-mids flicker the tips, onsets pulse the body. First intentionally organic 3D form in the sandbox. Demo Mode breathes on its own. Direct follow-up to your loved `130-tsl-particle-compute`. Zero new deps · 3.99 kB.

- **[/dream/133-kids-ripple-pond](/dream/133-kids-ripple-pond)** — Ripple Pond · *Cycle 158* · `demoable`
  Tap to drop a stone. When two rings collide → chord flash. Kids 3+.

## In progress / partial

Nothing in-progress.

## Notable: votes

13 loved prototypes. Loves: `82-kids-color-piano` ❤️, `83-kids-tilt-rain` ❤️, `130-tsl-particle-compute` ❤️, `111-kids-shape-loop` ❤️, `107-ocean-presence` ❤️, `106-beat-cut` ❤️, `105-pluck-field` ❤️, `104-kids-mirror-draw` ❤️, `101-camera-song` ❤️, `100-kids-paint-song` ❤️, `98-kids-drum-circle` ❤️, `86-sound-to-video` ❤️, `84-wave-fluid` ❤️.

## Research / queued

- **`arc-compose`** — MiniMax Music 2.6, hear the Ghost 6-phase arc as AI music, ~$0.03/gen.
- **`concept-steer`** — 6-axis radar chart (Brightness/Density/Complexity/Mode), zero deps.
- **Kids next** — `133-kids-ripple-pond` polish: stone-drop animation on tap + edge-bounce rings.

## Open questions for Karel

1. **Ghost 3D orbit** — Pixal3D: Ghost image → animated 3D GLB, ~$0.30/gen via FAL_KEY. OK to build?
2. **Welcome Home track IDs** — `72-paths-visualizer` + `76-cymatics-on-piano-path` blocked ~80 cycles.
3. **Anemone feedback** — does the organic 3D form feel right? Worth sub-branches / OrbitControls?
4. **Wheel Song** — does the "speed = rhythm" mechanic work for your kids? Does it feel like a music box?
