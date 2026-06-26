# Morning digest — last updated 2026-06-26 (cycle 556, kids · DEEP)

> **Yesterday's jury** (`docs/dreams/JURY.md`) called out two things I'm answering tonight: the kids builds have a **crystallized recipe** (sensor + GPU glow + drone + "no wrong notes" as an apology for not composing), and the lab swung into a **12-of-15 GPU monoculture**. So tonight's kids piece breaks the recipe with a tactile *force-field* toy where the harmony is a physical event, and ships on **Canvas2D** — the one fresh renderer left.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/953-kids-iron-garden](/dream/953-kids-iron-garden)** — **Drag glowing magnet-flowers around a dark field and watch thousands of iron filings snap into the invisible lines of force between them — then slide two flowers together and their notes bloom into a chord the instant their fields touch.** *Why open it:* it's the lab's **first real magnetic-field piece** — a 4-year-old can literally *see* Faraday's lines of force (the same iron-filings-on-paper magic) and *play* them, with 6 pentatonic flowers (no wrong notes). The harmony isn't a chord engine — it's **physical**: two magnets ring together only when their fields actually connect. Touch-first, runs on any iPad, self-demos on a cold load.

## Explored but not shipped (1 more — banked in IDEAS §556)
- **954-kids-iron-garden-gl ⭐ (resurrect-first)** — the **GPU sibling**: the same Iron Garden, but ~80,000 filings streaming on raw WebGL2 (denser, silkier lines of force). Equally complete — I held it back because for a *kids* piece, robustness won: the Canvas2D version runs on any iPad with no float-render-target dependency and no per-frame React churn. It's the natural "big-screen / installation" lens of the same idea.

## Why this shape (cycle 556)
- **Research → build, visible:** my dive found the 2026 cymatics-toy wave (CymaVis, Cymatica — "see sound as sand"). The lab already did cymatics **twice**, so instead of a third Chladni plate I took the *same idea* — make an invisible field visible + audible — and pointed it at a field the lab has never touched: **magnetism.**
- **DEEP** (one concept, two renderers: Canvas2D vs. WebGL2; shipped the more robust one).
- **Ambition 4/5** (lab-first technique + 5 subsystems + Faraday reference + dated research). Clears every diversity ban — notably it dodges both the GPU monoculture and the hardening kids harmony-garden recipe.

## Open questions for Karel
- **Does breaking the kids recipe land?** Iron Garden is deliberately *not* another "make pretty harmony together" garden — it's a physics toy where music is a side-effect of play. Worth leaning into a science-wonder kids lane (magnetism, then light/prisms, then pendulums), or do the harmony-gardens test better with real kids?
- **Verification debt (jury #3) is still the loudest open item** — 953 is the ~21st build-green-but-**unheard** prototype (no audio/touch in the container). It's low-risk (Canvas2D + plain Web-Audio), but I can't confirm the chord-bloom *sounds* right. A run-and-verify cycle on a real iPad (953 + 927/942/950/952) may be overdue before the next build.
- **Want the GPU version live too?** 954 is ready to resurrect after a small refactor — it'd be the projector/installation-scale Iron Garden.
