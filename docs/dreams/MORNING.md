# Morning digest — last updated 2026-07-04 (cycle 658, ~14:2x UTC)

> **The jury's verdict was the loudest yet** (2026-07-04, `docs/dreams/JURY.md`): the last fifteen are "one dark-cosmic physics sim wearing fifteen costumes." It banned the near-black glow + drag-to-stir 3D field and demanded something **bright, embodied, or about the real world**. This cycle answers all three at once.

## New since yesterday
- **`/dream/1160-body-choir` — conduct a choir with your whole body. Open this and stand back from your webcam.** No controller, no touchscreen: a webcam watches your motion (a home-grown optical flow, nothing uploaded) and a **warm, sunlit choir** follows you — move more → louder, raise your hands → higher voices sing, left/right → the shimmer pans, go still → it settles into a calm drone. Bright ivory-and-peach, the opposite of the dark glow the jury was tired of. **No webcam? It falls back to your mouse** and plays identically.
- **Why this one:** the jury's single biggest complaint was "**zero embodied prototypes in fifteen cycles**" — camera/body/MIDI all 0×. This is the direct answer. And it's the first time in weeks your **loves agreed with the jury**: you've loved `101-camera-song`, `217-dance-avatar`, `234-kids-hand-creature` — all body/camera pieces. So this pick is both what the jury demanded and where your taste already points.

## Banked (fully built, one cycle away)
- **⭐ `1161-seismic-song`** — **the last 24 hours of the whole Earth's earthquakes, as music**, over a bright daylight world-map. Pulls the **live USGS feed** (keyless), maps each quake's magnitude→pitch/loudness, depth→timbre, location→pan, and blooms it as a ripple on the map. This answers the jury's *other* big ask — "build about the real world, not a Hamiltonian." It's built and ready; I banked it only because embodiment was the louder gap this fire. **Say the word and it ships next.**
- **`1162-key-garden`** — the lab's **first MIDI instrument**: plug in a MIDI keyboard (or just use your computer keys) and every note grows a bright plant — a played phrase leaves a sunlit fading meadow.

## Research finding worth a look
- The headless box has no webcam/speakers, so I can't *see/hear* these before you do — but I found the way to do "embodiment" without that risk: a **self-contained frame-differencing optical flow** needs no MediaPipe or CDN model (which is why I'd deferred body-tracking before). Full body/hand-pose tracking and real MIDI hardware are still worth a cycle when you can watch them live. RESEARCH §658.

## Open questions for Karel
1. **Does `1160-body-choir` actually feel responsive — does moving your body clearly *play* the choir, and does it read bright/joyful?** Can't verify headless; a 30-sec stand-in-front-of-the-webcam tells us. The optical-flow + audio wiring is code-verified correct.
2. **Ship `1161-seismic-song` next?** One word and the Earth's earthquakes go live on the map — it's fully built.
3. **Real WebRTC multi-user** (the coldest open ask) still needs your call on a durable signaling store before I can build it.
