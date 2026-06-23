# Morning digest — last updated 2026-06-23 (cycle 524, kids · WIDE)

## New since yesterday
- **[/dream/868-kids-monster-keys](/dream/868-kids-monster-keys)** — **Monster Keys.** A row of big glowing creature-keys — **all 12 notes, every one plays, no "wrong" note ever.** Tap to stack a little chord; if you land on a *clash*, that creature turns into a friendly wobbly **monster** (it shivers and beats — never louder or scarier), and the note that would *fix* it gently glows and pulses, inviting you to add it. Tap that note and the monster settles into a happy round creature with a soft bloom. **Why open it:** this is the **"let a kid be WRONG" piece the jury asked for three nights running** — real harmonic tension *and* resolution, a genuine decision with a consequence, instead of the always-consonant "everything sounds nice no matter what" toys. Built on a real developmental finding (a 4-year-old only *hears* dissonance when the contrast is big — so the wobble is big and unmistakable). **For your 06:30 glance:** untouched, it auto-plays the whole story — spawn a monster, then calm it — within a second, no taps, no hardware. Plug in a MIDI keyboard and it plays that too.

## How this cycle was run
- **KIDS night, WIDE mode** — 3 orthogonal kids explorers built in parallel, each on a *different* GPU surface (Canvas2D stays jury-banned), each a different input/idea. Shipped the strongest, banked the other two.
- Picked the freedom-to-be-wrong build over two strong siblings mostly on **two open jury asks at once**: it's the directest answer to "give a kid a real harmonic decision" **and** raw-WebGL2 is the scarcest renderer, so shipping it kept us off a WebGPU monoculture (we'd done 3 WebGPU nights running).
- Today's research tuned it: a 2024 developmental study (4yos perceive consonance preference only with a *large* dissonant contrast) → the monster's wobble is deliberately big, not subtle.

## Banked explorers (see IDEAS §524) — both built complete + verified clean
- `867-kids-shadow-zoo` ⭐ — move your **whole body** in front of the camera and a **zoo of glowing creatures** blooms and sings (no landmarks, no pose to hit — a flailing toddler is the ideal user). Myron Krueger *Videoplace*. **Top kids resurrect-first** (aligns with your camera/body loves 104, 234) — de-selected only because three.js is at its over-use cap.
- `870-kids-ripple-pond` — tap a calm bedtime **pond**; real GPU water-ripples spread, bounce off the edges, and each reflection rings a soft chime. De-selected only because we *just* shipped a calm bedtime piece (866) and it'd be our 4th WebGPU night in a row.

## Open questions for Karel
- 868 is **device-unverified** here (no GPU/audio/MIDI in the sandbox) — worth a tap on an iPad to confirm a real 4yo reads "calm the wobbly monster," and that the monster's beating feels *friendly-wobbly*, not annoying.
- Two strong banked kids builds to pick from next: the **whole-body camera zoo** (`867`, matches your loves) and the **bedtime ripple pond** (`870`). Want either shipped, or keep widening?
- Cycle 525 is an **adult** night.
