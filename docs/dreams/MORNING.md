# Morning digest — last updated 2026-05-23 UTC (Cycle 136)

## New since yesterday

- **[/dream/115-kids-weather-music](/dream/115-kids-weather-music)** — Weather Music (kids) · *Cycle 136* · `demoable`
  Touch anywhere on the screen — you're inside that weather. Hold top-right
  for ☀️ Sun: bright C-major arpeggios + golden rays. Top-left for ☁️ Cloud:
  soft Am chord + drifting grey puffs. Bottom-left for 🌧️ Rain: pentatonic
  drops + falling streaks. Bottom-right for 💨 Wind: a gliding oscillator
  sweeping the pentatonic scale + horizontal streaks.
  **The magic**: drag slowly from ☀️ to 🌧️ and the arpeggio fades while
  the rain notes build — a natural musical diminuendo a 4yo finds by accident.
  Multi-touch: two fingers in different zones blend both sounds simultaneously.
  No tap targets, no characters — the whole screen IS the instrument.
  Zero permissions · Zero API · Zero deps · 3.48 kB.

- **[/dream/114-live-harmonize](/dream/114-live-harmonize)** — Live Harmonize · *Cycle 135* · `demoable`
  Play a melody → diatonic 3rd and 5th harmony voices follow in your key.
  Key detected live (chroma template matching). Scrolling piano roll:
  melody=orange, 3rd=blue, 5th=indigo. Demo: Bach BWV 772 / C major.
  Zero API · Zero deps · 3.68 kB.

- **[/dream/113-kids-conductor-wand](/dream/113-kids-conductor-wand)** — Conductor Wand (kids) · *Cycle 134* · `demoable`
  Drag anywhere — wand follows, rainbow trail. Y=pitch, speed=note rate.
  4 orchestras (Playground/Space/Forest/Ocean). Demo auto-conducts on load.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **Adult research** (Cycle 137): last adult research was Cycle 129 — 7 adult
  cycles ago. Research rule says every 3–4 cycles. Cycle 137 should be a
  research sweep. Ideas queue is healthy but may have stale entries.

## Open questions for Karel

1. **Weather Music zones**: bilinear blend from all four corners. Does the zone
   layout feel right? (Sun=top-right, Cloud=top-left, Rain=bottom-left,
   Wind=bottom-right). Happy to remap if one feels off.
2. **Live-harmonize latency**: key detection catches up in ~6 notes. 1–2 "wrong"
   harmonies during modulation — acceptable, or should it freeze key until
   a chord boundary?
3. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`,
   `44-binaural-lyria`. Any update?
4. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
5. **Ball-ball collision** in `109-kids-bounce-notes` — balls pass through
   each other. Polish cycle worth it?
