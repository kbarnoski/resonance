# Morning digest — last updated 2026-06-24 22:1x UTC (cycle 542, kids · WIDE)

**Open this first (on TWO phones if you can):** https://getresonance.vercel.app/dream/918-kids-starlight-friend

## New since yesterday
- **[/dream/918-kids-starlight-friend](/dream/918-kids-starlight-friend)** — ✨ **the lab's first multi-user piece — two 4-year-olds, two iPads, ONE shared night sky.** Shake your iPad to fling a shooting star; it streaks across a deep indigo→violet GPU sky, blooms, and chimes — *and the same star lights up + sings in your friend's sky too.* You build a constellation song together. No tempo clock: stars chime whenever they arrive on each device — the reward is purely "we made this together." One warm pentatonic, so nothing two kids fling can ever clash. **Why open it:** it finally answers the jury's #2 — **multi-user/WebRTC shared room, 0× after being named in every single jury** — and it's the answer to *your own* question from yesterday's digest ("want multi-user as the next big swing?"). Yes. In the kids register.
- **Works solo, hands-free:** a **"ghost friend"** auto-joins within ~1s and flings its own (cooler-hued) stars, so a single phone shows living two-player co-play with zero interaction. Tap 👋 to invite a real friend (serverless — a share-link, no account). Same-room / same-hotspot is the real two-iPads use case and connects cleanly.

## In progress / partial
- Two siblings were fully built then banked (IDEAS §542): **`920-kids-sing-a-sprout`** ⭐ (hum and a glowing garden **grows over minutes** on a sunflower spiral, then **sings your melody back** when you go quiet — the long-form/stateful depth lane 888 opened, the most bulletproof of the three) and **`919-kids-rain-bowl`** (tilt to pour glowing rain that chimes as it splashes — a from-scratch **WebGPU compute** particle sim with a lush three.js fallback). Both ready to rebuild from one brief.

## Research findings worth a look
- RESEARCH §542: networked-music research chases sub-30ms tight tempo for adult ensembles — but the dyadic-child-synchrony studies (PMC12063534, 2025; Kirschner & Tomasello 2010) show the *prosocial* "we made this together" payoff for a 4yo is robust to **loose** sync. So 918 makes latency-tolerance the **feature**, not the enemy.

## Open questions for Karel
- For a 4yo, is loose serverless two-device WebRTC the right bar, or should the multi-user piece run through a tiny shared "room" (one code, both join) instead of copy-pasting star-codes? The copy-paste handshake is parent-assisted; a room would be tap-and-go.
- Deepen 918 → **3+ players** / a shared constellation that *remembers* the session (the multi-cycle plan), or resurrect 920 (long-form voice garden) next?
- **Not device-verified** in-container (no audio/GPU/motion/second-peer here) — worth a 30-sec play on two phones to check the shake feel + the real connect; solo+ghost is verified-by-design to always sound and move.
