# 701 · Catalog Cosmos

**The one question:** *What if Karel's entire catalog were a night sky you could
wander — every recording a light, one click from sound?*

The hub for exploring the music. All 30 real recordings float as glowing bodies,
grouped into orbits by collection (Welcome Home · Snowflake · 17th St · Folsom
St · Sketches), each ring drifting at its own slow pace. Hover a body to read
its title; click to let that piece play — it swells to a small sun and pulses
with its own **tamed** audio while the rest of the field dims to a hush.

## How it works

- `COLLECTIONS` (from `_shared/welcomeHome.ts`) → one orbit per collection, hue
  per collection, bodies spaced around each ring.
- Click → `loadRealTrackBuffer(ctx, id)` → BufferSource → `createSafeMaster`
  (ear-safety bus) → speakers. `safeMaster.analyser` drives the playing body's
  pulse and the center sun, so the light tracks the sound.
- Canvas2D, soft additive glow, slow elliptical orbits — cosmic and calm, no
  abrupt motion.

Anon-servable, no login (see `700-welcome-home` for the mechanism).
