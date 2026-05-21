# 54-maestro-stems — design notes

**Question**: what if each instrument in an AI-generated band played from a distinct location in 3D space?

**Route**: `/dream/54-maestro-stems`

## What it does

1. You describe a style (or pick a preset: Cinematic / Jazz Trio / Ambient / Folk / Electronic).
2. Click **Generate Track + Stems** → server calls `beatoven/music-generation` on fal.ai.
3. Beatoven Maestro generates a ~2.5-minute instrumental **and returns four separate stems**:
   drums, bass, melody, and other (harmonic filler / pads).
4. Each stem is decoded and routed through its own Web Audio HRTF `PannerNode`:
   - **Drums** → directly overhead (+60° elevation)
   - **Bass** → below (−30° elevation)
   - **Melody** → front-right (+30° azimuth, +10° el)
   - **Other** → front-left (−30° azimuth, ear level)
5. **Play Stems** → the band plays. Each instrument comes from its own spatial position.
6. Mix sliders per stem: fade any instrument in/out live without stopping playback.
7. Mute per stem: solo any instrument by muting the rest.

## Why this is different from 7-spatial

`7-spatial` splits mic input into 6 **frequency bands** and places each in 3D space.
`maestro-stems` places by **musical role** — the drums come from above because they're the drums,
not because they occupy a particular frequency band. Bass guitar and kick drum both share the
low-frequency range, but only the bass stem goes below — the kick is above with the rest of the drums.
This is a fundamentally different kind of spatialization: role-based, not spectral.

## Spatial positions rationale

- **Drums above**: percussion in classical concerts often comes from above (elevated orchestra pit)
  or from behind at festivals. Above = spatial "impact" position.
- **Bass below**: sub-bass is visceral and floor-felt. Placing it below grounds the listener
  physically — the floor rumbles beneath you.
- **Melody front-right**: primary lead voice at slight right-of-center. Natural asymmetry between
  melody and harmony keeps both distinct from the center reference.
- **Other front-left**: harmonic support from the left balances the melody on the right.

## Canvas

Top-down sphere view (same pattern as `29-scene-spatial` and `53-ghost-sfx`). Listener at center,
forward = up (F label). Source dots placed at their azimuth positions. Elevation shown as ↑/↓
labels since the top-down view can't render it directly. Glow rings appear on active/unmuted stems.

## Known uncertainty

Endpoint `beatoven/music-generation` from RESEARCH.md §101 (Beatoven Maestro on fal.ai, Cycle 66
research sweep). Input parameters `{prompt, stems: true}` are reasonable guesses. If the endpoint
name or stem output structure differs, the raw error is displayed in the UI for Karel to paste back.

## Polish ideas

- Drag dots to reposition stems in the canvas (same drag pattern as `29-scene-spatial`)
- Auto-detect stem readiness and auto-start playback
- Waveform strip per stem (mini scrolling visualizer)
- Export mix: download the spatially-mixed stereo audio via `MediaStreamDestination`
- Add a "full mix" fallback tab that plays the non-stemmed track URL (Beatoven returns this too)
- Scene presets: "jazz in a jazz club" spatial arrangement vs. "chamber music" vs. "live stage"
