# Morning digest — last updated 2026-07-28 (cycle 932, DEEP)

## New since yesterday
- **`3328-mirrorhall` → [/dream/3328-mirrorhall](https://getresonance.vercel.app/dream/3328-mirrorhall)** — **the lab's first FORWARD acoustic solver: sculpt a room and hear your piano through the real physics of its reflections.** Drag the corners of a room's floorplan and the **image-source method** (Allen & Berkley 1979) recomputes the exact early reflections that geometry produces — mirroring the source across every wall, validating each specular path, assembling the taps into a live impulse response driving a ConvolverNode. A plain rectangle **rings with a flutter echo** (the parallel walls line up equally-spaced taps — you hear the metallic buzz, and the ring frequency is reported); splay the walls or raise absorption and the phrase **blooms** clean. *Why open it:* it's the jury's #2 ask made real — audio-IS-the-piece, no fragment shader, and a room you can hear is *wrong* (flutter) or *right* (bloom). The "hall of mirrors" viz draws the ghost image sources outside the walls so you SEE the reflections you hear. Press **Play phrase**, turn **Loop** on, then drag a wall and listen to the room morph.
- **1 more acoustics engine explored (DEEP race), banked to IDEAS §932:** `3336-materia` ⭐⭐ — the complementary **stochastic ray-tracer**: paint glass/stone/wood/curtain onto each wall and hear cathedral-bright→studio-dead, with a live RT60 + Sabine cross-check (verified: curtain 0.46s → glass 1.75s → stone 2.16s). Built demoable + lint-clean, then set aside (not committed). The ⭐ next step is to **fuse the two** — image-source early reflections + ray-traced late tail = the real production reverb recipe.

## In progress / partial
- Nothing half-built. `3328-mirrorhall` shipped whole this cycle.

## Research findings worth a look
- **RESEARCH §932 — geometric acoustic ray tracing has gone real-time** (Meta Acoustic Ray Tracing Audio SDK, 2025–26; arXiv 2503.12948 survey). A Houdini/offline technique is now production-grade; the two classic engines (image-source vs stochastic ray tracing) are exactly what tonight's race built. We had a room you *measure* (`2392-room-tone`) and one where you *place* voices (`2992-around`) — never one you *simulate from geometry*. Now we do.

## Open questions for Karel
- **Heads-up on the build:** the whole-repo `npm run build` now hits the sandbox's hard 4096 open-file cap during page-data collection (~880 routes) — an `EMFILE`, **not** a code error (TS+ESLint pass clean, Vercel's higher-fd builder is unaffected). I worked around it locally by pinning to one core; the deploy is fine. Flagging in case you see it too.
- **Can't ear-verify headless** — whether the flutter echo genuinely reads as a metallic ring vs a clean bloom, and whether the room audibly morphs while looping, want your device. Tell me if it lands.
- **AI-pipeline chains are STILL at zero — 6th jury / ~14 cycles overdue** (music→image→video, lyric→cover-art→loop via fal.ai/replicate). Blocked on your FAL_KEY budget go-ahead + a per-run cap. One word — *"go, cap $X/run"* — unblocks the single most novel unbuilt thing in the lab.
- **Next step?** Fuse mirrorhall + materia into a hybrid IR, route your real Path piano through the room, or ship materia's material-painter on its own — your call.
