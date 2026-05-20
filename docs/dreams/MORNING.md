# Morning digest — last updated 2026-05-20 UTC (Cycle 59)

## New since yesterday

- **[/dream/50-tap-rhythm](/dream/50-tap-rhythm)** — Tap Rhythm `demoable`
  The first prototype any non-musician can walk up to and immediately use.
  Tap or clap a rhythm → your taps become a 32-step circular drum loop that plays
  back instantly in the detected tempo.
  **Open this**: click **▶ Demo** for an instant 4-on-the-floor groove — no permissions.
  Then click **🎤 Tap your rhythm**, allow mic, and clap 8+ times. After 2s of silence
  the loop builds. Vary your tap pressure: gentle desk tap = kick (violet), medium =
  snare (cyan), hard clap = hi-hat (amber). Click any dot on the clock to toggle it.
  BPM slider ±20% from your detected tempo.
  Zero deps, zero API, 5.13 kB. Build validated clean.

- **[/dream/49-anemone-av](/dream/49-anemone-av)** — Anemone AV `demoable` (Cycle 58)
  Bioluminescent sea anemone — 14 FK-chained tentacles dancing to audio. Sub-bass
  sways the trunk, treble pulses violet tip beads, percussive hits flash the whole form.
  Zero new deps. Click Demo mode — no mic needed.

- **[/dream/48-arc-compose](/dream/48-arc-compose)** — Arc Compose `demoable` (Cycle 57)
  Write a journey arc with section tags → MiniMax 2.6 generates a 60–90s structured piece.
  $0.03/generation. ⚠ Paste raw error text if the API call fails.

## In progress / partial

- Nothing in-progress. All recent prototypes are `demoable`.

## Research findings worth a look

- **`tap-rhythm` shipped** (Cycle 59) — live performance accessible. Non-pianists can
  contribute a groove. Connects to DARC paper (RESEARCH.md §89): NMF onset detection →
  drum accompaniment. This is the Web Audio prototype equivalent.
- **Research due** — last research was Cycle 56. Now 3 cycles ago (57, 58, 59). Due at
  Cycle 60 per the 3–4 cycle cadence.
- **Flow Music + Lyria 3 Pro (§85)** — Stem Splitter extracts drums/bass/piano from AI
  tracks. Inspires `stem-spatial` (generate → split → HRTF). Needs GEMINI_API_KEY.

## Open questions for Karel

1. **GEMINI_API_KEY** — still the biggest unlock. Four prototypes waiting: `lyria-ghost`,
   `binaural-lyria`, `piano-to-ghost`, `stem-spatial`. One key, four demos.
2. **`arc-compose` API** — if `/dream/48-arc-compose` shows an error, paste the raw
   message and I'll fix the endpoint next cycle.
3. **Tap Rhythm feedback** — the amplitude thresholds for kick/snare/hat (0.33 / 0.66)
   are calibrated for desk taps. If you find the classification off on your setup, I can
   tune them. Also: want a "type selector" (choose kick/snare/hat explicitly before tapping)
   instead of amplitude-based auto-classification?
