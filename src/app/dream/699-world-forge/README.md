# 699 · World Forge

**What if you could hear and see the whole planet making things right now —
every code push, star, and merge on Earth as a spark of light and a grain of
sound, blooming at its place on a slowly turning globe?**

## Concept

World Forge turns the live global creation firehose — GitHub's unauthenticated
public-events stream — into a living planetary instrument. Each event is one
grain: its **type** chooses a timbre (a push is a soft mallet/bell, a star a
bright high shimmer, a pull request a warm mid swell, an issue a muted tom, a
fork/create a low bloom), and a stable hash of the **repository** picks a pitch
within a slowly drifting **D-Dorian** mode, so the same repo tends to ring the
same note. This is an ambient *texture*, not a chord progression — no cadence,
no tension-and-resolution, no pentatonic safety net. A rolling rate window over
the last 12 seconds swells a generative drone's density and brightness and
brightens the whole planet's glow, so a busy Earth sounds and looks more alive.
Every event is placed at a deterministic pseudo geo-location (hashed from
repo + actor, spread equal-area over the sphere) and panned by longitude — the
point is "a planet alive with sparks of making," not GIS accuracy.

## How to use

Open `/dream/699-world-forge` and press **Begin** (audio must start from a tap
for iOS/Safari). A **synthetic world** begins immediately with zero network so
the piece sounds and animates the instant you start. On the first successful
poll it upgrades to **live** data (polled at most once per ~78s to respect the
keyless 60-requests/hour limit), metering each batch of up to ~40 recent events
out gently across the window. Any error — 403, rate-limit, CORS, offline —
falls back to the synthetic world, clearly flagged in amber, so the piece plays
forever. Headphones bring out the longitude panning. The **design notes**
toggle in the corner reveals this concept and the current render mode. If WebGL
or three.js is unavailable, the globe degrades to a Canvas2D starfield-with-
blooms so the glance is never blank.

## Subsystems

1. **Feed engine** (`feed.ts`) — synthetic generator + live GitHub poller with
   metering and graceful fallback; deterministic geo/pitch hashing.
2. **Rolling-aggregate state** (`page.tsx`) — a 12s rate window smoothed into a
   0..1 intensity that drives both audio and visuals.
3. **Generative audio** (`audio.ts`) — drifting D-Dorian drone bed + per-event
   voices through an ear-safe master chain (gain ≤ 0.4 → lowpass → compressor).
4. **Globe renderer** (`globe.ts`) — three.js auto-rotating dark Earth with a
   procedural graticule, scattered land-ish dots, and additive event blooms;
   `fallback.ts` is the Canvas2D degradation.

## Lineage / references

- **Hatnote — "Listen to Wikipedia"** (listen.hatnote.com, Stephen LaPorte &
  Mahmoud Hashemi) — the canonical live collaborative-creation firehose
  sonification.
- **github.audio** — live sonification of the GitHub commit stream.
- **Brian Foo — "Data-Driven DJ"** (datadrivendj.com).
- **Refik Anadol** — planetary / collective data rendered as light.

## Ambition floor

Clears **#2** (≥3 subsystems: live-feed + synthetic-fallback engine ·
rolling-aggregate state · generative drone + event synth · three.js globe
renderer) and **#3** (the named references above). **#1 is not claimed** —
live-data sonification already exists in the lab; this piece's contribution is
the planetary globe rendering and the type→timbre / repo→pitch texture, not the
sonification technique itself.
