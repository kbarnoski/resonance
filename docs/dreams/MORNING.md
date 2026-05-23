# Morning digest — last updated 2026-05-23 UTC (Cycle 135)

## New since yesterday

- **[/dream/114-live-harmonize](/dream/114-live-harmonize)** — Live Harmonize · *Cycle 135* · `demoable`
  Play a melody into the mic — the system detects your key live and plays
  diatonic 3rd and 5th harmony voices alongside each note.
  Third pans slightly right; fifth slightly left. Like a trio: you lead, two
  voices follow — always in your key. A scrolling piano roll records all three
  parts (orange=melody, blue=3rd, indigo=5th).
  **Key insight**: intervals change per scale degree — E in C major gets G
  (minor 3rd) and B (P5); B gets D and diminished-5th F. Not mechanical
  transposition. Key display updates live as you play.
  Demo mode: Bach BWV 772 fragment, C major, loops.
  Mic optional · Zero API · Zero deps · 3.68 kB.

- **[/dream/113-kids-conductor-wand](/dream/113-kids-conductor-wand)** — Conductor Wand (kids) · *Cycle 134* · `demoable`
  Drag anywhere — wand follows, rainbow trail. Y=pitch, speed=note rate.
  4 orchestras (Playground/Space/Forest/Ocean), each with own color + reverb.
  Demo mode auto-conducts Lissajous figure until first touch.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

- **[/dream/112-bio-echo](/dream/112-bio-echo)** — Bio Echo · *Cycle 133* · `demoable`
  Play piano → watch a forest grow. Sub-bass=tendrils, bass=trunk (never
  shrinks), mid=canopy, onsets=birds, treble=sky. Canvas never clears.
  Save as PNG. Zero deps · 3.6 kB.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **kids-weather-music** (Cycle 136): four atmosphere zones, drag to blend
  continuously. Most different kids prototype yet — sustained states, not taps.
- **Research cycle** (Cycle 137 or sooner): adult research is 6 adult cycles
  overdue. Next research sweep should cover WebGPU compute, new fal.ai models
  (since Cycle 129), and Houdini→browser techniques.

## Open questions for Karel

1. **Live-harmonize latency**: key detection stabilizes in ~6 notes. On a
   modulation, you'll hear 1–2 "wrong" harmonies before it catches up — is that
   acceptable, or should I freeze the key until a chord boundary?
2. **Live-harmonize demo**: Bach fragment loops. Better demo: a more melodic
   piece, or a ii-V-I jazz phrase that shows the harmony chord changes visually?
3. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`,
   `44-binaural-lyria`. Any update?
4. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
5. **Ball-ball collision** in `109-kids-bounce-notes` — balls pass through each
   other. Polish cycle worth it?
