# 766 · Sky Orrery

**Route:** `/dream/766-sky-orrery`

## The question

> What if you stood under a real 3D dome of the sky and the bodies overhead
> conducted Karel's piano? The sun, the moon (correct current phase), and a
> handful of bright stars/planets are placed at their REAL computed
> altitude/azimuth for the local time & place; the dome turns slowly with
> sidereal time; and whichever bodies ride highest conduct a slow, ever-changing
> arrangement of whole PHRASES from Karel's real *Welcome Home* piano — Atlas
> Eclipticalis made literal: **sky position becomes score position**, so minute 5
> is genuinely not minute 1.

## How it works

### Astronomy (`sky.ts`) — all local, no network
Copied and extended from `347-the-place/astronomy.ts` (no cross-folder import).

- **Sun** — NOAA-style low-precision altitude/azimuth from day-of-year, local
  hours, lat/lon and device timezone.
- **Moon** — synodic phase from a reference new moon (correct current phase +
  illuminated fraction) plus a simplified Meeus lunar-longitude model converted
  through the obliquity to a plausible alt/az (rises ~50 min later each day).
- **Stars & planets** — eight genuinely bright bodies (Sirius, Vega, Arcturus,
  Betelgeuse, Rigel, Altair, Jupiter, Venus) with J2000 RA/Dec, placed via
  Local Sidereal Time → hour angle → alt/az. Exactness isn't claimed; plausible
  motion is.
- `dateWithForcedHour` powers the time-scrub A/B of noon vs midnight.

### Audio (`audio.ts`) — phrase scheduler, NOT granular
- Loads Karel's real recording via the exact public-GET loader. On failure it
  synthesizes a ~16 s `OfflineAudioContext` fallback of a soft warm piano-ish
  phrase with four distinct sub-phrases, so **the piece always sounds**.
- `segmentBuffer` splits the buffer into whole continuous PHRASE regions by
  energy-dip detection (even-slice fallback, ~6–10 regions, ~3–8 s each).
- Each celestial body owns a **phrase-voice**. A self-rescheduling loop plays
  continuous buffer REGIONS (`bufferSource.start(when, offset, duration)`),
  joined by **equal-power crossfades**, occasionally hopping to a neighbouring
  region so the arrangement keeps evolving. Whole phrases, never grains.
- A body's **altitude → voice gain & brightness**; its **azimuth → stereo pan**.
  Only above-horizon bodies schedule phrases; the highest bodies dominate, so
  the audible arrangement is literally the sky overhead.
- Master chain: per-voice filter → gain → panner → master (0.3) → analyser →
  lowpass → DynamicsCompressor → destination, with a reverb send that deepens at
  night.

### Visual (`dome.ts`) — three.js 3D dome + Canvas2D fallback
- A large inverted sphere with a daylight gradient shader that shifts with sun
  elevation (deep indigo night → blue day, golden-hour lift near the horizon), a
  soft horizon ring, a faint background star field that drifts with sidereal
  time, and additive glow sprites for every body placed at its computed alt/az.
- Sun blazes in daylight; stars/planets fade out in daylight; the moon's glow
  scales with its illuminated fraction. Bodies **pulse softly on phrase onsets**.
- No EffectComposer — bloom is just additive sprites (simple/robust).
- If WebGL can't be created, `createCanvas2D` draws the same day/night sky and
  the same bodies on a 2D canvas, still pulsing — never a notice-only dead state.

### Page (`page.tsx`)
- `"use client"`; everything touching browser APIs is inside effects/handlers.
- Start gesture unlocks iOS audio and (optionally) requests geolocation,
  defaulting to **San Francisco (37.77, -122.42)** with a small notice.
- HUD: local time, sun altitude, moon phase, mood label, sidereal time, and the
  body **conducting now**. A **Live sky / Explore time-of-day** toggle with an
  hour slider scrubs a day so you can watch and hear the dome transform.
- "Read the design notes" affordance in the corner.
- Full teardown on unmount: cancels rAF, stops/closes audio, disposes three.js
  geometries/materials, calls `renderer.dispose()` + `forceContextLoss()`.

## Tags
- **INPUT:** live wall-clock + optional geolocation (auto-evolving, no required
  interaction, no mic, no camera).
- **OUTPUT:** three.js WebGL 3D celestial dome, with a Canvas2D fallback.
- **TECHNIQUE:** local astronomical computation → self-rescheduling phrase
  scheduler playing continuous buffer regions (NOT granular).
- **VIBE:** diurnal / cosmic-but-warm / daylight-into-night — luminous and open.

## Named references
- John Cage, *Atlas Eclipticalis* — transparent star-chart overlays become an
  orchestral score (the literal conceit here).
- Jem Finer, *Longplayer* — long-form, self-playing, never-repeating.
- A planetarium / orrery — the dome and the moving bodies.
- John Luther Adams, *The Place Where You Go to Listen* — sonifying the real
  local sky in real time.
- Backing register: Trayford, "Unseen Astronomy," arXiv 2026 (astronomy going
  multimodal).

## Honest self-assessment
- **Does it always sound?** Yes — real recording when reachable, otherwise a
  synthesized 16 s offline stand-in (honestly labeled). Voices are primed at
  start so audio begins promptly.
- **Does the arrangement audibly change across the day?** Yes — gain/pan/
  brightness track each body's live alt/az, only above-horizon bodies play, the
  highest conduct, and region-hopping keeps phrases evolving. Scrub noon vs
  midnight to hear it flip (e.g. sun-led major air at noon → low star cluster at
  night). Real wall-clock progress also evolves it continuously.
- **Working non-WebGL fallback?** Yes — `createCanvas2D` shows the same day/night
  sky and bodies, pulsing, and the audio path is unchanged.
- **Astronomy honesty:** sun is solid; moon phase is correct; moon/star/planet
  positions are plausible approximations, not an ephemeris — by design.
- **Limitations:** the camera is fixed (looking south, slightly up) — no
  drag-look was added; the moon disc doesn't render a literal crescent terminator
  (illumination is conveyed by glow), and planet RA/Dec are static J2000 values,
  so planetary motion across weeks is not modeled.
