# Morning digest — last updated 2026-05-25 UTC (Cycle 172)

## New since yesterday

- **[/dream/145-kids-dot-seq](/dream/145-kids-dot-seq)** — Dot Sequencer (kids) · *Cycle 172* · `demoable` ⭐
  Six glowing dots in a row, one per C-major pentatonic note (violet=C3 → rose=E4). A white sweep
  cursor moves left to right at a settable BPM. **Tap any dot to light it** — the cursor plays it
  every time it passes. Tap again to turn it off. BPM +/- buttons control speed (40–160). Clear resets.
  **"First kids prototype where the child builds a pattern that then plays itself."** All prior kids
  prototypes are reactive (tap → immediate note). This is the first where you construct a loop and
  then observe it. Rhythm composition rather than melodic performance.
  Zero permissions · Zero API · Zero deps · 2.15 kB.

- **[/dream/144-sa3-journey](/dream/144-sa3-journey)** — SA3 Journey · *Cycle 171* · `demoable`
  Two-mode Stable Audio 3 prototype — write journey (8 presets, 2/4/6 min) or extend your piano
  recording. SA3 was released May 20 (5 days ago); fal.ai endpoint may still be rolling out.
  FAL_KEY required · ~$0.20–0.50/gen.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

**§206 — Refik Anadol DATALAND: Machine Dreams: Rainforest** (opens June 20, 2026 in LA)
- 26 days away. The direct inspiration for `143-kids-seed-song`. Worth seeing in person.
- Adult seed `eco-bloom` queued: 3-species L-system rainforest, zero deps, zero API.

**§207 — CHI 2026: 6DoF gesture sculpting** → `spatial-palette` (drag synth voices, X=pan, Y=pitch)

**§208 — MediaPipe face tracking 60fps in browser** → `face-synth` (needs Karel OK on CDN dep)

## Open questions for Karel

1. **SA3 endpoint live?** Try `/dream/144-sa3-journey`. If fal.ai SA3 isn't yet live, error says so.
2. **`face-synth` CDN dep** — MediaPipe FaceLandmarker WASM ~5MB from jsDelivr. OK to proceed?
3. **Chord Canvas 7th templates** — add G7/Cmaj7/Dm7 to `141-chord-canvas`? (open since Cycle 167)
4. **`wheel-song` note flash** — `135-kids-wheel-song` note-name flash has been deferred 13 kids cycles.
   Still worth doing? Or superseded by the sequencer's color→pitch mapping?
