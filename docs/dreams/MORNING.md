# Morning digest — last updated 2026-06-25 ~18:1x UTC (cycle 552, kids · WIDE)

> **Today's jury** (`docs/dreams/JURY.md`) said: stop apologizing for omitting pitch — **make real melody / harmony the idea** (#2), and **get off three.js** (#1). After two DEEP nights I went **WIDE**: three unrelated kids directions in one fire, all melody-first, none on three.js. Shipped the most novel.

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[946-kids-bird-round](https://getresonance.vercel.app/dream/946-kids-bird-round)** 🐦🎶🌅 — *Teach a bird a tune; hear a flock sing it as a round.* A 4-year-old **drags a glowing bird up & down a tree** to sing (height = pitch, auto-snapped to a friendly scale so it's always pretty). Let go — the bird **remembers your tune and loops it**. Tap **add-a-bird** and a second bird sings the same tune a beat later: a real **canon / round** ("Row, Row, Row Your Boat"), blooming into layered birdsong as the flock grows.
  - **The lab's first kids canon/counterpoint piece** — melody IS the toy (jury #2), and it's on **raw WebGL2**, not three.js (jury #1). No reading, big emoji buttons, ~2s-idle auto-demo sings a tune + adds a bird so a hands-off glance hears a little round within ~1–2s. Falls back to Canvas2D on older browsers; more birds never gets louder.
  - **Why this one of the three:** it extends the loop/layering toys you've ❤️'d (172-loop-station, 111-kids-shape-loop, 160-kids-paint-loop), and it *doesn't* repeat last night's 941 harmony piece.

## Also explored this fire (WIDE — 3 built, shipped 1)
- **944-kids-melody-coaster** ⭐ (kids resurrect-first) — *draw a hilly track, a cart rolls and **sings the shape** as a melody.* The most instantly-graspable 4yo delight; banked only because "draw a melody" is our most familiar kids ground. Grounded in the research below.
- **945-kids-harmony-garden** — *tap to plant note-flowers; consonant ones grow "friend-vines" and the chord **voice-leads** smoothly.* The directest harmony/voice-leading answer (and Canvas2D, which the jury wants back) — banked only because it overlaps last night's 941. A strong "workspace for composers, kids edition" seed. Both are build-green; rebuild briefs in IDEAS §552.

## Research finding worth a look
- **RESEARCH §552** — for young children, **the SHAPE of a tune (melodic contour) IS the tune** — they recognize melodies by their up/down contour before interval or key. So the most age-true way to obey the jury's "make music from pitch" is to let a kid *draw/drag a contour and hear it* — exactly what 946 (drag → round) and 944 (draw → cart) do. (Foundational developmental-psych, flagged honestly — not a last-30-days paper.)

## Open questions for Karel
- **Three melody-first kids directions, one shipped.** Did I pick right? 946 (round) is the novel/love-aligned one; 944 (draw-a-melody) is the safest delight; 945 (harmony garden) is the most "composer-ish." Say the word and I'll ship a banked one next kids cycle.
- 946 is **not ear-verified** here (no audio/WebGL2 in the container; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). The unverified bit is whether the **canon offsets sound like a genuinely harmonious round** on a real speaker — the always-on pad + auto-demo guarantee it'll *sound*, but the round-feel wants a real-device listen.
- **Verification debt keeps mounting** (jury #3): 946 is ~the 18th build-green-but-unheard prototype. An infra fix to actually *run* 927/942/946 on a real device would likely beat shipping a 19th. Flagging again.
