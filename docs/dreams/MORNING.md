# Morning digest — last updated 2026-08-10 (cycle 1082, WIDE)

## New since yesterday
- **[9512-heliosong](/dream/9512-heliosong) — the live sky as the carrier wave.** Press **"Play the sky"**:
  it opens **real-time NOAA space weather** (solar-wind speed/density, magnetic-field Bz, planetary Kp) and
  turns it into an **infinite, non-looping cosmic drone** under breathing DOM/CSS **aurora**. The storm state
  is *audible* — southward Bz drops the root and pulls the harmony minor; Kp thickens the pad events; wind
  speed sets the shimmer. **Why open this:** it's the calmest thing the lab has made, and the music is literally
  *what's happening in space right now*. Pure DOM/CSS, so it renders on any phone — no camera, no GPU. If the
  live feed can't be reached it drifts on a seeded synthetic sky, so it's never silent.

## Explored but not shipped (banked → IDEAS §1082)
Cycle was **WIDE**: three unrelated directions built in parallel, shipped the strongest, banked two (both built clean):
- **⭐⭐⭐ handglyph** — your two hands **conduct** a WebGPU glow-field that sings (camera + MediaPipe hand-tracking).
  The **most ambitious** of the three (6 subsystems); it lost only because I can't verify camera + GPU headless.
  **This is the one to green-light for a real on-device build** — it wants your webcam to become a headliner.
- **⭐⭐ tidewalk** — tilt-walk a map of timbres, record paths, layer them into a slowly **phasing canon** (Eno *Bloom*).

## How this cycle was chosen
- **WIDE** (ledger-due): three divergent explorers, none sharing input × output × technique × palette, ship the best.
- **Research-chained:** *Helioradar AV* (av.helioradar.com, live since Feb 2026) — NOAA telemetry → an infinite
  ambient soundscape. The idea that *the current sky is a ready-made generative score* is the one to sit with.
- Fills the jury's most-named empty category: **real-data sonification** — flagged as absent, and finally shipped
  (`9432-geomagnet` proposed it months ago but was never built). Dodges the physics-sim monoculture entirely.

## Open questions for Karel
- **Green-light `handglyph` for a real on-device build?** It's the boldest thing in the queue and only needs your
  webcam to prove out.
- **The AI-pipeline chain (music→image→video) still needs you.** It requires a `FAL_KEY` budget (your paid quota) —
  flagged ~46 cycles, the jury's headline "build it or kill it." A rough per-run cap unblocks it; "drop it" closes it.
- Not verifiable headless: whether the live NOAA fetch succeeds on your device (vs the synthetic sky) and whether the
  sonification reads as *musical* on a phone speaker. Your ear at 06:30 is the test.
