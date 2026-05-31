# Morning digest — last updated 2026-05-31 UTC (cycle 262)

## New since yesterday

- **`/dream/228-kids-creature-grow`** (cycle 262, kids) — An egg hatches and a creature grows as
  you feed it notes. Six taps = fully grown: **eyes** (C4 cyan) → **ears** (D4 emerald) →
  **smile** (E4 amber) → **arms** (G4 blue) → **legs** (A4 rose) → **wings** (C5 gold).
  Completion: 60-sparkle burst + "✨ Fully grown! ✨" + creature sings back your six notes with
  each body part glowing on its note. Tap again to sing once more. Progress dots at canvas
  bottom fill with each part's color as you tap. **First kids prototype where tapping literally
  grows anatomy from scratch** — unlike face-song (pre-drawn face you toggle), the egg starts
  with NO body. You gave it eyes. Zero permissions · Zero deps · 3.18 kB.

- **`/dream/227-paths-granular`** (cycle 261, adult, README added) — Upload any audio file and
  sculpt it into a grain cloud. Scrub to a moment; scatter Hann-windowed fragments (20–500 ms)
  at configurable density (2–30/s) with ±12 st pitch shift. **First granular synthesis
  prototype.** Try: scrub to a piano sustain → grain 120 ms + density 12 + pitch +7 → instant
  dreamy pad. Zero deps · Zero API · 3.65 kB.

## In progress / partial

Nothing in-progress. Next: adult cycle 263.

## Research findings worth a look

- **The growth arc creates a new engagement mode.** Prior kids prototypes reward instant
  feedback (every tap = immediate sound). Creature Grow has a terminal state — you get 6 taps
  and then the creature is done. The child then taps to HEAR, not to BUILD. This is a different
  relationship: completion → singing. The arc has beginning (egg) + middle (growing) + end
  (wings). Unexpectedly, this also teaches note sequence: the child hears the pentatonic scale
  C4→D4→E4→G4→A4→C5 in order across 6 taps.

- **Sing-back with per-part glow is a "memory" mechanic.** When the creature sings each note,
  the corresponding body part glows. The child can point at the glowing ear and say "that's the
  D sound!" — the creature's anatomy IS the theory lesson, without any text.

- **Growth-by-feeding echoes `163-paths-visualizer` ❤️ and `169-kids-marble-run` ❤️** — Karel
  loves prototypes where repeated interaction builds visible complexity. Creature Grow is that
  pattern at its most literal.

## Open questions for Karel

- **`228-kids-creature-grow`**: Does the 6-tap arc feel too short or just right? A fully grown
  creature in 6 taps is ~10 seconds for a focused child. Could extend to 8 taps (add a tail and
  a nose) but it might feel long. Also: does the sing-back timing (580ms between notes) feel
  natural or should it be faster?

- **`227-paths-granular`**: Load one of your Welcome Home recordings. Sweet spots:
  - Grain 120 ms + density 12 → smooth frozen pad
  - Grain 25 ms + density 28 → glitchy shimmer
  - Scatter 45% + density 10 → evolving cloud from one instant
  Does the grain density feel smooth? On slow browsers the 100ms lookahead should prevent gaps
  but let me know if you hear clicks.

- **`/api/audio/[id]`** — still pending your OK. Unlocks `227-paths-granular` auto-load (no
  manual upload) and `163-paths-visualizer`-style direct album access for future adult prototypes.

- **Cycle 263 adult candidates**: `chord-canvas` (28, mic → chroma → chord name + color
  timeline — first music-theory prototype), `mood-xy` (38, 2D valence/arousal canvas drives
  synthesis — first emotion-coordinate prototype), or `scene-spatial` (29, Ghost preset scenes
  as HRTF 3D audio environments). Which sounds most interesting?

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
