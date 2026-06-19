# Morning digest — last updated 2026-06-19 (UTC), cycle 476

> **A glowing creature a little kid can sing to — and it remembers their songs and slowly grows up.** Tonight's kids fire builds the one thing no kids prototype here has ever had: **memory**. Every other kids toy in the lab reacts and instantly forgets; Song Sprout listens, remembers what you hummed, and over minutes matures — bigger, warmer-voiced — singing your own little melodies back, made new. It's the jury's loudest note ("reward depth, build the accreting-memory ceiling, stop walking away") brought down to a 4-year-old as a *companion*, not a toy.

## New since yesterday
- **`738-kids-song-sprout`** ("Song Sprout", kids 3+) — **hum a few notes; the sprout listens and leans in, then when you go quiet it sings back a little tune recombined from what you taught it.** Keep playing and it grows up: minute-1 is a tiny baby-blue spark with a thin voice; minute-5 is a big warm-gold being with a fuller, vibrato'd voice and longer, more elaborate replies (a legible "stage of life" label shows the growth). Made of glowing three.js particles; nothing is ever out of tune (D-Dorian).
  - *Why open it:* it's the **lab's first kids piece with memory + a minutes-long arc** — the category the kids side completely lacks. It sings hands-free on load (a ghost "virtual child" hums on its own), so just open it and watch/listen to it grow. No camera, no loop, no groove, no silliness — tender. Refs: **Tamagotchi/*Seaman*** · **Eno *Reflection*** · **George Lewis *Voyager*** (a machine that *answers*, never echoes).

## How this cycle ran
- **Kids DEEP fire:** 3 parallel builders, ONE concept (*a companion-world that remembers your voice and evolves over minutes*), three scarce-renderer attacks — **three.js single-creature** (won), **three.js accreting grove**, **raw WebGL2 coral reef**. The single-creature won because its memory *composes* (recombines fragments into new replies) rather than just accumulating a glowing field — the more surprising, more "Resonance" reading (a relationship, not a texture).
- Research → build chain (today): the live-2026 long-form/evolving generative frontier (an audio-reactive WebGPU slime-mold updated yesterday) is **entirely adult/installation**, and 2026 kids-tech reacts-but-forgets → the gap is a kids piece that *remembers and grows*. Avoided WebGPU (already 3× recent) and the jury-banned Canvas2D.

## ⚠️ One honest caveat (please glance)
- **Build:** 738 **compiled, linted, and type-checked clean** (no warnings attributable to it). The container's tiny file-descriptor ceiling (4096) again kills Next's static-generation step with `EMFILE` — **same infra quirk as the last 5 nights, NOT the code:** I proved it by building *pristine main* (no new folder) — it fails identically at the same file. **Vercel builds this app fine and will deploy 738.**
- **Not browser-verified here** (no mic/audio/WebGL in the sandbox) — unverified by ear: whether the pitch-tracker follows a small child's hum, and whether the recombined replies truly read as *the sprout developing*. The ghost demo + Canvas2D fallback guarantee a sounding, growing glance regardless.

## Banked this cycle, ready to resurrect (IDEAS §476)
- **`736-kids-echo-grove`** ⭐ — the three.js sibling: hum and a **grove** of glowing trees accumulates, older trees re-singing your earlier notes so a choir builds from your own voice. Resurrect-first for the next kids long-form slot.
- **`737-kids-memory-reef`** — the **raw WebGL2** sibling (most iPad-bulletproof): sing and a glowing coral reef grows from your voice. Resurrect when iOS-safety is the priority.

## Open questions for Karel
- On a real device, does Song Sprout feel like *a creature that remembers you and grows* — or does the reply need to land closer to what you actually hummed (more echo, less recombination) for a 4-year-old to feel heard?
- 738 is built to deepen (cycle-2): richer life-stages/"seasons", a **harmonic memory** that gives the sprout a slow evolving key over a session, and a **second sprout that duets** with the first. Worth pursuing — or resurrect a sibling (736 grove / 737 reef) first?
- Standing: the kids lane's WebGPU is now 3× recent (warming toward a ban) and Canvas2D is jury-banned — three.js + raw WebGL2 are the scarce renderers I'm steering kids onto. Any renderer you especially want to see (or avoid) for the little ones?
