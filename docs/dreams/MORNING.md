# Morning digest — last updated 2026-06-02 (cycle 278, kids · DEEP orchestration)

## New since yesterday
- **[258-kids-mirror-pets](https://getresonance.vercel.app/dream/258-kids-mirror-pets)** — **a 4-year-old plays music with their FACE.** Make faces at the camera and your reflection appears as a swarm of soft glowing "pets" that light up to form your portrait — a singing **Daniel-Rozin-style mosaic mirror**. The awake pets ring a pentatonic music box: **open your mouth** → louder/faster + more notes, **smile** → everyone turns warm gold and grows little smiles, **tilt your head** → the swarm leans and the sound pans. **Why open this:** it's the **first face-tracking piece in the lab** (we had hands at `234` ❤️, never face), and it's the kids zone escaping flat glass for the third time (hands → tilt → face). No reading, no fail states, never silent. **No camera? It self-plays + you can tap to wake the pets.**
- This was a **DEEP 2-builder face-music fire**: a Rozin swarm-mosaic (shipped) vs. a single glowing creature that mirrors your expressions. The mosaic won on surprise + the Rozin reference; **the single-creature take (`257-kids-face-band`) is banked build-verified** — it's the *more legible* "open mouth → creature sings" toy, a one-cycle ship whenever you want both.

## In progress / partial
- **The "AI band" trio is 2 of 3:** melody (`251-trader` ❤️) + harmony (`256-harmonist`). The **third — Groover** (drums/tempo, build-verified ~728 lines) is queued for cycle 279 to complete the reactive ensemble you play with.
- **Banked & build-verified, waiting:** `257-kids-face-band` (single-creature face toy, above) and the older kids siblings `254-kids-blow-bloom` (first breath input) + `255-kids-sing-garden` (sing → bedtime sky).

## Research findings worth a look
- **MediaPipe FaceLandmarker = 52 free expression signals** (jawOpen, smile, brow, blink as clean 0–1 streams, no calibration). designerzen's **InterFACE** proved "your face is the instrument" is musical; nobody had aimed it at a kid who can't read or reach a keyboard. Full note: RESEARCH.md §278. Obvious adult sibling: blendshapes → expressive synth (vibrato from brow micro-movement).

## Open questions for Karel
- **Housekeeping I noticed:** cycles 269–277 shipped code + this digest but **skipped the STATE.md / INDEX.md log** (their reasoning is in commit messages + JURY.md). I restored both this cycle. No action needed — flagging so the gap isn't a surprise.
- **Output mix:** still steering off the three.js glut (6 of last 10) — 258 is Canvas2D. And after 5 mic-input pieces in a row I deliberately picked a non-mic input (face). Flag if you'd rather I lean a direction.
- **Cycle 279:** finish the AI-band trio (ship Groover), or build an **adult** face-instrument, or a 2nd real-world-data sonification (`weather-score`/`transit-pulse`)? Default: Groover.
