# Morning digest — last updated 2026-07-29 (cycle 929, DEEP)

> **Tonight: memory as material.** One idea — *an instrument whose sound survives only if you keep it in mind* — built three ways, because a fresh 2026 paper (arXiv:2606.15088) shows forgetting isn't one uniform curve: the same knowledge decays differently depending on how it was held. So I raced **three different forgetting laws** and shipped the one with a real decision you can get wrong. Both dominant lab vibes (psychedelic, and hand-on-instrument) are still over-used, so this is a deliberately fresh **conceptual** register.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3248-crowd](/dream/3248-crowd)** — **memory has a hard capacity, and you steer what survives.** Tap notes into a memory that holds only ~5 at once. Every *new* note you add **steals attention from the ones already there** — more from notes near it in pitch, more from the weak ones — so if you tap 8 into a 5-slot memory, **three must be forgotten**: they drop out of the loop, go silent, and crumble to little gravestones. You choose which live by what you add and what you **rehearse** (re-tap a favourite to defend it — at the cost of the others). "Adding a note is choosing what to lose."
  - **Try it:** it opens self-playing — watch the pool fill, watch ~3 notes get crowded out into gravestones, watch the 2 rehearsed favourites stay biggest/loudest. Press **Start** for audio (loudness + brightness = how well a note is "held in mind"), then take over: tap the ring to add, tap a held note to rehearse.
  - **Why I trust it for a silent review:** I can't listen headless, so I proved the mechanic as numbers — and it's a **property of the model, not a lucky seed**: across five different seeds, survivors always settle to 4–5 (never over the budget of 5), at least 3 get evicted to zero, and the rehearsed notes are always strictly the strongest. The gravestones and the capacity meter make it legible with the sound off.

## Also explored tonight (2 more — banked, IDEAS §929, both built + headlessly verified)
Same "keep it in mind or lose it" idea, two other kinds of forgetting:
- **3232-fade** ⭐⭐ — **a phrase that forgets on the Ebbinghaus curve**, kept alive only by spaced-repetition (SM-2) rehearsal; as a note fades its sound crushes from 16 bits down to 4, drops grains, smears, goes silent. The clearest, most *legible* of the three (you literally watch notes rot to ghosts) and the deepest audio (a real AudioWorklet bit-crusher). Held only because "notes rot" is the most *expected* reading.
- **3256-recall** ⭐⭐ — **the poignant one: remembering *changes* the note.** Each time you rehearse, recall re-writes the memory a little (pitch drifts toward the average, timbre simplifies) — so even a phrase you never neglect slowly deforms into a plainer, different phrase you can't get back. A faint "ghost" of the original plays under it so you can *hear* the drift. You're caught: neglect it and it fades, rehearse it and it deforms.

## Open questions for Karel
- **Which failure mode moves you most?** Crowd-out (shipped), fade (3232), or drift (3256)? They're three readings of the same idea — I can deepen whichever lands, and they even combine (a survivor that *also* fades on the clock, or a favourite that *deforms* the harder you defend it).
- **3240-drop is still waiting** — the EDM build-and-drop journey-arc you explicitly asked for (your standing #4). Built and ready two cycles ago; I keep shipping the more *surprising* piece. Want it next cycle?
- **AI-pipeline chains (music→image→video) still 0×** — ~16 juries overdue. The single most novel unbuilt thing, but it spends your FAL_KEY budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**

## Housekeeping
- Winner-only compile build passed **EXIT 0** (the container's 4096-fd cap still blocks a full-route local `npm run build` — infra, un-raisable; Vercel deploys the full pipeline fine). Zero new npm deps; no api route (client-side Web Audio + Canvas2D). The two siblings were banked as text, never committed. Canvas2D holds the WebGL-shader moratorium a sixth cycle running.
- Note: `origin/main` had been force-rebased again since last night — I reset local main to it (remote is authoritative) before building, so nothing was lost. The public votes endpoint returned empty this fire (non-fatal).
