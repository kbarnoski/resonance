# Morning digest — last updated 2026-07-14 ~04:00 UTC

> **A body in the room, at last.** For weeks the jury's loudest, oldest note has been "get a *body* in the room — an embodied piece where the body, not the voice, is the instrument." Tonight cashes it: stand in front of your webcam and **your whole body becomes the bridge of a giant harp** — sweep a wrist, elbow, knee or ankle across a hanging string and it plucks a real physically-modeled note you *watch* shiver and *hear* decay.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[1630-string-loom](https://getresonance.vercel.app/dream/1630-string-loom)** — *Your body is the bridge of a giant string instrument: MediaPipe tracks your joints, and every string a limb crosses plucks a real Karplus-Strong note that shivers in 3D exactly as it rings.* **Why open this:** it's the first real body-as-instrument piece in the lab — the whole body, not a hand or a cursor — and it keeps our tightest trick (the string you *see* wobble is the exact pitch you *hear*). 15 strings tuned to a warm just-intonation pentatonic over 3 octaves, genuine Karplus-Strong plucked-string physics, warm bronze/bone on charcoal. **Just press Start** — with no webcam it self-plays a deterministic ghost skeleton sweeping the strings, so it's never blank, but it comes alive when it can see *you*.

## Mode this cycle: DEEP — one embodied concept, three approaches, shipped 1, banked 2
- **⭐⭐ 1632-hand-lyre** (banked, **TOP embodied ship-next**) — the precise, playable sibling: your two hands are a ten-string lyre, a mid-air pinch plucks that finger's string, hand height sets the register. The most *musical* of the three — held back only because it's hands-only, and the jury asked for the whole body. This is the natural next embodied night.
- **⭐ 1634-flow-choir** (banked) — the no-ML version: pure camera motion (no skeleton, no model) pours energy into a grid of tuned resonators, so moving through the air swells a choir exactly where you disturbed the space. The most portable and robust of the three; held back on being an aggregate "hum" rather than discrete plucked notes.

## Where the jury stands — FULLY DISCHARGED, and tonight cashed its #1
All five 2026-07-13 provocations were answered 762–765; tonight finally paid off its **loudest/oldest** one ("get a body in the room"). A **fresh jury verdict is genuinely overdue** — I've been orchestrator's-choice on the alternation ledger for several nights. Worth running one before the next cycle to reset the targets.

## Open questions for Karel
- **Retire criterion #5 (fresh <14-day research)?** 18th straight cycle with no genuine <14-day find. Tonight rests honestly on a *recent* finding (2026 *Fluid Body* embodied-sonification, Springer) plus #2 + #3 + #4. Recommend we formally accept "recent research finding" as the bar and retire the <14-day hunt. One call.
- **The audio→image→video AI-pipeline chain is still unbuilt after 19 juries asking** — blocked ONLY on your OK to spend a small per-prototype FAL budget (I can't spend unattended). One yes/no.
- **Does the body tracking feel right on your Chrome?** The pluck threshold + crossing velocity were tuned blind (headless has no webcam) — tell me if it's too twitchy or too dead when it sees your real movement, and I'll retune next cycle.

## Honest notes
- **Honest 3/5:** #2 four wired subsystems (pose-tracking + crossing/velocity pluck-detection + Karplus-Strong DSP + three.js standing-wave render) + #3 named refs (Karplus & Strong 1983, Waisvisz *The Hands* 1984, *Fluid Body* 2026) + #4 declared cycle-1 of a multi-cycle embodied line. **#1 not claimed** — body-tracking (1590) and Karplus-Strong both already exist here; the fresh part is body-joints-as-a-string-bridge.
- **Not seen/heard/webcammed on your hardware** (headless has no display/speakers/camera): whether the joint-crossing feel and string-shiver read right want your Chrome. Verified clean (compile OK; route in both manifests; no non-winner leaked); the seeded ghost skeleton guarantees it's never blank/silent.
- **Repo recovery (again):** local `main` was stale/diverged (50/50) with a forced update; `git reset --hard origin/main` before working. This recurring web-container divergence keeps costing the first minutes every fire — worth a look when you have a moment.
