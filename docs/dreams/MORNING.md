# Morning digest — last updated 2026-06-30 ~20:20 UTC (cycle 614)

> **The one thing this fire did:** built the lab's **first HRTF-spatialized *planetary* instrument** — every real earthquake on Earth right now becomes a depth-timbred gong-strike placed at its true compass bearing around you, ringing into a dark void. Swings the pole back to **dark / NDE-void** after the cosmic-ambient aurora, and lands the **spatial** category the jury named as actively-wanted but 0×.

## Open this first
- **[1070-deep-tremor](https://getresonance.vercel.app/dream/1070-deep-tremor)** — *the living planet, sonified as a dark instrument you fall into.* Tap **Begin**: it fetches the live USGS earthquake feed, replays the planet's last hour over ~36 s, then polls every 60 s. Each real quake rings out as **one struck gong, HRTF-placed at its true direction** around you (use headphones — the spatial bearing is the point), while an expanding circle blooms at its true lat/lon on a slowly-rotating dark globe. Big quake = low massive boom; deep quake = darker, farther, quieter; shallow = a bright near tap. The drone swells when quakes cluster. `state: NDE void · pole: dark`. **Zero permissions, zero device — the globe visibly pulses even without headphones, so it's easy to verify on your phone.**

## Also explored this fire (DEEP — 2 competing approaches, 1 banked)
- **1071-tremor-core** ⭐ — the *egocentric* twin: instead of watching a globe, **you are suspended at Earth's core in a black void**, and the quakes arrive as HRTF strikes out of the dark from their true bearing/depth. The purer NDE framing and arguably the more surprising of the two — banked because its near-black visual + headphone-dependent bearing is the *least* legible on a phone glance. Resurrect with **head-tracking** (turn your head toward a strike). (IDEAS §614)

## Honest caveats
- **Built green; the fallback + autonomy are the headless proof.** `npm run build` → `✓ Compiled successfully in 56s` + ESLint + project `tsc --noEmit` (exit 0), 0 issues from the 1070 folder; only the standing container EMFILE fd-block stopped static-gen (infra, Vercel-safe). The synthetic Ring-of-Fire fallback + 60 s polling mean it sounds and the globe pulses with **zero network and zero hardware** — so it dents, not adds to, the verification-debt liability.
- Not yet heard on real ears: whether the HRTF bearing reads clearly, and whether live-vs-synthetic *feels* different. If the badge is amber, the USGS fetch was blocked from your network — the piece is identical either way.

## Open questions for Karel
- **Does "the real planet, right now, placed around you" land?** The bet: hearing a quake's true *direction* + depth (deep = below and far) makes the live seismic feed a spatial instrument, not a data map.
- **Two real-data sonifications back-to-back (solar wind → earthquakes) — keep mining live data, or pivot?** Still never-built and jury-named: **multi-user/WebRTC shared room**, and a **live-mic score-follower** (banked 1071-following-light §613). Or honor a multi-cycle commitment again: **1071-tremor-core's** head-tracked NDE-core, or **1068's cycle-3** (depth-z, entity gaze, multi-body).
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and I can stop caveating "build-green-but-unfelt."
