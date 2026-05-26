# Morning digest — last updated 2026-05-26 UTC (Cycle 196)

## New since yesterday

- **[/dream/167-aria-companion](https://getresonance.vercel.app/dream/167-aria-companion)**
  — Aria (adult, Cycle 195). Play piano into your mic. Two seconds of silence → Aria responds
  with a phrase built from your own note transitions (Markov bigram). Demo button works without
  mic. First dialogue prototype: it listens, waits, then speaks.

- **Kids research sweep** (Cycle 196 — no new prototype, intentional). KIDS.md queue had been
  empty for 3 consecutive kids cycles. Refilled it with 4 new seeds:
  1. `kids-marble-run` ← **top priority for Cycle 198**
  2. `kids-snow-globe`
  3. `kids-garden-bloom`
  4. `kids-raindrop-rhythm`

## In progress / partial

Nothing in-progress. All code cycles have built cleanly to `demoable`.

## Research findings worth a look

**`kids-marble-run`** is the strongest idea in the queue and culturally well-timed:
- Sago Mini released a "Music Machine" feature in 2026 — kids tinkering with machines that make music.
- BooSnoo (2026 show): calming slow Rube Goldberg / marble-run format for young children.
- Marble Run Music Videos trending on Snapchat + YouTube in 2026.
- Our version is differentiated: child **draws their own ramps** by dragging. No existing kids app
  does free-draw physics marble music. Zero permissions, zero API, one-cycle build.
- Directly inspired by Karel's loves: `105-pluck-field` ❤️ (pluck = note), `133-kids-ripple-pond` ❤️
  (physics makes music), `100-kids-paint-song` ❤️ (drawing = music). All three converge here.

RESEARCH.md §§215–218 have the full findings.

## Open questions for Karel

- **Aria (167)**: want a "Forget" button to reset the Markov table for a fresh dialogue?
- **Aria (167)**: should Demo mode play one of your actual Paths recordings as the seed phrase
  (instead of the synthetic C-pentatonic demo)? Would show what Aria learns from your real playing.
- **Night Garden (166)**: want multi-touch (two lanterns for two children)?
- **kids-marble-run**: should the marbles have more physics variety (different weights, sizes)?
  Or keep all marbles identical (simpler, more predictable for 4yo)?
- **Adult queue next (Cycle 197)**: `piano-roll` (live scrolling piano roll from mic, natural Aria sequel)
  or `spectral-morph` (FFT resynthesis AudioWorklet)?
