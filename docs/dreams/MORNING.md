# Morning digest — last updated 2026-06-22 ~10:20 UTC (cycle 513)

## ▶ Open this first
- **[/dream/842-air-veil](https://getresonance.vercel.app/dream/842-air-veil)** — **Air Veil.** Hear the air six world cities are breathing *right now*. It pulls **live air-quality data** (Open-Meteo, no key) for NYC, London, Delhi, Tokyo, São Paulo, Mexico City — and the dirtier a city's air, the more it **fouls that city's harmony**: clean air = pure consonant partials; rising pollution adds inharmonic partials, beating roughness, and detune, so you literally *hear a city's air get dirty*. Each city is a glowing dot on a world map under a drifting pollution particle-veil. Tap **Listen to the air**. (No network? It runs on simulated drifting air — fully demoable.)

## Why this one (adult · WIDE · 3 explorers → shipped 1)
- The directest answer to **JURY #3** — "real-world-data sonification is a cold category with *zero* entries this window; make music *about* something other than music." Grep-verified the lab has sonified weather, tides, and solar wind but **never the air** — so this opens genuinely new ground rather than re-treading a lineage.
- The inversion is the idea: instead of mapping data to *more notes*, pollution maps to **harmonic fouling**. That's the surprise — you don't just see the AQI, you hear consonance corrode.
- Mode **WIDE**: 3 orthogonal adult briefs (inputs external-API / pointer / mic), all dodging every JURY ban (his-recording, machine-listens, UPIC, adult-ambient-default). Shipped the data one — freshest + highest-surprise.

## 2 more explored, banked to IDEAS §513 (built complete, not committed)
- **`843-gravity-sequencer`** ⭐ — pointer · compose a polyrhythm by arranging **gravity**: drop tuned bells, fling satellites; a velocity-Verlet symplectic integrator runs the orbits and every **perihelion** (closest approach) triggers a percussive strike. Orbit period = rhythm, eccentricity = swing, three-body chaos breathes the groove. The §507 ⭐ banked `825` rebuilt clean & lint-fixed — **top adult resurrect-first.**
- **`844-overtone-mirror`** — mic · sing one note and **climb its hidden overtone tower** with your voice; a hand-written NSDF pitch detector lights & rings each just-intonation overtone (2f–16f) as you slide up to it. Demo-voice glide works with no mic.

## Research finding (RESEARCH §513)
- **Real-time air-quality sonification** (Andrea Polli *Particle Falls*, *Mutual Air* PM wind-chime, Sonic Kayaks) + Open-Meteo's free no-key CORS air-quality API = a never-touched data feed for the lab. The compelling move vs. every prior data piece: map pollution to *harmonic fouling*, not to more notes. Built this fire as 842.

## Open questions for Karel
- Real-world-data is a genuinely thin lane (now `842` air, plus the still-banked `836-flightpaths` ADS-B). Worth a sustained push — sonify transit / seismic / lightning next — or was one enough for now?
- Does the *fouling-harmony* mapping land by ear, or does dissonance just read as "out of tune"? That's the one thing I can't verify in the sandbox.

_Infra (standing since 472): local `npm run build` passes compile + lint + type-check but can't finish static-gen — a cgroup-locked ~4096-fd container ceiling (EMFILE at `next-font-manifest.json`), not a code defect; fails identically on pristine `main`. Vercel deploys fine._
