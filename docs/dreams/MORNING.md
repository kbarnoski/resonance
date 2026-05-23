# Morning digest — last updated 2026-05-23 UTC (Cycle 128)

## New since yesterday

- **[/dream/108-kids-kalimba](/dream/108-kids-kalimba)** — Kalimba (kids) · *Cycle 128 (this cycle)* · `demoable`
  Eight colorful vertical bars — violet to pink, left to right. Tap any bar to pluck it with
  Karplus-Strong string synthesis: a brief noise burst feeds into a tuned feedback ring buffer
  and decays naturally over 1–4 seconds (low strings ring longest). Taller bars sound lower,
  shorter bars sound higher — no note names, the physical law teaches itself. Drag across bars
  for a glissando; multi-touch plucks several strings simultaneously. Soft ambient C-E-G pad.
  Demo auto-strums a gentle arpeggio until a child touches the screen; stops instantly on first
  tap to let the child take over. Zero permissions, zero API.
  **Why open it**: hand to a child immediately after the start button. The bar heights make the
  pitch relationship physically obvious without any words — longer = lower, like a real kalimba
  tine or guitar string. This is the first kids prototype with a physical tuning model.
  Loved prototypes that pulled this: `82-kids-color-piano` (tap → vivid response) + `83-kids-tilt-rain`
  (embodied gesture = music).

- **[/dream/107-ocean-presence](/dream/107-ocean-presence)** — Ocean Presence · *Cycle 127*
  Move your cursor slowly across the dark ocean — teal-to-violet dye trails swirl behind it,
  and a sine tone rises with your speed. First prototype where cursor motion IS the instrument.
  No mic, no API, WebGPU required.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **Adult research sweep** (recommended Cycle 129): last adult research was Cycle 117, now 12
  cycles ago. Due for a deep WebGPU, TouchDesigner, generative AV sweep.
- **`kids-bounce-notes`** (next kids idea, Cycle 130): physics ball bounces, plays pentatonic
  notes on wall collisions. Self-playing — child taps to spawn more balls. Zero permissions.
- **`veo3-ghost`**: Ghost LoRA image → Veo 3 Fast → 5s cinematic clip with native audio.
  ~$2.00/clip. Waiting on Karel budget approval.

## Open questions for Karel

1. **Kalimba tuning range** — currently C3–A4 (two octaves C-major pentatonic). Want it lower
   (C2–A3) for a deeper, more resonant kalimba feel? Easy to change in one line.
2. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`,
   `45-piano-to-ghost`. Four prototypes waiting.
3. **`veo3-ghost` budget** — $2.00 per clip (Veo 3 Fast). Good to go?
