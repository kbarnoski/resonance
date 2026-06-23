# Morning digest — last updated 2026-06-23 (cycle 521, adult · DEEP)

## New since yesterday
- **[/dream/864-marine-gamelan](/dream/864-marine-gamelan)** — **Marine Gamelan.** The real, live state of the world's oceans plays a bronze gamelan — and **rough seas audibly DETUNE the metal**. Pick a coast (Oahu · Bay of Biscay · Drake Passage · Maldives), and the live wave height drives one `roughness` value that at once strikes faster, drops the register, turns the resonators from *singing* to *clanging*, and detunes every bronze partial up to ±35¢ — a Drake Passage storm beats and shimmers out of tune, the Maldives stay sparse and sweet. **Why open it:** it's the **842-air-veil "data-with-consequence" register the jury called a standout**, now on the ocean — and you can **crossfade two seas at once** to hear a storm beating against a calm. A caustic water-light shader + the modal physical-modeling synth read the *same* sea signal, so what you see and hear never disagree. **No setup for your 06:30 glance** — if the live feed is blocked it falls back to a believable simulated sea and keeps sounding within a second.

## How this cycle was run
- **DEEP mode** — one concept (live ocean → detuned bronze gamelan), **two GPU rendering approaches** built in parallel; shipped the stronger, banked the other.
- **It resurrects a banked ⭐** — `860-marine-gamelan`, the top adult resurrect-first, parked last cycle only because the WebGPU build answered the jury's #1 first. This directly answers the jury's loudest standing adult ask — "**develop what you have, don't open a new tab**" (#5) — and "force a GPU surface, not Canvas2D" (#1 — it's WebGL2).
- Today's research anchored it in a real lineage: **Bob Sturm's *Music from the Ocean***, Plymouth's live wave-tank sonification, and WHOI/OOI ocean-data sonification — turning sea-state into sound is a 15-year artistic practice, not a gimmick.

## Banked sibling (see IDEAS §521) — built complete
- `865-tide-gamelan` ⭐ — the **same idea as a three.js 3D scene** you orbit: an undulating sum-of-sines ocean mesh under a floating field of glowing bronze gongs that bob, tilt, and bloom with the swell. De-selected only on runtime risk (CPU mesh displacement wants a perf trim) and an approximate gong↔strike mapping. **Top adult resurrect-first.**

## Research worth a look (RESEARCH §521)
- The ocean-sonification lineage (Sturm / Plymouth / WHOI-OOI) points at two next pieces: a **tidal long-form** (24h of one buoy compressed into minutes — fills the lab's thin long-form-generative menu) and a **multi-buoy "ocean choir"** where a dozen real coastlines each take a voice.

## Open questions for Karel
- 864 is **ear-unverified** here (no audio/GPU/network in the sandbox) — worth a listen on a real device to confirm the mix balance, decay tails, and the storm-vs-calm contrast feel right; the resonator Q range and bloom threshold are the most likely things to want a nudge.
- ⚠️ **WebGL2 is now 4× in the last 10 builds** — at the diversity audit-ban threshold. Next builds should rotate to **three.js / WebGPU**.
- Next kids cycle (522): resurrect `863-kids-solfege-choir` (the Kodály "ladder of light"), possibly re-skinned off raw-WebGL2 — or keep opening fresh kids surfaces?
