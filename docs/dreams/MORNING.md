# Morning digest — last updated 2026-06-03 (UTC, cycle 300)

**Open this first:** [/dream/295-kids-shadow-dance](https://getresonance.vercel.app/dream/295-kids-shadow-dance) — hit **Start dancing**, stand back, and **move your whole body**. The dusk meadow blooms and sings wherever you go. (No camera handy? A ghost dancer demos the whole thing for you.)

## New since yesterday
- **Shadow Dance** (`295-kids-shadow-dance`, kids) — the lab's **first whole-body / camera kids piece**. A 4-year-old just *dances* and a Lydian meadow blooms, leaves glowing light-trails, and sings under them — **nothing to tap, no way to be wrong**.
  - **Why open it:** it answers the jury's #1 kids ask ("ban touch — make the child *move*, not poke") and your "stop shipping mic+pentatonic" note in one shot — it's tuned to **G-Lydian**, not pentatonic, and it's the most technically ambitious of the three (camera **frame-difference motion** → a raw-WebGL2 meadow with light-trail accumulation + a faint shadow of *you* in the grass).
  - **Privacy:** the camera is analysis-only — frames become motion numbers and are thrown away. Nothing recorded, nothing sent, no API.

## How it was made (the orchestration is the point)
- **WIDE fire — 3 parallel builders, three different hands-free directions**, ship the strongest:
  - 🏆 `shadow-dance` — **dance** (camera, whole-body, Lydian). **Won.**
  - 🌱 `voice-garden` — **sing** a garden into bloom, it sings back (pitch detection + memory). Banked — it's lovely, but mic+pentatonic is the rut you flagged, so I held it to *reframe* first.
  - 🌱 `firefly-tilt` — tilt a firefly to wake stars; **the sky remembers your path and replays it as a lullaby**. Banked — the "remembers your journey" concept is the keeper; I'll lift it onto a fresher input.

## Research worth a look (RESEARCH §300)
- **Both kids forms are current, not nostalgic:** browser pitch-detection shipped a how-to **this month** (MusicalBoard, 2026-05-05) and movement-sonification has a **CHI 2026** workshop. The winner chains straight from the movement finding.

## Next
- **Cycle 301 (adult):** 291-harmonograph **cycle 3** — the polychrome colored-thread specimen + SVG export (already banked, continues the multi-cycle thread).
- **Cycle 302 (kids):** reframe voice-garden *out of* pentatonic, or move firefly's remember-and-replay onto a fresher input.

## Open questions for Karel
- 295 is **build-verified, not browser-verified**. A 1-min play would confirm: does the **motion field feel responsive** under your room's lighting, and does the faint **shadow-of-you** in the meadow read as charming (not noisy)? On a laptop with no camera, the ghost dancer should still demo everything.
- **Force-push doc-drift** recurred again (origin/main force-updated; local diverged 50/50 → `git reset --hard origin/main`; it even left a stale AGENT.md in my first read). Harmless to the loop, but worth a glance if it's from your side.
