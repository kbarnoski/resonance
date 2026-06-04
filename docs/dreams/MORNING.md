# Morning digest — last updated 2026-06-04 (UTC, cycle 302)

**Open this first:** [/dream/298-kids-echo-friend](https://getresonance.vercel.app/dream/298-kids-echo-friend) — for the kids (4+). Tap **"Sing to me ✨"** and **sing a little phrase**. A glowing creature listens, **sings it back**, and **remembers** every phrase — every few rounds it plays a growing song made of everything you've sung together. (No mic? It demos itself — a hands-free auto-singer drives the whole loop.)

## New since yesterday
- **`298-kids-echo-friend` — call-and-response WITH MEMORY.** The kids lane's antidote to "poke a cute thing → it drones." The child sings → the creature detects the pitch, **answers in its own voice**, and **accumulates** the phrases into a little song that grows the longer you play. It's *different at round 5 than round 1*.
  - **Why open it:** it does the two things you queued for the kids lane in one piece — it reframes the banked voice-garden **out of the C-pentatonic rut** (it's in **D-Dorian** now) and moves the firefly's *remember-and-replay* idea onto a **fresher input** (voice, not tilt). Born from a fresh paper (below).

## How it was made (the orchestration is the point)
- **WIDE fire — 3 parallel builders, three ways to break the kids "poke" form** (all hands-free — sing / clap / blow), ship the strongest:
  - 🏆 **echo-friend** — SING → sing-back **with growing memory**. **Won** (the only one with a real compositional arc; matches your loved sing + loop pieces).
  - 🌱 **clap-band** — CLAP → a band catches your rhythm and layers a groove (Steve Reich *Clapping Music*). Banked — fresh onset-detection DSP, but loops one pattern rather than *remembering* you.
  - 🌱 **blow-sail** — BLOW → your breath is the wind sailing a boat past singing buoys. Banked — lovely + a clever breath-vs-voice detector, but the calmest/least "memory" of the three.
  - Both banked siblings are build-reviewed with full specs in IDEAS.md — ready to revive.

## Research worth a look (RESEARCH §302)
- **SingingSDS** (arXiv:2511.20972, Nov 2025) — a dialogue agent that **responds by *singing*** instead of speaking, arguing melody makes a reply more *memorable*. `298` is its fully-client, no-AI, kid-sized embodiment: no model, no server, the mic never leaves the tab.

## Next
- **Cycle 303 (adult):** 291 **cycle 4** = the banked scope mode — *only if the harmonograph thread still feels alive after 3 cycles*; else pivot to banked breadth (`289-still-room`, `282-ensemble-tabs`).
- **Cycle 304 (kids):** revive **clap-band** (rhythm sibling to 298's pitch) or **blow-sail** (calm breath).

## Open questions for Karel
- `298` is **build-verified, not browser-verified**. A 1-min sing would confirm: does the pitch-tracking land cleanly on a real kid's **wobbly voice**, and does the sing-back feel like **a song we're building** vs. a list of echoes?
- **Force-push doc-drift** recurred *again* (origin/main force-updated; local diverged 50/50 → `git reset --hard origin/main`; a stale AGENT.md tripped my first read). Harmless to the loop, but it happens every fire now — worth a glance if it's from your side.
