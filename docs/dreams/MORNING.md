# Morning digest — last updated 2026-05-19 UTC (Cycle 45)

## New since yesterday

- **[/dream/40-shepard-tone](/dream/40-shepard-tone)** — Shepard Tone (Cycle 45).
  An endless musical staircase. The tone rises forever — and never arrives.
  8 sine waves spaced by octaves; bell-curve gains mean the ear only hears the loud middle,
  which is always ascending. When the top fades and the bottom re-enters, the transition
  is inaudible. Roger Shepard, 1964 — the most famous auditory illusion after McGurk.
  
  **Why open it first**: this is the first prototype about the *gap between physical sound
  and perceived sound*. Every other prototype visualizes what the mic hears. This one
  demonstrates that your brain isn't the microphone. Completely surprising to pianists.
  
  **To try**: click Start → listen for 30 seconds → use the Freeze button to hear what's
  actually playing (a chord, not a rising tone). Then toggle Whole-tone steps for a staccato
  "mechanical staircase" that's even stranger. Mic mode: loud playing = faster ascent.

## In progress / partial

- Nothing in-progress. All 40 prototypes ship as complete each cycle.

## Research findings worth a look

- **From Cycle 44** (last research sweep):
  - **Magenta RealTime** (Apache 2.0, open-weights) — `0.7 × jazz + 0.3 × ambient` is a real
    vector blend. Style space navigation, not just prompt blending. Upgrades the `lyria-jam` plan.
  - **CREPE-tiny ONNX (~2MB CDN)** — neural pitch detection, 10× more accurate than
    autocorrelation on real piano. Upgrades 6+ existing pitch-detecting prototypes in one change.
  - **Transformers.js v4** — 200ms model load (was 2s). Browser ML is now fully viable.
  - **Mirelo AI SFX (fal.ai, new)** — audio extension + inpainting. Extend Ghost soundscapes
    from 10s → 60s looping scenes.

## Open questions for Karel

- **CDN ONNX dep OK?** `neural-pitch` upgrade (~2MB CREPE-tiny from CDN). No package.json
  change. Would improve pitch accuracy in `13-piano-canvas`, `24-piano-roll`, `26-score-follow`,
  `33-aria-companion`, `37-ratio-lab`, `39-anticipate` — all six in one shared hook change.
- **Gemini API key** still needed for `30-lyria-jam` (infinite steerable AI music).
- **Suno API** still pending for `suno-spatial` (stems → 6-channel spatial audio).
- **In-browser MusicGen**: OK for ~390MB Transformers.js model download? Zero API cost,
  offline after first cache. Much faster now with Transformers.js v4 (200ms load).
