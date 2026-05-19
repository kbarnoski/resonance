# Morning digest — last updated 2026-05-19 UTC (Cycle 27)

## New since yesterday

- **Cycle 27 was a research sweep** — 8 new entries in RESEARCH.md, 4 new prototype ideas.
  No new prototype to open, but the queue is freshly stocked. Build cycle fires next.

## Strongest new ideas from research

- **`24-piano-roll`** (build next) — Live scrolling piano roll from mic pitch detection.
  A pianist's natural vocabulary: what you play renders as colored note bars scrolling left.
  Zero deps, one-cycle build. Companion to `13-piano-canvas` (abstract art from your playing)
  and `22-code-score` (written score). The three together cover the full representation space
  of a musical session: abstract → notation → score-as-code.

- **`25-cellular`** — Conway's Game of Life as a composer. Living cells trigger pitched notes;
  gliders make repeating melodic loops; chaos patterns produce cluster chords. You set initial
  conditions; the music writes itself. Nothing in the 23-prototype sandbox works this way —
  all other prototypes react to your input. This one acts first. Inspired by CLAVIER-36 (HN Sep 2025).

- **`26-score-follow`** — Score cursor that follows your playing. Displays the Bach fragment
  from `22-code-score`. Play it on piano; pitch detection matches your notes and advances
  the cursor. "The score lights up as you play it." Directly useful for practice.

- **`27-gpu-additive`** — Particles ARE Fourier partials; GPU physics IS the synthesizer.
  Most ambitious idea in the queue. 2+ cycles. Requires WebGPU.

## In progress / partial

- All 23 prototypes remain `demoable`. Nothing half-built.

## Research findings worth a look

- **Score following is real** (arxiv 2505.05078, May 2026) — 174ms latency from mic to
  "current score position." Browser-feasible with the autocorrelation detector already built.
  The dream sandbox is 2/3 of the way there (pitch detection + score notation both exist).

- **Kling 3.0 for Ghost arcs** (fal.ai, Feb 2026) — multi-shot storyboarding + native audio
  + character consistency across shots. Could render a full journey arc (4 Ghost scenes) as
  a coherent ~20-second cinematic sequence. Budget ~$1–2/arc. HappyHorse still best for
  single clips; Kling 3.0 uniquely enables multi-shot sequences.

- **WASM AudioWorklet is now the 2026 DSP standard** — Rust → WASM → AudioWorklet for
  physical modeling, FFT vocoder, ML inference. Could fix the metallic transients in
  `23-pitch-harmonize`. Needs a pre-built `.wasm` binary (can't compile Rust in dream zone).
  Worth a conversation about whether to check one in.

- **Real-time AI accompaniment** (arxiv 2604.07612, Apr 2026) — latent diffusion model
  generates accompaniment from 4-bar mic input at ~1s latency. Browser equivalent would
  use ACE-Step (~$0.01/loop). Could become an upgraded `6-compose`.

## Open questions for Karel

- **`piano-roll` vs `cellular` first?** Piano roll is immediately legible for pianists;
  cellular automaton is the bigger surprise. Which direction for Cycle 28?
- **WASM in AudioWorklet**: worth checking in a pre-built Karplus-Strong `.wasm` binary
  to enable physical modeling synthesis? Or keep the sandbox dep-free?
- **Kling 3.0 Ghost arc**: green-light the FAL_KEY budget for a multi-shot Ghost journey
  arc (~$1–2/run)? If yes, say the word and Cycle 28 can wire it into `2-ghost-lab`.
- **`23-pitch-harmonize` quality**: the ring-buffer pitch shifter is smooth on sustained
  notes, metallic on staccato. Worth a polish cycle (FFT vocoder), or acceptable as-is?
