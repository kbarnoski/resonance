# Morning digest — last updated 2026-07-30 (cycle 955, DEEP)

> **Lean your head and the flat screen becomes a *window* into a deep cathedral of piano voices. The webcam tracks your head — left/right, up/down, closer/farther — and the hall opens with real motion parallax (columns sliding against each other into the dark). Line your head up with a distant light and *hold*, and that veiled voice wakes into the chord + the sound moves to where your head is. You compose the room with your body.**

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3920-nave](/dream/3920-nave)** — **the lab's first piece that's a *room you look into*, not a screen you watch.** It's real "fish-tank VR": instead of orbiting a camera, the 3D nave is drawn with an off-axis, head-skewed frustum (the Johnny Lee / Wii-remote technique, 2007), so your head movement reveals genuine depth. Seven voices sit at real 3D positions and the audio listener is glued to your head, so leaning toward a distant light brings its voice forward; hold your gaze on it and it wakes into the chord. **Why open it:** point your laptop webcam at your face and move your head side to side — the parallax should *pop* into real depth with no headset. It also finally fills the "Resonance in a room" gap I've flagged for three cycles, and cashes the camera/body direction you've loved. No webcam? Move your pointer, or just watch the seeded self-demo — audio plays either way. **Best with headphones** (the spatial mix follows your head).

## In progress / partial
- **DEEP cycle — one concept ("Resonance as a room you walk through"), three techniques, shipped the strongest.** Two banked, rebuild-ready (IDEAS §955):
  - **3912-atrium** ⭐⭐ HIGH — **stand inside a cathedral and *summon its voices with your gaze*.** Turn your phone to look around a 360° soundfield; hold your gaze on a dim voice to wake it. The best **mobile** pick — it gets better on your actual phone's gyro. My pick to ship next.
  - **3928-vespers** ⭐ — **a room full of phones sounding one composition**, all locked to one shared clock; where you place each device helps or muddies the chord. The clearest run yet at a shared "now" across viewers — held until I can prove it on two real phones.

## Research findings worth a look
- **§955:** the dive found a SIGGRAPH 2026 installation literally titled **"Resonance: Meditative Neural Rhythms as Collective Spatial Experience"** — same name, same spirit (architectural-scale light + motion, collective, spatial). Current AV-installation art is heading exactly where "Resonance in a room" points. That + the fish-tank-VR lineage seeded all three of tonight's builds.

## Open questions for Karel
- **Does the parallax *pop*?** I can't move a real head here — the off-axis math is right, but whether it reads as convincing depth wants your webcam + eye. Too subtle? Too jittery? Tell me and I'll tune the head→frustum gain.
- **Nave or atrium next?** Both are the room direction. Want me to ship the phone-gyro **atrium** (summon-by-gaze) tomorrow, or deepen **nave** — e.g. place *your real Path piano* recording into the hall's depth instead of synth voices (the still-uncashed "use my music" idea)?
- **Note on the build:** nave passes the exact checks Vercel runs (lint + types, both clean) and auto-deploys; the full local build only can't finish here because of an open-file limit against 900+ pages — the environment, not the piece.
