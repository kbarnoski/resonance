# Morning digest — last updated 2026-07-25 (cycle 902, WIDE)

> **The jury's loudest open ask ([JURY.md](JURY.md), 07-25) was "get your hands off the keyboard — build for a REAL sensor as the primary surface."** Tonight's winner is a piece you play by *physically swinging your phone.* No keyboard, no AI bandmate, no voice, no safety-net tuning.

## New since yesterday
- **[2688-orrery](/dream/2688-orrery)** — *a pocket solar system you play by swinging.* Four bodies orbit a star; the **whip of your phone's motion** pumps energy into them. When two orbits fall into a small-integer period ratio (2:1, 3:2, 4:3 …) they **lock** — the same physics that traps Jupiter's moons — and you hear that exact interval bloom into consonance. Swing hard and the orbits destabilise, the pitches drift **microtonal and beating**; ease off and it re-locks.
  - **Why open this:** it's the most *visceral* answer yet to "make it need a human and a real sensor" — you don't press anything, you **move**, and consonance is something you *earn* out of the dynamics. Pitch is read straight off each orbit's frequency and is **never snapped to a scale** — the honest kill of the just-intonation safety net you asked us to protect.
  - **The tell, on your phone:** the interval readout at the bottom names the current lock (`3:2 · perfect fifth`) or says `drifting · microtonal`; bright threads with pulsing ratio labels connect locked pairs. **Open it on your phone, tap Start, and swing it** — on desktop, drag the canvas; leave it alone and a seeded autopilot keeps it breathing in and out of resonance.
  - **The one thing I need your hands on:** does swinging actually *feel like playing an instrument*, and are the capture/damping constants balanced — locks too eagerly, or drifts too freely? That's headless-unverifiable; the physics and determinism are sound, the *feel* wants your phone.

## Explored but not shipped (2 more, both strong — see IDEAS §902)
- **2696-standing-wave** ⭐⭐ — *your actual ROOM slowly composes the piece.* A real-time homage to **Alvin Lucier's _I Am Sitting in a Room_**: the mic listens to your room as a **resonance sensor (not your voice)**, learns its persistent standing modes over minutes, and feeds them back as sustained tones until the room's own frequencies bloom into a chord that portrays *that* room. Long-form emergence, safe (no feedback howl), microtonal. **TOP resurrect — the cleanest non-voice mic piece in the queue; grab it on a mic/meditative cycle.**
- **2704-two-hands** ⭐ — *two devices, one shared resonant field, connected by nothing but a link/QR.* True cross-machine **WebRTC** (serverless copy-paste/QR handshake, from-scratch QR encoder), the jury's #4 "biggest untouched category." Ships with a solo ghost-hand loopback so it demos on one device — but the *live* two-phone pairing is untested headless. Resurrect on a cycle where two real devices can verify it.

## Research finding worth a look (RESEARCH §902)
- **[NIME 2026](https://nime2026.org/)** (New Interfaces for Musical Expression, London, Jun 23–26) keeps the phone's **accelerometer as an expressive *performance* controller** front-and-centre — map continuous motion to musical expression, not discrete taps. The lab reads `deviceorientation` in 98 files but almost always as passive parallax; tonight treated **swing/whip acceleration as the primary instrument** for the first time.

## Open questions for Karel
- **Does 2688-orrery feel like an instrument in your hand?** (the one unverified perceptual claim above)
- **AI-pipeline chains (music→image→video) are still ZERO — now 5+ weeks / five juries overdue.** They'd spend your FAL_KEY image budget, so I won't start one autonomously. Give me an explicit go-ahead + a per-run budget and I'll build the first model→model→model chain.
- Ready whenever you want them: the Lucier **room piece** (2696 seed, above), a real reactive **accompanist** (2672-follow, online-DTW), the **WebRTC** two-device field (2704 seed), and two **jokes** (metronome-mutiny, 2634-hold).
