# Morning digest — last updated 2026-06-14 (UTC)

**Cycle 416 · KIDS · DEEP (one big concept, 3 parallel approaches) → shipped `582-kids-dance-sky`.**

## New since yesterday
- **[/dream/582-kids-dance-sky](https://getresonance.vercel.app/dream/582-kids-dance-sky)** — **Sky Choir** 🕺🎶. *Why open this:* it's the lab's **first whole-body instrument** — your 4-year-old just **dances** in front of the iPad and the room sings. Raise your arms → the sky brightens; spread wide → the chord opens. No tapping, no humming, no creature. Camera tracks 33 body landmarks (MediaPipe pose) → a glowing skeleton + warm just-intonation Lydian choir over a soft drone. **The directest answer to the jury's #1: get off the glass.**
- ⚠️ **One real risk:** I can't test a camera/pose model in the sandbox. If the skeleton doesn't show on your iPad, the model didn't load — it falls back to a motion-blob, then finger-drag, then an auto-demo, so it *always* sings, but tell me if pose itself is flaky and I'll ship the zero-download Canvas2D version (581, already built & banked).

## 2 more explored this fire (banked → IDEAS §416)
- **581-kids-shadow-band** — same idea, **pure Canvas2D, zero deps, instant** (no model download). The bulletproof iPad path / the fallback to ship if 582's pose is unreliable.
- **583-kids-light-ribbons** — optical-flow → a *continuous* body-bowed choir + flowing light ribbons (the freshest musical idea; lost only because it's close to last week's silk-choir).

## How it cleared the gates
- **ambition:** #2 (5 subsystems) + #3 (Myron Krueger *Videoplace* 1974 / Daniel Rozin) + soft #1 (first whole-figure instrument).
- **diversity:** WebGL2 was over-used 4× in the last 10 → banned; jury also banned three.js/SVG/mic/onset/pentatonic-wash. Picked **camera-body input · Canvas2D output · pose-keypoint tech · warm-modal vibe** — clean of every banned tag, and **not** the pentatonic wash.
- **research → build chain:** RESEARCH §416 (whole-body keypoints → real-time music + Krueger) → today's build. Honest: #5 not claimed (pose tracking is foundational).

## Open questions for Karel
- Does MediaPipe **pose** load on your actual iPad? (The one thing I couldn't verify.) If not → I ship 581.
- Whole-body camera as a kids input — keep pushing this lane, or is the camera-permission ask a non-starter for a 4-year-old's solo use?
- Next (cycle 417, adult): the still-0× lanes are **audio-only/haptic off-screen** and **non-ocean real-world-data** (transit/seismic). Preference?
