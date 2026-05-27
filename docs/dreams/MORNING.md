# Morning digest — last updated 2026-05-27 UTC (Cycle 207)

## New since yesterday

- **[/dream/176-sdf-cave](https://getresonance.vercel.app/dream/176-sdf-cave)** — Cave
  SDF ray-marching cave interior rendered in WebGL1. You are *inside* the geometry —
  first sandbox prototype where the camera is inside the visual space rather than looking
  at a canvas. Bass melts the stalactites into the ceiling (smooth-min blend 0.05→0.68);
  treble roughens the stone; spectral centroid shifts the glow violet→ice blue; onsets
  shake the camera. Open this one full-screen with music playing — the wall-melting effect
  on a bass hit is the main surprise. Demo mode requires no mic (LFO breathing).

## In progress / partial

- Nothing in-progress. `splat-bloom` (Gaussian splat field) is the queued next adult build
  for cycle 209.

## Research findings worth a look

- Cycle 206 kids research sweep: 4 new seeds queued. Next kids cycle (208) = `kids-lego-sequencer`
  (2D pitch×time block grid, BrickMusicTable-inspired). `kids-mirror-dance` needs Karel approval
  on ~8MB MediaPipe CDN dep (see open questions).
- Cave shader insight: `smin` blend driven by bass energy creates a "walls liquifying" effect —
  the most physically resonant audio-visual metaphor in the sandbox. Candidate technique for
  future shader prototypes.

## Open questions for Karel

- **Cave on phone**: 64-step SDF ray march at 55% resolution. Fine on iPhone 14+ / Pixel 7+,
  may drop frames on older devices. Worth a quick check at `/dream/176-sdf-cave`.
- **`kids-mirror-dance`** (cycle ~214): first camera-based kids prototype, MediaPipe
  HandLandmarker ~8MB CDN dep. OK to add that dependency?
- **Cycle 209 direction**: `splat-bloom` (Gaussian additive painting, aligns with
  `130-tsl-particle-compute` ❤️) vs `score-structure` (real-time improvisation architecture
  analyser). Your call.
