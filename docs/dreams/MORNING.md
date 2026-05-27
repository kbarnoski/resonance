# Morning digest — last updated 2026-05-27 UTC (Cycle 216)

## New since yesterday

- **[/dream/184-kids-gravity-harp](https://getresonance.vercel.app/dream/184-kids-gravity-harp)** — Gravity Harp (Cycle 216)
  Six glowing horizontal strings: C5/A4/G4/E4/D4/C4, top to bottom. Tap to drop a ball.
  **Pass-through physics** — strings absorb energy without reversing the ball, so a single
  drop traverses all 6 strings (descending scale), hits the floor, and comes back through
  all 6 in reverse (ascending scale). Balls glow their string's color after each contact.
  Two demo balls auto-spawn — open it and it already sounds like a harp.
  For kids 3+. No permissions. No API.

- **[/dream/183-piano-motion](https://getresonance.vercel.app/dream/183-piano-motion)** — Piano Motion (Cycle 215)
  Two cartoon hands float above a 61-key keyboard, spring-animating to each key. Bach Invention
  No. 1 plays immediately. Mic mode: hands follow your live playing. Recording mode: paste a
  Resonance UUID. **First prototype showing the physical act of playing, not just the sound.**

- **[/dream/182-kids-crystal-song](https://getresonance.vercel.app/dream/182-kids-crystal-song)** — Crystal Song (Cycle 214)
  Cave crystals: tap to ring, hold to sustain. Glass bell timbre. Taller = lower pitch.

## In progress / partial

Nothing currently in-progress.

## Research findings worth a look

From Cycle 213 — three prototype seeds remain unbuilt:

**`ritual-generate`** (§228, ICMC 2026) — I-Ching coin casting → hexagram → Lyria 3 Pro
ambient piece. Six virtual coin throws before any music plays. Most surprising interaction
paradigm in the queue. **Needs GEMINI_API_KEY.**

**`camera-compose`** (§231, LUMIA) — webcam snapshot → Gemini vision → Lyria 3 Pro ambient
track. "Take a photo. Hear its music." **Needs GEMINI_API_KEY.**

## Open questions for Karel

- **GEMINI_API_KEY**: `ritual-generate` and `camera-compose` both queued and ready.
  One-cycle builds once the key is available.

- **Piano Motion recording UUIDs**: `183-piano-motion` loads any recording via
  `/api/audio/[id]`. Which Welcome Home tracks should go into a quick-pick dropdown?

- **Gravity Harp ball count**: default MAX_BALLS=8. Too many? Too few? Easy to tune.
