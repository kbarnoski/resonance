# 1110 · Earth Hum

**What if you could tune into the planet's own electromagnetic heartbeat — hear Earth hum, live?**

A meditative, cosmic-ambient instrument that sonifies the **Schumann Resonance**: the real extremely-low-frequency (ELF) electromagnetic standing wave in the cavity between Earth's surface and the ionosphere, excited by roughly **44 lightning strikes per second** worldwide. Its harmonics SR1–SR5 sit at about **7.83, 14.3, 20.8, 27.3, 33.8 Hz** — below or at the very edge of hearing.

Route: `/dream/1110-earth-hum`

## The sound (physically-accurate Schumann synthesis)

- **Pitched drone bed** — the five true harmonics transposed **up four octaves (×16)** into a warm audible register (~125, 229, 333, 437, 541 Hz). Each is a soft sine/triangle voice with a faintly detuned partner so it **beats and shimmers**; amplitudes taper SR1 > SR2 > … > SR5.
- **True sub-frequencies kept as *felt* elements** — a **7.83 Hz amplitude tremolo** breathing across the whole bed (the cavity's real fundamental, as a pulse), plus a gentle **gated 7.83 Hz sub-oscillator** you feel more than hear.
- Everything runs through a **`DynamicsCompressor` limiter → destination**. It starts only on a user gesture (Web Audio autoplay policy) and is **never silent after Start**.

## The live data (the point — music about something other than music)

The cavity's real strength is shaped by the ionosphere, which geomagnetic storms disturb. So the piece tunes itself to **real space weather** from NOAA SWPC's public, no-key, CORS-open feeds, fetched **client-side** on Start and refreshed every ~60 s:

- **Planetary K index** — `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json` (array-of-arrays; header row first, most recent row last, Kp at column 1).
- **Solar-wind plasma** — `https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json` (columns time / density / speed / temperature).

**Robust fallback (mandatory):** each fetch has a ~4 s timeout. If any fail, or this runs headless with no network, the piece drops to a **deterministic** model — a slow sinusoidal Kp walk 1↔6 and plausible wind ~350–600 km/s (no `Math.random` anywhere in a per-frame path; a seeded mulberry32 PRNG drives the visual flicker). It is **never blank, never silent**. The HUD badge reads **● LIVE** vs **● simulated**.

### Mapping

| Live signal | Sound | Visual |
|---|---|---|
| **Kp** (geomagnetic storm, 0–9) | more amplitude flutter/beating; brighter lowpass; deeper felt heartbeat | warmer/redder glow; more frequent lightning flickers |
| **Solar-wind speed** | subtle pitch-drift / shimmer rate | ring drift + breath rate |
| **Per-voice amplitude** | the audible beating of each SR voice | brightness of that voice's SR ring in the harmonic ladder |

## The visual (warm — non-black by requirement)

Earth's night side as a world **lit from within** — a warm amber/gold sphere inside a deep indigo→amber sky, wrapped in an additive **ionospheric shell that breathes**. The 7.83 Hz heartbeat drives the breath but is **eased to a calm ~0.15 Hz swell** so it reads as breathing, not a strobe. Five soft glowing rings are the **harmonic ladder SR1–SR5**, each tracking its voice's amplitude. Built with **three.js** (already installed; no new deps).

## Controls / UX

- **Start listening** (or tap anywhere on the intro) — one gesture begins audio + visuals + the live feed.
- **Read the design notes** — bottom-right toggle opens an in-page summary of this README.
- **HUD** — current Kp, solar-wind speed, and the LIVE / simulated badge.

## Safety & honest framing

- Lightning flickers are **gentle, brief warm glows** around the globe — never full-screen flashes, mean brightness roughly constant. `prefers-reduced-motion` damps both the flicker and the breath.
- **7.83 Hz is the real Schumann fundamental** — a genuine geophysical cavity frequency. This piece makes **no brainwave-entrainment or health claims**. The calm, oceanic, meditative feeling is what the *piece* creates, not a medical effect.
- Graceful degradation: no WebGL → readable notice; audio failure → visible notice with the globe still running; no network → seeded fallback.

## Named references

- **Winfried Otto Schumann (1952)** — predicted the resonance.
- The **ELF Earth–ionosphere cavity** physics — the mechanism itself.
- **Frank White, *The Overview Effect* (1987)** — the ego-dissolving awe astronauts feel seeing Earth whole.
- **Oceanic boundlessness** (Frontiers, 2025; existential neuroscience) — the meditative pole this piece leans into.

## Tags

`state: overview-effect / oceanic planetary boundlessness` · `pole: cosmic-ambient (warm)` · INPUT: live external data (NOAA space weather) + autonomous fallback · OUTPUT: three.js warm globe · TECHNIQUE: real-data sonification + physically-accurate Schumann-cavity harmonic synthesis · PALETTE: warm amber/gold ionosphere.

## Next-cycle deepening

Fetch a live global-lightning (WWLLN-style) stroke feed and fire each drone-voice excitation and lightning flicker on **real strikes**, so the cavity is rung stroke-by-stroke by the actual storms exciting it right now — turning the steady bed into a living, breathing resonance.

## Files

- `page.tsx` — client component: gesture-to-start, render/audio loop, HUD, notes panel, graceful degradation.
- `audio.ts` — Schumann harmonic synthesis (drone bed + felt 7.83 Hz tremolo & sub + limiter mapping).
- `scene.ts` — three.js warm globe, breathing ionospheric shell, harmonic-ladder rings, seeded lightning.
- `data.ts` — NOAA SWPC fetch (Kp + plasma) with deterministic fallback.
- `readme.ts` — in-page design-notes prose.
