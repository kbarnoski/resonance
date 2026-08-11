# Morning digest — last updated 2026-08-11 ~05:00 UTC

**Open this first:** [/dream/9864-handroom](https://getresonance.vercel.app/dream/9864-handroom) — **conduct a room with your bare hands.** You stand still at the center; six just-intonation voices float in a sphere around your head. Reach a hand toward one, *grab* it, and move it — pull it close and it swells, lift it and it brightens — so you **sculpt a spatial chord** instead of walking through one. On a muted phone a seeded "ghost hand" is already conducting the room for you (voices orbiting, glyphs breathing). Press **Begin** for sound; grant the camera to conduct it with your own hands + headphones.

## New since yesterday
- **9864-handroom — "Handroom"** (cycle 1091 **DEEP** winner). This **finally ships the embodied-room lane** — the last of the jury's three named "0× lanes" (multi-user ✓ 1086, MIDI-out ✓ 1089, embodied-room now ✓). The twist that won it: instead of *walking* a room, the listener stays fixed and **the sound moves** — you grab and place the HRTF voices with your hands (MediaPipe hand-tracking, degrading cleanly to frame-diff → pointer → the seeded auto-conductor).
  - *Why this verb, not the walk-through room:* I raced three approaches to the same idea (**walk it / conduct it / pose it**). Handroom won because a hand-sculpted sound-sculpture has **no precedent in the lab**, whereas the walk-through version renders a perspective room + wall acoustics — squarely inside the lab's most-mined spatial cluster (narthex / reflections / wavehall / nearfield). The jury's whole 2026-08-10 verdict was "break the monoculture," so I shipped the freshest verb.
  - *Try it for real:* on your phone the auto-conductor reads even muted; on a laptop, hit **Start camera** + headphones and reach for a voice — near/far = louder/softer, high/low = brighter/darker.

## Also explored this fire (banked, not shipped — IDEAS §1091)
- **9848-shadowroom** ⭐⭐⭐ (**walk it**) — the faithful version of yesterday's resurrect-first seed: a webcam silhouette walks your head through a one-point-perspective JI room, *plus* a real **image-source early-reflection** layer so the walls throw the sound back as you move. Strongest **installation / Tauri** fit and the most robust camera path (no CDN). Banked only because its room-acoustics look rhymes with the lab's existing spatial pieces.
- **9880-poseroom** ⭐⭐⭐ (**pose it**) — the most fully embodied: full-body skeleton tracking, your head walks the listener and your **arm span opens/closes the chord** (wide arms = bright & full, arms in = dark cluster). Wants room to step back from the camera.

## Research worth a look (RESEARCH §1091)
- **In-browser body-tracking and HRTF spatial audio are both mature in 2026 — but nobody *fuses* them.** MediaPipe Pose/Hands gives 33 landmarks at <50 ms on-device; Web Audio HRTF is the standard binaural spine — yet every 2026 example keeps them apart (tracking drives a flat 2D instrument, or the webcam only personalizes *passive* playback). **A tracked body driving a *playable* HRTF room is grep-0.** Handroom is that fusion.

## Note
- With this fire, **all five of the 2026-08-10 jury's provocations are now cashed** (palette-break 1088 · multi-user 1086 · MIDI-out 1089 · conceptual 1090 · embodied-room 1091). A **fresh jury pass** would be well-timed whenever you want to reset the direction.

## Open question for you (standing, ~53 cycles)
- The **AI-pipeline chain** (music → image → video) is still the biggest untouched category, but it needs a `FAL_KEY` spend I won't authorize on your paid budget unilaterally. **Yes/no + a per-run budget?**
