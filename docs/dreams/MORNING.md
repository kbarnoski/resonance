# Morning digest — last updated 2026-07-26 (cycle 912, WIDE)

> **Jury verdict today**: The lab did exactly what you asked — dropped the keyboard, killed the AI bandmate, built the multi-user and memory pieces — and then walked into a science-fair rut: 7 of 15 now sonify a textbook system and play themselves while you watch; the two real peaks (`2672-somnus`'s dreaming memory, `2912-ensemble`'s serverless duet) are humans and memory, not simulations — so tomorrow, put a hand back on the instrument and stop sonifying the textbook. See `docs/dreams/JURY.md`.

## New since yesterday
- **`2912-ensemble`** → https://getresonance.vercel.app/dream/2912-ensemble — **the lab's first-ever multi-user piece.** Two people, two devices, ONE shared rack of plucked strings, no server. Open it: a **ghost partner duets with you immediately** (so it's alive solo). The real trick — this cycle's fresh research — is *control events, not audio*: nothing streams over the wire, only "pluck at x" events, and each browser re-synthesizes the sound locally. To hear the network for real: click **Local duet** and open a second tab; or use the copy-invite / paste-answer panel across two devices. This is the biggest untouched category the jury has named 5+ weeks running (multi-user, jury #4).
- Went **WIDE** (3 divergent real-sensor explorers: network / mic / MIDI) to deliberately break the recent input-free + physics-sonification + iridescent-material rut. Shipped the strongest; **2 more explored — see IDEAS §912.**

## Banked from tonight (both built demoable, then held)
- **`2920-follow`** ⭐⭐ — **a reactive accompanist that follows YOU, not a click track.** Sing a melody it knows; online-DTW tracks your tempo and hesitations and plays chords/bass/arp locked to *your* position (waits when you pause, catches up when you leap). The most **product-relevant** banked piece — a pianist's real accompanist. Ship next mic/live-performance cycle.
- **`2928-seaboard`** ⭐ — **the lab's first MPE / per-note-expression instrument.** Every held note bends, swells and changes timbre independently; a ROLI-Seaboard-style touch surface means you can play it with no MIDI hardware. Ship next MIDI/expressive cycle.

## Research findings worth a look (RESEARCH §912)
- The real trick of low-latency browser jamming isn't the network — it's **not sending audio**: broadcast control events, synthesize locally ("synchronized local engine"; sub-50ms; self-demoable on one machine via a BroadcastChannel loopback). That's what finally made a multi-user piece both buildable *and* reviewable solo.
- Online score-following shipped as a real library this year (**Matchmaker**, arXiv:2510.10087) — an ML-free online-DTW aligner is browser-feasible, which is what `2920-follow` is.

## Open questions for Karel
- **AI-pipeline chains (music→image→video) are still 0×** — now ~8 juries overdue. It spends your FAL_KEY budget, so it needs your **explicit go-ahead + a per-run budget** before the agent can build it. One word and it's next.
- **`2912-ensemble`'s real cross-device tier is unverified from here** (headless — no second device). The ghost + two-tab loopback are demoable; the manual-SDP WebRTC path wants you to try it phone↔laptop and tell me if pairing feels right.
- Want the accompanist (`2920-follow`) fast-tracked? It's the closest thing tonight to an actual Resonance feature.
