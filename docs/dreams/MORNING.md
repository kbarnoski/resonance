# Morning digest — last updated 2026-07-26 (cycle 914, WIDE)

## New since yesterday
- **`2928-freeharmony`** → https://getresonance.vercel.app/dream/2928-freeharmony — **sing (or hum, or play) ANYTHING and it harmonizes you live.** No reference tune — it listens to your voice, finds your key with **Krumhansl–Schmuckler key-finding**, and lays the right chord under you, re-harmonizing a beat or two *after* you modulate (a deliberate lag, like a real player catching up). *Why open this:* it's the **free-jam companion to yesterday's `2920-follow`** — that one follows a piece you *know*; this one follows you on *anything*. Together they're "accompany my song" ⟷ "jam with me." The jury's "danger — an agent who can be wrong": with no score, *you* own the melody. **Try it with your voice**, or hit **Auto** to watch a seeded singer wander and modulate while the key-finder tracks (WebGL2 "harmony aurora" — hue rides the circle of fifths).
- Went **WIDE**: raced **3 different "hand back on the instrument" corners** of the live-music-agent design space (arXiv:2602.05064, 2026) — voice-harmonizer, touch-MPE surface, bowed-string physics — and shipped the strongest. **2 more explored — see IDEAS §914.** Directly answers last night's jury: *put a hand back on the instrument; stop the science-fair monoculture.*

## In progress / partial
- Nothing half-built. One clean ship + two banked seeds.

## Research findings worth a look (RESEARCH §914)
- **"A Design Space for Live Music Agents" (arXiv:2602.05064, 2026)** maps the whole space of *machines that play music WITH a live human*. `2920-follow` is one labelled point (score-anchored); the map exposes the empty corners — I built the **scoreless** one and banked the **direct-manipulation** and **pure-physics** ones.
- Banked **`2944-bowfield`** ⭐⭐ — **bow a string with your hand** and it catches/sings/scratches like real rosin, because it's a genuine **stick-slip friction physical model** (McIntyre–Woodhouse 1983), not a sample. First bowed-string model in the lab; it already builds clean. My top pick to ship next.
- Banked **`2936-seaboard`** ⭐ — a ROLI-Seaboard/Osmose multi-touch surface where each finger bends/swells/recolors its own note independently (three.js petal field). Per-note expression, playable with no hardware.

## Open questions for Karel
- **Does `2928-freeharmony` feel alive with your real voice?** I can't hear it here (headless) — does it *audibly* find your key and re-harmonize as you wander? Does the lag read as musical (a player catching up) or sluggish?
- **The obvious next step is a fusion:** a "free mode" toggle on `2920-follow` → one instrument that both **follows a known piece** *and* **jams on anything** (I kept them separate so far because the immutability rule means I never edit a shipped prototype — a fused v2 would be its own new piece). Want it?
- **AI-pipeline chains (music→image→video) are still 0× — the FOURTH+ jury flagging it.** It spends your FAL_KEY budget, so it needs your explicit go-ahead + a per-run cap. One word unblocks it.
