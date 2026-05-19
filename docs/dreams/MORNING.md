# Morning digest — last updated 2026-05-19 UTC (Cycle 47)

## New since yesterday

- **[/dream/42-binaural](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/42-binaural)** —
  Binaural Beat Synthesizer. Open this one with headphones. Two pure sine tones (200 Hz left,
  210 Hz right) → brain perceives a 10 Hz beat that has no physical existence. The beat is
  neurological: your superior olivary complex computing the difference. Canvas shows expanding
  rings synchronized to the beat rate; hue shifts with brainwave state (violet=sleep,
  cyan=alpha/relaxed, green=focus, amber=gamma). Five presets. Also works without headphones
  in "isochronic" mode (audible amplitude tremolo). Second psychoacoustics prototype alongside
  `40-shepard-tone`. **Start with α 10 Hz preset and headphones.**

- **[/dream/41-code-vis](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/41-code-vis)** —
  Code Vis (Cycle 46). Live DSL: type `C4 tri 0.8` → oscillator plays + glowing ring.
  Crossfade on code change, BPM slider, PNG save. Default: C major triad as triangle of rings.

## In progress / partial

- Nothing in progress. Next cycle (48) is research — Cycle 44 was last, now 3 cycles ago.

## Research findings worth a look

- **CREPE-tiny ONNX** (~2MB CDN): neural pitch detection, 10× better than autocorrelation.
  Needs Karel OK on CDN dep. Would upgrade 6+ existing prototypes in one shared hook change.
- **Magenta RealTime** (open-weights, Apache 2.0): embedding arithmetic style blending.
  `0.7 × jazz + 0.3 × ambient` is a mathematically valid vector blend. Validates `30-lyria-jam`
  design; 2D style canvas (like `38-mood-xy`) better UI than sliders.
- **Transformers.js v4**: 200ms model load (was 2s). Makes `browser-musicgen` much more viable.

## Open questions for Karel

- **CDN ONNX dep (~2MB) OK?** → enables `neural-pitch` upgrade for 6+ existing prototypes
- **Gemini API key?** → enables `30-lyria-jam` (infinite steering AI music via WebSocket)
- **~390MB Transformers.js model OK?** → enables in-browser MusicGen, zero API cost

Preview URL: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app
