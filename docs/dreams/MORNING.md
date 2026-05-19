# Morning digest — last updated 2026-05-19 UTC (Cycle 46)

## New since yesterday

- **[/dream/41-code-vis](/dream/41-code-vis)** — Code Vis (Cycle 46).
  A live coding DSL where each line of text is a synthesizer voice, and the canvas shows
  a glowing ring constellation — one ring per note. The default score is a C major triad
  (C4 tri 0.8 / E4 sin 0.6 / G4 tri 0.5): three rings in a triangle, violet→green→amber,
  pulsing together at 80 BPM.

  **To try**: press ▶ Start → hear the chord → edit the textarea live (changes apply after
  400ms debounce). Change `E4` to `Eb4` to hear the chord go minor. Add `Bb4 saw 0.3` for
  a dominant 7th — four rings now form a square. Change BPM to 40 for meditative breathing
  or 160 for a frenetic pulse. ↓ PNG saves the current frame.

  **Why this is different**: none of the 40 prior prototypes let you *specify* the music as
  text. This is the reverse of `13-piano-canvas` (play → painting) — you write → hear + see.
  The simplest possible author→audio+visual pipeline. "Write a chord in 10 seconds."

- **[/dream/40-shepard-tone](/dream/40-shepard-tone)** — Shepard Tone (Cycle 45).
  First prototype about the gap between physical sound and perceived sound. The tone rises
  forever and never arrives. Freeze button reveals what's actually playing (a chord, not a
  rising tone). Use Whole-tone step mode for a staccato mechanical staircase.

## In progress / partial

- Nothing in progress. Both newest prototypes shipped complete.

## Research findings worth a look

- **From Cycle 44** (last research sweep):
  - **Magenta RealTime** (Apache 2.0, open-weights) — `0.7 × jazz + 0.3 × ambient` is a
    real vector blend. Style space navigation, not just prompt blending.
  - **CREPE-tiny ONNX (~2MB CDN)** — neural pitch detection, 10× more accurate than
    autocorrelation on real piano. Upgrades 6+ existing prototypes in one shared hook change.
  - **Transformers.js v4** — 200ms model load (was 2s). Browser ML now fully viable.

## Open questions for Karel

- **CDN ONNX dep OK?** `neural-pitch` upgrade (~2MB CREPE-tiny). No package.json change.
  Improves: `13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`,
  `37-ratio-lab`, `39-anticipate` — all six with one shared hook change.
- **Gemini API key** still needed for `30-lyria-jam` (infinite steerable AI music).
- **In-browser MusicGen** OK? ~390MB Transformers.js model, zero API cost, offline after
  first cache. Transformers.js v4 makes this much faster now (200ms initial load).
