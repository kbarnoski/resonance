# Morning digest — last updated 2026-06-04 (cycle 307) UTC

> **Jury verdict today**: Strong at the edges — `308-orbit-choir` finally breaks the screen and the multi-cycle threads are holding — but the kids lane has shipped the same no-fail modal noodle through five different sensors; tomorrow, deepen the spatial piece with your real piano, don't build a sixth shaker. See `docs/dreams/JURY.md`.

**Cycle 307 · adult · DEEP (2 approaches) → ships `308-orbit-choir`.** I pivoted off the Mirror-Canon polish and finally shipped the spatial-audio breadth the Concept Jury has been asking for three provocations running: **the lab's first non-screen, audio-FIRST piece.** Best opened **on your phone, with headphones.**

## New since yesterday
- **▶ [/dream/308-orbit-choir](https://getresonance.vercel.app/dream/308-orbit-choir)** — **A choir scattered around your head that gathers itself home over 6 minutes.** Headphones on, tap *Begin the orbit*. Seven sustained voices start scattered and detuned all around you; over ~6 minutes they **orbit inward and resolve into a warm A-minor chord** — the room is genuinely different at minute 6 than minute 0. **Turn your phone (or your head)** and the voice you face swells *and* resolves a little faster — you shepherd them home. The screen is almost black on purpose; the piece is in your ears.
  - **Why this is a real first:** in 300+ prototypes the lab had **never shipped a spatial-audio piece** (3 were banked, 0 shipped) and **never** built one whose *output isn't a screen visualizer*. This is both.
  - **The science behind the gesture:** browser HRTF (3D audio) is famously front/back-ambiguous — but **head movement is the known fix** (arXiv:2510.09161). Turning isn't a gimmick; it's literally what makes the 3D sound legible.

## Also explored this fire (build-verified, banked)
- **`307-still-room`** — the calmer sibling: 7 voices at *fixed* bearings, no clock, no arc — pure *Deep Listening* (Pauline Oliveros). Lost curation to the bigger 308 but built clean; re-banked as a ready companion to ship next.

## Heads-up / honest caveats
- **The whole bet rides on one thing I can't test here:** whether generic Web-Audio HRTF actually *externalizes* (sounds outside your head) on your real phone + headphones. **Please try it with headphones and tell me if it feels 3D or flat.**
- Does the 6-min arc read as an *arrival*, or as a slow wash? That's the one judgment call I'd most want your ear on.

## Open questions for Karel
- **Deepen this into a thread?** Next adult cycle I'd love to swap the synth voices for your real *Welcome Home* piano stems (your music, spatialized around you), add a haptic buzz when a voice resolves, and persist where you left the room. Worth a multi-cycle commitment, or one-and-done?
- Clean sync again this fire — no force-push drift, AGENT.md current. Second clean fire running.
