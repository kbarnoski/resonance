# Morning digest — last updated 2026-05-20 UTC (Cycle 55)

## New since yesterday

- **[/dream/47-mood-journey](/dream/47-mood-journey)** — Mood Journey
  _Why open this_: click your NOW mood anywhere on the Russell circumplex (valence × arousal),
  then click your GOAL mood, pick a duration (2m / 5m / 10m / 20m), press Begin. The dot glides
  from Now to Goal automatically — no interaction needed. The music walks with it: BPM, chord
  quality, register, and a second isochronic tone layer all track the gliding position in real time.
  At the midpoint of "distressed → content" you hear a genuine audio blend of both states.
  **The first prototype where you surrender control to the arc.** Zero deps, no API keys.

## What's been shipping (Cycles 53–54)

- **[/dream/46-osc-composer](/dream/46-osc-composer)** — Oscilloscope Composer _(Cycle 54)_
  Design a Lissajous shape, download the stereo WAV that draws it on an oscilloscope in XY mode.
  Perfect fifth = trefoil, perfect fourth = rose, major sixth = starburst. Puzzle mode.

- **[/dream/45-guided-session](/dream/45-guided-session)** — Guided Brainwave Session _(Cycle 53)_
  Pick a journey arc (Stressed → Calm, etc.), isochronic tones walk your brainwave frequency
  from start to goal. No headphones needed. Journal, path breadcrumb, auto-advance.

## In progress / partial

- Nothing currently in-progress.

## Research findings worth a look

- **`mood-journey` is now live** — the proactive traversal prototype shipped this cycle. Polish
  direction: non-linear arc shapes (peak through energetic before descending to serene), waypoint
  system like guided-session, mic amplitude → arousal feedback, preset journeys (Morning activation,
  Sleep prep, Creative flow).

- **Zero-dep buildable queue is now exhausted.** Next cycle will be a research sweep (3–4 cycle
  cadence; last research was Cycle 51, now 4 cycles ago: 52, 53, 54, 55). Research is overdue.

## Open questions for Karel

1. **GEMINI_API_KEY** — still pending. Unlocks `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
   `piano-to-ghost`. Four prototypes waiting on one key. This is the single highest-leverage action
   you can take to unlock the next generation of prototypes.

2. **`44-vocal-bgm` API status** — did the ACE-Step endpoint work, or did you see a fal.ai error?
   If error: paste the message (shown in the prototype's UI) and the agent will fix `route.ts`.

3. **CDN deps awaiting approval**:
   - `ghost-xr` — A-Frame CDN ~1MB → WebXR spatial audio inside a Ghost scene
   - `neural-pitch` — ONNX Runtime Web CDN ~2MB → 10× more accurate pitch detection for 6+ prototypes
   - `browser-musicgen` — Transformers.js ~390MB → offline MusicGen, zero API cost
