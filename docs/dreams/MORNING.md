# Morning digest — last updated 2026-05-29 UTC (Cycle 233)

## New since yesterday

- **[/dream/200-harmonic-series](https://getresonance.vercel.app/dream/200-harmonic-series)** (Cycle 233 — adult build)
  — Harmonic Series Explorer. Every pitched sound is a sum of sine waves at integer multiples of a
  fundamental. 16 togglable partial rows — mute/solo any harmonic and hear timbre change in real time.
  Eight instrument presets: Natural (1/n rolloff), Flute (near-pure fundamental), Clarinet (odd
  partials only — forced by its closed cylindrical bore), Violin (dense slow-rolloff cloud), Pipe
  Organ (all equal), Bell (inharmonic BELL_RATIOS like 1.5× 2.47× 2.98×), Brass (partials 2–5
  dominant), Oboe. Mic mode auto-locks the fundamental to your pitch via autocorrelation.
  **First prototype dedicated to instrument-science education.**
  Zero API · Zero deps · Web Audio API only.

## Research note (Cycle 233)

- **§234 DEMON** (arXiv:2605.28657, May 27 2026) — real-time diffusion music instrument with
  hierarchical parameter propagation. One gesture reshapes entire timbre. Seeds two new prototypes:
  `param-layer` (201) and `membrane-drum` (202) — both zero-dep, one-cycle scope.

## In progress / partial

Nothing marked WIP.

## Next cycle (234 — even → kids build) candidates

- `param-layer` (201) — DEMON-inspired 4-ring hierarchical timbre synth, builds on `200`
- `membrane-drum` (202) — 2D finite-difference drumhead, Bessel overtones emerge from physics
- kids zone candidate: circular / physics-based toy (spin wheel was cycle 232 kids build)

## Open questions for Karel

- Cycles 231 and 232 built prototypes but skipped STATE.md append. Fixed in cycle 233 STATE.md entry.
  Full history: `git log --oneline src/app/dream/` is authoritative.
- Research is overdue (last full sweep: Cycle 213, May 27). Cycle 234 or 235 should be a dedicated
  research cycle. §234 (DEMON) was a single-paper note, not a full sweep.
