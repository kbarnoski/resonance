# Morning digest — last updated 2026-06-23 (cycle 523, adult · WIDE)

## New since yesterday
- **[/dream/869-spatial-grove](/dream/869-spatial-grove)** — **Spatial Grove.** Stand in front of the camera and **walk through a grove of 16 singing trees**: step sideways to pan across it, step *toward* the camera to move deeper in. Each tree is a fixed, HRTF-spatialized voice — the trees never move, **you** do — and walking near one blooms it in your ears and brightens its glowing canopy. The grove **drifts over minutes** (each tree slowly re-transposes / re-times / re-colours), so it's never the same twice. **Why open it:** this is the **pose-driven spatial-audio room the jury has asked for three times running** (depth/body input was 0–1×, the coldest category) — and the first time the *whole body navigates* a fixed sound field rather than conducting it with hands. It's the Cardiff *Forty Part Motet* inverted: a fixed choir you wander through. Rendered as a **WebGPU compute** particle field (the scarcest, most-wanted GPU surface). **For your 06:30 glance with no camera:** a synthetic walker auto-strolls a figure-8 so the grove sounds and blooms within a second, and you can drag with the pointer to walk it yourself; falls back WebGPU → WebGL2 → audio-only so it never dies.

## How this cycle was run
- **WIDE mode** — 3 orthogonal adult explorers built in parallel, each on a GPU surface, each a *different* input/output/technique/vibe. Shipped the strongest, banked the other two. This is the directest attack on "too similar."
- I **did not** resurrect the queued `865-tide-gamelan` — it's the same ocean-gamelan concept we just shipped as `864`, the literal "too similar" trap. Went wide on a fresh, long-cold direction (the spatial room) instead.
- Today's research grounded it: **AudioMiXR** (arXiv 2502.02929) + **MoXaRt** (2603.10465) — 2026 work on manipulating spatial-audio *objects* in 6DoF — which inverts cleanly to "the objects are fixed and you move."

## Banked explorers (see IDEAS §523) — both built complete + verified clean
- `870-live-accompanist` ⭐ — play a MIDI keyboard (or the on-screen keys / mic) and a **generative jazz trio follows you** in real time: walking bass + comping that track your tempo and chord, not a fixed backing track. Antescofo/score-following. **Top adult resurrect-first** — the directest "live-performance fitness / jazz-responsive arc" answer; de-selected only because three.js was at its over-use cap.
- `871-solar-wind-aurora` — the **live solar wind** (NOAA space-weather data) plays a sonified aurora, and geomagnetic storms intensify it; WebGPU curtains. De-selected only to avoid two data-sonification pieces back-to-back (after last night's `864`).

## Open questions for Karel
- 869 is **device-unverified** here (no camera/GPU/headphones in the sandbox) — worth a try on a webcam + headphones to confirm the HRTF pan reads spatially and to tune the **shoulder-width → depth** mapping (the likeliest thing to nudge).
- Both freshly-banked builds answer standing asks you can pick from next: **live-performance / jazz** (`870`) and **real-world-data** (`871`). Want either shipped, or keep widening?
- Renderer watch: **WebGPU now 3× and leading** (859 → 866 → 869); raw-WebGL2 is at its cap; three.js is near it. WebGPU is the surface to keep favouring.
