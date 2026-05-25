# Morning digest — last updated 2026-05-25 UTC (Cycle 167)

## New since yesterday

- **[/dream/141-chord-canvas](/dream/141-chord-canvas)** — Chord Canvas · *Cycle 167* · `demoable` ⭐
  Play any chord on the piano. The name appears: **C**, **F♯m**, **Bdim**. Large,
  glowing, in the chord's own color. A scrolling timeline accumulates every chord you
  play as a colored block — the width is how long you held it. Chroma bars at the
  bottom show which pitch classes are active; active chord tones light up brighter.
  - **Why open this**: it's the first sandbox prototype that bridges signal to theory.
    You play, it names. Hit Demo for ii–V–I in C without a mic.
  - Algorithm: 4096-pt FFT → 12-bin chroma (C2–A♯6) → 24 template matching + 5-frame
    stability filter. Pure Web Audio, zero deps.
  - **Open question**: worth adding 7th chord templates (G7 vs G, Cmaj7 vs C)?

- **[/dream/140-kids-string-bridge](/dream/140-kids-string-bridge)** — String Bridge (kids) · *Cycle 166*
  Two-finger glowing string. Closer = higher. Zero permissions.

## In progress / partial

Nothing in-progress.

## Love signal (unchanged — 13 loved)

`82-kids-color-piano` ❤️ `83-kids-tilt-rain` ❤️ `130-tsl-particle-compute` ❤️
`111-kids-shape-loop` ❤️ `107-ocean-presence` ❤️ `106-beat-cut` ❤️ `105-pluck-field` ❤️
`104-kids-mirror-draw` ❤️ `101-camera-song` ❤️ `100-kids-paint-song` ❤️
`98-kids-drum-circle` ❤️ `86-sound-to-video` ❤️ `84-wave-fluid` ❤️

## Research findings worth a look

Nothing new this cycle (build cycle). Adult research is now **39 adult-equivalent
cycles overdue** (last: Cycle 129). Cycle 169 should be a full research sweep.

## Open questions for Karel

1. **Chord Canvas 7th templates** — G7 currently registers as G (triad tones outweigh
   the 7th). Add 7th templates (36 more) for proper G7 / Cmaj7 / Dm7 detection?
2. **Chord Canvas timeline export** — download the chord history as a text transcript
   (timestamp → chord name)? Would make it a lightweight session logger.
3. **Research sweep** — Cycle 169 (adult). IDEAS.md adult queue is thinning.
   OK to skip a build cycle? Or prioritize one of: `scene-spatial` (Ghost scenes as
   spatial audio environments), `loop-station` polish, `spectral-morph`?
4. **String Bridge multi-finger** (from Cycle 166) — triangle chord for 3 fingers?
