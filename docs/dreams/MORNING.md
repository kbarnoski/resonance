# Morning digest — last updated 2026-06-17 (UTC) · cycle 458

> **Yesterday's jury** had one loud ask for the kids side: **MAKE A KID LAUGH.** The silly/funny pole is at **0×** — six straight kids builds went tension-and-resolution ("the new pentatonic"), uniformly solemn. Build **groove, play, humor — not a cadence.** This cycle does exactly that. See `docs/dreams/JURY.md`.

## New since yesterday
- **🎤🥁 [696-kids-mouth-band](https://getresonance.vercel.app/dream/696-kids-mouth-band)** — *"Mouth Band."* A 4-year-old makes silly **mouth noises** — *boom, tss, pop, brrr* — into the mic, and a goofy cartoon creature **catches each one, turns it into a drum, and loops it into a beat** they can bop to. Real-time **vocal-percussion classification** (an onset gate + a spectral-centroid bucket → 4 silly drum voices), looped on a 100 BPM groove; the creature mugs, bugs its eyes, and squashes on every hit. **Why open it:** it's the **groove + a laugh** you asked for — the child's own mouth is the instrument (no reading, no "wrong"), and it's the directest realization of this cycle's research (Incredibox + the beatbox-onset-classification literature). *Tap START and make a "boom" — then keep going and hear your beat build.*
- *2 more silly/off-glass groove explorers built this fire — banked, see IDEAS §458.*

## How this cycle ran (orchestration)
- **WIDE fire, 3 parallel builders, 3 unrelated funny/groove directions, all off-glass:** **696 mouth-band** (mic beatbox → looping groove — shipped) · **698 dance-mirror** ⭐ (dance at the webcam → a character **copies & exaggerates** you + **freeze-dance comedy**; camera analysis-only, never shown — banked) · **697 shake-circus** (shake the tablet → a **three.js jelly clown** squashes, boings, and pops confetti — banked).
- **Why 696 won:** the directest research chain (the beatbox-classifier recipe *is* its engine), the freshest *machine* (a mouth becomes a drum kit — a qualified lab-first), it serves the kids "use your voice" goal, and it's bulletproof for a glance (a ghost auto-beatboxes if there's no mic).

## In progress / partial
- None. Clean tree; one commit. Build verified (exit 0, ✓ compiled in 43s, 495/495 static pages).

## Research findings worth a look
- **RESEARCH §458** — **Incredibox** + the **vocal-percussion / beatbox onset-classification** literature (Hazan & Stowell 2010; the AVP dataset, 2019) give an ML-free recipe — an energy-onset gate + a spectral-centroid low/mid/high bucket → kick/snare/hat/raspberry — fast and forgiving enough for a 4-year-old's untrained mouth. That recipe is the literal classifier inside 696.

## Open questions for Karel
- **696 wants a real mic + speakers** (sandbox has none): does the 4-bucket classifier reliably tell a child's **"boom" from "brrr"** and **"pop" from "tss"**? I tuned it forgiving — every hit is *a* drum and the beat never stops, so a misfire still grooves — but real-device tuning may help. The ghost auto-beatbox covers the silent glance.
- **The kids comedy pole is now open (1×) but thin.** Two strong silly siblings are banked and ready: **`698-dance-mirror`** ⭐ (off-glass body/dance — directly revives the danceable register the jury said we built once at `652` and abandoned) and **`697-shake-circus`**. Want me to keep building the funny/groove side next kids cycle, or rotate?
- **Adult side next fire (459):** push **multi-user** further (banked `693` band-room), or return to the ceiling builds — the AI closed-loop **`687-latent-oracle`** (needs you awake + a `FAL_KEY`)?
