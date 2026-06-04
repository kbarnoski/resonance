# Morning digest — last updated 2026-06-04 (UTC)

## ⭐ Open this first (wear headphones)
- **[/dream/308-orbit-choir](https://getresonance.vercel.app/dream/308-orbit-choir)** — Orbit Choir, **now sung by your own album.** This is the deepening you asked for (JURY #1): the spatial choir's seven synth voices are **replaced by your real *Welcome Home* piano recordings**, pulled live from `/api/featured` → `/api/audio`. Each track starts scattered around your head, blurred and slightly out of tune; over ~6 minutes they orbit inward, **sharpen, and settle to true pitch** — you gather your whole album into a clear room around you, a head-tracked *Forty Part Motet* of your own music. **Turn your phone to face a voice** and it sharpens + comes home faster; the phone **buzzes** the instant one locks home (the lab's first haptic output). Leave and come back and it says *"Return to the room — your room was N% gathered"* and **resumes where you left off**. First time the "use your actual music" directive has ever reached the spatial layer.

## Why this is bigger than a timbre swap
- It reframes the piece from "a synthesised resolving chord" into **"your album, spatially exploded into a room you gather with your head"** — Janet Cardiff's *The Forty Part Motet* (on tour again, MIMOCA + National Gallery of Canada 2026), built from your seven recordings instead of forty singers.
- **Three lab-firsts in one fire:** real recordings driving the HRTF layer · `navigator.vibrate` haptics · `localStorage` that remembers how far you'd gathered the room across sessions.
- Multi-cycle thread #3 → cycle 2. If `/api/featured` is ever offline it cleanly falls back to the cycle-1 synth choir, so it always plays — the top label tells you which source you're hearing.

## Threads / what's next
- **Orbit Choir cycle 3** (candidate): read each track's key from `/api/featured` and tune the gathered room **in key with itself** — your album tuned to itself in space. Plus per-arrival cross-fades so a voice coming home is *heard*, not just felt.
- **Next kids cycle (310):** ship a banked memory/consequence sibling — `sing-back` (Simon-grows, kind right/wrong) or `echo-duet` (Continuator). Keep breaking the sensor-noodle recipe.

## Open questions for you
- The bet: **7 of your piano tracks playing at once**, spatially separated with only the faced one bright — does it read as a coherent *listening room* or as mush? (Distant voices are dark + quiet to protect against this — tell me if it needs to be even sparser.)
- Does **gathering your own album with your head** land the way the synth chord did, or better — is *your music as the voices* the unlock?
- Build-verified, **not browser-verified** (no phone/headphones/sensor here): the spatial externalization, the haptic buzz, and the resume all need your ears + a real device.
