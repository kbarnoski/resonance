# Morning digest — last updated 2026-06-20 ~04:15 UTC · cycle 488

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[767-kids-kite-flyer](https://getresonance.vercel.app/dream/767-kids-kite-flyer)** 🪁☀️ (kids 4+) — **Kite Flyer.** TILT the tablet to fly a glowing kite across a sunny sky, and the flight *plays music*: the kite's **height is a melody** (pentatonic, every height is a "right" note), **wind gusts are a rhythm** (sparkle chimes), and the **taut string hums a soft Aeolian-harp drone** that swells as it tightens. The whole-body tilt IS the instrument. **Why open it:** the bright/joyful/*active* kids register the jury asked for (#4) — exuberant, sunny, not the dark-glow everything had drifted into; and it flies itself on a ~2s idle "ghost breeze," so just point your phone at it.
- *2 more bright kids explorers built + banked — a Canvas2D two-kid **flower duet** (`769`, plant a meadow together, every flower harmonizes) and a three.js **balloon band** (`768`, inflate-then-pop a pentatonic sky-chord). See IDEAS §488.*

## In progress / partial
- Nothing mid-build. WIDE fire: 3 unrelated bright kids directions built in parallel, shipped the strongest (the only one on a non-warming renderer), banked 2 as text seeds.

## Research findings worth a look
- **A child's body MOVEMENT, sonified well, reads back as music** (Frid et al., KTH — foundational; the empirical Reggio-Emilia core). The lab's kids side is almost all *touch-on-glass* — `767` is the first to let the **whole body fly a singing object**. Also: I disproved a stale note in my own jury file — "recognized-word→music is unused" is **false** (`752`/`570`/`189` already do speech recognition), so I killed a redundant "first ASR kids piece" before building it. (RESEARCH §488.)

## Open questions for Karel
- **Renderer rotation just flipped.** three.js is now at 3× (it's been my safe pick three fires running) — it's now the *warming* one. SVG/DOM and Canvas2D are also tight at 3× / 2×, GPU-shader-fields are jury-banned. We're running low on un-warmed renderers. **Worth a call:** lift the GPU-shader ban next, or push into the thin **audio-only / projection / installation** registers? I keep flagging this — it's becoming the real constraint.
- **Kids resurrect-first:** `769-flower-duet` ⭐ (the social two-kid meadow — most robust of this fire) the moment Canvas2D cools. **Adult resurrect-first:** `764-sky-almanac` ⭐ (the calm SVG sun-dial) the moment SVG cools.
- Standing: the dream build can't run Next static-gen in this container (4096 fd ceiling — pristine main fails identically). Compile + lint + types verified green every fire; Vercel deploys fine. The fix is infra (raise the container ulimit), not code.
