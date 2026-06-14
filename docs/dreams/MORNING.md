# Morning digest — last updated 2026-06-14 (UTC) · cycle 422

> **Jury verdict today**: The lab kicked its mic/three.js/pentatonic habits and surfaced two real gems — 583 reaching into your own piano, 594 a recording that crumbles as you hold it — but warmth itself has quietly become the new autopilot (9 of 15 cozy, 6 Canvas2D), so tomorrow we chase a register with edges. See `docs/dreams/JURY.md`.

## New since yesterday
- **[597-kids-water-bowls](https://getresonance.vercel.app/dream/597-kids-water-bowls)** — *Singing Water* (kids). Six glowing water bowls. **Tap** one and it rings like a glass bell; **rub** a finger round and round the rim and it **SINGS** — a breathy glass-armonica tone that gets louder and brighter the faster you rub, and fades softly when you stop. No reading, no menus, no wrong notes; each bowl is a bold color, and the fuller bowls sound lower (real physics, so it teaches itself). **Why open this:** it's the lab's **first friction-excited resonator** — a genuinely new synthesis primitive for us (rub *speed* drives the sound in real time), and the directest answer to the jury's "tension you feel, not solve." Best on an iPad with two hands. (Silent? After ~2.5s a ghost finger demos a bowl singing.)

## How this cycle ran
- Kids **DEEP** fire: one instrument — *play a row of singing water bowls* — built in parallel via **3 different synthesis cores**; shipped the most robust + truest. **2 more explored — see IDEAS §422:**
  - `599` — the same bowls modelled as a real **bowed-string AudioWorklet** (most physically authentic stick-slip; banked as our first audio-worklet physical model).
  - `598` — a **modal additive** version (arguably the truest glass *timbre*, a real inharmonic mode bank).
- Resurrects the seed `592` you flagged as the strongest unshipped kids idea. Not a growing-creature (the jury asked us to freeze that), and tuned in just-intonation, not the usual pentatonic wash.

## Research findings worth a look
- RESEARCH §422 — friction/modal physical-modelling synthesis (glass armonica, jal tarang, differentiable modal resonators). Honest note: no fresh <30-day paper bind — the technique is foundational — but the *primitive* (a real-time, drag-speed-driven friction resonator) is **grep-verified 0× across our 594 prior prototypes**. That's the genuinely new thing 597 ships.

## Open questions for Karel
- Does the **rub actually sing** the way you'd want for a 4-year-old? It's build-verified but not ear-checked here — the friction balance is reasoned, not heard. Worth a real-iPad listen.
- Is tap-vs-rub the right two-gesture vocabulary for that age, or should rub be the *only* thing (simpler, but loses the bell)?
- Adult side next (cycle 423): I'm leaning the **off-the-glass** seed `589-still-bloom` (hold the phone still → a drone blooms) — the embodied/spatial swing the jury keeps asking for. Say the word if you'd rather I chase something else.
