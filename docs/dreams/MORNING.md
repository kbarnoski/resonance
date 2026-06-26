# Morning digest — last updated 2026-06-26 ~12:30 UTC (cycle 561, adult · DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`965-phosphor-draw`** ([open it](https://getresonance.vercel.app/dream/965-phosphor-draw)) — **draw a shape on a glowing green oscilloscope and you HEAR that exact shape — because the figure on screen and the stereo signal in the speakers are literally the same signal.** Tap a preset (circle hums clean, star buzzes, square is harmonically rich) or draw your own loop; spin it and the timbre turns with it. **Why open it:** the lab's **first true oscilloscope vector-synthesizer** — left channel = horizontal beam, right = vertical, so the drawn line *is* the sound and the sound *is* the drawn line (Jerobeam Fenderson / Hansi Raber OsciStudio / Ryoji Ikeda's *data-cosm*, live in London to Feb 2026). Geometry = timbre, draw-speed = pitch. After the one Start tap a figure-8 already draws itself and sings — a hands-free glance lands the idea in ~1s.

## Why this one, this morning
The research dive surfaced a fresh 2026 Neural-Cellular-Automata wave — but a grep proved the lab has already built the *entire* self-organizing-life family (Lenia, physarum, reaction-diffusion, particle-life, and differential-growth just last cycle), and the jury flagged "ship a sim, pulse a bell off it" as the new adult crutch. So I pivoted **off the sim and onto its mirror**: an instrument that's **non-sim AND non-harmony** (it also breaks the harmony-engine lane that had crept back into 7 of the last 10 builds). It extends your **most-loved cluster** — the draw→sound pieces (fourier-paint ❤️, paint-compose ❤️) — with a genuinely new technique: the drawn line and the sound are one thing.

## Also explored tonight (banked, not shipped)
- **`966-osci-solids`** ⭐ — the "massively bigger" sibling: a rotating 3D wireframe **solid** (cube, torus, trefoil knot) traced as one pen-path so you *hear it spinning*. De-selected only because 965 is more interactive (you draw) and a cleaner realization of "signal = image" (it never rebuilds the audio buffer). It's the obvious **cycle-2 deepening** of this thread — full seed in IDEAS §561.

## Verification
- `965` build: **compiled + type-checked + lint clean** (winner-only `npm run build` → `✓ Compiled successfully in 2.1min`, zero phosphor warnings). **Not** eye/ear-verified (no WebGL2 device or audio in the build box; static-gen blocked by the standing EMFILE infra ceiling — Vercel deploys fine). Small win on the verification-debt front: because the scope renders the *exact* buffer that plays, "you see what you hear" is provable by construction, not just claimed.

## Open questions for Karel
- This oscilloscope thread has real legs — want the **3D-solids** version next (966), or a **strange-attractor** scope (a Lorenz attractor's coordinates AS the waveform = chaotic vector music)? Or trace **your initials / a piano** in 3D so they spin and sing?
- Verification debt is now 26 straight build-green-but-unrun surfaces — worth one cycle to actually *run* a few recent builds (965, 964, 960) on real hardware?
