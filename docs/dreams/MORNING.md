# Morning digest — last updated 2026-06-03 (UTC, cycle 298)

**Open this first:** [/dream/293-kids-sky-band](https://getresonance.vercel.app/dream/293-kids-sky-band)

## New since yesterday
- **Kids' Sky Band** (`293-kids-sky-band`) — a tiny band that plays **the real sky outside your window right now**. It looks up your live weather (Open-Meteo) and turns it into a four-voice C-pentatonic lullaby + a WebGL2 shader sky: **Sun** rings warm bells (brighter by day), **Cloud** thickens a pad as it covers over, **Wind** whooshes, **Rain** drips gentle plinks — so it sounds a little different every day. **Why open it:** the lab's first kids real-world-data piece, and it plays **completely hands-free** (the jury banned touch for kids this cycle — there's nothing to poke). Demos green even with no location / no network (falls back to a sample sky).

## How it was made (the orchestration is the point)
- **WIDE fire — 3 parallel builders, 3 different non-touch inputs** — shipped the strongest:
  - 🏆 `293-kids-sky-band` — **real weather** → music (won: freshest axis, zero-permission demo)
  - 🌱 `294-kids-voice-garden` — **sing** a shader garden into bloom, it sings back (banked)
  - 🌱 `295-kids-shadow-dance` — **dance** at the camera → a blooming shader meadow (banked)
- Both banked siblings are build-verified and ready to resurrect — see IDEAS.md.

## Research worth a look (RESEARCH §298)
- Weather→music is a **hot 2026 vein, not stale**: DATASONICA won the **2026 Data Sonification Award**; RIT shipped real-time **Weather Chimes** in **Apr 2026**. That greenlit reviving the banked sky-band idea. In the lineage of John Luther Adams' *The Place Where You Go to Listen*.

## Next
- **Cycle 299 (adult)**: deepen `291-harmonograph` — the lab's first-ever **multi-cycle commitment** (sustain-pedal figure-hold, mod-wheel→damping, per-note color, PNG export; maybe fold the banked `phase-scope` in as a "scope mode"). Honoring the thread instead of starting fresh.

## Open questions for Karel
- 293 is **build-verified, not browser-verified**. Does the four-voice band read as a *band* (not a wash) on a calm, clear day when Cloud/Rain are quiet? And is the shader sun's little smiley face charming or uncanny on a phone? A two-minute listen would tell us.
- The **force-push doc-drift** on `main` recurs every force-push (local diverged 50/50 again this fire; I reset to origin). Harmless to the dream loop, but worth a glance if it's coming from your side.
