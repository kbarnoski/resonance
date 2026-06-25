# Morning digest — last updated 2026-06-25 ~02:2x UTC (cycle 544, kids · WIDE)

## ☀️ Open this first
**[924-kids-sing-a-sprout](https://getresonance.vercel.app/dream/924-kids-sing-a-sprout)** — *a 4-year-old hums, and a glowing garden grows from their voice.* Every note plants a sprout on a sunflower-spiral (Vogel phyllotaxis, golden angle 137.5°) and chimes right away; keep singing and over a few minutes it blooms — and every ~14s the garden **softly sings an earlier phrase back**. No mic? A synthetic "humming child" starts growing it within ~0.35s, so it's alive on a glance.
*Why it matters:* the lab's **first long-form, stateful KIDS piece** — the depth register the jury most praised (888's lane), now for a child. The child's accumulating voice is a *memory trace* that biases later growth and re-voices the garden, so minute 5 genuinely differs from minute 1. Mic-voice, three.js GPU, no pitch theory — clears every jury ban.

## New since yesterday
- **924-kids-sing-a-sprout** (kids, WIDE fire) — winner of 3 orthogonal explorers. Mic-voice → Vogel phyllotaxis garden + a stigmergic memory bank that re-sings the child's song. Ambition 4/5; in-README dated research citation now **10 cycles running**.

## Explored but banked (see IDEAS §544)
- **925-kids-tilt-tide** ⭐ resurrect-first — tilt the iPad and a sea of light tips & pools; where it pools, warm bells ring in the rhythm of your tilting. The freshest input (tilt is 0× in the last 10 kids builds) and the most bulletproof of the bench.
- **926-kids-firefly-meadow** — wave a hand at the camera and a swarm of glowing fireflies gathers + chimes where you move. Uses raw frame-difference motion (no ML model, camera never shown) — a lightweight fresh camera technique.

## Research finding (RESEARCH §544)
- **MusicSwarm** (Buehler, *Advanced Intelligent Systems*, 2026) — long-form musical *coherence* emerges from a **stigmergic swarm** (agents leaving traces in a shared field), not a central composer. The inversion that drove this cycle: make the child's own sung phrases the trace that grows the garden. (Paywalled — month not pinned; flagged honestly.)

## Open questions for Karel
- Does 924 read as **"my song became a garden"** over minutes, or does it need a clearer macro-arc (seasons / day→night the garden passes through)? Only your ears + a few minutes can tell.
- The autocorrelation pitch detector is untested on a real small-child voice (octave wobble possible) — worth a more robust detector, or is the snap-to-pentatonic forgiving enough?

*Build: `✓ Compiled successfully in 112s`, lint + types clean (only the standing container EMFILE static-gen blocker — infra, Vercel deploys fine). Not yet ear/mic/GPU-verified — no audio hardware in the build sandbox. 2 more explored — see IDEAS §544.*
