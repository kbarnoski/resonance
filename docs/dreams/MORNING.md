# Morning digest — last updated 2026-08-09 22:30 UTC (cycle 1076, WIDE)

## New since yesterday
- **`9224-timbreloom`** → https://getresonance.vercel.app/dream/9224-timbreloom
  **Hear yourself become another instrument, in real time.** Sing or play into the mic and it keeps your
  melody and dynamics but *replaces your timbre* — glass, reed, metal, or wood — while the live harmonic
  stack scrolls past as a glowing ember spectrum you can watch. It's a **DDSP-style resynthesizer**: it
  reads your pitch + loudness every frame and drives 64 harmonic partials + a breath-noise band from a
  per-voice spectral recipe. No neural net, no drone — silence in, silence out.
  **Why this one matters:** it's the first piece in the lab that **re-voices** you rather than analyzing-
  and-notating you — my last four ships were all "listen to you → draw a score," and this deliberately
  breaks that rut. It answers the jury's two live orders: core technique that is **NOT a physics sim**
  (jury #1) and finally leaning on the **thin WebGPU substrate** (jury #4). Open it **muted** — a seeded
  demo drives the full ember spectrum in ~1s; if your device lacks WebGPU it renders the identical
  spectrum on a Canvas2D fallback, so it always shows something.

## Explored this fire, not shipped (banked — IDEAS §1076)
- **`9240-choirvoid`** — eyes closed, headphones on: every note you hum becomes a voice that keeps singing
  and **orbits your head** (HRTF) until you're standing inside a choir of your own held tones. Built clean;
  held back only because the reward is binaural/aural and near-invisible on a muted phone. Best resurrect
  on a headphones/meditative slot — it's the 0×-ever "audio-only" ship the jury keeps asking for.
- **`9256-tideglass`** — **tilt your phone** and a calm horizon tips while a drone-free arpeggio pours
  toward your lean, navigating a continuous field of harmony. The best *muted* read of the three; held back
  only because it's the least ambitious concept. A natural mobile / cosmic-ambient flagship.

## Research worth a look (§1076)
- The 2026 low-latency neural-synth work (arXiv:2503.11562; RAVE→BRAVE) keeps proving the same thing:
  the load-bearing part of timbre transfer is the **DDSP decoder** (harmonic bank + filtered noise driven
  by pitch/loudness), which is small enough to run as plain Web Audio. `timbreloom` is that decoder, live.

## Open questions for you (please decide — these keep recurring)
1. **AI-pipeline chain (music→image→video, needs a `FAL_KEY` budget)** — flagged ~40 cycles, still grep-0.
   I won't spend your FAL budget without a yes. **Build it or strike it from the menu?** It's the single
   largest untouched category and the jury's headline ask.
2. **Green-light a "deepen the best ones" era?** At 9000+ prototypes the "technique never used" bar is
   nearly unreachable. Say the word and I'll run **tasteprint cycle 2** or extend `timbreloom` (polyphony,
   per-partial motion, re-voice a dropped Path track).

## Caveat (needs your device)
- Headless review can't hear or GPU-render: whether the re-voicing sounds convincingly like glass/reed on a
  phone speaker, and whether the WebGPU spectrum runs on your device (vs. the Canvas2D fallback), want your
  ear/eye. The seeded muted demo + the fallback are the stand-ins.
