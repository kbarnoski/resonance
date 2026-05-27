# Morning digest — last updated 2026-05-27 UTC (Cycle 209)

## New since yesterday

- **[/dream/178-splat-bloom](https://getresonance.vercel.app/dream/178-splat-bloom)** — Splat Bloom (adult)
  500 luminous oriented ellipses in a Gaussian cloud, rendered with additive ("screen") compositing.
  Overlapping splats add light — the dense centre blooms to near-white while sparse edges stay
  richly coloured. Bass pulses the centre outward (nearest 100 splats scale ×1.6); treble slowly
  swirls the whole field; spectral centroid shifts the global hue from violet to amber; onsets
  scatter 50 random splats that spring back over ~2 s.
  **Why open it**: open demo mode and just watch — the centre breathes with the LFO like a living
  nebula. Then add mic and play piano; the colour temperature shifts from violet (bass-heavy) toward
  amber (treble-bright) as your playing changes register. The "screen" compositing means you never
  see individual splats — only their cumulative light. Qualitatively unlike any of the 177 prior
  prototypes: not particles, not fluid, but a *texture field*.

- **[/dream/177-kids-lego-sequencer](https://getresonance.vercel.app/dream/177-kids-lego-sequencer)** — Lego Beats 🧱 (kids, Cycle 208)
  First 2D pitch×time grid in the kids zone. 8-step × 6-row block sequencer with lego-brick visual.
  Tap a block → it plays when the cursor sweeps past, looping endlessly. Comes pre-seeded with a
  starter melody. Ages 3+, zero permissions.

## In progress / partial

- Nothing in-progress. Next queued:
  - **Cycle 210 (kids, 210%2=0)** → `kids-voice-monster` — hum/sing to feed a glowing character;
    it grows with amplitude, colour-shifts with pitch, sings your pitches back after 30 s.
  - **Cycle 211 (adult, 211%2=1)** → `score-structure` (real-time improvisation architecture
    analyser from Karel's piano recordings) or `loop-station` v2.

## Research findings worth a look

- WebSplatter (RESEARCH.md §222, Feb 2026) — Gaussian splat Canvas2D technique as an AV medium.
  Inspired `splat-bloom`. The "screen" compositing insight: individual splat opacity becomes a
  density parameter — the denser the cloud, the brighter the light. This is a fundamentally
  different visual logic from colour or size.
- BrickMusicTable (arxiv 2411.13224, Nov 2024): lego block grid sequencer validated with 150+
  kids aged 3–13. Inspired `kids-lego-sequencer`. Construction-as-composition is pedagogically
  sound at ages 3–13.

## Open questions for Karel

- **`splat-bloom` sensitivity**: demo LFOs are gentle by design. With loud piano mic input the
  bloom push and onset scatter will be more dramatic. Worth testing at your desk with a recording.
- **`kids-lego-sequencer` tap size on phone**: cells are ~44px wide at 375px screen width. Comfortable
  on iPad (~93px). The lower rows may need a stretched thumb on a small phone — worth a check at
  `/dream/177-kids-lego-sequencer`.
- **Cycle 211 direction**: `score-structure` (analyses phrase architecture from your recordings —
  fulfils the "Karel's actual music as input" directive) vs. `loop-station` v2 (SA3 continuation).
  Your preference, or I'll default to `score-structure`.
