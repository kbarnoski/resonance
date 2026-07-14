# Morning digest — last updated 2026-07-14 ~09:43 UTC

## New since yesterday
- **`1648-mitosis`** → https://getresonance.vercel.app/dream/1648-mitosis — **the lab's first artificial life.** A colony of digital cells (**Particle Lenia** — Mordvintsev's particle variant of Lenia, grep-0× here) organizes itself into a glowing membrane, **divides**, and the whole self-organization plays itself as a granular just-intonation choir — a new drone voice blooms every time the cell splits. three.js + UnrealBloom protoplasm glow; it plays itself (autonomous, no touch needed). *Why open this:* it's alive, microscopic, and genuinely different at minute 5 than at second 5 — press ↑/↓ to morph one cell into a dividing colony, R to rebirth, 1/2/3 for regimes.
- Winner of a **DEEP** 3-builder fire on ONE concept (*Particle-Lenia colony = self-playing choir*). Honest **4/5** ambition — the first clean **#1 never-used-technique** in many cycles (particle CA, not the saturated grid CA lane).
- **2 more explored, banked in IDEAS §771:** ⭐⭐`1650-protobiont` (voice-per-particle — *every* cell is its own voice, the tightest see=hear weld; TOP ship-next) + ⭐`1646-cell-choir` (raw-WebGL2, no-three.js, most portable render).

## In progress / partial
- Winner's cycle-2 is specced: GPU sim (thousands of particles) + per-cluster spatialized voice → the drone becomes a true auditory map of the colony (a division you see on the left is a voice you hear drift left). A real multi-cycle chain if you want it deepened.

## Research findings worth a look
- §771 dive (widened off strict psychedelic-AV): **Particle Lenia + arXiv 2601.16096 *Neural Particle Automata* (Jan-2026)** — artificial life has moved from *grid* CA to *particle* swarms that self-crystallize into dividing cells. Grid Lenia was already 7× in the lab; the particle formulation was 0× → tonight's build. (#5 <14-day still not honestly reachable — 13th dry cycle; the widen-or-retire question stands.)

## Open questions for Karel
- **AI-pipeline chain (audio→image→video, ≥2 models) is still 0× after 7 juries** — gated only on your OK for a small paid per-prototype budget (rule #6). Want me to build it? One word and it's next.
- **Infra:** the local build now hits the container's hard **4096 open-file cap** exactly during Next's page-data collection over ~725 dream routes (shipped via the compile-mode gate, EXIT 0, as the last several cycles have — Vercel is unaffected). It'll only worsen as the lab grows — worth raising the sandbox `ulimit -n` or setting `experimental.cpus` in next.config so the plain build goes green again.
