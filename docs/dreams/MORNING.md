# Morning digest — last updated 2026-10-14T13:05Z

> **Jury verdict landed today** (`docs/dreams/JURY.md`): earwell was the note taken — but the same window shows a *new* rut: four of the last fifteen (cantor, resonhand, earwell, timesring) lift your harmony out with the identical bandpass-filterbank trick. The jury banned that engine for the next cycle and asked for a genuinely different sound-verb (granular, spectral, physical-model, waveshaping, pitch/time) + a many-to-many coupling. Noted for the next fire. (It landed *after* I'd already built + validated + committed mouthvalve this morning, so I rebased it in rather than redo a clean ship — and mouthvalve isn't that rut: it's a serial filter-valve, not a chord-tuned bandpass bank.)

> **`mouthvalve` shipped — conduct your piano with the SHAPE of your mouth.** The lab has done hands and faces to death but had *never* used the mouth as a control surface (I grepped — zero across all 1,237 pieces). So this fire: **open your mouth to let one of your recordings pour out bright and full; close it to hold the music in, dark and muffled; widen it for a brighter tone.** A glowing mouth with a luminous stream pouring out of it — the shape you make is exactly the sound you hear. Fully playable with no webcam (the pointer is the real control), so you can judge it the instant web returns.

## New since yesterday
- **`20640-mouthvalve` — sing the shape, not the note.** Your mouth's opening is a valve on your real take: aperture opens a filter + gain (closed = held-in, open = pours out), width tilts the timbre round↔bright. The same two measurements draw the mouth and the stream, so see == hear. Canvas2D, violet + bone, zero chrome in the way.
  - **Why open it:** it's a body signal the lab has literally never used, and it reads as a single striking image at a glance. Put on headphones, press Play, and mouth along (or just move your mouse — up/down opens, left/right brightens).
  - **status: demoable** — one honest caveat: the webcam mouth calibration is an untuned first guess (clamped + smoothed, but may need a sensitivity nudge against a real face). The *pointer* path is exact. Wants your ~30-sec mouth-and-listen check when web returns.

## Also explored (banked, not shipped)
- `handtab` — play a take like a **tablature of gestures**: open palm = swell, fist = hold, point = spotlight one chord tone, pinch = pluck — each shape drops a glyph on a scrolling staff. The direct build of today's find (*Handel*). Fully built, QA-clean; banked because the hand lane is saturated and it reads more like a tool than a single image. Seed in IDEAS §1298 — a strong near-future ship. (I'd add a gentle auto-release so a lone "clamp" doesn't leave it silent.)

## Research find worth a look
- **Handel** (contra.com, 2026-10-02, 12 days old) — a webcam toy mapping hand *shapes* to sound *events*. Confirmed "shape → sound" webcam instruments are a current pattern, and pointed me at the one axis you've never explored: the mouth. Today's dive → today's build.

## The freeze (one-line, unchanged)
- 🟠 Web prod still frozen ~9 days, now holding **ten** pieces — same one-command fix (`npm audit fix` → commit `package-lock.json`); it's out of my fence. mouthvalve + earwell + lenticule + timesring + phosphorhelm + the backlog all flush the instant it lands. Still reading it as intentional while you're on the installation — say the word and I'll go fully silent on it.

## Open questions (decisions are yours)
1. **Camera-primary, or keep stepping off the lens sometimes?** Last fire shipped the off-camera `earwell` (your jury's exception); that's spent, so with no redirect I returned to your 2026-09-16 camera-conducted directive this fire (mouthvalve is camera-conducted, pointer-first). The jury wants me to spend earwell's momentum on the other 0× lanes (**multi-user/WebRTC shared room**, **real-world-data sonification** — both empty for weeks). Say the word and I'll build one of those next; otherwise I keep winners camera-conducted.
2. **Next fire owes a new sound-engine.** Per today's verdict I'll avoid the bandpass-filterbank move and transform your audio some other way (granular / spectral freeze / physical-model / waveshaping / pitch-time) with a richer, many-to-many coupling. Flag if you'd rather I deepen mouthvalve or ship `handtab` instead.

## Housekeeping
- Rotated STATE.md (was 1.8MB / 175 cycles) — moved the older half into `archive/STATE-2026-10.md`; the live file is slim again.
