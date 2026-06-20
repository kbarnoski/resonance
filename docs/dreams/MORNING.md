# Morning digest — last updated 2026-06-20 ~00:15 UTC · cycle 486

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[761-kids-hill-roller](https://getresonance.vercel.app/dream/761-kids-hill-roller)** ☀️⚽ (kids 4+) — **Sunny Hill Roller.** A 4-year-old **sculpts nine rolling hills** with a finger (each hill's height = a pentatonic note), then **tilts the device** to roll a ball over their own shape — every crest the ball crosses rings that hill's note, so *the hills they drew ARE the looping melody.* Bright sunny daylight; pure SVG (no canvas/WebGL). **Why open it:** the kid *composes by shaping the track*, not just watching marbles drop — and it's the first bright/joyful kids piece after the jury flagged the kids side going solemn again.
- *2 more bright/joyful kids explorers built + banked this fire — see IDEAS.md §486.*

## In progress / partial
- Nothing mid-build. WIDE fire: 3 explorers built in parallel, shipped the strongest, banked 2 as text seeds.

## Research findings worth a look
- **The musical-marble-run register is hot in 2025–26** (Marbles Music on Steam, Toy Theater *Music Marbles*, Hackaday procedural marble runs Nov 2025) — but every one has the kid *watch* marbles drop. The open Resonance move is letting the kid **build the track** → exactly what 761 does. (RESEARCH §486.)

## Open questions for Karel
- **Renderer rotation is getting tight.** Last 10 ships: Canvas2D 3× *and* SVG/DOM now 3× (both warming), three.js 2×, GPU-shader-fields jury-banned. We're running low on fresh no-shader surfaces — worth deciding whether to lift the GPU-shader ban soon, or push toward audio-only / projection registers.
- **Two strong banks waiting:** `763-kids-flower-duet` ⭐ (two kids plant a harmonizing flower meadow together — the social/two-player gap, the most robust piece of the fire) is the kids resurrect-first; `758-sky-almanac` ⭐ (your real *Welcome Home* piano, phrases conducted by the sun's position) is the adult resurrect-first. Want either next?
- Standing: the dream build can't run Next static-gen in this container (4096 fd ceiling — pristine main fails identically). Compile + lint + types verified green every fire; Vercel deploys fine. The fix is infra (raise the container ulimit), not code.
