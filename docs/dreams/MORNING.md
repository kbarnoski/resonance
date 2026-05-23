# Morning digest — last updated 2026-05-23 UTC (Cycle 126)

## New since yesterday

- **Cycle 126 — kids research sweep** (no new prototype)
  Kids seeded queue was exhausted. Spent the cycle researching 2026 kids music interaction:
  BANDIMAL design principles, Shape Your Music, physics ball music (Bouncy), CHI 2025 touchscreen
  review, Sound2Hap haptics (arxiv Jan 2026), conducting gesture research. Seeded **6 new kids
  prototype ideas** in KIDS.md — the queue is now full again.
  **Top recommendation**: `kids-kalimba` for Cycle 128 — BANDIMAL-inspired, bar height = pitch,
  zero reading, one-cycle build.

- **[/dream/106-beat-cut](/dream/106-beat-cut)** — Beat Cut · *Cycle 125 (yesterday)*
  6,000 particles in all six of your published journey themes. Every audio onset hard-cuts the
  camera — no tween, just a snap. TouchDesigner camSequencer ported to browser.
  **Why open it**: Demo mode → watch the camera flicker between Cosmic → Earth → Ocean →
  Snowflake → Sanctuary → Ghost on the beat. Mic mode: every sharp piano attack fires the next cut.

## In progress / partial

- Nothing in-progress. Clean queue.

## Research findings worth a look

- **`kids-kalimba`** (recommended Cycle 128): 8 vertical glowing bars, tap to pluck
  (Karplus-Strong), drag to retune. Bar HEIGHT = pitch — no note names, the physical analogy
  teaches itself ("longer bar = lower note", same as every real kalimba/xylophone/guitar). One-cycle
  build, zero deps. Directly extends your loved `82-kids-color-piano` interaction.
- **`kids-bounce-notes`**: physics balls bounce and play pentatonic notes on wall collision.
  First autonomous-music kids prototype — child just adds more balls, physics makes the music.
- **`kids-shape-loop`**: draw a closed shape with finger → it loops as a melody forever.
  Multiple shapes = polyphony. Build a layered composition by drawing.
- **Sound2Hap (arxiv Jan 2026)**: audio → vibrotactile haptic generation. Not browser-buildable
  today (Web Vibration API too coarse), but iOS 26 Haptic Engine API may change this. Tagged [emerging].

## Open questions for Karel

1. **Beat Cut** — cooldown is 380ms; if your playing is dense (fast runs), cuts fire fast. Want
   it tuned? I can slow it (500ms+) for melodic playing or speed it (200ms) for percussive.
2. **Particle camera angles** — Cosmic = above, Earth = below-front, Ocean = far-left, Snowflake
   = high-right, Sanctuary = front, Ghost = back-low-left. Any feel wrong? One-line fix.
3. **Kids kalimba** — the BANDIMAL app is on the App Store if you want to see the interaction
   before I build it. Bar height = pitch, drag to tune. Very tactile.
4. **Chord Canvas** (adult, queued Cycle 127) — first prototype that NAMES the chord you're
   playing (F♯m, C, Bdim etc.) + color timeline strip. Good for the morning review after you
   practice?
5. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`,
   `45-piano-to-ghost`. Four prototypes waiting.
