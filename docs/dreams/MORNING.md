# Morning digest — last updated 2026-08-18 ~13:05Z (cycle 1179)

> **Jury verdict today**: Every ban held — no more fader banks, Canvas2D, MIDI, or warm — but the freedom went shallow: 5 of 15 are cool-on-black again and 7 are "a recording driving a simulation." Only two reached the top, **pulse** (your heartbeat) and **answerback** (a duet that answers you); extend those two, and give me anything that isn't a simulation on an SVG. See `docs/dreams/JURY.md`.

## New since yesterday
- **`15200-schlieren` → open this one.** *What if you could SEE your recording as the air it moves?* Schlieren is the real optical technique used to photograph shockwaves and **sound in air** — and this is the lab's first one. One of your takes plays; its low/mid/high energy stirs a simulated field of "air," and a knife-edge render turns the invisible density gradients into a luminous **monochrome shadowgraph**: plumes billowing on quiet passages, sharp ripples on loud onsets. Drag across the frame to **rotate the knife-edge** (a genuine schlieren control — reveals ripples along a different axis); press to disturb the air yourself. Grayscale on purpose — it's the rare palette your last jury called the *healthy* one, and it's a real break from the lab's cosmic-particle norm. Works on a laptop, no special hardware — but it wants your eyes to confirm the plumes read as *his music*.
- This was a **DEEP** cycle — one big lab-first idea ("see sound as disturbed air"), built two ways (knife-edge schlieren vs a star-field you look *through*), best one shipped.

## In progress / partial (built, vetted, banked — ready to ship a later cycle)
- **`15216-shadowgraph`** ⭐ — the cosmic-ambient sibling of today's winner: a dim **star-field you look through** that shimmers and **lenses** as your music disturbs the air (Background-Oriented Schlieren). The more immersive, more beautiful of the two — banked as the void-register ship; the natural next step is a 3D plume you can orbit.
- **`15136-stillroom`** ⭐ — *the recording that clears only when you go still.* Front-camera reads your stillness; hold still and a take lifts from haze to full presence. Still my top pick for the meditative lane.
- Earlier banks still ready: `15168-tideorgan` (live SF tide plays a take), `15120-echochamber` (stand inside a 3D echo hall), `15056-recurrence`, `14912-chordlattice`.

## Research worth a look
- **Sound as visible air.** The browser is now a real-time GPU field solver (this year's WebGPU showcase is all audio-reactive fluid/particle fields), but the lab had only ever rendered those fields *literally*. Schlieren/shadowgraph imaging (Toepler 1864; Settles 2001) is the one optics whose literal job is to photograph density gradients — i.e. sound in air. That's the whole idea behind today's piece: the physically-correct picture of what a piano does to a room, not a metaphor.

## Open questions for Karel
- **Sound-on / real-device review is still the #1 unblock.** `15200-schlieren` needs your eyes to confirm the plumes pulse *musically* to your playing; `15136-stillroom` wants a webcam. A few minutes validates several banked pieces at once.
- **AI music→image→video chain** (queued across many verdicts, never shipped): green-light a per-prototype FAL_KEY budget + guarded route, or say drop it permanently. It won't ship autonomously — your call.
