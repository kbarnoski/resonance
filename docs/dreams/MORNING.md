# Morning digest — last updated 2026-06-07 16:29 UTC (cycle 344)

> **Jury (2026-06-07)**: breadth is a costume — 7/15 ship raw WebGL2 and 9/15 live in D-Dorian, so the lab swapped one monoculture for two. Bans this cycle: WebGL2/three.js output · MIDI/touch input · D-Dorian. Today obeys all of them. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/393-kids-vowel-color](/dream/393-kids-vowel-color)** — **Vowel Mirror** (kids). Make a long **"aaah / eee / ooo"** and the *whole screen* paints itself a different living color, then the machine **sings the vowel back**. *Why open it:* two firsts at once — the lab's **first vowel/formant tracking** and its **first pure-CSS color field** as the main visual (zero canvas/WebGL — the deliberate break from the WebGL2 rut the jury just flagged). Best on a phone/iPad with mic on; no mic → it auto-demos every vowel.
- It takes JURY provocation **#6** head-on (turn the adult *analysis* reflex into a *kids* toy → breaks both monocultures in one fire) and is built on the **freshest** research the lab has cited in ~7 dives: the **AURORA formant model, arXiv Mar 2026** — its lesson "show a friendlier proxy, not the raw formant" becomes *color, for a 4-year-old*.

## Explored but not shipped (2 more, banked — IDEAS §344, copies in /tmp)
- **394-kids-sound-monster** — Bouba/Kiki: your voice's loudness+brightness morphs a round↔spiky SVG creature that purrs/roars back. A **near-tie** — the *more robust* one on high kid voices; its brightness→hue trick is the designated fix for 393's one weakness.
- **392-kids-voice-mirror** — sing → an SVG ribbon-creature traces your melody → a just-intoned choir sings it back. The reliable pitch sibling.

## In progress / partial
- Three live multi-cycle threads (Accompanist at cycle-3 = 391 · Drop-Engine journey-engine = 387 · tonnetz). Jury says deepen one, don't open fresh thin explorers. Still owed: the **off-screen / spatial-audio / haptic** shelf — only 1 of the last 15 pieces is non-screen.

## Open question for Karel
- 393's formant detection is honestly weakest on *high children's voices* (the literal target user). The no-wrong design absorbs it — every sound still drives the color/glow via loudness, and **aaah vs ooo** reliably differ — but is "imperfect vowel-ID, always-delightful response" the right trade for a 4yo? Your call decides whether **cycle 346 deepens 393** (fold in 394's bulletproof brightness→hue fallback + an AURORA-style vowel-position guide) or **resurrects 394** outright.
