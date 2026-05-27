# Morning digest — last updated 2026-05-27 UTC (Cycle 208)

## New since yesterday

- **[/dream/177-kids-lego-sequencer](https://getresonance.vercel.app/dream/177-kids-lego-sequencer)** — Lego Beats 🧱 (kids)
  First 2D pitch×time sequencer in the kids zone. 8-step × 6-row block grid: each row is a
  note in the C pentatonic (C3→E4), each column is one beat. Tap any block to activate it —
  a white cursor sweeps left to right and plays every lit block as it passes, looping endlessly.
  Drag to paint a run of notes. BPM adjustable 40–160. Comes with a seeded starter melody so
  it plays immediately on open. Lego-brick visual: rounded rect + top plastic sheen + center
  stud, glow bounce on play. Zero permissions. Ages 3+.
  **Why open it**: tap a few blocks and you have a melody. Tap more and you have a chord. Clear
  and start fresh. The simplest composition metaphor in the sandbox.

- **[/dream/176-sdf-cave](https://getresonance.vercel.app/dream/176-sdf-cave)** — SDF Cave (built Cycle 207, yesterday)
  WebGL1 fragment shader rendering a stone cave interior from the inside. Bass melts stalactites
  into ceiling (`smin` blend 0.05→0.68); treble roughens stone; spectral centroid shifts glow
  violet→ice blue; onsets shake the camera. First prototype where you are *inside* the geometry.
  Open full-screen with music for the full effect.

## In progress / partial

- Nothing in-progress. Next queued:
  - **Cycle 209 (adult)** → `splat-bloom` (177-splat-bloom → now 178 since 177 is kids-lego-sequencer)
    Gaussian splat additive Canvas2D painting field. Aligns with `130-tsl-particle-compute` ❤️.
  - **Cycle 210 (kids)** → `kids-voice-monster` — hum/sing to feed a glowing monster character;
    it grows with amplitude, color-shifts with pitch, sings your pitches back after 30s.

## Research findings worth a look

- BrickMusicTable (arxiv 2411.13224, Nov 2024): lego block grid sequencer validated with 150+
  kids aged 3–13. Construction-as-composition is naturally intuitive. Inspired `kids-lego-sequencer`.
- Cycle 206 kids research: Neural rewards in children's musical improvisation (PMC11986006,
  Apr 2025) — fMRI confirms improvisation activates reward centers MORE than memorized tasks.
  Validates our pentatonic / no-wrong-notes approach.

## Open questions for Karel

- **`kids-lego-sequencer` tap size**: cells are (screen width)/8 wide. On a 375px phone = ~44px.
  On iPad = ~93px. Feels comfortable on iPad; on phone the lower rows might need a stretched thumb.
  Worth a quick test on your phone?
- **`kids-mirror-dance`** (cycle ~214): first camera-based kids prototype, MediaPipe
  HandLandmarker ~8MB CDN dep. OK to add that dependency?
- **Cycle 209 direction**: `splat-bloom` (Gaussian additive painting) vs `score-structure`
  (real-time improvisation architecture analyser). Your call — or I'll default to splat-bloom.
- **Cave on phone**: 64-step SDF ray march at 55% resolution. Fine on iPhone 14+ / Pixel 7+,
  may drop frames on older devices. Worth a check at `/dream/176-sdf-cave`.
