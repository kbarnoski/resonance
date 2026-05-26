# Morning digest — last updated 2026-05-26 UTC (Cycle 197)

## New since yesterday

- **[/dream/168-piano-roll](https://getresonance.vercel.app/dream/168-piano-roll)**
  — Piano Roll (adult, Cycle 197). Play piano into your mic — each note appears as a
  glowing colored bar scrolling left. Pitch sets the row (C2–C6, 48 semitones); color
  shifts violet→red as pitch rises, matching the `1-live` palette. Live tail extends
  from note start to the "now" cursor while you hold. BPM slider adjusts scroll speed.
  Demo button plays a 26-note passage — notes scroll in from the right like a player piano.
  **First notation-style prototype**: you see what you actually played, not abstract art.

- **Kids research sweep** (Cycle 196 — no new prototype, intentional). KIDS.md queue refilled:
  `kids-marble-run` (top pick), `kids-snow-globe`, `kids-garden-bloom`, `kids-raindrop-rhythm`.

## In progress / partial

Nothing in-progress. All code cycles building cleanly.

## Research findings worth a look

`kids-marble-run` remains the top kids pick for **Cycle 198**:
- Draw ramps → marbles fall and bounce notes. Free-draw physics marble music. Nothing like it.
- Culturally well-timed: Sago Mini Music Machine, BooSnoo (2026), marble run videos trending.
- Directly pulls from `105-pluck-field` ❤️, `133-kids-ripple-pond` ❤️, `100-kids-paint-song` ❤️.

**New love signals since last cycle** (19 total, up from 5 noted in Cycle 196):
`153-paint-compose` ❤️, `148-spatial-palette` ❤️, `138-lmdm-echo` ❤️, `130-tsl-particle-compute` ❤️,
`107-ocean-presence` ❤️, `106-beat-cut` ❤️, `101-camera-song` ❤️, `86-sound-to-video` ❤️,
`84-wave-fluid` ❤️, `140-kids-string-bridge` ❤️, `104-kids-mirror-draw` ❤️, and more.
These suggest strong interest in: physics-based tools, spatial audio, particle visuals,
and music-as-artifact (paint, roll, drawing). `168-piano-roll` directly answers the artifact theme.

## Open questions for Karel

- **Piano Roll (168)**: happy with the violet→red color mapping (low=violet, high=red)?
  It matches `1-live` bands. Alternatively could do rainbow by note class (C=red, D=orange...).
- **Piano Roll (168)**: want a click-track overlay? Or chord-name detection overlay (using
  the `28-chord-canvas` algorithm) so you see both notes AND chord names in real time?
- **Aria (167)**: want a "Forget" button to reset the Markov table mid-session?
- **kids-marble-run (Cycle 198)**: should marbles be identical (simpler for 4yo) or have
  physics variety (different weights/sizes)? Leaning identical for predictability.
- **Adult queue next (Cycle 199)**: `spectral-morph` (FFT resynthesis AudioWorklet — your piano
  morphed with a flute/sine) or `diatonic-harmony` (play melody → hear scale-correct harmonies added)?
