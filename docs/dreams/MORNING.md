# Morning digest — last updated 2026-07-26 (cycle 917, WIDE)

## New since yesterday
- **`2992-around`** → https://getresonance.vercel.app/dream/2992-around — **sculpt a choir in the space around your head.** Click a top-down radar to place sustained voices at real 3-D positions; each is a continuous-pitch drone rendered through its own **HRTF binaural** panner, and they slowly **orbit your head** — a voice sweeps from one ear to the other. Drag (or tilt your phone) to **turn**, and the whole field rotates around you. *Why open this:* it's the lab's **first dedicated 3-D binaural instrument** — immersive/spatial audio, arguably the most *product-relevant* lane for a "personal audio workspace." **Put headphones on** — that's where the binaural effect lands. A seeded demo is already orbiting on load; tap **Start** for sound.
- Went **WIDE** to break a **4-cycle groove**: 913–916 were all *one hand directly playing one instrument* (sing-follow, sing-harmony, tabla, murmuration). This cycle raced **three unrelated registers — SPACE / PEOPLE / ENVIRONMENT** — and shipped the strongest. **2 more explored — see IDEAS §917.**

## In progress / partial
- Nothing half-built. One clean ship + two banked seeds (both built demoable + `tsc`/`eslint` clean in-folder this cycle).

## Research findings worth a look (RESEARCH §917)
- **Spatial audio + head-tracking is a first-class 2026 interaction** (AudioMiXR arXiv:2502.02929 — grab/place 3-D sources; SpatialNet 2512.20122 — binaural under head rotation). The browser already ships the primitive (`PannerNode{HRTF}` + movable listener), yet the lab had never built a spatial *instrument*. `2992-around` is that.
- Banked **`3008-daylight`** ⭐⭐ (HIGH — freshest concept, the cosmic-ambient pole you want covered) — **the light in your room becomes the instrument**: the camera reads brightness/hue/motion (not your body) and turns it into a slow living chord. Cup the lens, walk to a window, dim a lamp. Scriabin's colour-organ **inverted**. No image data leaves the browser.
- Banked **`3000-commons`** ⭐ — a **collective drone-choir** (open a 2nd tab = another person joins) where the room self-organizes into harmony. Cashes the multi-user seam (`2912-ensemble`) — but I held it because its coupling pulls toward just-intonation ratios (the very "safety net" the jury wants gone) and it's a close sibling to ensemble; the resurrect note swaps it for a roughness-minimizing (Sethares) coupling.

## Open questions for Karel
- **Does `2992-around` localize convincingly on your headphones?** I can't hear it here (headless). When a voice orbits, do you feel it move *around* your skull — and when you turn/tilt, does the field audibly rotate? The pitch range, orbit speeds and distance-rolloff are hand-tuned and want your ear.
- **Spatial/immersive is a brand-new lane (0× → 1×) and the most Resonance-shaped one yet.** Want me to grow it — a spatial layer over your **real Path tracks** (arrange your piano in the round), or head-tracked spatial *journeys*? It's a natural multi-cycle build.
- **AI-pipeline chains (music→image→video) are still 0× — the FIFTH+ jury flagging it.** It spends your FAL_KEY budget, so it needs your explicit go-ahead + a per-run cap. One word unblocks it.
