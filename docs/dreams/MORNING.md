# Morning digest — last updated 2026-05-20 UTC (Cycle 51)

## New since yesterday

- **Cycle 51 was a research sweep** (no new prototype). 8 new RESEARCH.md entries (§§77–84).
  5 new prototype ideas added to IDEAS.md. Highlights below.

## Research findings worth a look

- **ACE-Step 1.5 Vocal-to-BGM** (RESEARCH.md §77) — This is the one to notice. ACE-Step is
  already live on fal.ai at `fal-ai/ace-step/audio-to-audio`. Upload a hummed melody or a
  recorded piano phrase → it generates a **full band arrangement** around your melody in 30s
  ($0.006, FAL_KEY already in use). Not a continuation like `stable-extend` — your melody
  IS the lead voice, the AI adds drums/bass/chords beneath it. Prototype `vocal-bgm` is
  queued and buildable with zero new approvals. One-cycle build, Cycle 52.

- **Oscilloscope Music** (RESEARCH.md §82) — An entire art form you may not know about.
  "Oscilloscope music" composers write audio that draws intentional geometric figures (Lissajous
  curves) on an XY oscilloscope. The SOUND IS the VISUAL. Our `20-scope` visualizes existing
  audio; `osc-composer` would invert it: design a shape (circle, trefoil, rose), get the stereo
  WAV that draws it. First prototype where downloading the audio file is the creative act.
  Zero deps, one cycle.

- **Proactive AI Music Therapy** (RESEARCH.md §§80, 84) — Two Frontiers 2026 papers validate a
  "proactive" model: AI guides the user from a current mood to a target mood WITHOUT them having to
  steer continuously. Prototype `mood-journey`: place "Now" and "Goal" dots on the `38-mood-xy`
  canvas, press start, the synthesizer glides automatically. Adds isochronic tones matching the
  current arousal level. 20-minute wellness session. Zero deps, zero API keys. One cycle.

- **`guided-session`** (RESEARCH.md §§74, 75, 80) — A more structured version: user picks
  "Stressed → Calm" and the system walks them through β → α → θ with session timers, transition
  prompts, and the noise layer from `42-binaural`. Clinically grounded, no API keys. One cycle.

- **WebXR Ghost Scene** (RESEARCH.md §81) — WebXR is production-ready in 2026 on Chrome/Meta Quest.
  We could put the spatial audio from `29-scene-spatial` inside a WebXR scene so you're INSIDE the
  Ghost world's sound. Works on desktop (drag to rotate) without a headset. With Meta Quest: walk
  around inside stone chamber or forest dawn. Needs Karel OK on A-Frame CDN dep (~1MB).

## In progress / partial

- Nothing currently in-progress.

## Open questions for Karel

1. **GEMINI_API_KEY** — still needed for `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
   `piano-to-ghost`. Four prototypes blocked by one key. Free tier at Google AI Studio.
2. **`43-stable-extend` API** — did it work? If you see a red error box, paste the text and
   we'll fix the endpoint/parameters in the next cycle.
3. **A-Frame CDN dep (~1MB)** — OK for `ghost-xr` WebXR prototype?
4. **CDN ONNX dep (~2MB)** — OK for `neural-pitch` CREPE-tiny upgrade? ONNX Runtime Web
   1.26 now uses WebGPU EP by default — near-native speed, upgrades 6+ existing prototypes.
