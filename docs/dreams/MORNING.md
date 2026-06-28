# Morning digest — last updated 2026-06-28 (cycle 588)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 588 (KIDS · WIDE, 3 orthogonal explorers, shipped 1)
- **`1027-kids-chaos-aurora` — a 4-year-old flicks a glowing double pendulum; it dances a never-the-same-twice aurora ribbon and *sings* a real chord progression that never exactly repeats.** **Why open this:** it's the **lab's first-ever chaotic double pendulum** — grep-checked 0× across all 587 prior prototypes, so a genuinely new engine (the "massively bigger / never-used technique" you keep asking for), not another variation. Flick anywhere → instant chime + a swooping glowing trail; the chaos means it literally never loops (your "minute-5 ≠ minute-1" ask, on the kids lane). And it copies the recipe your jury praised in `1015`: **real moving harmony** (a true I–vi–IV–V — V actually has the leading-tone B, not pentatonic mush), the **sim IS the instrument's body**, and a **passing unit test**. Zero permissions — no mic, no camera — so it just plays the moment you open it on your phone.
- ✅ **Actually verified this time (rare):** I ran its headless self-test — **5/5 pass** — so the double-pendulum integrator is real (bounded over 7,200 steps, conserves energy <2%) and the harmony is provably always in-key. ⚠️ Still **not heard** (no audio in my box): chime balance + the aurora feel want a minute on a real device.

## Also explored this fire (built complete, banked — not shipped) — see IDEAS §588
- **`kids-marble-bells`** ⭐ RESURRECT-FIRST — tilt a tray of glowing marbles into a ring of bells tuned to a live I–IV–V–vi clock. Lovely + uses your loved tilt input + copies the 1015 recipe; held back **only** because the double pendulum is the genuinely-new technique. First in line next kids fire.
- **`kids-star-weaver`** — tap stars, connect them into a constellation, and a comet-spark walks the shape and sings it as a melody. The most *compositional* of the three (the child draws a reusable little loop); held back because the constellation/graph idea is close to the lab's well-worn orbit cluster.

## Why this shape (KIDS · WIDE · real-harmony · zero-permission · Canvas2D)
- Even cycle = kids rotation. Your jury told the kids lane to **copy 1015** (real harmony + sim-as-body + a test) and **stop the pentatonic toys** — all three explorers did exactly that, with three unrelated techniques. The lab is now 588 cycles deep and *saturated* (Lenia, sandpile, pendulum-harp, orbit, particle-life, RD all already built), so I hunted for and found the one classic engine never used — deterministic chaos — and built the night around it. Today's research (ALIFE 2026: open-ended novelty from simple deterministic rules) → today's build.

## Open questions for Karel
- **The unheard pile (jury #4) is real and growing:** `1027`, `1024`, `1020`, `1019`, `977` are all green-build-but-never-heard (no audio/GPU/camera in my container). The highest-value thing you could do is **one pass on a real device** — or raise the container's ~4096-fd ceiling so static-gen + tests run locally. I'd love to actually *hear* these.
- **Echo Halls thread (adult):** I detoured to data (587) then kids (588), so `1019` still hasn't been extended. Next adult fire (589) I'll **resurrect `1018-echo-halls-walk` with a compute body** unless you redirect.
