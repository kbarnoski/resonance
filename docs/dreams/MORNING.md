# Morning digest — last updated 2026-06-13 (UTC) · cycle 412

> **Yesterday's jury** said: get off three.js/SVG/the mic, get **off the glass**, build the **real-world-data** piece (it's been 0× the whole window), **freeze the growing-creature spine** (549 ≈ 569 were twins), and **chase warmth, not another clever puzzle**. This cycle does the real-data + warmth move. See `docs/dreams/JURY.md`.

## ⭐ Open this first
**[/dream/575-kids-sky-song](https://getresonance.vercel.app/dream/575-kids-sky-song)** — **Sky Song** 🌦️🎶 (kids 4+)
**Today's REAL weather outside your window writes a little song — and your kid plays it.** The piece quietly fetches your **actual current local weather** (live, no setup) and lets the real sky **compose**: a sunny day → a bright major celesta; rain → gentle minor-pentatonic plucks; snow → glassy bells; fog → a low drone; night drops it an octave. Wind sets the tempo, clouds set how busy it is. A little generative song **plays itself and keeps evolving** (never a flat loop), and the child **touches a glowing aurora** to add their own voice — always in today's key, so nothing is ever wrong.
- **See it in 10 seconds:** open it — the aurora drifts and notes bloom on their own from frame one, so a silent glance already shows a sky *making music*. Tap once to start the sound, then touch the sky to play along.
- **The headline:** this is the lab's **first kids piece driven by real-world data** — your literal weather, not a synthetic toy. The directest answer to the jury's most-repeated ask ("music *about* something other than music").
- **Grant location** when it asks and you'll hear *your* weather; deny it and it still plays a default-city sky. Works on iPad (WebGL2 aurora, Canvas2D fallback).

## How this cycle ran
**KIDS · DEEP** (one big concept, 3 parallel approaches). The diversity audit + jury **banned three.js, SVG, and the mic** all at once — so all three explored real-weather sonification on **WebGL2 / Canvas2D + live data + touch**, no mic. Shipped the most ambitious: the one where the weather *composes* an evolving song, not just tints a tap-toy.

## 2 more explored — banked (IDEAS §412)
- **573-kids-sky-window** — a gorgeous **raw-WebGL2 GLSL living sky** (volumetric clouds, sun/moon, rain, lightning) you touch to play. The richest *atmosphere* of the three — lost only because 575's self-composing song is the bigger idea. **Worth reviving as the lush sky layer.**
- **574-kids-weather-today** — the **warmest, coziest** take: a cut-paper diorama with a smiling sun and a friendly paper critter, tap-to-play. The most instantly readable for a 4-year-old and the most iPad-bulletproof (Canvas2D) — lost because its *shape* is closest to our older synthetic weather toys.

## Research finding worth a look
**Live local weather is now a zero-setup browser instrument** — Open-Meteo gives real current conditions for any location with **no API key, no server, no secret**, CORS-ready. That's what makes 575 possible. The same pipe opens up tide / air-quality / ISS-pass / seismic pieces — each "music about something real". (Honest note: the *sonification* lineage I leaned on is foundational, not a <14-day finding, so I did **not** claim a fresh-research score.)

## Open questions for Karel
- **Love 575 → cycle 2:** add a **forecast time-lapse** — scrub the next 16 hours of your real forecast and hear today's weather *arc* as a piece that changes (a genuine lab-first: long-form generative driven by a real forecast). Fold in 573's lush volumetric sky as the backdrop. Want that?
- **One caveat:** on a clear review morning the piece will (correctly) sound bright and major — you won't *hear* the rainy/snowy variants without that weather. Want a tiny "try other skies" toggle so you can preview all the moods on demand?
- Next is an **adult** cycle (413), leaning WIDE — and the jury explicitly **banned polytempo + the xenharmonic lattice** there and asked for **warmth**. Likely an *adult* real-data drone or an off-the-glass piece. Any steer?

— Build-verified (`npm run build` ✓ 448/448 pages); not browser-verified (no WebGL2/audio/network in the sandbox). The alive-from-frame-one visuals + baked-sky fallback mean it always shows a living sky even with no location and no network.
