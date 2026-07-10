# Morning digest — last updated 2026-07-11 ~UTC

> **Cycle 731 · psychedelic · WIDE** — three unrelated directions explored in parallel; shipped the one that builds on something you'd want us to build on. I turned the **live earthquake data of the planet's last 24 hours into a breathing instrument** — the browser-scale echo of Refik Anadol's *Dataland* (which opened in LA three weeks ago).

**Open the lab:** https://getresonance.vercel.app/dream

## New since yesterday — open this first
- **[/dream/1426-biome-field](https://getresonance.vercel.app/dream/1426-biome-field)** — *the planet composes.* Hit **Begin** and the last ~24 h of global earthquakes are fetched **live from the USGS**, right in your browser, and grown into a breathing shell of light around a dark, slowly-turning Earth — magnitude → size/brightness, depth → colour + height, recency → shimmer. It's a **living field, not a chart**: it drifts, twinkles, and re-fetches every ~2.5 min, so *it will look and sound different at your 06:30 than it did an hour before.* **Drag** to orbit; **hover** to "listen in" on a region. The sound is derived entirely from the data as a slow **inharmonic** drone + granular shimmer — deliberately not the pretty pentatonic default. **Use headphones.** *(Renders robustly, but the live-data look + the mix want your screen — I'm headless.)*
- Why this one, of three: it's the direct build-on of the **Anadol *Dataland*** finding the jury flagged as "built on by nothing," it's our first live real-world-data piece since `1374-sky-strata`, and it's unlike any recent winner.

## Explored but not shipped (2 more — banked, full specs in IDEAS §731)
- **⭐⭐ 1428-dissolve-room** (TOP ship-next) — *ego-dissolution as a room.* A solid glowing lattice of real 3-D `<div>` cells that **loosens over minutes and tunnels toward a light**, tuned to **inharmonic bell partials** that drift *further* out of tune as it dissolves — the "make a note sound wrong on purpose" piece you keep asking for. It's the highest-ambition one; I held it only because it's on the same DOM/CSS-3D surface + dissonance theme as last week's `1408-wolf-ring`, and this was a *diversity* cycle. Fully render-robust (pure DOM/CSS, phone-perfect). **Say go and it ships next.**
- **⭐ 1424-flow-mandala** — *dance and a fractal melts with you.* Webcam **optical flow** (no libraries) advects a kaleidoscopic Klüver form-constant mandala; DMT-intense when you move, cosmic drift when still. Held only because it's camera→WebGL2 like last week's `1412-time-smear`.

## Open questions for Karel
- **The AI-pipeline chain is still the last 0× rung** (audio→image→video — the jury's standing ask). It needs your explicit per-prototype **paid-budget** go-ahead (FAL/Replicate); I won't auto-spend, so it can't run unattended. Say the word.
- **Ship 1428-dissolve-room next?** If you want the "out-of-tune on purpose" NDE room, it's built and clean.

## Note on the build
- Winner verified: **TypeScript `--noEmit` = 0**, repo-pinned **ESLint `--max-warnings 0` = 0**, `compile` build **exit 0** with the route in the manifest and `page.js` (41 kB) emitted. Plain `npm run build` only tripped on the container's known open-file-limit at the last packaging step (not a code error, absent on Vercel). Pure client-side three.js + Web Audio + a read-only public data fetch — deploys clean.
