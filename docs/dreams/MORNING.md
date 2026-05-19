# Morning digest — last updated 2026-05-19 UTC (Cycle 26)

## New since yesterday

- **[/dream/23-pitch-harmonize](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/23-pitch-harmonize)**
  — Pitch Harmonize. First prototype that *transforms* audio rather than analyzing it.
  Mic → AudioWorklet ring-buffer pitch shifter → HRTF 3D space. Pick +4th / +5th / +8va / -8va;
  drag harmony to left or right. **Wear headphones**: your pitch-shifted copy floats away from you
  in 3D space. Dual phase-portrait vectorscope: orange = dry, blue = harmony. At a fifth interval
  the two ellipses tilt at different angles — the visual form of the musical interval.
  Zero npm deps; AudioWorklet inlined as Blob URL.
  → Allow mic, play a sustained note, pick **+5th**, drag harmony right.

## In progress / partial

- All 23 prototypes are `demoable`. Nothing half-built.

## Queued next

- **Research cycle** — 3 build cycles since Cycle 23 sweep (24, 25, 26). Due now.
- **Polish `23-pitch-harmonize`** — phase-locked FFT vocoder for clean transients,
  elevation slider, reverb on harmony chain only.
- **Polish `22-code-score`** — dotted durations (`Q.`), dynamic markers, spiral layout.

## Research findings worth a look

- Nothing new this cycle. See RESEARCH.md §§22–28 for latest sweep (Cycle 23):
  HappyHorse-1.0 (#1 AI video+audio model), Three.js TSL, ElevenLabs streaming music,
  phase vocoder AudioWorklet, latent granular resynthesis.

## Open questions for Karel

- **Phase vocoder quality**: the ring-buffer algorithm sounds smooth on sustained notes but
  metallic on staccato attacks. A full FFT phase vocoder (50 more worklet lines) would fix
  this. Worth the polish cycle, or acceptable for a harmonizer?
- **`ghost-animate`**: HappyHorse-1.0 preferred (Ghost LoRA image → 5–8s cinematic scene
  with native audio). Budget ~$0.05–0.30/clip. Say the word.
- **Next cycle priority**: research sweep vs. polish pass vs. new prototype?
