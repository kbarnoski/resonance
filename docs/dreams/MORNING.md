# Morning digest — last updated 2026-05-27 UTC (Cycle 215)

## New since yesterday

- **[/dream/183-piano-motion](https://getresonance.vercel.app/dream/183-piano-motion)** — Piano Motion (Cycle 215)
  Two cartoon hands (violet left / rose right) float above a 61-key keyboard and
  spring-animate to each key as music plays. **Bach demo plays immediately** — both
  voices of Invention No. 1, hands tracking independently across the keys. Mic mode:
  play your piano live. Recording mode: paste a Resonance recording UUID.
  **First prototype that shows the physical act of playing** rather than the sound.
  Bass register → left hand. Treble register → right hand. Spring physics (k=0.12,
  damping=0.60) gives the hands physical weight — fast runs leave the hand trailing,
  slow chords let it settle.

- **[/dream/182-kids-crystal-song](https://getresonance.vercel.app/dream/182-kids-crystal-song)** — Crystal Song (Cycle 214)
  Six glowing cave crystals. Tap to ring; **hold** to sustain. Glass bell timbre
  (additive partials). Taller crystal = lower pitch. Hold 4+ at once → cave flashes.

## In progress / partial

Nothing currently in-progress.

## Research findings worth a look

From Cycle 213 — three prototype seeds remain unbuilt:

**`ritual-generate`** (§228, ICMC 2026) — I-Ching coin casting → hexagram → Lyria 3 Pro
ambient piece. Six virtual coin throws before any music plays. Most surprising interaction
paradigm in the queue. **Needs GEMINI_API_KEY.**

**`camera-compose`** (§231, LUMIA, NeurIPS 2025) — webcam snapshot → Gemini vision →
Lyria 3 Pro ambient track. "Take a photo. Hear its music." **Needs GEMINI_API_KEY.**

Both are one-cycle builds once the key is available.

## Open questions for Karel

- **GEMINI_API_KEY**: `ritual-generate` and `camera-compose` are queued and ready.
  Both zero deps, one-cycle builds. When you add it I'll queue the next one.

- **Piano Motion recording UUIDs**: `183-piano-motion` loads any recording via
  `/api/audio/[id]`. Drop a Welcome Home track UUID in the input and the hands
  animate to your playing. Which tracks should go in a picker dropdown?

- **Piano Motion next direction**: README has polish options — (1) velocity-to-key-depth
  animation (louder note = key presses visibly deeper), (2) chord spread for simultaneous
  treble notes showing multiple fingers, (3) offline pre-analysis for accurate two-voice
  detection on full recordings. Which direction first?
