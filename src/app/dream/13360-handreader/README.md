# 13360-handreader

**What if you could watch Karel's own hands play — reconstructed from his real
recordings — as a 3D choreography of two hands moving across a piano keyboard,
driven note-for-note by his actual note-roll?**

Nobody in the lab had ever visualized his _playing_ as embodied motion. This
prototype reads his real recorded note-roll and reconstructs a plausible
two-hand keyboard choreography, rendered as an imperative three.js scene over an
88-key keyboard and synced to his real audio.

## What you see

A warm, stage-lit 3D piano keyboard (all 88 keys, MIDI 21–108). Two luminous,
violet-tinted translucent hand forms — a palm ellipsoid, five fingertip nodes,
and soft connecting tendons each — glide across the board. Keys visibly hinge
down on his real onsets; strike depth and key glow scale with note velocity. An
amber footlight and the key-light pulse from the master analyser's energy.

- **Input** — his real catalog audio (Welcome Home / Snowflake, with a track
  selector; default is _Bath_) plus its analysis note-roll
  (`loadTrackAnalysis().notes[]`: MIDI pitch, onset time, duration, velocity).
- **Output** — plain imperative `three.js` (no react-three-fiber), one scene
  built in a single `useEffect` rendering into a `<canvas>` ref.

## The solver — `kinematics.ts`

A note-roll → hand-kinematics solver, deliberately simple and robust rather than
research-grade:

1. **Pitch → position.** MIDI pitch → key index → x-position along the keyboard,
   using real white/black key geometry (black keys sit at the half-unit boundary
   between their neighbours).
2. **Causal L/R split.** For each frame, the notes sounding (or about to sound,
   within a small anticipation window) are collected via a binary-search +
   forward scan. A moving pitch-split boundary eases toward the pitch centroid;
   notes below it go to the left hand, above to the right. Wide one-sided chords
   get their lower half handed to the idle hand so both stay expressive.
3. **Palm + fingertips.** Each hand's palm lerps toward the centroid of its
   active keys (and drifts back to a home region when idle). Up to five fingertip
   nodes spread across the active keys nearest that hand — a lightweight
   nearest-key assignment, centred so outer fingers rest in a natural fan when
   there are fewer than five notes. No full IK.
4. **Press state.** A key is pressed while `time ≤ now < time+duration`; press
   depth eases with a fast attack and slower release, and drives the key's dip
   and emissive amber glow.
5. **Energy pulse.** During playback the stage footlight and key-light pulse from
   `master.analyser` (`getByteFrequencyData`); in the muted demo they pulse from
   the choreography's own note activity.

## Sync & determinism

- **Playing:** the clock is the `AudioBufferSourceNode`'s elapsed time measured
  against `AudioContext.currentTime`, so hands and keys track his real audio.
- **Seeded muted auto-demo:** on mount, before any click, track-1's note-roll is
  fetched and drives the same choreography on a monotone demo clock, looping, so
  the hands are already moving and keys depressing on the first painted frame
  with zero interaction. Pressing Play starts the real audio in sync.
- No `Math.random` / `Date.now` / `new Date` in the render path. The only
  randomness is a seeded `mulberry32` (idle finger breathing and the synthetic
  fallback roll). `performance.now()` is used solely for visual-easing `dt`,
  never for state or randomness.

## Audio routing

Audio is **Karel's real catalog only** — no synth/oscillator/mic. An
`AudioContext` is created on the Play gesture; audio routes
`AudioBufferSourceNode → createSafeMaster(ctx).input`, never to
`ctx.destination` directly. Visual energy is read from `master.analyser`.

## Graceful degradation

- No WebGL → an on-brand notice; nothing else renders.
- `loadTrackAnalysis` returns null → a small seeded synthetic note-roll drives
  the **visual only** (audio still plays the real recording, or stays silent).
- Full teardown on unmount / stop: `cancelAnimationFrame`, dispose all three
  geometries / materials / renderer, `source.stop()`, `master.disconnect()`,
  `ctx.close()`.

## Palette

Warm lit stage, non-cosmic: near-white / graphite keys, amber key-light
(`#ffb14e`) on his onsets, soft violet hands (`#9a6bff` / rim `#6b4cff`) on a
near-black stage (`#08070b`). All art colours live only inside three.js
materials; the chrome uses semantic tokens exclusively.

## References

- **SKY-Piano: A Multimodal Piano Performance Dataset** (arXiv:2607.27296, ISMIR
  2026) — piano performance as coupled motion + audio + MIDI multimodal data.
- **Profy: Interpretable Visualization of Expertise-Dependent Motor Skills**
  (arXiv:2606.10627, 2026) — visualizing the physicality of piano skill.

## Files

- `page.tsx` — the imperative three.js scene, audio wiring, and chrome.
- `kinematics.ts` — keyboard geometry + the note-roll → two-hand choreography
  solver, plus the seeded synthetic fallback roll.
