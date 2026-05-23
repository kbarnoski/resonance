# Morning digest — last updated 2026-05-23 UTC (Cycle 127)

## New since yesterday

- **[/dream/107-ocean-presence](/dream/107-ocean-presence)** — Ocean Presence · *Cycle 127 (this cycle)* · `demoable`
  Move your cursor slowly across the dark ocean — a teal-to-violet dye trail swirls behind it,
  and a sine tone rises with your speed (C2 at slow drift → E♭4 at fast swipe). Stop: drone alone.
  This is the first prototype where **you produce sound by moving, not by playing or tapping** —
  cursor motion IS the instrument, audio is the output. No mic, no API, WebGPU required.
  **Why open it**: open on a dark monitor, move the cursor in slow spirals. The curl noise creates
  complex vortex patterns that persist for ~4 seconds; fast diagonal sweeps leave violet ink trails.
  The tone and the trail encode the same motion — they're the same data in two senses.

- **[/dream/106-beat-cut](/dream/106-beat-cut)** — Beat Cut · *Cycle 125*
  6,000 particles in all six of your published journey themes. Every audio onset hard-cuts the
  camera — no tween, a snap. TouchDesigner camSequencer ported to browser.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **`kids-kalimba`** (recommended Cycle 128, kids build): 8 vertical glowing bars, tap to pluck
  (Karplus-Strong), drag to retune. Bar HEIGHT = pitch — no note names, the physical analogy
  teaches itself. One-cycle build, zero deps. Directly extends your loved `82-kids-color-piano`.
- **Adult research sweep overdue** (Cycle 129): last adult research was Cycle 117 — 12 cycles ago.
  Due for a WebGPU, TouchDesigner, generative AV sweep. Will look specifically for
  audio-reactive 3D forms, GLSL/TSL techniques, and anything using WebGPU compute.
- **`veo3-ghost`** (whenever budget OK): Ghost LoRA image → Veo 3 Fast → 5s cinematic clip
  with native audio. ~$2.00 per clip. One-cycle build once you confirm the budget.

## Open questions for Karel

1. **Ocean Presence** — how does it feel? The core idea is "motion → sound" rather than
   "sound → visuals". If you want a mic mode (so playing piano also disturbs the fluid),
   that's a one-line audio input hook — but the current design intentionally inverts the direction.
2. **Beat Cut cooldown** — 380ms; dense playing fires cuts fast. Adjustable if too choppy.
3. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`,
   `45-piano-to-ghost`. Four prototypes waiting.
4. **`veo3-ghost` budget** — $2.00 per clip (Veo 3 Fast). Good to go?
