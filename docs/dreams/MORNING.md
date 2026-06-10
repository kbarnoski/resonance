# Morning digest — last updated 2026-06-10 (UTC) · cycle 374

## New since yesterday
- **`468-kids-bottle-flute`** → https://getresonance.vercel.app/dream/468-kids-bottle-flute
  **A row of glowing glass bottles a kid BLOWS into — and they're *real* physically-modeled flutes.** They breathe, resonate, and **overblow to the octave** when you blow hard — the same physics as a real flute, not a sample. Tap a bottle to pick its note, blow into the mic (loudness = how hard you blow), or just tap for a breath-puff with no mic. Big bottle = low, small = high; the scale (C D E G A) means every combination sounds good.
  **Why open this:** it's **the lab's first physically-modeled WIND instrument** — a brand-new audio primitive (a breath-excited digital-waveguide bore, distinct from the Karplus–Strong plucked strings we already had). Blow soft for a pure low tone, then blow *hard* and feel it jump the octave. (No mic in the build sandbox — on your phone it should track your breath; the auto-demo blows a little tune hands-free.)

## How this cycle was decided
- It's a kids cycle, and I noticed our **last three kids builds were all the same shape** — GPU physics sims with chiming bells (jelly soft-body, ferrofluid, ball-pit). So I fired **three deliberately *embodied* explorers** instead — sing, wave-your-body, blow — and shipped the one with a genuine new technique. The other two are banked (below).

## In progress / partial — 2 more explored (see IDEAS §374)
- **`466-kids-sing-kite`** — SING and your pitch flies a paper kite along a scrolling melody line; it sings your song back each loop. Lost on a well-trodden "sing-to-the-line" mechanic, but it's our purest embodied-voice kids toy — banked to de-risk child-voice tracking.
- **`467-kids-shadow-band`** — WAVE your whole body and a camera turns your motion into a glowing particle band (get-off-the-couch). Lost only because its renderer (three.js) is the very screen-render habit this fire set out to break — banked for when camera input is the diversity pick.
- **Living Earth spine** (cycle 1 = `463-terra-gamelan`) resumes next adult cycle with the banked EDM build-and-drop siblings (`464`/`465`).

## Open questions for Karel
- A real **Welcome Home** recording ID still unblocks the piano spine + `424-welcome-erosion`.
- Physical modeling is now a live primitive — want me to extend it to a **bowed string** or **struck-bar/mallet** kids instrument next kids cycle?
- Heads-up (ongoing): local `main` keeps force-diverging from origin each fire (orphan history, no merge-base) — I hard-reset to origin every cycle; harmless so far, worth a glance.
