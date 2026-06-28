# Morning digest — last updated 2026-06-28 (cycle 587)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 587 (ADULT · WIDE, 3 orthogonal live-data explorers, shipped 1)
- **`1024-wiki-bells` — every Wikipedia edit on Earth, *right now*, struck as a bell. The planet's collective thinking-out-loud, heard as a slow drifting carillon.** **Why open this:** it's the lab's **2nd real-world-data sonification** (your jury's #5 ask — only `1002-sun-organ`/NOAA existed) and the most *un*-lab-like thing here in a while: no mic, no camera, no finger on glass — **the world plays it, you just listen inside it.** Big edits ring as low, weighty bells; tiny copyedits as high tinkles; new articles bloom violet chimes; new users sparkle mint; bots go quiet and woody (mutable). Pitches snap to a modal lattice that **drifts every ~30s**, so minute 5 never sounds like minute 1. It's a Resonance-flavored, harmonically-richer descendant of **Hatnote's *"Listen to Wikipedia"*** (2013), credited in-app. Just press play and leave it on — an ambient instrument made of human attention.
- ⚠️ **Not heard yet:** no audio in my box. Compile + dream-zone lint/type are green; the live feed (Wikimedia EventStreams) is keyless + CORS-open so it should be **genuinely live in your browser**, not synthetic — but the bell balance + busy-day throttle want a minute on a real device. (No feed? a synthetic edit-stream plays an identical carillon.)

## Also explored this fire (built complete, banked — not shipped) — see IDEAS §587
- **`airspace-organ`** — the live airspace overhead (OpenSky aircraft) as a slowly-recomposing just-intonation chord on a gorgeous phosphor ATC radar. Held back **only** because OpenSky is CORS/auth-flaky → it'd often fall to synthetic, weakening the "the real sky plays it" promise. Revive with a reliable aircraft source.
- **`isobar-winds`** — a whole continent's live weather (METAR) as one breathing wind-organ over a cyan isobar map. Warm and clean; held back as the *third* slow-drone of the set — least surprising. Revive for a meditative continental-weather fire.

## Why this shape (ADULT · WIDE · live-data · non-pointer · Canvas2D)
- Your jury was pulling four ways at once: build a **2nd data piece** (#5), **vary the human↔sound relationship** (#1), **break the 7× pointer reflex** (#3) — *and* it flagged the cathedral/"walk a reverberant room" groove as **on the clock**. Deepening the Echo Halls thread again would have fed that exact groove. So I picked the one move that satisfies all four and reinforces *zero* grooves: **live-world-data as a playable instrument**, fanned out three orthogonal ways (edits / aircraft / weather), all non-pointer, all Canvas2D (dodging the 9× WebGL2-flat output). Today's research (Sonification Tools v2, 2026 — data is becoming a *playable instrument*, not a passive plot) → today's build.

## Open questions for Karel
- **Echo Halls thread:** I deliberately did *not* extend `1019` this fire (to avoid feeding the cathedral groove) — but it's your only 5/5 and the jury said don't abandon it. Next adult fire I'll **resurrect `1018-echo-halls-walk` with a compute body** unless you'd rather I push more data-sonification. Your call.
- **Data feeds as a recurring instrument class:** worth investing in? The category is wide open (transit, seismic, finance, OSC-from-your-phone). I can make the *next* one genuinely interactive (you shape the listening) rather than ambient.
- **Still the unheard pile (jury #4):** `1024`, `1020`, `1019`, `977` are all green-build-but-never-heard. One cycle that just hand-checks them on a real device would pay down real debt.
