# Morning digest — last updated 2026-06-25 ~10:2x UTC (cycle 548, kids · DEEP)

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[935-kids-shake-critters](https://getresonance.vercel.app/dream/935-kids-shake-critters)** 🫨🟡🔵🟣🟢 — *Shake the iPad like a rattle and a little band of glowing jelly-creatures wakes up.* The harder a 4-year-old shakes, the **denser and brighter** the rattle gets (never louder — kids-safe). Pause, and **the rhythm you just shook is caught into a loop the critters keep grooving** — a warm stomp-and-shaker groove builds up as you play.
  - The rattle is a real **PhISEM stochastic-shaker synth** (Perry Cook, 1997) — there are **no chimes, no notes to get "right," no wrong moves**: you sculpt *texture and groove*, not a tune. The deliberate opposite of a calm pentatonic lullaby (the directest answer to the jury's "make music from rhythm/timbre, not pitch theory").
  - No shake sensor (laptop)? **Drag a finger or mouse anywhere** — it plays fully. Leave it alone → it gently auto-plays so it's never silent or still. Visuals are **three.js on the GPU** (the scarcer GPU surface after the last two builds both used raw WebGL2).

## In progress / partial
- Nothing mid-thread. Cycle 549 (adult) resurrect-first: **933-tilt-orrery** (lush three.js galaxy) → **929-cathedral-rhythm**. Cycle 550 (kids) resurrect-first: **936-kids-rattle-bloom** (below) → **930-kids-tilt-tide**.

## Research findings worth a look
- **RESEARCH §548** — **PhISEM** (Cook 1997), the foundational real-time *shaker* model: shaking a handful of virtual beans makes sound as pure **texture + rhythm**, no pitch at all. Every modern 2026 granular/particle synth descends from it. The cleanest "music from not-pitch" idea for a 4yo who already loves shaking things. In-README dated-citation streak now **14 cycles**.

## Also explored (DEEP — 1 concept × 2 GPU approaches, shipped 1)
- **936-kids-rattle-bloom** — the same shake→rattle→groove as a **raw-WebGL2 metaball shader**: gooey candy-bright blobs that wobble and *merge* with shake energy. Build-green, banked in IDEAS §548. De-selected because abstract blobs read less like "a band of creatures" than 935's actual characters — but the gooey-merge look could be a striking alternate skin for 935.

## Open questions for Karel
- For kids, do **identifiable character critters** (935) land better than abstract gooey blobs (936)? That was the deciding call this cycle — worth your gut check on a real iPad.
- Only compile+lint+type are verified here (container has no shake sensor / GPU / audio; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). The PhISEM grain balance + the "the critters kept my rhythm" groove-loop feel may want a real-device tuning pass.
