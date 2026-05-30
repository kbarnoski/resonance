# Morning digest — last updated 2026-05-30 UTC (cycle 247)

## New since yesterday

- **Cycle 247 — Research sweep** (no new prototype this cycle; research overdue by 34 cycles)
  5 new prototype seeds added to IDEAS.md, 10 new RESEARCH.md sections (§235–§244).
  **Why open RESEARCH.md**: the FM synthesis seed (§241) and dance-avatar seed (§243) are the
  highest-surprise ideas — FM because it's a foundational synthesis technique in zero existing prototypes;
  dance-avatar because it's the first that animates a human figure.

- **`/dream/213-kids-echo-drum`** (cycle 246) — Four BANDIMAL drum pads. Tap any rhythm; after 1.5s
  silence the drum echoes it exactly (cyan overlay = drum's voice). Then fires one +1 bonus beat (gold
  sparkle burst) at the statistical next interval. **Why open this**: tap kick-kick-kick slowly → hear
  it back + one more kick. Tap chaotically → your chaos, perfectly mirrored, plus one more.

## In progress / partial

Nothing in-progress.

## Research findings worth a look (Cycle 247 — freshest)

**`dance-avatar`** (§235, §243 — DiscoForcing ICML 2026): A 12-joint spring-physics stick figure that
dances to your music in real time. Bass → hip sway, treble → arm splay, onset → jump impulse, centroid →
lean. Zero deps, zero CDN. Paradigm gap: 213 existing prototypes, none animate a human figure. Live
performance fit: project on stage next to the pianist. One-cycle build. Route: `/dream/214-dance-avatar`.

**`fm-explorer`** (§241): FM synthesis is missing from the sandbox entirely. Two OscillatorNodes, one
`connect()` to an AudioParam — and you get the DX7's timbral universe. A 2D canvas: X=carrier pitch,
Y=modulator ratio. Mouse position sweeps hundreds of timbres. Presets: Bell, Rhodes, Clangy, Sub.
Zero deps, one cycle. Route: `/dream/215-fm-explorer`.

**`waveshape-draw`** (§242): Draw a waveform on a canvas → hear the timbre change via `createPeriodicWave`.
Most underused Web Audio API primitive. Inverts all 213 prior prototypes: instead of visualizing sound, you
sculpt the source. Includes harmonic spectrum display below the waveform. Zero deps, one cycle.
Route: `/dream/216-waveshape-draw`.

**`optical-flow-music`** (§237, §244 — V2M-Zero): Webcam frame differencing (no MediaPipe, no CDN) →
synthesis parameters. Moving right → pitch up; moving down → more reverb; total motion → filter open.
Flow arrows drawn over the webcam feed. Zero CDN dep. Route: `/dream/217-optical-flow-music`.

**`paths-granular`** (Karel-music directive): Load a Welcome Home track via `/api/audio/[id]` → granular
synthesis. Scrub position + grain size + density + pitch shift + scatter. Sparkle particles per grain.
First prototype to granularize Karel's own recordings (crystallized, non-linear). Route: `/dream/218-paths-granular`.

**Model confirmations from fal.ai scan**: Lyria 3 Pro is confirmed "new" (all Lyria-based prototypes
confirmed). Seedance 2.0 accepts audio reference input → updates `ghost-animate` plan. Mirelo SFX 1.6
extend-audio up to 60s (was 30s in prior spec).

**ACE-Step UI trending**: 1,940 GitHub stars this month. Developer community has converged on ACE-Step 1.5
as the default music gen model. Validates timing of `vocal-bgm` (audio-to-audio) and `arc-compose` (section-tagged generation) when Karel next confirms FAL_KEY budget.

## Open questions for Karel

- **Research freshness**: cycle 247 research found 5 zero-dep one-cycle build candidates. Which to build
  cycle 249 (next adult slot): `dance-avatar` (highest surprise, live performance), `fm-explorer`
  (foundational synthesis gap), or `waveshape-draw` (paradigm inversion)?
- **Echo Drum (213)**: +1 beat = most-tapped pad (dominant reinforcement) vs. least-tapped pad (surprise introduction). Which design?
- **Diatonic Harmony (212)**: 3-lane layout vs. all three voices overlaid in one pitch space?
- **FAL_KEY budget**: `vocal-bgm` ($0.006/generation, ACE-Step) and `arc-compose` ($0.03/generation,
  MiniMax 2.6) are ready to build — confirming budget unlocks these next.
- **`/api/audio/[id]`**: `paths-granular` needs this endpoint to return Karel's tracks. If it's
  auth-gated in production, should the prototype use a public track URL or get a temporary bypass?
