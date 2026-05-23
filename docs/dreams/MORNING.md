# Morning digest — last updated 2026-05-23 UTC (Cycle 137)

## New since yesterday

- **[/dream/115-kids-weather-music](/dream/115-kids-weather-music)** — Weather Music (kids) · *Cycle 136* · `demoable`
  Touch anywhere on the screen — you're inside that weather. Hold top-right
  for ☀️ Sun: bright C-major arpeggios + golden rays. Top-left for ☁️ Cloud:
  soft Am chord + drifting grey puffs. Bottom-left for 🌧️ Rain: pentatonic
  drops. Bottom-right for 💨 Wind: gliding oscillator + horizontal streaks.
  Drag slowly between zones — the music crossfades over ~1.5s. Multi-touch:
  two fingers in different zones blend both sounds simultaneously.
  Zero permissions · Zero API · Zero deps · 3.48 kB.

- **[/dream/114-live-harmonize](/dream/114-live-harmonize)** — Live Harmonize · *Cycle 135* · `demoable`
  Play a melody → diatonic 3rd and 5th harmony voices follow in your key.
  Key detected live. Scrolling piano roll: melody=orange, 3rd=blue, 5th=indigo.
  Demo: Bach BWV 772 / C major. Zero API · Zero deps · 3.68 kB.

## Cycle 137 — research sweep (adult)

8 adult cycles since last research (threshold = 3–4). Full sweep done.
**6 new prototype seeds** added to IDEAS.md and RESEARCH.md §191–§196:

1. **`data-cosm`** (zero deps, zero API, one cycle) — Ryoji Ikeda aesthetic.
   Synthetic particle physics event stream: scrolling monospace matrix of
   collision data on pure black + audio pulse per event (sub-bass hum +
   4kHz sine burst). Three scales auto-advance every 40s: Quantum (dense, fast,
   8 events/sec) → Biological (1/sec, 440Hz) → Cosmic (1/10s, near-silence,
   single centered event). Scale transitions: full-canvas white flash → numbers
   scatter → snap back. Completely different visual language from all 115
   existing prototypes. **Highest surprise of this batch.**

2. **`poem-fluid`** (zero deps, zero API, one cycle) — Memo Akten "The Thinking
   Ocean" paradigm (Whitney Artport 2026: WebGPU fluid + generative real-time
   poem). WebGL Navier-Stokes fluid driven by mouse presence + Markov text
   overlay keyed to fluid vorticity: still water → long Ghost narrative sentence;
   gentle motion → 3-5 word phrase; turbulence → single word. "The fluid speaks
   in fragments — the calmer the water, the fuller the thought."

3. **`image-chord`** (zero deps, zero API, one cycle) — Drag any image onto
   the canvas. Extract dominant hue H, saturation S, brightness L via
   `getImageData()`. Map to synthesizer: hue → chord quality (warm=major,
   cool=minor, violet=diminished); saturation → harmonic richness (1–5 voices);
   brightness → register + tempo. 8 preset journey-theme swatches. "Your
   visual sense becomes music." Inspired by Mozualization (Apr 2026).

4. **`arc-steer`** (FAL_KEY in use, one cycle) — MusicRFM concept ported to
   ACE-Step. 6 editable textarea fields, one per journey phase, each with a
   mood descriptor. ▶ Start Journey → fires 6 sequential ACE-Step calls
   (30s each, ~$0.036 total). Each phase plays through the bloom visualizer;
   timeline advances live. "Write the emotional arc. Hear it realized."

5. **`audio-cloud`** (zero deps, WebGPU required, two cycles) — Elekktronaut
   TouchDesigner particlesGPU technique → WebGPU. 6 particle species, one per
   FFT band, each with distinct physics: sub-bass particles fall (gravity), high
   particles scatter (repulsion), all other species between. 12,000 particles.

6. **`body-conductor`** (CDN ~8MB, one cycle, needs your OK) — MediaPipe
   PoseLandmarker: 33 body landmarks at 30fps. Wrist Y → pitch/bass, arm span →
   stereo width, elbow angle → harmonics, body motion → dynamics. Full-body
   dance → music. Needs OK on CDN dep.

## In progress / partial

- Nothing in-progress.

## Open questions for Karel

1. **`body-conductor` CDN dep** — MediaPipe PoseLandmarker is ~8MB, CDN-loaded
   (no package.json change). Same pattern as the queued `31-gesture-music`.
   Good to proceed? Unlocks full-body dance → synthesizer.
2. **`arc-steer` spend** — 6 × ACE-Step 30s = ~$0.036 per journey run. Small
   budget. Good to proceed?
3. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Still waiting for OK.
4. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`. Any
   update?
5. **`data-cosm` vs `poem-fluid` for Cycle 139** — both are one-cycle, zero deps.
   `data-cosm` is more visually striking / surprising. `poem-fluid` is more
   emotionally resonant (Ghost narrative + fluid). Which calls to you?
