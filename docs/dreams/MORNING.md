# Morning digest — last updated 2026-07-07 (~10:xx UTC, cycle 691)

**Cycle 691 · psychedelic · WIDE — three cosmic/dream states, three starved inputs; I shipped the one that's *real*.**
Three unrelated directions in parallel — a meditative dissolution, a live-aurora void, a hypnagogic dream. I shipped the one driven by **the actual aurora happening on Earth right now**: it's the planet-scale sibling of `1193-tremor-core` (the live-earthquake gong you liked), and it breaks us out of the run of full-screen shader fields I've shipped three nights straight.

## New since yesterday — ▶ open this first
- **[`/dream/1259-auroral`](https://getresonance.vercel.app/dream/1259-auroral)** — **Earth's live auroral oval, sung back.** Press *Begin*. Two keyless NOAA space-weather feeds (the OVATION global aurora grid + the Kp index) are pulled **live in your browser** and become slow luminous green→violet curtains drifting overhead; the brightest cells chime. The **more active the real geomagnetic storm this minute, the more overwhelming the piece** — right now it's a quiet night (real Kp ~1), so it's a faint calm shimmer; it shows the live Observation Time + Kp on screen so you can see it's real. **Why:** it's "music about the world, not about music" — the tremor-core pattern the jury named as one of only two builds that *soared* — and a live **map**, not another shader field.

## Explored tonight but banked (see IDEAS §691)
- **`1258-stillness`** ⭐ TOP — **hold still and the screen dissolves into clear light.** Your webcam measures how much you move (plain frame-differencing, no ML); the *stiller* you hold, the more the field melts into a boundless white-gold Ganzfeld and the sound opens — one twitch pulls the light back. It's the *inverted interaction* the jury keeps asking for (novelty in what you do, not the model). Lost only because it'd be the 4th full-screen shader field in a row, and the payoff takes a few seconds. Strongest thing in the resurrect queue.
- **`1260-threshold`** ⭐ — **draw at the edge of sleep.** Your finger's trail smears and blooms into drifting hypnagogic forms (lattices, cobwebs, faces-in-noise) that morph on their own and abruptly *teleport* into a new scene — dream discontinuity. Warm dusk palette, glassy bells. Lost on a technique we've done before (feedback trails) + it's dim until you draw.

## Open questions for you
- **Ship the phone-native `1258-stillness` next, or `1253-ganzfeld` (from cycle 689)?** Both are camera/sensor cosmic-ambient pieces waiting on a clear slot — 1258 is the standout, but it re-camps the shader-field output, so it wants a night's gap first.
- **The build fd-ceiling** is still *worked around* (isolation build, now proven 6×), not fixed — a one-line `ulimit -n` raise restores a clean full local build. Not urgent.
- **WebRTC multi-user** still blocked on your durable-signaling-store decision (jury #5, deferred for weeks).

## Standing note
WIDE fire, so 2 more directions were fully built and banked (not shipped) — see IDEAS §691. Pole stayed **cosmic-ambient/endogenous** (688 cosmic → 689 dissociative → 690 intense → 691 cosmic), spectrum covered. Auroral is unusually low-risk: no GPU shader to compile, robust live-fetch + a deterministic offline sample if NOAA is down, no server route. Verification debt as always: build-green but headless here — whether the curtains *read* as the aurora (and whether a quiet Kp renders too faint vs. the offline Kp≈3 sample) wants your browser. Field draws on load (never blank); sound starts on *Begin*. Safety: no strobe — smooth slow shimmer only.
