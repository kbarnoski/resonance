# 5816 · Astrolabe

**What if you PLAYED an instrument by tilting your phone _through_ it — steering a beam across a celestial sphere of resonant tones, the way an astrolabe measures the sky?**

You are standing at the centre of a night sky. The sphere around you is engraved with latitude rings — each ring an octave — and studded with stars. Every star is a pitch. Tilt your phone to aim a reticle (the astrolabe's _alidade_) across the sky; when the beam crosses a star, it plucks a resonant string. How centred you are sets how loud and how bright. Tilt _is_ navigation _is_ performance.

## How it works — the subsystems

The build is five small modules wired through `page.tsx`:

1. **`orientation.ts` — the beam (PRIMARY input).** `DeviceOrientationEvent` `gamma`→yaw and `beta`→pitch steer a single forward direction. The first reading calibrates a resting baseline, so whatever pose you hold the phone in becomes "level". Everything is exponentially smoothed — the beam glides, never snaps. Input priority while running: **device → mouse → arrow-keys → seeded auto-demo → idle ghost drift**.
2. **`starmap.ts` — the pitch-sphere.** 30 stars = 5 octave-rings × 6 just-intoned scale degrees `[1, 9/8, 5/4, 4/3, 3/2, 5/3]` over base C3. Elevation = octave, azimuth = scale degree, with a golden-angle twist per ring so the columns spiral. Just ratios mean any swept path is consonant.
3. **`sky.ts` — the celestial sphere (three.js / GPU raster).** Camera at the centre; star cores (near-white) + violet glow halos as additive sprites; a latitude-ring graticule (the engraved plate); a 900-point seeded background starfield for parallax; a screen-centre reticle pinned as a child of the camera. The pitch-sphere drifts slowly around its axis and stars twinkle, so the sky is alive from load.
4. **`audio.ts` — resonant voices (Web Audio).** Each pluck is a **Karplus–Strong** string: a few ms of seeded noise injected into a delay line tuned to the pitch's period, fed back through a low-pass so the tone decays bright-to-dark. Under it sits a barely-there just-tuned drone (tonic + fifth + octave) with a slow sub-Hz filter breath, so the sky is never truly silent.
5. **`demo.ts` — the seeded auto-play.** A fixed-seed `mulberry32` generates a stepwise melodic walk over the stars, favouring small intervals so it sings. On "Enter the sky" the beam sweeps this path, lighting and sounding stars in sequence — legible even with sound off.

Proximity gating lives in `page.tsx`'s render loop: the beam's forward is transformed into the sphere's local frame, angular distance to every star is measured, near stars bloom, and crossing a star's cone (with a short per-star cooldown) fires the pluck at an amplitude set by how centred you were.

## Named reference

Honoured, and cited honestly:

- **The astrolabe** — the medieval celestial-navigation instrument. Its literal geometry is the interface here: a sphere of stars you _sight through_ a reticle to find your bearing, over an engraved plate of latitude rings. This is the primary metaphor and the visual grammar.
- **The theremin** and **Michel Waisvisz's _The Hands_** — the spatial-gesture pitch-control lineage. Here, as there, position/gesture _is_ the note; there are no keys to press.

## Ambition-floor criteria hit

- **≥3 distinct subsystems?** Yes — five: orientation→beam, pitch-sphere layout, three.js sky renderer, Karplus–Strong synthesis, and the seeded auto-demo conductor.
- **Named reference?** Yes — the astrolabe (structural + visual), plus the theremin / _The Hands_ (interaction lineage).
- **Audio-visual, self-contained, deterministic, degrades gracefully?** Yes — Web Audio + three.js; all randomness from one fixed-seed `mulberry32`; WebGL-failure notice, iOS `requestPermission()` on the Start gesture, and mouse/arrow-key fallback with an on-brand note when no tilt sensor is present.

## Known rough edges

- Karplus–Strong voices allocate a small node graph per pluck (torn down after decay). The per-star cooldown keeps this bounded, but a very fast tilt-scrub could still stack a handful of voices briefly.
- Device-orientation gains (`YAW_FROM_GAMMA` / `PITCH_FROM_BETA`) are tuned for a hand-held portrait phone; a flat-on-a-table pose calibrates awkwardly. "Recenter tilt" re-levels it.
- The slow sphere drift plus the reticle means stars occasionally sound on their own even when you hold perfectly still — intended as gentle celestial-drift music, but it does blur the line between "you played that" and "the sky did".
- Reduced-motion is not yet special-cased (the drift is already very slow and there is no strobe, but a full `prefers-reduced-motion` path would be cleaner).

## Next-cycle deepening

- **Absolute compass mode:** use `webkitCompassHeading` / absolute orientation so the sky is anchored to real geography — face north, find the tonic.
- **Chord constellations:** let a slow, steady aim sustain and _bow_ neighbouring stars into a just-tuned chord rather than a single pluck.
- **Sight-lines:** draw faint alidade lines from the reticle to the nearest few stars, and engrave the current scale-degree/octave as an astrolabe-style readout.
- **Bell/plate resonators:** offer an additive partial-bank timbre (inharmonic bell spectra) as an alternative to the string, selectable per octave-ring.
