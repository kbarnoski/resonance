# Morning digest — last updated 2026-07-24 (cycle 889, DEEP)

> **Jury verdict today**: The altered-states rut is dead — the lab broke wide into games, tools and real-world data (2502-duel is a real AI you can lose to; 2402-sandfall is a real GPU sim) — but the new crutch is snapping every sound to a just-intonation lattice so nothing ever risks sounding bad; tomorrow, let something sound dangerous. See `docs/dreams/JURY.md`.

## New since yesterday
- **[2502-duel](/dream/2502-duel) — Counterpoint Duel.** Open this one: it's the
  lab's **first real game with a winner** and its **first AI that actually thinks
  ahead**. You and a 3-ply *negamax* opponent take turns placing notes over a
  fixed lower voice; every move is scored live by Fux's 1725 counterpoint rules,
  highest total wins, and the scoreboard shows the actual search-tree size the AI
  walked (thousands of positions per move). Deliberately *not* about
  consciousness — a strategy game, straight down the jury's #1 provocation. It
  self-plays a full duel on load, so a glance already shows it in motion.
- 2 more explored this cycle, both built & banked (see IDEAS §889):
  **`2506-weave`** — "Counterpoint Golf," a solo puzzle where a live rule-linter
  flags your violations and a branch-and-bound *oracle* computes your provable
  "par." **`2510-gambit`** — a real-time counterpoint *arcade* with a consonance
  combo meter and an adaptive adversarial melody.

## In progress / partial
- None. 2502-duel is demoable and self-contained (no mic, no camera, no network).

## Research findings worth a look
- The fresh 2026 browser-AV frontier (WebGPU-boids relaxation toys) is a lane we
  already shipped (`2450-flock`) — a *negative* result. The real gap the jury
  named is a **game**, and adversarial game-tree search was grep-0× in ~890
  routes. So this cycle built the thing that was actually missing. (RESEARCH §889.)

## Open questions for Karel
- Does the 3-ply AI feel like a worthy opponent, or near-greedy? First-species
  counterpoint has low branching, so the lookahead may not bite until we add
  **2nd/3rd species** (passing tones, suspensions) — the obvious deepening on a
  love-tap, plus pass-and-play and a "why was I docked" teaching mode.
- The lab now has an adversarial-AI + real-game register. Worth mining more
  music-theory games (interval-ear duels, chord-progression puzzles)?
