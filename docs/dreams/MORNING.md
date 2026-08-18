# Morning digest — last updated 2026-08-18 ~15:20Z (cycle 1180)

> **Yesterday's jury** (2026-08-18): the constraint is no longer breadth — it's the **ceiling**. Only two pieces reached 4/5 (**pulse**, **answerback**); a third top piece is worth more than a fourteenth honest 3/5. Bans this week: pointer-primary input, inline-SVG, "a recording driving a simulation," cool-cyan-on-black. Extend pulse or answerback; give me anything achromatic that isn't a sim on an SVG. See `docs/dreams/JURY.md`.

## New since yesterday
- **`15248-coherence` → open this one, with headphones and a quiet room.** *What if his recording only comes into full presence when you breathe with it?* This is the direct answer to your jury: it **extends `pulse`** (your heartbeat) with the second biosignal you asked for — **your breath**. A slow grayscale glow paces you at about six breaths a minute; as your breathing locks to that pace, a coherence meter climbs and Karel's take **lifts out of a muffled, far-away veil into close, full, present sound**, while a WebGL2 field of light **focuses from fog to a single bright still point**. No fader, no simulation — a *reward loop* on one real recording: breathe well, hear him clearly. It has a **Guided demo** toggle that plays the whole bloom with no microphone, so it demos on any device — but it wants your real breath + headphones to confirm the lock feels earned.
- This was a **DEEP** cycle — one big idea ("breathe his music out of a veil"), built two ways (WebGL2 "breath lens" vs a Canvas2D "aperture/tide to light"), best one shipped. Achromatic on purpose — the palette you keep calling the *healthy* one.

## In progress / partial (built, vetted, banked — ready to ship a later cycle)
- **`15264-tidebreath`** ⭐ — the sibling of today's winner and the more *legible* one: a grayscale **aperture that dilates on each inhale** (a clearer breathing guide than the winner's field), his take **"approaching from far"** across a horizon as coherence rises. Bank it, or graft its explicit breathing-ring onto `coherence`.
- **`15216-shadowgraph`** ⭐ — a dim **star-field you look through** that lenses as your music disturbs the air (the cosmic-ambient sibling of `15200-schlieren`).
- **`15136-stillroom`** ⭐ — *the recording that clears only when you go still* (front-camera). Still the top meditative-lane pick.
- Earlier banks ready: `15168-tideorgan`, `15120-echochamber`, `14912-chordlattice`.

## Research worth a look
- **Coherence, not just reaction.** `pulse` *reacted* to your body; this reads the HRV **resonance-frequency breathing** literature (fixed 0.1 Hz pace works as well as an individually-tuned one — Scientific Reports 2026 RCT) and builds the lab's first **reward loop**: the piece asks you to *entrain*, and pays clarity for coherence. The obvious next step closes the loop back to pulse — a **breath + heartbeat (RSA) coherence** piece: does your camera-PPG heart rate rise on the inhale? That's the lab's first true two-biosignal interoceptive piece.

## Open questions for Karel
- **Sound-on / real-device review is still the #1 unblock.** `15248-coherence` wants a mic + headphones to confirm the coherence lock feels earned; a few minutes also validates `15136-stillroom` (webcam) and the schlieren pieces.
- **AI music→image→video chain** (queued across many verdicts, never shipped): green-light a per-prototype FAL_KEY budget + guarded route, or say drop it permanently. It won't ship autonomously — your call.
