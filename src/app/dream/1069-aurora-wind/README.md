# 1069 · Aurora Wind

**What if the real, LIVE solar wind streaming past Earth right now played a cosmic-ambient aurora you fall into?**

A drug-free *altered-states* piece — the meditative, oceanic pole of boundlessness. On a single **Begin** gesture it fetches NOAA SWPC's live space-weather feeds and lets the real wind drive an endless rising glissando and a field of drifting auroral curtains. It keeps evolving (the feed is polled every ~60 s) and it runs on slowly-drifting **synthetic** data when the network fails, so it **always** sounds and moves with zero network and zero interaction beyond Begin.

We sonify the **real** solar wind, not a fake. The HUD says which: a green `live · NOAA SWPC` dot when data is real, an amber `synthetic fallback` dot otherwise. (In 2026 we're near solar maximum, so live aurora activity tends to be high.)

## Live data

Fetched client-side in `data.ts`, each with its own 4-second `AbortController` timeout; on **any** failure (network, CORS, parse, missing values) it falls back to drifting synthetic values that are meant to be indistinguishable in feel.

| Product | Fields used | URL |
| --- | --- | --- |
| Plasma | speed, density | `…/solar-wind/plasma-5-minute.json` |
| Magnetic field | `bz_gsm`, `bt` | `…/solar-wind/mag-5-minute.json` |
| Planetary K | `Kp` | `…/noaa-planetary-k-index.json` |

Each product is an array of arrays; row 0 is a header and we take the most recent row whose needed columns all parse to finite numbers.

## Mapping

### Data → sound
- **Solar-wind SPEED → Shepard `setDrive`.** Faster wind = a faster, more energetic endless ascent (`startShepard`, `dir:1`).
- **Southward Bz (negative nT) + Kp → drone `setDrive`.** Real physics: southward Bz couples the solar wind to the magnetosphere and drives substorms, so the low just-intonation bed (`startDroneBank`) **swells** exactly when the sky should light up.
- **Strong southward-Bz swing → a sparse high shimmer "ping"** (rate-limited so it stays rare).
- Both buses route through a ~6 s `createVoidReverb` (`seconds: 6, decay: 2.5`) for a vast tail; the wet mix opens as the sky gets more energetic.

### Data → visual
- **SPEED → curtain ripple/flow speed and lateral drift.**
- **DENSITY → curtain brightness / opacity.**
- **Southward Bz → an overall glow surge** across the curtains.
- **Kp → colour spread and how low the red tops reach**: high Kp pushes red-topped, lower-latitude curtains (the classic storm-time red aurora).

## Visual

A GPU field of vertical auroral **curtains** — shader-displaced ribbon planes (`three.js`, `import * as THREE`) at staggered depths, additive-blended in a green→magenta→red auroral palette, with horizontal ripple, scrolling vertical shimmer, and slow drift over a sparse star backdrop. It is deliberately a drifting **field**, not a center-out bloom. If WebGL is unavailable, a readable `text-rose-300` notice appears instead of a crash.

## Named reference — the magnetosphere-sonification lineage

- **"Listening to the magnetosphere: How best to make ULF waves audible"** (arXiv:2206.04279) — shifting ultra-low-frequency magnetospheric waves up into the audible band.
- The broader **heliophysics-sonification tradition**: NASA's heliophysics sonification work, and **Andrea Polli's** environmental / Antarctic sonification.

This piece stands in that lineage: it sonifies the **real** solar wind, not a stand-in.

## Design notes

- Audio composes the shared psych engines (`startShepard`, `startDroneBank`, `createVoidReverb`) — no bespoke synthesis beyond the shimmer ping.
- Everything is smoothed: live-data jumps glide into both sound and image over ~1 s, so a new 5-minute sample never snaps.
- After the one Begin gesture the piece is autonomous: it drifts, polls, and re-paints on its own.

## Files
- `page.tsx` — Begin gesture, render/audio loop, live HUD, in-page design-notes toggle.
- `data.ts` — NOAA SWPC fetch + synthetic fallback.
- `audio.ts` — composes the shared psych engines + shimmer ping; all data→sound mapping.
- `scene.ts` — three.js auroral curtains + star backdrop; all data→visual mapping.
- `readme.ts` — the in-page design-notes prose.
