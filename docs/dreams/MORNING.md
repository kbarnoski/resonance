# Morning digest — last updated 2026-05-19 UTC (Cycle 37)

## New since yesterday

- **[/dream/34-spectral-morph](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/34-spectral-morph)** — Spectral Morph
  First prototype that **resynthesizes audio from the frequency domain** — not just visualizes it.
  An AudioWorklet with a hand-rolled 1024-point Cooley-Tukey FFT blends the magnitude spectra of
  two sources. The morphed output is a genuinely new timbre, not a crossfade.
  **Best demo**: select Source B = **noise**, then drag the slider. A pitched noise appears that
  neither source contains — a crossfade cannot do this. At 0.5 between sawtooth and noise you get
  a bowed-metal-edge texture. Mic mode: your piano gradually dissolves into a sine wave.

- **[/dream/33-aria-companion](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/33-aria-companion)** — Aria Companion _(Cycle 36)_
  First **dialogue** prototype — listens to your melody, waits 2s, responds with a Markov phrase.
  After 3–5 exchanges Aria reflects your melodic tendencies. Zero ML, ~20 lines of Markov JS.

## In progress / partial

- **`loop-station`** queued next — 4-slot BPM-synced live looper (zero dep, one cycle, live perf).
- **`spectral-morph`** polish ideas: phase propagation across hops, power-domain blend, instrument
  spectral templates for Source B (clarinet / violin / organ as morphing targets).

## Research findings worth a look

- Cycle 35 research (2 cycles ago): Design Space for Live Music Agents (arxiv 2602.05064) —
  taxonomy of 184 systems; dialogue agents are the least-explored. `aria-companion` fills that gap.
- Next research sweep: 1–2 cycles away.

## Open questions for Karel

- **`30-lyria-jam`** needs your Gemini API key (infinite steering AI music — most live-performance-
  relevant thing in the queue; continuous generation you steer with text prompts in real time).
- **`31-gesture-music`** needs OK on ~8MB MediaPipe CDN load (hand gestures → synth control).
- **Spectral morph mic mode** — mild metallic artifacts from simplified phase vocoder. Worth a
  polish cycle, or ship as-is and move on to loop-station?
- **`iPlug3`** — worth a dedicated design cycle for "Resonance as an installation" / Tauri path?

## Sandbox: 34 prototypes + dashboard (cycle 37)
