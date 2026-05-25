# Morning digest — last updated 2026-05-25 UTC (Cycle 171)

## New since yesterday

- **[/dream/144-sa3-journey](/dream/144-sa3-journey)** — SA3 Journey · *Cycle 171* · `demoable` ⭐
  **Mode A — Write Journey**: pick any of 8 Resonance themes (Cosmic Homecoming, Earth Grounding,
  Inner Sanctuary, Ocean Breath, Snowflake, Ghost, Inner Fire, Mycelium Dream), edit the prompt,
  select 2/4/6 min → Stable Audio 3 generates up to 6 minutes of journey music.
  **Mode B — Extend Your Playing**: record 5–30 s of piano → SA3 continues it for 2–6 minutes.
  Amber waveform = your recording; blue waveform = AI continuation. Six-band bloom during playback.
  **"First prototype to break the 30-second generation ceiling."**
  FAL_KEY required · ~$0.20–0.50/gen · SA3 released May 20 (5 days ago); fal.ai endpoint may still
  be rolling out — error surfaces clearly if not yet live.

- **[/dream/143-kids-seed-song](/dream/143-kids-seed-song)** — Seed Song (kids) · *Cycle 170* · `demoable`
  Tap → seed glows → procedural tree grows over 20 s with Karplus-Strong plucks. Plant 4 trees.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

**§204 — Stable Audio 3** (Stability AI, May 20, 2026) — just built as `144-sa3-journey`.
Next: monitor fal.ai dashboard for when SA3 Large goes to general access (currently partner-access).

**§206 — Refik Anadol DATALAND: Machine Dreams: Rainforest** (opens June 20, 2026)
- DATALAND opens in 26 days in downtown LA. Machine Dreams: Rainforest uses L-system + Karplus-Strong.
- Adult seed `145-eco-bloom` queued: 3-species L-system rainforest, zero deps, zero API.

**§207 — CHI 2026: 6DoF gesture sculpting** → `146-spatial-palette` (drag synth voices, X=pan, Y=pitch)

**§208 — MediaPipe face tracking 60fps in browser** → `147-face-synth` (needs Karel OK on CDN dep)

## Open questions for Karel

1. **SA3 endpoint live?** Try `/dream/144-sa3-journey` — if SA3 isn't on fal.ai yet, the error says so.
   Monitor `fal.ai/models` for `stable-audio-3` general access.
2. **`147-face-synth` CDN dep** — MediaPipe FaceLandmarker WASM ~5MB from jsDelivr. OK to proceed?
3. **Chord Canvas 7th templates** — add G7/Cmaj7/Dm7 to `141-chord-canvas`? (open since Cycle 167)
4. **DATALAND June 20** — 26 days from now in downtown LA. Machine Dreams: Rainforest is the
   direct inspiration for Seed Song and eco-bloom. Worth seeing in person?
