# Morning digest — last updated 2026-06-15 (UTC) · cycle 429

**Open this first:** [/dream/618-solar-organ](https://getresonance.vercel.app/dream/618-solar-organ) ☀️🌌

## New since yesterday
- **☀️🌌 [618-solar-organ](/dream/618-solar-organ)** — "Solar Organ" (adult). **What does the space weather hitting Earth right now sound like? — the live solar wind plays a magnetospheric organ while you watch the aurora that same data is driving.** Why open it: it's the lab's **first solar-wind / geomagnetic real-data piece** (after 613's seismic) and it's **alive with the real planet right now** — three keyless NOAA feeds (planetary Kp + southward-Bz + plasma speed) sonified into an inharmonic, *edged* 24h replay over a hand-written WGSL aurora curtain. When Bz plunges south and Kp spikes, the aurora opens and the organ tenses into a slow alarm — a real geomagnetic storm sounds ominous, not cozy. Hits two of your standing asks at once: **mine UNMINED data, not the ocean** (you named aurora/Kp) + **a full WebGPU spectacle off Canvas2D**. **No network? It self-plays:** a built-in synthetic storm + Canvas2D fallback + ~2.5s autostart mean a silent glance still sees the curtains move and hears the organ.

## Also explored (banked, not shipped — see IDEAS §429)
- **619-combustion** — rev a procedural **combustion engine** off the glass (keyboard/tilt → AudioWorklet pulse-train + Karplus-Strong exhaust → WGSL tachometer; implements a March-2026 engine-synthesis paper). Loud, abrasive, mechanical. **Banked as the ready resurrect for the next "edges" fire** — it's now been built twice, a near-instant ship.
- **620-empty-room** — sit in the dark with headphones and you're **not alone**: inharmonic presences circle you in real 3D sound (HRTF), hiding when you face them and creeping closer when behind you. The lab's swing at the **off-screen / audio-first** lane the jury keeps naming. **Banked** — its payoff needs headphones + your real ears, so I held it for a cycle where we can verify it on hardware.

## How this cycle was chosen
- ADULT cycle (429 odd), **WIDE** mode (3 parallel builders, ship the best). Each explorer attacked a *different* open jury lane: 618 = unmined real-data + WebGPU; 619 = edges; 620 = off-screen. Gates: research-first (verified NOAA SWPC is keyless + CORS-open with two live curls this cycle); diversity (all three dodge the banned Canvas2D / touch / warm-JI / cozy); ambition floor (618 honest 3/5 — first solar-wind sonification + 4 subsystems + named refs Polli / Dungey-cycle / Bridson).

## Caveats
- **Build-verified, not browser-verified** (no GPU/audio/network in the sandbox). The *live* NOAA wire parse wasn't exercised — only the synthetic-storm path ran — and the WGSL aurora + the sonification feel are reasoned, not eyes-on. The fallbacks guarantee it does something on a glance regardless.

## Open questions for Karel
- 618 mines **solar wind**; 613 mined **seismic**. Which real-data world pulls you — keep going cosmic/geophysical, or pivot to human data (ISS passes, transit, finance, language)?
- The off-screen / audio-only lane (620) is still nearly empty after 600+ builds. Worth a dedicated fire where you test it on headphones and tell me if it lands?
- Adult builds have run WIDE four cycles straight — want the next one to go **DEEP** (one massively-bigger concept, parallel approaches) instead?
