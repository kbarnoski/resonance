# Morning digest — last updated 2026-06-21 ~10:25 UTC (cycle 502 · KIDS · WIDE)

Kids **WIDE** fire — 3 unrelated directions explored, shipped the one the jury was begging for. Back on the starved SVG surface, off the three.js streak.

## New since yesterday
- **🎀🕺 [/dream/811-kids-body-ribbons](https://getresonance.vercel.app/dream/811-kids-body-ribbons)** — *A 4-year-old's whole BODY is the instrument: wave your arms and dance, and your hands draw glowing ribbons that sing as they move.* MediaPipe Pose tracks the body — **arm height = pitch** (pentatonic, never a wrong note), **move fast = louder + brighter**, **both arms up = a sparkle chord**. Each hand trails a glowing gold/violet SVG ribbon. **Why open it:** it's the lab's **first full-body UPIC** (Xenakis's "kids draw, they hear" — but the body is the pen); it's the directest answer to last night's jury, which flagged that body/camera input had collapsed **4×→0×** and that "the full-body version of the UPIC idea is sitting unbuilt in your own research log." Stand back, let the camera see you, move. No camera? A dancing ghost plays it on its own.
- **2 more explored this fire** (banked to IDEAS §502): **`812-kids-breath-bubbles`** (blow → a WebGL2 glow-bubble cloud that pops in chimes) + **`813-kids-sky-lullaby`** (your real local sky + moon phase → an Eno-style dusk lullaby you tilt).

## In progress / partial
- None shipped-partial. `813-kids-sky-lullaby` is banked with one **known coordinate-space bug** to finish before it can ship (logged in IDEAS §502) — the builder was mid-fix when I curated.

## Research findings worth a look
- **RESEARCH §502:** the body-as-instrument anchor is current — **¡Otro!**, a movement→sonification work premiering at the **IAIA Digital Dome (Apr 18, 2026)** that turns a dancer's gesture/velocity into live spatialized sound + generative imagery. Grounded by **Frid et al. (2016)**: kids genuinely read movement qualities out of sound. 811 is the kids version.

## Open questions for Karel
- **Renderer spread is holding:** body→SVG ribbons keeps the kids side off Canvas2D (your 10× monoculture) AND off the three.js run (799→803→805). The adult side still needs one cycle to cool three.js before `802-body-aviary` resurrects.
- **Not camera-verified** (no camera/audio in the sandbox). On a real tablet: does the ribbon clearly track a child's arm height so it reads as "I raised my arm and it sang higher"? The always-on pad + ghost-body fallback guarantee a sounding, drawing glance regardless.
- **811 wants a cycle-2:** legs/feet as bass voices, a second body for duets, or "keep your ribbon painting." Say the word and I'll deepen it.
- Standing infra ask unchanged: the container's ~4096-fd ceiling blocks local static-gen (compile + lint + types verified green; Vercel deploys fine).
