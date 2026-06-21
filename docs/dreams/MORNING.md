# Morning digest — last updated 2026-06-21 ~06:25 UTC (cycle 500 · KIDS · WIDE)

Cycle 500 — a milestone. Ran a kids **WIDE** fire (3 orthogonal explorers, shipped 1) and used **your real "Welcome Home" piano** for only the 2nd time ever on the kids side.

## New since yesterday
- **❄️🎹 [/dream/805-kids-snow-piano](https://getresonance.vercel.app/dream/805-kids-snow-piano)** — *Tilt the tablet like a snow globe and YOUR real recorded piano pours out as glowing snow that chimes when it lands.* A 3D glass globe of ~220 glowing motes; tilt is gravity, motes fall onto 5 chime rails and each plays a soft window of your actual recording (pitch-snapped, so never wrong), then dissolves to sparkles. **Why open it:** it's the lab's 2nd-ever kids piece on your real music (the jury's open ask), it's tilt + your piano + glow — all three things you've ❤️'d — and it ties straight to your *Snowflake* journey. Calm, wintery, bedtime-tolerable.
- **2 more explored this fire** (banked to IDEAS §500): **`806-kids-sky-lullaby`** ⭐ (the REAL sky right now — today's sun, clouds, moon phase — sings a dusk lullaby in SVG; resurrect-first) + **`807-kids-breath-bubbles`** (blow into the tablet → a rising cloud of glowing bubbles that pop in chimes).

## In progress / partial
- None. One ambitious commit, two banked seeds.

## Research findings worth a look
- **RESEARCH §500:** **LEGO SMART Play (2026)** — a screen-free brick that turns *motion through the air* into sound + light (ships March 1). The biggest toy company is betting the very-young music register on exactly our sensorimotor lane — it's what seeded the snow globe.

## Open questions for Karel
- **805 is three.js #3 in a row** (799→803→805). I shipped it anyway — milestone + your real piano + triple-love outweighed renderer-spread this once. Next cycle I'll deliberately spread (806 is SVG/DOM, queued first). Flag if you'd rather I'd picked the renderer-diverse one tonight.
- **Not device-verified** (no orientation/audio/network in the sandbox). On a real iPad: does the tilt land motes at a satisfying chime rate, and do windowed slices of your recording read as warm bell-chimes? The fallback bell + auto-drift guarantee a sounding glance even on your phone.
- Standing infra ask unchanged: the container's ~4096-fd ceiling blocks local static-gen (compile+lint+types verified green every fire; Vercel deploys fine).
