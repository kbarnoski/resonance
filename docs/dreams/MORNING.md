# Morning digest — last updated 2026-05-20 UTC (Cycle 50)

## New since yesterday

- **`/dream/42-binaural` — polished** (Cycle 50). Three additions:
  - **Session timer**: `α 2:35` appears after the play button and ticks up per second.
    Switches and accumulates as you move between brainwave presets — so after 2 min in α
    and 3 min in θ, switching back to α resumes from 2:00.
  - **Noise layer**: `off | pink | brown` buttons + level slider. Pink noise = 1/f air-wash
    (good for α/β focus). Brown noise = 300 Hz lowpass rumble (good for δ/θ sleep/meditation).
    Switchable while playing — won't mask the binaural beat, just fills the ambient space.
  - **Journal textarea**: per-state notes persisted in localStorage. Each state has a
    context-appropriate placeholder prompt. A `●` dot in the toggle indicates saved text.
    Open `📓 session notes — alpha ↓` to expand.

- **`/dream/43-stable-extend`** (Cycle 49 — from yesterday): Record piano phrase → Stable Audio
  2.5 on fal.ai continues it seamlessly into 30s. Amber waveform (yours) + blue waveform (AI).
  Bloom visualizer plays the result. ⚠ API may show an error if fal.ai endpoint differs from
  RESEARCH.md §70 spec — tell me the error text if so.

## In progress / partial

- Nothing currently in-progress. Clean queue for next cycle.

## Research findings worth a look

- **Lyria 3** (Google DeepMind, Feb 2026, RESEARCH.md §69): Send a Ghost scene IMAGE into the
  Gemini API → receive a 30s ambient MP3 shaped by that visual's mood. Prototype `lyria-ghost`
  is fully spec'd but blocked on GEMINI_API_KEY. Same key unlocks three other prototypes.
- **binaural-lyria**: Extend `42-binaural` so each brainwave state also generates a Lyria 3
  ambient track matched to that state's profile (δ = vast drones, α = calm piano, γ = bright
  gamelan). Also needs GEMINI_API_KEY. Natural next step after today's `42-binaural` polish.
- **Music as "controlled hallucination"** (Frontiers 2026, RESEARCH.md §74): The brain simulates
  a "virtual body" inside music. `42-binaural` is one of the most direct known browser implementations
  of this effect. The new journal captures first-person data from inside that virtual body state.

## Open questions for Karel

1. **GEMINI_API_KEY** — needed for `lyria-ghost`, `binaural-lyria`, `30-lyria-jam`,
   `45-piano-to-ghost`. Four prototypes blocked by one key. Free tier at Google AI Studio.
2. **`43-stable-extend` API** — did it work? If you see a red error box, paste the text here.
   fal.ai endpoint `fal-ai/stable-audio-25/inpaint` was from RESEARCH.md §70; one fix cycle if wrong.
3. **CDN ONNX dep (~2MB)** — OK for `neural-pitch` CREPE-tiny neural pitch detector?
   ONNX Runtime Web 1.26 now uses WebGPU EP by default — near-native speed, upgrades 6+ prototypes.
