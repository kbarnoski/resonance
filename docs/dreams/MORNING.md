# Morning digest — last updated 2026-05-27 UTC (Cycle 212)

## New since yesterday

- **[/dream/181-kids-texture-drum](https://getresonance.vercel.app/dream/181-kids-texture-drum)** — Texture Drum (kids, Cycle 212)
  Five material zones: 🪵 Wood · 🔔 Metal · 💧 Water · 🥁 Earth · 🫙 Glass. Tap any zone to hear
  its synthesized timbre (Wood = lowpass noise thud; Metal = tight bandpass bell ring; Water =
  sweeping noise drip; Earth = 72Hz sub-kick; Glass = 2440Hz sharp ping). Hold to roll (80ms
  rapid-fire). Two fingers together → louder accent + full-screen color flash.
  **Why open it**: this is the **first kids prototype about timbre, not pitch**. All 30+ prior kids
  builds used C-major pentatonic — the musical dimension was always "high vs low." Here, the
  difference between zones isn't pitch, it's sound quality. Tap Wood then Glass — same force,
  completely different acoustic world. A 3yo discovers instrumental timbre without any theory.
  Animated water waves + wood grain + stippled earth texture visible before first tap.
  Zero permissions · Zero API · Zero deps · 3.13 kB.

- **[/dream/180-cellular](https://getresonance.vercel.app/dream/180-cellular)** — Cellular (adult, Cycle 211)
  Conway's Game of Life on a 64 × 16 grid. Each column is a pitch (C2→C5). Every Life tick fires
  triangle-wave notes for all columns with a live cell. Try **Glider** — a rising 4-note melody
  that walks rightward and vanishes. Try **R-pent** — 1,103 generations of free-jazz improv.
  Click/drag to draw your own patterns. Left = bass, right = treble.
  Zero permissions · Zero API · Zero deps · 3.02 kB.

- **[/dream/179-kids-voice-monster](https://getresonance.vercel.app/dream/179-kids-voice-monster)** — Voice Monster (kids, Cycle 210)
  Hum/sing to feed a glow-monster (30s). It sings back the distinct pitches it detected.
  "Try demo" works without a mic. First kids prototype with character memory of what the child sang.

## In progress / partial

- Nothing in-progress. Next queued:
  - **Cycle 213 (adult)** → Research sweep overdue (Cycle 203 was last, now 10 cycles since then).
    Or build: `gesture-music` (needs Karel OK on 8MB CDN), `chord-canvas` (zero deps),
    or `voice-scene` (Web Speech API → AV mode switching, zero deps, no prior precedent).

## Research findings worth a look

- **Timbre as first vocabulary** (Cycle 212 observation): All prior kids builds introduce pitch as
  the primary musical concept. Texture Drum inverts this: five timbres, no pitch variation. Children
  can explore material acoustics (what does metal sound like vs. earth?) before any note/scale
  concepts. This is closer to how very young children actually experience sound — as texture
  and quality first, pitch structure second. Worth exploring a "timbre sequencer" prototype.

## Open questions for Karel

- **Texture Drum — Earth zone on phone speakers**: 72Hz is at the edge of small speaker range.
  It will feel more like a thud on laptop speakers and nearly disappear on phone. Worth testing
  on your actual device — easy to bump to 100Hz if needed, still feels low and physical.
- **`gesture-music`**: still waiting on Karel OK for ~8MB MediaPipe WASM from jsDelivr CDN.
  Webcam hands → pitch/reverb/percussion. Genuinely different from all 181 prototypes.
- **Research cadence**: now 10 cycles since last research (Cycle 203). Plan: Cycle 213 = research
  sweep unless you direct otherwise. Want to scan arxiv + GitHub trending for anything post-May.
