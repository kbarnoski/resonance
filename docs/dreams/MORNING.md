# Morning digest — last updated 2026-05-31 UTC (cycle 260)

## New since yesterday

- **`/dream/226-kids-face-song`** (cycle 260, kids) — A glowing face made of five musical parts.
  Tap each to wake it up: **head** = deep C2 drone (violet), **left eye** = G3 pluck every 800ms (teal),
  **right eye** = E3 pluck every 1200ms (amber), **nose** = A3 bounce every 600ms (rose),
  **mouth** = C3–G3–A3–E3–C4 melody (cyan). Tap again to silence. All five active → sparkle burst +
  "La la la! ✨". Eyes blink independently (different periods, never sync). Nose bounces to its beat.
  Mouth arc opens and closes while singing. **First prototype shaped like a human face** — body part
  = voice, size = pitch (BANDIMAL). Kids 3+ · Zero permissions · Zero API · 2.84 kB.

- **`/dream/225-aria-companion`** (cycle 259, adult) — Play a piano phrase. Pause 2s. Aria responds
  with a Markov-chain phrase trained on YOUR intervals, then listens again. By exchange 4–5 the
  response starts echoing your own melodic habits. **First dialogue prototype.** Split piano roll,
  demo mode included. Zero deps · 3.66 kB.

## In progress / partial

Nothing in-progress. Next: adult cycle 261.

## Research findings worth a look

- **Face → music body-mapping works well for very young kids.** The head/eye/nose/mouth metaphor
  lets a 4-year-old say "the nose makes the bouncy sound" and know exactly which part to touch.
  Prior prototypes (drums, circles, plants) are visually arbitrary for non-readers. Faces are not.
  Could extend this: what does a "full body instrument" look like? Head=drone, shoulders=chord,
  hands=melody, feet=kick drum — could be a fun next prototype for the kids zone.

- **Polyrhythm from three independent periods (800ms / 1200ms / 600ms)** creates a 2.4s full
  cycle (LCM). The child doesn't know that — they just hear the rhythm feel "busy" when all three
  are on. The emergent complexity from simple intervals is more surprising than I expected.

## Open questions for Karel

- **`226-kids-face-song`**: try it on a phone in portrait mode — faces naturally appear on phone
  screens. The geometry scales cleanly. Does the mouth arc hit zone feel big enough for small fingers?
  The hit radius is ±52px Y from the arc, which should be generous.

- **`/api/audio/[id]`** — still pending your OK. Unlocks `paths-granular` (granular synthesis of
  your Welcome Home album tracks) and `music-to-ghost` (mic → chord analysis → Ghost LoRA image).

- **`217-dance-avatar`** ❤️ follow-up — gesture-music via MediaPipe is queued; needs OK on ~8MB
  CDN load.

- **Cycle 261 adult candidates**: `chord-canvas` (first music-theory prototype — mic → chord name
  + color timeline; chroma vector + template matching), `mood-xy` (2D valence/arousal → real-time
  synthesis; drag a dot to steer the music), or `225-aria-companion` polish (Markov heatmap: 12×12
  pitch-class grid showing your interval tendencies as a visual map). Which sounds most interesting
  to you this morning?

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
