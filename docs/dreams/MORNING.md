# Morning digest — last updated 2026-08-03 (cycle 1001, WIDE fire)

**Open first — on your phone:** [/dream/5816-astrolabe](https://getresonance.vercel.app/dream/5816-astrolabe) — then **tilt the phone**. You're standing inside a night sky where every star is a note (just-intoned, laid out as octave-rings). Tilting aims a beam across the sky; cross a star and it plucks a resonant string. **The tilt IS the instrument** — no keys, no buttons to play. On desktop it auto-plays a seeded melody and you can steer with the mouse/arrow-keys, but this one is built to be *played with your hands* on the phone you're reading this on.

## New since yesterday
- **`5816-astrolabe`** *(shipped — cycle 1001 WIDE winner)* — **play the sky by tilting your phone.** This finally cashes something the concept-jury has asked for repeatedly and I'd never delivered: a piece where a **real motion sensor is the PRIMARY instrument**, not a fallback. Device-orientation steers a beam across a sphere of 30 just-intoned stars; proximity plucks Karplus–Strong strings; a faint drone keeps the sky alive. It's the first bodily/spatial instrument the lab has shipped in ~15 cycles of screens-you-look-at — and the rare one you can actually *perform* during your morning review. Refs: the medieval **astrolabe** (you sight stars through a reticle) + the **theremin** / Waisvisz's *The Hands* (gesture = note).
- **2 more divergent directions explored & banked (IDEAS §1001):**
  - **`5832-harmonices`** ⭐⭐ — the **real positions of the planets right now**, computed from orbital mechanics (no network), tuned to **Kepler's literal 1619 interval ratios** and heard as a slow drone you stand under. Different every day. Best "music of the spheres" reference I've had — resurrect on a desktop/listen slot.
  - **`5848-augur`** ⭐⭐ — an instrument that **shows you a melody's future**: forecasts the likely next notes as branching ghost-paths ahead of the cursor, softly pre-sounds them, then collapses onto the note you choose (Huron's *Sweet Anticipation*).

## In progress / partial
- Nothing half-built. One clean WIDE commit; the two runners-up are banked as full briefs (built-clean, then removed), not code.

## Research findings worth a look
- **§1001:** the **NIME 2026** frontier (late June) is all about *the body and its intentions as the instrument* — orientation/IMU gesture, even *imagined* movement decoded to sound before it completes. That's orthogonal to everything the lab's shipped lately and it's exactly the "cash a real primary sensor" note. Tonight's winner is that idea, browser-feasible: tilt as the instrument.

## Open questions for Karel
- **Try `5816` on your phone and tell me if the tilt *feels* like an instrument** — the gains are tuned for a hand-held portrait phone, and "Recenter tilt" re-levels it. If it sings, I'd deepen it into chord-constellations (hold an aim → bow neighbouring stars into a just chord) and an absolute-compass mode (face north → find the tonic).
- **Which banked direction next?** The Kepler planetary drone (`5832`) or the anticipation tree (`5848`)?
- **Standing yes/no (flagged ~23 cycles):** the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget so I can build it, or strike it permanently?
