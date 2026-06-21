# Morning digest — last updated 2026-06-21 ~08:25 UTC (cycle 501 · ADULT · DEEP)

Adult **DEEP** fire — ONE concept, 3 competing resonator engines, shipped the most reference-faithful one. Deliberately renderer-spread: SVG, off the three.js streak you flagged last night.

## New since yesterday
- **🎻🎹 [/dream/808-sympathetic-strings](https://getresonance.vercel.app/dream/808-sympathetic-strings)** — *Sing or play into your mic and exactly the right strings ring back — your sound waking a bank of tuned strings that vibrate sympathetically, the way a grand piano hums when you hold the sustain pedal.* 48 strings, each a **real Karplus-Strong tuned delay line** in an AudioWorklet; the live FFT scales each string's excitation so the ones matching your pitch ring. Hold **Space** (sustain pedal) → feedback climbs to near-lossless and a shimmering bed **accretes** (fuller at minute 3 than second 10). Modes: Chromatic / Fifths / Overtone. **Why open it:** it's **piano-native + live-performance-fit** — point a mic at your real piano and the strings answer; it's the literal browser build of the EAE *Prismatic Wall* pedal; and it's on SVG, deliberately off the three.js run.
- **2 more explored this fire** (banked to IDEAS §501): **`809-sympathetic-modes`** (FFT-gated high-Q bandpass bank — lost for rhyming with 803's modal banks) + **`810-sympathetic-comb`** (native feedback-comb bank — most robust, least KS-faithful).

## In progress / partial
- None. One ambitious commit, two banked seeds.

## Research findings worth a look
- **RESEARCH §501:** the sympathetic-string bank is a live 2026 idea on two fronts — the boutique **EAE *Prismatic Wall*** pedal (tuned-delay-line KS, Jan-2026 reviews, 4 interval modes) and arXiv **Dialogue in Resonance** (May-2026, a piano that answers a live player). 808 is the first mic-excited sympathetic-string instrument in the lab.

## Open questions for Karel
- **Renderer spread worked:** after three.js 3× (799→803→805), 808 is back on SVG. The three engines were all SVG by design.
- **Not ear-verified** (no mic/audio in the sandbox). On real hardware: do sung/played pitches clearly wake their matching strings, and does the pedal-held bed accrete musically or muddy? Always-seeded strings + ghost exciter + a hard limiter guarantee a sounding glance even with no mic.
- **Orchestration note:** the killed builder sub-agents *recreated* their removed folders mid-build — I had to remove the losers twice. The worktree/self-continue behavior keeps biting; flagging again.
- Standing infra ask unchanged: the container's ~4096-fd ceiling blocks local static-gen (compile+lint+types verified green; Vercel deploys fine).
