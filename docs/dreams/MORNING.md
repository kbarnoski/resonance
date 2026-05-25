# Morning digest — last updated 2026-05-25 UTC (Cycle 170)

## New since yesterday

- **[/dream/143-kids-seed-song](/dream/143-kids-seed-song)** — Seed Song (kids) · *Cycle 170* · `demoable` ⭐
  Tap anywhere on a dark forest canvas to plant a seed. A procedural tree grows from your
  tap point over ~20 seconds — violet trunk, indigo branches, sky-blue fork, emerald twigs,
  amber tips. **Each branch plays a Karplus-Strong pluck as it reaches its tip** (same warm
  physical-modeling synthesis as `105-pluck-field` and `108-kids-kalimba`). Plant 4 seeds;
  they grow and sing simultaneously in C-major pentatonic harmony. Soft brown-noise wind
  plays throughout. Leaves flutter at the terminal tips.
  "First kids prototype where the reward is patient growth, not instant tap response."
  No mic · No API · No deps · 2.5 kB · For kids 4+.

- **Research sweep complete** — Cycle 169 (adult research): 5 new findings §§204–208, 4 new
  prototype seeds added to queue. Biggest find: **Stable Audio 3** (May 20, 2026) — up to
  6-minute generation + causal continuation of Karel's own piano recordings. Fills the
  "30-second ceiling" and "my music as input" directive simultaneously.

- **[/dream/142-kids-echo-canon](/dream/142-kids-echo-canon)** — Echo Canon (kids) · *Cycle 168* · `demoable`
  Tap a phrase, wait 1.5s → echoes back as three overlapping voices (amber, blue +5th, violet +octave).

## In progress / partial

Nothing in-progress.

## Research findings worth a look

**§204 — Stable Audio 3** (Stability AI, May 20, 2026)
- 6-minute generation + causal continuation: Karel records piano → SA3 extends it
- Seed: `144-sa3-journey` — **highest-priority adult build, Cycle 171**

**§206 — Refik Anadol DATALAND: Machine Dreams: Rainforest** (opens June 20, 2026)
- L-system + Karplus-Strong + atmospheric noise — exactly what Seed Song implements
- DATALAND opens 26 days from now. You could see the full-scale installation.
- Adult seed: `145-eco-bloom` — 3 simultaneous L-system trees, rain toggle, dawn birds

**§207 — CHI 2026: spatial gesture sculpting for musical mixing**
- Seed: `146-spatial-palette` — drag synth voices to sculpt soundscapes (X=pan, Y=pitch)

**§208 — MediaPipe face tracking 60fps confirmed in browser (March 2026)**
- Seed: `147-face-synth` — jaw=VCF, eyebrow=harmonics, smile=chord quality (needs CDN OK)

## Open questions for Karel

1. **SA3 Large fal.ai endpoint** — check `fal-ai/stable-audio-3` or `fal-ai/stable-audio-3/large`
   when building `144-sa3-journey` next adult cycle. Fallback: SA3 Medium on HuggingFace.
2. **`147-face-synth` CDN dep** — MediaPipe FaceLandmarker WASM ~5MB from jsDelivr. OK to proceed?
3. **Chord Canvas 7th templates** — add G7/Cmaj7/Dm7? (open since Cycle 167)
4. **DATALAND June 20** — opening 26 days from now in downtown LA. Machine Dreams: Rainforest
   uses the exact same technique as Seed Song and eco-bloom. Worth seeing in person?
