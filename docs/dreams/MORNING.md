# Morning digest — last updated 2026-08-01 ~06:15 UTC (cycle 974, WIDE fire)

> **Tonight the real, shaking Earth is your accompanist.** No mic, no camera, no playing — the piece fetches the actual global earthquakes from the last 24 hours (USGS's live feed) and lets the planet play itself. Every quake drops a ripple into a world-sized pond *and* strikes a bell, tuned so the Earth **rings** instead of rattling. And the pond never fully clears — it accumulates, so minute five doesn't look like minute one.

**Open on your phone → https://getresonance.vercel.app/dream/4520-seismarium** — it starts painting + playing within ~1s on its own (no tap needed). Tap once to enable sound. Watch the top-left badges: **LIVE** = it reached USGS, **SYNTH** = it's on the offline fallback; **GPU** = WebGPU, **CPU** = the Canvas2D fallback. Bigger/deeper quakes = lower, longer bells; a low drone swells when the planet's been busy.

## New since yesterday
- **`4520-seismarium` — the living Earth as an accumulating instrument.** Real USGS earthquakes → a WebGPU "ripple tank" world map that *remembers* (low damping, so waves pile up over minutes) + a struck-bell synth snapped to a slowly-rotating pentatonic. The key idea (from today's research): impose a **musical grammar** on live data so an endless real-world stream stays music, not noise.
- **Why this one's different:** it's the lab's first piece where an **external, indifferent real-world stream is the composer** — you witness it, you don't play it. Fills two of our thinnest cells at once (external-data input; genuine long-form memory). Deterministic offline fallback so it always works, even with no signal.

## Also explored tonight (2 more — banked, not shipped — see IDEAS §974)
- **`4536-ballast`** — hold your phone *level* and a chord rings pure; let it list and the overtones groan (a balance instrument in a ship's gimbal). Held only because three.js has shipped 3× recently — resurrect-first on the next tilt slot.
- **`4552-tribute`** — the music only keeps playing while you keep proving you're listening (answer its rhythmic call-and-response; neglect it and it dies). Held because SVG just shipped last night. Both are strong, both built clean.

## Decisions for you (yes/no — I keep re-flagging these because they're blocked on *you*, not me)
- **AI-pipeline chain (music → image → video)?** Needs your `FAL_KEY` go-ahead + a per-piece budget. If yes, I'll build it next.
- **Real two-device multi-user (WebRTC)?** Every "ensemble" piece so far fakes the other players. I can build a genuine shared room if you'll do a two-device review.
- **Depth-camera spatial-audio room?** The cold "embodied/spatial" cell — needs your OK on a camera-in-the-room piece.

## Open question
- `4520` is **not ear/eye-verified** (headless: no GPU/speakers, and I couldn't confirm the live USGS fetch survives the runtime proxy). The fallbacks guarantee it *plays*, but tell me if the pentatonic grammar actually sounds luminous on your phone — that's the one thing I can't hear from here.
