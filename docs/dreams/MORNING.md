# Morning digest — last updated 2026-07-25 (cycle 896, WIDE)

## New since yesterday
- **[/dream/2590-tremor](https://getresonance.vercel.app/dream/2590-tremor)** — **play a voice with your hands.** Point your webcam at yourself and *move* — your hands become a vocal tract: raise them and the pitch climbs, open them and a closed "oo" blooms into an open "ah," move fast and wide and the voice genuinely **roughens and growls**. It's the deliberate inversion of 2026's hot research (SIGGRAPH '26 avatars that are *puppeted by* audio) — here the arrow runs the other way: **sound comes FROM motion.** No scale, no safety net — the pitch is continuous, so it can sound beautiful or dangerous depending on how you move. Payoff visual: a glowing **WebGL2** trail that follows your gesture and reddens as the voice gets rough. *Why open it:* it's the lab's first instrument you play with your **body**, not the keyboard — grant camera access and conduct yourself.
- **Auto-plays on load** — a seeded gesture (rise → open → accelerate → still) drives the field + voice with zero interaction; camera and sound unlock on first click. Falls back gracefully: no MediaPipe → optical-flow; no camera → the demo; no WebGL2 → an SVG throat.

## Also explored this cycle (banked — see IDEAS §896)
A **WIDE** cycle: three prototypes across three *unrelated input sources* — **voice / body / world** — to break a rut I noticed. My last **six** ships were all played with the computer keyboard; this cycle deliberately dragged the two starved inputs (camera, mic) back.
- ⭐⭐ **2586-prosody** (MIC) — keep only the *melody* of how you speak and throw the words away; it draws the tune you were unconsciously singing while you talked ("WORDS·DISCARDED / PROSODY·KEPT"). The most *you*-facing idea in the queue — but I've now built it twice and held it twice because it needs your mic + ears to judge. **I'm flagging it to just ship next time, no more racing it.**
- ⭐ **2594-quake** (WORLD) — the planet's last 24h of live earthquakes (real USGS feed) turned into a room drone: deep quakes rumble, big ones growl. Real and clean; the "music about real-world data" lane just already has a few siblings.

## Research finding worth a look
- **2026 keeps binding the body and the voice to real-time AI** — SIGGRAPH '26 shipped avatars that generate full-body motion *from* streaming audio (EchoAvatar, DiscoForcing). Every system runs it audio→body: a puppet. 2590-tremor flips it — *you* are the source, the machine sings your motion. The inversion is the whole piece.

## Open questions for Karel
- 2590 needs your webcam + ears: does hand-motion read as a *playable voice* (vs noise), and is the roughness expressive or just harsh? The auto-demo + fallbacks are verified; the live camera→voice feel is a real-hardware call.
- Should I **force-ship 2586-prosody** next cycle (it's the most on-brand thing waiting), or keep breaking new input lanes (MIDI? phone-tilt?) first?
- The **AI-pipeline chain** (music→image→video) is still the top-requested unbuilt thing — it needs your **FAL_KEY-budget go-ahead** before I spend your image budget. Say the word.
