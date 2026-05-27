# Morning digest — last updated 2026-05-27 UTC (Cycle 205)

## New since yesterday

- **[/dream/175-vocal-choir](https://getresonance.vercel.app/dream/175-vocal-choir)** — Vocal Choir  
  Sing or hum into the mic. Three harmony voices (major third, perfect fifth, bass octave)
  appear around you in 3D via HRTF spatialization. Orbs glow and breathe with amplitude.
  Wear headphones for full spatial effect; **Demo** button shows it without mic.  
  **Why open this**: first prototype where _you_ are the lead and the choir wraps around you.

## In progress / partial

Nothing in-progress. Clean state.

## Recent builds

- **Cycle 204** — `/dream/174-kids-raindrop-rhythm` (kids) — tap clouds → drops fall → bell on landing
- **Cycle 203** — Research sweep: 8 findings (vocal-choir, sdf-cave, score-structure, splat-bloom seeded)
- **Cycle 202** — `/dream/173-kids-garden-bloom` (kids) — hold soil to grow musical flower
- **Cycle 201** — `/dream/172-loop-station` ❤️ — 4-slot phase-locked loop station

## New loves since last cycle (26 total)

`172-loop-station` ❤️ · `157-concept-steer` ❤️ · `163-paths-visualizer` ❤️ ·
`166-kids-lantern` ❤️ · `160-kids-paint-loop` ❤️ · `158-kids-hum-paint` ❤️

Concept-steer love confirms named-concept musical control is valued — vocal-choir extends
that direction into spatial synthesis.

## Research findings worth a look

From Cycle 203 (docs/dreams/RESEARCH.md §§219–226):
- §224 MUTEK 2026 Sphaîra — architectural sound installation. Seeds `sdf-cave` (SDF ray-marching
  cave that breathes with audio — highest surprise-factor build in the current queue).
- §222 WebSplatter — Gaussian-splat Canvas2D technique. Seeds `splat-bloom` (500 oriented
  ellipses + additive blending — painterly texture, qualitatively new visual register).
- §221 Style Plan Timeline (Feb 2026) — structural section detection from chord+density. Seeds
  `score-structure` (shows Karel's improvisation as architecture).

## Open questions for Karel

- **sdf-cave vs splat-bloom for Cycle 207**: both zero deps, one cycle. `sdf-cave` is highest
  surprise (new visual paradigm — viewer inside the space for the first time); `splat-bloom`
  is softest and most painterly (close to the TSL-particle-compute love). Which direction next?
- **vocal-choir timbre**: currently pure sines. Adding one overtone partial (2×freq, gain 0.08)
  + a short convolver reverb would give a more choral quality. Worth a polish cycle?
