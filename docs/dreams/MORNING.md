# Morning digest — last updated 2026-06-05 (UTC), cycle 322

> **The kids lab can now be played by TWO children at once.** Your jury's #3 ask was "turn-taking / multi-user for two kids — *not* another it-grows-while-you're-away." So I built the lab's **first multi-user piece** (the only collaborative thing we had, `319-hub-score`, was adult). Multi-user was the single most-unserved axis in 300+ prototypes — now it's open for kids.

Open the lab: https://getresonance.vercel.app/dream

## ⭐ Open this first (kids — two friends build one song together)
- **[334-kids-pass-the-song](https://getresonance.vercel.app/dream/334-kids-pass-the-song)** — **two children, two tablets in the same room, pass a glowing creature back and forth and take turns adding notes to ONE shared song.** Hum or tap to give the creature a note, hit **✨ send to friend**, and it flies across to your buddy's screen; the song-ribbon grows identically on both and plays back. *Why open it:* you're alone on a phone at 6:30am, so a **robot friend** automatically takes the other side — tap Start and watch the whole pass-back-and-forth loop run by itself. Try opening it in **two browser tabs** to see the real two-kid version.

## Why this one won (DEEP — 1 concept, 3 interaction models, 1 shipped)
- **It's the literal answer to jury #3:** "319's BroadcastChannel idea, but for two children," off touch, with real turn-taking — not another localStorage toy.
- **Most verifiable + cleanest for a 4yo.** Discrete "your turn → give a note → send" reads instantly and the robot loop is fully self-running; no GPU/perceptual blind spot.
- **Honest scoping:** I grepped first and found real-world-weather (`293`) and camera (`295`) were *already* done for kids — so the genuinely new path was multi-user, and that's lab-first.

## Also explored this fire (built, banked in IDEAS.md)
- **335-kids-duet-bridge** — the bolder, stranger one: two kids each hold one end of a glowing rope across their screens and **tune to each other by ear** until it glows gold ("in tune!"). The biggest "huh" — it lost only because the gold-lock reward is perceptual and I couldn't ear-check it in the sandbox. **Flagged as the next kids build, paired with a real-device listen.**
- **336-kids-echo-relay** — sing a phrase, it flies to a friend's tablet, *their* creature echoes it back and adds — a kid-to-kid canon. Banked, but it rhymes with our many existing echo toys; resurrect only if differentiated.

## Threads / what's next
- **Adult (323):** ship **332-overtone-mirror** (your voice exploded into its harmonic series in space — with a real-headphones verify) or `333-antiphon`.
- **Kids (324):** ship **335-kids-duet-bridge** with a device check — keep deepening the new multi-user axis, don't fall back to single-child toys.
- **Verification debt:** `323` + `327` still never ran on a real GPU — worth one cycle on real hardware before the next big WebGPU build. (331 + 334 are pure Web Audio + SVG — no new debt.)

## Open questions for you
- **AI-pipeline-chain** (image gen *inside* an AV piece) remains your most-wanted, never-built direction — blocked on a paid FAL budget. One-word call: **grant a per-cycle budget and I build it next adult fire.**
- **334 is build-verified, not browser-verified** — the unknowns are the two-live-tablet sync and mic pitch on a real child's hum. The robot-friend demo exercises the full loop solo if you want to see it without a second device.
