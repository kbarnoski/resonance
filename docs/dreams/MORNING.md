# Morning digest — last updated 2026-05-25 UTC (Cycle 169)

## New since yesterday

- **Research sweep complete** — Cycle 169 (adult research): 5 new findings §§204–208, 4 new prototype seeds added to queue. See RESEARCH.md for full notes.
  - **Biggest find**: Stable Audio 3 (May 20, 2026 — 5 days ago!) — up to 6-minute generation + causal continuation of YOUR piano recordings. Fills the "30-second ceiling" and Karel's "my music as input" directive simultaneously. SA3 Large on fal.ai, FAL_KEY in use.
  - **Kids next**: `143-kids-seed-song` — plant a tree seed on canvas, watch it grow via L-system, hear Karplus-Strong birdsong at each branch. Zero deps, zero API, 4-year-old friendly. Inspired by Refik Anadol's *Machine Dreams: Rainforest* (opens DATALAND June 20, 2026).
  - **Adult next**: `144-sa3-journey` — Stable Audio 3 journey generator + piano causal continuation (your 30s recording → SA3 extends to 6 min).

- **[/dream/142-kids-echo-canon](/dream/142-kids-echo-canon)** — Echo Canon (kids) · *Cycle 168* · `demoable` ⭐
  Tap a pentatonic phrase, then 1.5s later it echoes back as three overlapping voices:
  amber (original), blue (+perfect fifth), violet (+octave). First kids prototype that
  harmonizes your own phrase back at you. Zero permissions, tap anywhere.

- **[/dream/141-chord-canvas](/dream/141-chord-canvas)** — Chord Canvas · *Cycle 167* · `demoable`
  Play a chord into mic → chord name appears (C, F♯m, Bdim) + scrolling color timeline.
  First prototype to name musical structure. ii–V–I demo mode.

## In progress / partial

Nothing in-progress.

## Love signal (unchanged — 13 loved)

`82-kids-color-piano` ❤️ `83-kids-tilt-rain` ❤️ `130-tsl-particle-compute` ❤️
`111-kids-shape-loop` ❤️ `107-ocean-presence` ❤️ `106-beat-cut` ❤️ `105-pluck-field` ❤️
`104-kids-mirror-draw` ❤️ `101-camera-song` ❤️ `100-kids-paint-song` ❤️
`98-kids-drum-circle` ❤️ `86-sound-to-video` ❤️ `84-wave-fluid` ❤️

## Research findings worth a look

**§204 — Stable Audio 3** (Stability AI, May 20, 2026 — freshest find this cycle)
- 4-model family: Small/Medium open-weight HuggingFace; Large via fal.ai partner
- Up to 6+ minutes per generation (vs. 30s cap everywhere else)
- Causal continuation: Karel records 30s of piano → SA3 extends it for 3–5 more minutes
- LoRA fine-tuning possible on Medium: future "Karel Piano LoRA" for personalized gen
- Seed: `144-sa3-journey` — highest-priority adult build next adult cycle

**§206 — Refik Anadol DATALAND + Machine Dreams: Rainforest** (opens June 20, 2026)
- World's first AI arts museum in downtown LA (The Grand)
- Technique: L-system tree growth + Karplus-Strong birdsong + atmospheric noise
- Zero deps, zero API, pure Web Audio + Canvas2D
- Kids seed: `143-kids-seed-song`; Adult seed: `145-eco-bloom`

**§207 — CHI 2026: spatial gesture sculpting > precision sliders for musical mixing**
- Draggable synthesis voices on canvas (X=pan, Y=pitch, scroll=filter/reverb)
- Seed: `146-spatial-palette` — zero deps, live performance fitness

**§208 — MediaPipe face tracking 60fps in browser (March 2026 confirmed)**
- 468 face landmarks; jaw → VCF, eyebrow → harmonics, tilt → pan, smile → chord quality
- Seed: `147-face-synth` — needs Karel OK on ~5MB CDN dep

## Open questions for Karel

1. **SA3 Large fal.ai endpoint** — Stability AI lists fal.ai as partner for SA3 Large
   but specific endpoint ID wasn't confirmed publicly at research time. Check
   `fal-ai/stable-audio-3` or `fal-ai/stable-audio-3/large` when building
   `144-sa3-journey`. Fallback: SA3 Medium via HuggingFace Inference API (free tier).
2. **`147-face-synth` CDN dep** — MediaPipe FaceLandmarker WASM ~5MB one-time download
   from jsDelivr. OK to proceed, same as `31-gesture-music` precedent?
3. **Chord Canvas 7th templates** (open since Cycle 167) — add G7/Cmaj7/Dm7 templates?
4. **Echo Canon mic mode** — hum a phrase → echoed back transposed? Worth a polish cycle?
5. **DATALAND opening June 20** — you could be there. The rainforest exhibition uses
   the exact same techniques as `145-eco-bloom`. Might be worth seeing in person.
