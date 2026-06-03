# Morning digest — last updated 2026-06-03 ~12:20 UTC (cycle 295)

> **Jury verdict today**: The floor is being cleared but gamed — same "poke-a-thing-that-sings" form, touch input at 5×, zero multi-cycle builds, and three spatial pieces banked-but-never-shipped; today, ship the breadth you've already paid for instead of citing new breadth. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/287-mirror-choir](https://getresonance.vercel.app/dream/287-mirror-choir)** — open this first. **Your whole body becomes a choir.** The lab's *first* body-tracking piece: the camera tracks your 33 body landmarks, your hands become two sung voices (pitch = how high you raise them), arms-wide opens the vowel oo→ah, and you're drawn back as a matte **wooden mirror** (Daniel Rozin) — warm tiles, no glow. Two firsts in one build: **MediaPipe pose ML** + **vocal-formant synthesis**. No camera / denied? It drops to a self-playing "ghost dancer" so it still demos on your phone with nothing allowed. *Why open it: the most "huh, I didn't know we could do that" build in weeks — your body, sung back at you.*

## How it was made (the orchestration)
- Ran **WIDE**: 3 parallel builder agents, 3 divergent adult concepts on 3 empty shelves, shipped the strongest. The other two are **build-verified and banked** in IDEAS.md:
  - **aurora-wire** — live NOAA space-weather (solar wind / Bz / Kp) → a cosmic drone + matte aurora. The lab's 2nd real-world-data source (after 279's earthquakes).
  - **still-room** — eyes-closed HRTF spatial audio you navigate by **tilting your phone**; the tone you face swells, the ones behind go quiet. First non-screen / tilt-controller piece. *(Strong, build-safe standalone — I'd ship this next.)*

## Research findings worth a look
- RESEARCH §295: MediaPipe Pose is now a real browser primitive (33 landmarks, CDN, no install) and head-tracked spatial audio went mainstream at CES 2026 — the phone's own tilt sensor can be the head-tracker, no VR hardware. Both shelves the lab had never touched; this fire opened the first and banked the second.

## Open questions for Karel
- **Doc-drift to know about**: a force-push **rewound STATE.md to cycle 290 and RESEARCH.md to §293**, even though folders/INDEX/git advanced through cycle 294 (folder 286). Prototypes 283–286 shipped fine and INDEX still describes them, but their STATE/RESEARCH write-ups were lost in the rewind. Nothing of yours is broken — flagging so the narrative gap isn't a surprise. (AGENT.md is back to the *current* version with the ambition + orchestration mandates.)
- 287 is **build-verified, not browser-verified** — if MediaPipe doesn't load live, the ghost-dancer fallback already covers it. Worth a 10-sec camera test on the deploy.
- Next (cycle 296) is a kids cycle — leaning toward a kids body-tracking "move-and-it-sings" toy now that 287 de-risked the MediaPipe path.
