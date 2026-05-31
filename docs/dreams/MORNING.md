# Morning digest — last updated 2026-05-31 UTC (cycle 258)

## New since yesterday

- **`/dream/224-kids-glow-garden`** (cycle 258, kids) — Tap to grow a flower. Each flower sings
  its pentatonic note. Plant two flowers near each other → a glowing arc connects them, both
  brighten, and a 3-note resonance chord rings (both pitches + perfect fifth above the lower).
  **WHERE you plant = which harmonies you get.** The garden layout IS the music. First tap wakes
  the two demo flowers with a retroactive chime — rewarding. BANDIMAL sizing (bigger=lower).
  Kids 3+ · Zero permissions · 2.81 kB.

- **`/dream/223-fourier-paint`** (cycle 257, adult) — Draw any closed shape, press Animate.
  The Fourier Transform decomposes your path into rotating epicycles — a chain of spinning arms
  reconstructs your shape while each arm's harmonic plays as a sine tone. **The shape IS the
  timbre**: circle → pure sine. Square → square wave. 5-point star → fundamental + 5th harmonic.
  Terms slider (1–64) lets you hear the harmonic series build in real time. Zero deps · 3.3 kB.

## In progress / partial

Nothing in-progress. Next build: adult cycle 259.

## Research findings worth a look

- **`glow-garden` resonance mechanic** — `NEAR_FRAC = 0.34` (34% of screen width) is the right
  threshold. Scales naturally with screen size so demo flowers (at 29% and 62% of width, 33% apart)
  are always in resonance range on phone and tablet both.

- **Retroactive audio on first tap** — pattern established in `224-kids-glow-garden`: demo flowers
  plant visually before AudioContext exists; `ensureAC()` on first tap retroactively starts their
  oscillators AND fires the resonance chime. First interaction = garden wakes up all at once. Good
  pattern to reuse in future prototypes with visual pre-demos.

- **`paths-granular`** — still blocked on your OK for `/api/audio/[id]`. One "yes" unlocks it.

## Open questions for Karel

- **`/api/audio/[id]`**: publicly accessible without auth? Unlocks `paths-granular` —
  granular synthesis of your Welcome Home album tracks. Has been pending several cycles.

- **`224-kids-glow-garden`**: try planting flowers at left, center, and right — all three form
  three resonance pairs simultaneously, filling the garden with overlapping arcs. Worth trying
  with headphones for the sustained pentatonic drone layer.

- **`217-dance-avatar`** — you ❤️ loved it recently. `221-optical-flow-music` was the first
  follow-up (camera motion → sound). Next ideas in this direction: `gesture-music`
  (hand landmarks via MediaPipe) or a body-tracking Fourier piece (dance moves → harmonic
  content via pose keypoints). Say the word.

- **FAL_KEY budget**: `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.

- **Cycle 259 adult candidates** — lean toward `aria-companion` (Markov-chain piano duet,
  zero deps, first dialogue prototype — high surprise), `chord-canvas` (first music-theory-named
  prototype), or `mood-xy` (2D emotion → synthesis). Which sounds most interesting?
